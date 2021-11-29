const ethers = require("hardhat").ethers;

module.exports = async (hre) => {
  const deployer = (await hre.getUnnamedAccounts())[0];

  const tokens = [
    {
      symbol: "AAVE",
      decimals: 18,
      address: "0x341d1f30e77D3FBfbD43D17183E2acb9dF25574E",
    },
    {
      symbol: "DAI",
      decimals: 18,
      address: "0x001B3B4d0F3714Ca98ba10F6042DaEbF0B1B7b6F",
    },
    {
      symbol: "USDC",
      decimals: 6,
      address: "0x2058A9D7613eEE744279e3856Ef0eAda5FCbaA7e",
    },
    {
      symbol: "USDT",
      decimals: 6,
      address: "0xBD21A10F619BE90d6066c941b04e340841F1F989",
    },
    {
      symbol: "WBTC",
      decimals: 8,
      address: "0x0d787a4a1548f673ed375445535a6c7A1EE56180",
    },
    {
      symbol: "WETH",
      decimals: 18,
      address: "0x3C68CE8504087f89c640D02d133646d98e64ddd9",
    },
  ];

  for (const token of tokens) {
    const faucetResult = await hre.deployments.deploy("Faucet", {
      from: deployer,
      args: [
        token.address,
        `${token.symbol}_Faucet`,
        ethers.BigNumber.from(10_000).mul(
          ethers.BigNumber.from(10).pow(token.decimals)
        ),
      ],
    });
    console.log(`${token.symbol} faucet: ${faucetResult.address}`);
  }
};

module.exports.tags = ["mumbai"];
