/* Utility function to:
 * Get all current entries of the Toy ENS contract
 * Subscribe to get all future modifications to its entries
 */
import { ethers } from "ethers";
import * as ToyENS from "./ToyENSCode";
import { typechain } from "../types";
const multicallAbi = require("../constants/artifacts/Multicall2.json");

const multicallAddress = "0xdecaf1" + "0".repeat(34);

/* Call 'decimals' on all given addresses. */
export const callDecimalsOn = async (
  provider: ethers.providers.JsonRpcProvider,
  addresses: string[]
): Promise<(number | undefined)[]> => {
  // ABI to get token decimals
  const ierc20 = typechain.IERC20__factory.createInterface();
  const decimalsData = ierc20.encodeFunctionData("decimals");

  /* Grab decimals for all contracts */
  const multicall = typechain.Multicall2__factory.connect(
    multicallAddress,
    provider
  );
  const args = addresses.map((addr) => {
    return { target: addr, callData: decimalsData };
  });
  const returnData = await multicall.callStatic.tryAggregate(false, args);
  const ret = returnData.map(({ success, returnData }) => {
    let decoded;
    if (success) {
      try {
        // if not a token, decoding will trigger the error encoded in returnData
        decoded = ierc20.decodeFunctionResult("decimals", returnData)[0];
      } catch (e) {}
    }
    return decoded;
  });
  return ret;
};

// Populate a ToyENS contract object
export const connectToToyENSContract = (
  provider: ethers.providers.JsonRpcProvider
): ethers.Contract => {
  return new ethers.Contract(ToyENS.address, ToyENS.abi, provider);
};

/* Fetch all Toy ENS entries, used to give contract addresses to Mangrove */
/* onSets is called at most once per block with the list of name,address pairs that were set during the block */
export const getAllToyENSEntries = async (
  provider: ethers.providers.JsonRpcProvider,
  onSet?: (name, address, decimals?: number) => void
): Promise<DevNode.fetchedContract[]> => {
  const ens = connectToToyENSContract(provider);
  const initialBlock = await provider.getBlockNumber();
  if (typeof onSet !== "undefined") {
    ens.on("Set", async (name, address, evt) => {
      // Warning: may be incompatible with snapshot/revert to before initialization
      if (evt.blockNumber > initialBlock) {
        const [decimals] = await callDecimalsOn(provider, [address]);
        onSet(name, address.toLowerCase(), decimals);
      }
    });
  }

  let names: string[];
  let addresses: string[];

  try {
    [names, addresses] = await ens.all();
  } catch (e) {
    return [];
  }
  const decimals = await callDecimalsOn(provider, addresses);
  const contracts = names.map((name, index) => {
    return {
      name,
      address: addresses[index].toLowerCase(),
      decimals: decimals[index],
    };
  });
  return contracts;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace DevNode {
  export type fetchedContract = {
    name: string;
    address: string;
    decimals: number;
  };

  export type provider = ethers.providers.JsonRpcProvider;

  export type info = { setCode: string };
}

export const devNodeInfos: { [key: string]: DevNode.info } = {
  anvil: {
    setCode: "anvil_setCode",
  },
  Hardhat: {
    setCode: "hardhat_setCode",
  },
  Ganache: {
    setCode: "evm_setAccountCode",
  },
};

class DevNode {
  provider: DevNode.provider;
  web3ClientVersion: string;
  multicallAddress: string;
  constructor(provider: any) {
    this.multicallAddress = multicallAddress;
    if ("send" in provider) {
      this.provider = provider as DevNode.provider;
    } else {
      throw new Error(
        "provider object has no send property; are you using JSON-RPC?"
      );
    }
  }

  async clientVersion(): Promise<string> {
    if (typeof this.web3ClientVersion === "undefined") {
      this.web3ClientVersion = await this.provider.send(
        "web3_clientVersion",
        []
      );
    }
    return this.web3ClientVersion;
  }

  async clientType(): Promise<string> {
    const version = await this.clientVersion();
    return version.split("/")[0];
  }

  async info(): Promise<DevNode.info | undefined> {
    const info = devNodeInfos[await this.clientType()];
    if (typeof info === "undefined") {
      throw new Error(`No info for this node ${await this.clientVersion()}`);
    }
    return info;
  }

  async isDevNode(): Promise<boolean> {
    return typeof devNodeInfos[await this.clientType()] !== "undefined";
  }

  async setCode(address: string, newCode: string): Promise<any> {
    const method = (await this.info()).setCode;
    return await this.provider.send(method, [address, newCode]);
  }

  async hasCode(address: string): Promise<boolean> {
    const currentCode = await this.provider.send("eth_getCode", [
      address,
      "latest",
    ]);
    return currentCode !== "0x";
  }

  async setCodeIfAbsent(address: string, newCode: string): Promise<any> {
    if (!(await this.hasCode(address))) {
      return this.setCode(address, newCode);
    }
  }

  setToyENSCodeIfAbsent(): Promise<any> {
    return this.setCodeIfAbsent(ToyENS.address, ToyENS.code);
  }

  setMulticallCodeIfAbsent(): Promise<any> {
    return this.setCodeIfAbsent(
      multicallAddress,
      multicallAbi.deployedBytecode.object
    );
  }

  callDecimalsOn(addresses: string[]): Promise<(number | undefined)[]> {
    return callDecimalsOn(this.provider, addresses);
  }

  connectToToyENSContract(): ethers.Contract {
    return connectToToyENSContract(this.provider);
  }

  getAllToyENSEntries(onSet?: (name, address, decimals?: number) => void) {
    return getAllToyENSEntries(this.provider, onSet);
  }
}

export default DevNode;
