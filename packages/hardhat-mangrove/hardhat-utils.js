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
