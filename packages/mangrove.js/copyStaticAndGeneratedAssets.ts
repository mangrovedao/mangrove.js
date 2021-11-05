import * as shell from "shelljs";

shell.cp("-R", "src/types/typechain/*.d.ts", "dist/nodejs/types/typechain");
shell.cp("src/hardhatAddresses.json", "dist/nodejs/");
