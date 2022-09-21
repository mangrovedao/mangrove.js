import { ethers } from "ethers";
import * as ToyENS from "./ToyENSCode";
import * as Multicall from "./MulticallCode";

type fetchedContract = { name: string; address: string; decimals: number };

/* Fetch all Toy ENS entries, used to give contract addresses to Mangrove */
export const getAllToyENSEntries = async (
  provider: ethers.providers.Provider
): Promise<fetchedContract[]> => {
  const ens = new ethers.Contract(ToyENS.address, ToyENS.abi, provider);
  const [names, addresses] = await ens.all();

  /* Grab decimals for all contracts */
  const decFn = (new ethers.utils.Interface(["function decimals() view returns (uint8)"]));
  const decimalsData = decFn.encodeFunctionData("decimals",[]);
  const args = addresses.map(addr => [addr, decimalsData]);
  const multicall = new ethers.Contract(Multicall.address, Multicall.abi, provider);
  const [allIsToken,allDecimals] = await multicall.callStatic.aggregate(args);

  const contracts = names.map((name, index) => {
    let decimals;
    if (allIsToken[index]) {
      decimals = decFn.decodeFunctionResult("decimals",allDecimals[index])[0];
    }
    return { name, address: addresses[index], decimals };
  });
  return contracts;
};
