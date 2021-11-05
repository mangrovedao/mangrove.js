// Utility functions for writing integration tests against Mangrove.
import { ethers } from "ethers";
import { Market, MgvToken } from "../..";
import * as typechain from "../../dist/nodejs/types/typechain";
import "hardhat-deploy-ethers/dist/src/type-extensions";
import { ethers as hardhatEthers } from "hardhat";
import { Provider } from "@ethersproject/abstract-provider";

export type Account = {
  name: string;
  address: string;
  signer: ethers.Signer;
  connectedContracts: {
    // Contracts connected with the signer for setting chain state in test case setup
    mangrove: typechain.Mangrove;
    testMaker: typechain.TestMaker;
    tokenA: typechain.TestTokenWithDecimals;
    tokenB: typechain.TestTokenWithDecimals;
  };
};

export type Balances = {
  ether: ethers.BigNumber;
  tokenA: ethers.BigNumber;
  tokenB: ethers.BigNumber;
};

export type BA = "bids" | "asks";

export const bidsAsks: BA[] = ["bids", "asks"];

export type Addresses = {
  mangrove: string;
  testMaker: string;
  tokenA: string;
  tokenB: string;
};

let addresses: Addresses;

export const getAddresses = async (): Promise<Addresses> => {
  if (!addresses) {
    addresses = {
      mangrove: (await hardhatEthers.getContract("Mangrove")).address,
      testMaker: (await hardhatEthers.getContract("TestMaker")).address,
      tokenA: (await hardhatEthers.getContract("TokenA")).address,
      tokenB: (await hardhatEthers.getContract("TokenB")).address,
    };
  }
  return addresses;
};

export const logAddresses = async (): Promise<void> => {
  console.group("Addresses");
  const addresses = await getAddresses();
  console.table(addresses);
  console.groupEnd();
};

export type Contracts = {
  mangrove: typechain.Mangrove;
  testMaker: typechain.TestMaker;
  tokenA: typechain.TestTokenWithDecimals;
  tokenB: typechain.TestTokenWithDecimals;
};

export const getContracts = async (
  signer: ethers.Signer
): Promise<Contracts> => {
  const addresses = await getAddresses();
  return {
    mangrove: typechain.Mangrove__factory.connect(addresses.mangrove, signer),
    testMaker: typechain.TestMaker__factory.connect(
      addresses.testMaker,
      signer
    ),
    tokenA: typechain.TestTokenWithDecimals__factory.connect(
      addresses.tokenA,
      signer
    ),
    tokenB: typechain.TestTokenWithDecimals__factory.connect(
      addresses.tokenB,
      signer
    ),
  };
};

export enum AccountName {
  Deployer = "deployer", // Owner of deployed MGV and token contracts
  Maker = "maker", // Owner of TestMaker contract
  Cleaner = "cleaner", // Owner of cleaner EOA
}

export const getAccount = async (name: AccountName): Promise<Account> => {
  const signer = await hardhatEthers.getNamedSigner(name);
  return {
    name: name,
    address: signer.address,
    signer: signer,
    connectedContracts: await getContracts(signer),
  };
};

export const getAccountBalances = async (
  account: Account,
  provider: Provider
): Promise<Balances> => {
  return {
    ether: await provider.getBalance(account.address),
    tokenA: await account.connectedContracts.tokenA.balanceOf(account.address),
    tokenB: await account.connectedContracts.tokenB.balanceOf(account.address),
  };
};

export const getBalances = async (
  accounts: Account[],
  provider: Provider
): Promise<Map<string, Balances>> => {
  const balances = new Map<string, Balances>();
  for (const account of accounts) {
    balances.set(account.name, await getAccountBalances(account, provider));
  }
  return balances;
};

export const logBalances = async (
  accounts: Account[],
  balancesBefore: Map<string, Balances>,
  balancesAfter: Map<string, Balances>
): Promise<void> => {
  const accountBalancesTable = []; // [(name?, address?, ether|token|..., before, after, change)]
  for (const account of accounts) {
    const before = balancesBefore.get(account.name);
    const after = balancesAfter.get(account.name);
    if (!before || !after) {
      continue;
    }
    accountBalancesTable.push({
      Name: account.name,
      Address: account.address,
      Currency: "ether",
      Before: before.ether.toString(),
      After: after.ether.toString(),
      Change: after.ether.sub(before.ether).toString(),
    });
    accountBalancesTable.push({
      Name: "",
      Address: "",
      Currency: "TokenA",
      Before: before.tokenA.toString(),
      After: after.tokenA.toString(),
      Change: after.tokenA.sub(before.tokenA).toString(),
    });
    accountBalancesTable.push({
      Name: "",
      Address: "",
      Currency: "TokenB",
      Before: before.tokenB.toString(),
      After: after.tokenB.toString(),
      Change: after.tokenB.sub(before.tokenB).toString(),
    });
  }
  console.group("Balances");
  console.table(accountBalancesTable, [
    "Name",
    "Address",
    "Currency",
    "Before",
    "After",
    "Change",
  ]);
  console.groupEnd();
};

export const getTokens = (
  market: Market,
  ba: BA
): {
  inboundToken: MgvToken;
  outboundToken: MgvToken;
} => {
  return {
    inboundToken: ba === "asks" ? market.base : market.quote,
    outboundToken: ba === "asks" ? market.quote : market.base,
  };
};

export type NewOffer = {
  market: Market;
  ba: BA;
  maker: Account;
  wants?: ethers.BigNumberish;
  gives?: ethers.BigNumberish;
  gasreq?: ethers.BigNumberish;
  shouldFail?: boolean;
  shouldAbort?: boolean;
  shouldRevert?: boolean;
};

// By default, a new offer will succeed
export const postNewOffer = async ({
  market,
  ba,
  maker,
  wants = 1,
  gives = 1000000,
  gasreq = 5e4,
  shouldFail = false,
  shouldAbort = false,
  shouldRevert = false,
}: NewOffer): Promise<void> => {
  const { inboundToken, outboundToken } = getTokens(market, ba);

  await maker.connectedContracts.testMaker
    .shouldFail(shouldFail)
    .then((tx) => tx.wait());
  await maker.connectedContracts.testMaker
    .shouldAbort(shouldAbort)
    .then((tx) => tx.wait());
  await maker.connectedContracts.testMaker
    .shouldRevert(shouldRevert)
    .then((tx) => tx.wait());

  await maker.connectedContracts.testMaker[
    "newOffer(address,address,uint256,uint256,uint256,uint256)"
  ](inboundToken.address, outboundToken.address, wants, gives, gasreq, 1) // (base address, quote address, wants, gives, gasreq, pivotId)
    .then((tx) => tx.wait());
};

export const postNewRevertingOffer = async (
  market: Market,
  ba: BA,
  maker: Account
): Promise<void> => {
  await postNewOffer({
    market,
    ba,
    maker,
    wants: 1,
    gives: 1000000,
    shouldRevert: true,
  });
};

export const postNewSucceedingOffer = async (
  market: Market,
  ba: BA,
  maker: Account
): Promise<void> => {
  await postNewOffer({ market, ba, maker });
};

export const setMgvGasPrice = async (
  gasPrice: ethers.BigNumberish
): Promise<void> => {
  const deployer = await getAccount(AccountName.Deployer);
  await deployer.connectedContracts.mangrove
    .setGasprice(gasPrice)
    .then((tx) => tx.wait());
};

export const mint = async (
  token: MgvToken,
  receiver: Account,
  amount: number
): Promise<void> => {
  const deployer = await getAccount(AccountName.Deployer);
  switch (token.name) {
    case "TokenA":
      await deployer.connectedContracts.tokenA
        .mint(receiver.address, token.toUnits(amount))
        .then((tx) => tx.wait());

      break;

    case "TokenB":
      await deployer.connectedContracts.tokenB
        .mint(receiver.address, token.toUnits(amount))
        .then((tx) => tx.wait());

      break;
  }
};

export const approveMgv = async (
  token: MgvToken,
  owner: Account,
  amount: number
): Promise<void> => {
  const addresses = await getAddresses();
  await approve(token, owner, addresses.mangrove, amount);
};

export const approve = async (
  token: MgvToken,
  owner: Account,
  spenderAddress: string,
  amount: number
): Promise<void> => {
  switch (token.name) {
    case "TokenA":
      await owner.connectedContracts.tokenA
        .approve(spenderAddress, token.toUnits(amount))
        .then((tx) => tx.wait());

      break;

    case "TokenB":
      await owner.connectedContracts.tokenB
        .approve(spenderAddress, token.toUnits(amount))
        .then((tx) => tx.wait());

      break;
  }
};
