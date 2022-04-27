const getParams = require("@mangrovedao/mangrove-solidity/lib/testDeploymentParams");
const fs = require("fs");
const JSON_FILE = "./src/constants/hardhatAddresses.json";

const mn = async () => {
  const params = await getParams();
  const hardhatAddresses = {};
  for (const { name, address } of params) {
    hardhatAddresses[name] = address;
  }
  const json = JSON.stringify(hardhatAddresses, null, 2);
  fs.writeFileSync(JSON_FILE, json + "\n");
};

mn().catch((e) => {
  console.error(e);
  process.exit(1);
});
