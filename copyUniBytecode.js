const fs = require("fs");

/**
 * Outputs the compiler output to a file.
 * @typedef {Object} CompilerOutput
 * @property {string} bytecode The bytecode of the contract.
 */

const files = [
  "node_modules/@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json",
  "node_modules/@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json",
  "node_modules/@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json",
];
const outputs = [
  __dirname + "/uni-out/UniswapV3Factory.txt",
  __dirname + "/uni-out/NonfungibleTokenPositionDescriptor.txt",
  __dirname + "/uni-out/NonfungiblePositionManager.txt",
];

async function main() {
  await Promise.all(
    files.map(async (file, idx) => {
      const fileContent = await new Promise((resolve, reject) => {
        fs.readFile(file, "utf8", (err, data) => {
          if (err) reject(err);
          resolve(data);
        });
      });
      /**
       * @type {CompilerOutput}
       */
      const data = JSON.parse(fileContent);
      const bytecode = data.bytecode.replace(
        /__\$[a-fA-F0-9]+\$__/gm,
        "0".repeat(40),
      );

      await new Promise((resolve, reject) => {
        fs.writeFile(outputs[idx], bytecode, (err) => {
          if (err) reject(err);
          resolve();
        });
      });
    }),
  );
}

main()
  .then(() => console.log("done"))
  .catch(console.error);
