/*
Script to a write addresses for a chain to a json file (at a given path), given a foundry broadcast file.

Writes a new file, if output file is not already present. If output file is found, only updates the
values for the chain and contracts corresponding to the given argument for chainkey and the known
names of Mangrove contracts, and leaves other key-value pairs.

Args:
  --broadcast=<path to broadcast file>
  --chainkey=<key for chain in output json file>
  --output=<path to output json file>
  [--debug]

  Add --debug flag to get debug output.

Example:

  ts-node getMangroveAddresses.ts --broadcast ../../../packages/mangrove-solidity/dist/broadcasts/mumbai/run-latest.json --chainkey maticmum --output ../../../packages/mangrove.js/src/constants/addresses.json 
*/

import fs from "fs";
import minimist from "minimist";

// define relevant contracts
const coreContracts = [
  "Mangrove",
  "MgvCleaner",
  "MgvReader",
  "MgvOracle",
  "MangroveOrder",
  "MangroveOrderEnriched",
];

/* broadcast logs are the form:

  transactions: [
    { 
      transactionType: "CREATE", // or "CALL"
      contractName: "MyContract", // or null if unknown
      contractAddress: ...
    },
    { 
      <another transaction>
    }
  ]

*/
const readContractAddresses = function (
  broadcastFile: string,
  contractNames: string[]
): Record<string, string> | undefined {
  let fileData: string;
  try {
    let fileData = fs.readFileSync(broadcastFile, "utf8");
  } catch (e) {
    console.warn(`Broadcast log ${broadcastFile} not found, skipping.`);
    return undefined;
  }

  const broadcastLog = JSON.parse(fileData);

  const fullAddressMap: Record<string, string[]> = {};
  const addressMap: Record<string, string> = {};

  for (const tx of broadcastLog.transactions) {
    if (tx.transactionType === "CREATE" && tx.contractName !== null) {
      fullAddressMap[tx.contractName] ??= [];
      fullAddressMap[tx.contractName].push(tx.contractAddress);
    }
  }

  for (const contractName of contractNames) {
    if (!fullAddressMap[contractName]) {
      console.warn(
        `No contract ${contractName} deployed in this broadcast, skipping.`
      );
    } else if (fullAddressMap[contractName].length !== 1) {
      console.error(
        `Error: expected exactly one address for contract ${contractName}. Got: ${fullAddressMap[contractName]}`
      );
      process.exit(1);
    } else {
      addressMap[contractName] = fullAddressMap[contractName][0];
    }
  }
  return addressMap;
};

// read args - and do minimal sanity checking
const stringArgs = ["broadcast", "chainkey", "output"];

const args = minimist(process.argv.slice(2), {
  string: stringArgs,
  boolean: ["debug"],
  unknown: (a) => {
    console.error(`Unexpected argument '${a}'- ignoring.`);
    return false;
  },
});

if (args.debug) {
  console.debug("Args:");
  console.debug(args);
}

const missingArgs = stringArgs.filter((name) => !(name in args));
if (missingArgs.length > 0) {
  console.error(`Error: Missing arguments ${missingArgs}`);
  process.exit(1);
}

const broadcastFile: string = args["broadcast"];
const chainkey: string = args["chainkey"];
const outputFile: string = args["output"];

// read broadcast addresses for core contracts
const contractAddresses = readContractAddresses(broadcastFile, coreContracts);
// if falsy value returned, skip processing
if (contractAddresses) {
  // read outputFile, if present
  let oldAddresses: Record<string, {}> = {};
  if (fs.existsSync(outputFile)) {
    if (args.debug) {
      console.debug(
        `Found existing file at ${outputFile}. File will be updated.`
      );
    }

    oldAddresses = JSON.parse(fs.readFileSync(outputFile, "utf8"));
  } else {
    if (args.debug) {
      console.debug(
        `Did not find file at ${outputFile}. File will be created.`
      );
    }
  }

  // Overwrite info for relevant addresses for the relevant chainkey, and then write to file.
  // (Note - we don't test whether there are actually any changes, and we always write to file, so
  // the file timestamp will always be updated. This script is intended for CI, so it's an
  // unnecessary hassle to actually test for changes.)

  const newChainAddresses = Object.assign(
    oldAddresses[chainkey] ?? {},
    contractAddresses
  );
  const newAddresses = Object.assign(oldAddresses, {
    [chainkey]: newChainAddresses,
  });

  if (args.debug) {
    console.debug(
      `Constructed the following content, which will be written to file at ${outputFile}:`
    );
    console.dir(newAddresses);
  }

  fs.writeFileSync(outputFile, JSON.stringify(newAddresses, null, 2));
}
