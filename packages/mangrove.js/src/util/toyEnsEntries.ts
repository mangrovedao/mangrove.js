import { ethers } from "ethers";
import * as ToyENS from "./ToyENSCode";

type fetchedContract = { name: string; address: string; isToken: boolean };

/* Fetch all Toy ENS entries, used to give contract addresses to Mangrove */
export const getAllToyENSEntries = async (
  provider: ethers.providers.Provider
): Promise<fetchedContract[]> => {
  const ens = new ethers.Contract(ToyENS.address, ToyENS.abi, provider);
  const [names, addresses, isTokens] = await ens.all();
  const contracts = names.map((name, index) => {
    return { name, address: addresses[index], isToken: isTokens[index] };
  });
  return contracts;
};
