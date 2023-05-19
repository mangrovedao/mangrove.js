import { ethers } from "ethers";
import { execForgeCmd, runScript } from "./forgeScript";
import DevNode from "./devNode";
import { JsonRpcProvider } from "@ethersproject/providers";
import path from "path";
const CORE_DIR = path.parse(require.resolve("@mangrovedao/mangrove-core")).dir;

export async function deal(dealParams: {
  url: string;
  provider: JsonRpcProvider;
  token: string;
  account: string;
  amount?: number;
  internalAmount?: ethers.BigNumber;
}) {
  // Foundry needs these RPC urls specified in foundry.toml to be available, else it complains
  const env = {
    ...process.env,
    TOKEN: dealParams.token,
    ACCOUNT: dealParams.account,
  };

  // parse script results to get storage slot and token decimals
  let slot: string;
  let decimals: number;

  let ret: any = await runScript({
    url: dealParams.url,
    env: env,
    provider: dealParams.provider,
    script: "GetTokenDealSlot",
    coreDir: CORE_DIR,
    pipe: false,
    stateCache: false,
    stateCacheFile: "",
  });
  for (const line of ret.split("\n")) {
    const slotMatch = line.match(/\s*slot:\s*(\S+)/);
    if (slotMatch) {
      slot = slotMatch[1];
    }
    const decimalsMatch = line.match(/\s*decimals:\s*(\S+)/);
    if (decimalsMatch) {
      decimals = parseInt(decimalsMatch[1], 10);
    }
  }

  if ("internalAmount" in dealParams) {
    if ("amount" in dealParams) {
      throw new Error(
        "Cannot specify both amount (display units) and internal amount (internal units). Please pick one."
      );
    }
  } else if ("amount" in dealParams) {
    dealParams.internalAmount = ethers.utils.parseUnits(
      `${dealParams.amount}`,
      decimals
    );
  } else {
    throw new Error(
      "Must specify one of dealParams.amount, dealParams.internalAmount."
    );
  }

  const devNode = new DevNode(dealParams.provider);
  await devNode.setStorageAt(
    dealParams.token,
    slot,
    ethers.utils.hexZeroPad(dealParams.internalAmount.toHexString(), 32)
  );
}
