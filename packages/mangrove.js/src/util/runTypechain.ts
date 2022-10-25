/*
Generate typechain files from mangrove-core ABIs/artifacts.
*/
import shelljs from "shelljs";
import path from "path";
import { runTypeChain, glob } from "typechain";

async function main() {
  // Get directory for mangrove-core module's abis
  const coreDir = path.parse(require.resolve("@mangrovedao/mangrove-core")).dir;
  const inDir = path.join(coreDir, "dist/mangrove-abis");

  const cwd = process.cwd();
  const outDir = path.join(cwd, "src/types/typechain");

  // Clean
  shelljs.rm("-rf", outDir);
  shelljs.mkdir("-p", outDir);

  // Gather json files
  const artifacts = glob(cwd, [`${inDir}/*.json`]);

  return await runTypeChain({
    cwd,
    filesToProcess: artifacts,
    allFiles: artifacts,
    outDir: outDir,
    target: "ethers-v5",
  });
}

main()
  .catch(console.error)
  .then((result) => {
    console.log(`Typechain done. Result: %o`, result);
    process.exit(0);
  });
