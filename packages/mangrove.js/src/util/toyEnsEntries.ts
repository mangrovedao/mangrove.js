/* Utility function to:
 * Get all current entries of the Toy ENS contract
 * Subscribe to get all future modifications to its entries
 */
import { ethers } from "ethers";
import * as ToyENS from "./ToyENSCode";
import * as Multicall from "./MulticallCode";

type fetchedContract = { name: string; address: string; decimals: number };

/* Call 'decimals' on all given addresses. */
const callDecimalsOn = async (
  provider: ethers.providers.Provider,
  addresses: string[]
): Promise<(number | undefined)[]> => {
  // ABI to get token decimals
  const decFn = new ethers.utils.Interface([
    "function decimals() view returns (uint8)",
  ]);
  const decimalsData = decFn.encodeFunctionData("decimals", []);
  /* Grab decimals for all contracts */
  const args = addresses.map((addr) => [addr, decimalsData]);
  const multicall = new ethers.Contract(
    Multicall.address,
    Multicall.abi,
    provider
  );
  const [allIsToken, allDecimals] = await multicall.callStatic.aggregate(args);
  const ret = allDecimals.map((rawData, index) => {
    let decoded;
    // if not a token, rawData decoding will trigger the error encoded in the rawData
    if (allIsToken[index]) {
      try {
        decoded = decFn.decodeFunctionResult("decimals", rawData)[0];
      } catch (e) {}
    }
    return decoded;
  });
  return ret;
};

// Populate a ToyENS contract object
export const connectToToyENSContract = (
  provider: ethers.providers.Provider
): ethers.Contract => {
  return new ethers.Contract(ToyENS.address, ToyENS.abi, provider);
};

/* Fetch all Toy ENS entries, used to give contract addresses to Mangrove */
/* onSets is called at most once per block with the list of name,address pairs that were set during the block */
export const getAllToyENSEntries = async (
  provider: ethers.providers.Provider,
  onSet?: (name, address, decimals?: number) => void
): Promise<fetchedContract[]> => {
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
