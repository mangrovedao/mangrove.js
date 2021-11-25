const hre = require("hardhat");

exports.hreServer = async ({ hostname, port, provider }) => {
  const {
    TASK_NODE_CREATE_SERVER,
  } = require("hardhat/builtin-tasks/task-names");
  const server = await hre.run(TASK_NODE_CREATE_SERVER, {
    hostname,
    port,
    provider,
  });
  await server.listen();
  return server;
};

let last_snapshot_id = undefined;

exports.snapshot = async () => {
  last_snapshot_id = await hre.network.provider.request({
    method: "evm_snapshot",
    params: [],
  });
  return last_snapshot_id;
};

exports.revert = async (snapshot_id = last_snapshot_id) => {
  await hre.network.provider.request({
    method: "evm_revert",
    params: [snapshot_id],
  });
};
