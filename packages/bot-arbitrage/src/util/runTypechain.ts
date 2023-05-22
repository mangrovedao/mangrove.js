/*
Generate typechain files from mangrove-core ABIs/artifacts.
*/
import shelljs from "shelljs";
import path from "path";
import fs from "fs";
import os from "os";
import { runTypeChain, glob } from "typechain";

/* This script gathers all relevant .json artifacts and runs typechain on them.
    Since the .json file come from multiple places, it is not as easy as doing input -> typechain -> outpout
  2 methods were tried but did not work.
    1) Running typechains with artifacts = glob(cwd,[dir1/*.json,dir2/*.json]) will generate .ts files with their directory hierarchy up to the lowest common ancestor of all globbed files. We want to flatten the file hierarchies so this does not work.
    2) Running typechain twice (ie. runTypeChain(...); runTypeChain(...);) will fail because the second invocation will erase the typechain/index.ts file generated at the first invocation.
  The current method is to copy everything to a temp directory, then run typechain.
*/
async function main() {
  // Clean out directory
  const outDir = path.join(process.cwd(), "src/types/typechain");
  shelljs.rm("-rf", outDir);
  shelljs.mkdir("-p", outDir);
  const pwd = shelljs.pwd();

  // Generate temp directory to place artifacts
  const tempDir = await fs.mkdtempSync(`${os.tmpdir()}/`);

  try {
    // Get directory for mangrove-arbitrage submodule abi
    const abiDir = `mangrove-arbitrage/abi`;

    // copy all inputs to temp dir. later dirs will have precedence.
    shelljs.cp(`${abiDir}/*.json`, tempDir);

    const artifacts = glob(process.cwd(), [`${tempDir}/*.json`]);

    const res = await runTypeChain({
      cwd: process.cwd(),
      filesToProcess: artifacts,
      allFiles: artifacts,
      outDir: outDir,
      target: "ethers-v5",
    });
    console.log("runTypechain.ts:", res);
  } finally {
    shelljs.rm("-rf", tempDir);
  }
}

main()
  .catch(console.error)
  .then((result) => {
    process.exit(0);
  });
