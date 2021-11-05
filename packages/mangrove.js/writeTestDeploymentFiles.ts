const getParams = require("@giry/mangrove-solidity/lib/testDeploymentParams");
const fs = require("fs");
const JSON_FILE = "./src/hardhatAddresses.json";

const mn = async () => {
  const params = await getParams();
  const hardhatAddresses = {};
  for (const { name, address } of params) {
    hardhatAddresses[name] = address;
  }
  const json = JSON.stringify(hardhatAddresses);
  fs.writeFileSync(JSON_FILE, json);
};

mn().catch((e) => {
  console.error(e);
  process.exit(1);
});
