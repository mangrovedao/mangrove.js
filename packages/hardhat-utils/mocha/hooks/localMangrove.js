const child_process = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = async (listen = { ip: "127.0.0.1", port: 8546 }) => {
  const root = "/Users/ah/Projects/mangrove";
  const script =
    "/Users/ah/Projects/mangrove/packages/mangrove-solidity/scripts/a.sol";
  const deploy_output = path.resolve("./deploy_output.txt");
  console.log("deploy_output", deploy_output);
  // sole.log("Running an anvil instance...");
  anvil = child_process.spawn("anvil", [
    "--host",
    listen.ip,
    "--port",
    listen.port,
  ]);
  anvil.stdout.setEncoding("utf8");
  // anvil.stdout.on('data', (data) => {
  //   console.log(data);
  // });
  // execa('anvil',['--port','8546']);
  anvil.on("close", (code) => {
    console.log(`anvil has closed with code ${code}`);
  });

  anvil.stderr.on("data", (data) => {
    console.error(`anvil: stderr: ${data}`);
  });

  anvil.on("close", (code) => {
    console.log(`anvil: child process exited with code ${code}`);
  });

  // wait a while for anvil to be ready, then bail
  const serverReady = new Promise((ok, ko) => {
    // return ok();
    let ready = null;
    setTimeout(() => {
      if (ready === null) {
        ready = false;
        ko("timeout");
      }
    }, 3000);
    anvil.stdout.on("data", (data) => {
      // console.log(data);
      for (const line of data.split("\n")) {
        if (
          ready === null &&
          line === `Listening on ${listen.ip}:${listen.port}`
        ) {
          ready = true;
          ok();
        }
      }
    });
  });

  await serverReady;

  const cmd = `forge script \
  --root ${root} \
  --rpc-url http://${listen.ip}:${listen.port} \
  --froms 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast --json \
  ${script} `;

  console.log(cmd);
  const outt = child_process.execSync(cmd, {
    encoding: "utf8",
    env: { ...process.env, MGV_DEPLOY_FILE: deploy_output },
  });
  console.log("outt", outt);

  const file = fs.readFileSync(deploy_output, "utf8");
};
