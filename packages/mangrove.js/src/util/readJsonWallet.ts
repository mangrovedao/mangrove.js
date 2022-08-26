import fs from "fs";
import { ethers } from "ethers";

export const readJsonWallet = async function (
  path: string,
  password: string,
  provider: any
) {
  const jsonWalletFile = fs.readFileSync(path, "utf8");
  return new ethers.Wallet(
    await ethers.Wallet.fromEncryptedJson(jsonWalletFile, password),
    provider
  );
};
