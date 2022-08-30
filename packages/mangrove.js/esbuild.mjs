// Rollup builds only the browser version
const BrowserBuildPath = "./dist/browser/mangrove.min.js";

import { build } from "esbuild";
import resolve from "esbuild-plugin-resolve";

build({
  entryPoints: ["./src/index.ts"],
  bundle: true,
  minify: true,
  outfile: BrowserBuildPath,
  platform: "browser",
  format: "iife",
  globalName: "Mangrove",
  footer: {
    js: "module.exports = Mangrove;",
  },
  plugins: [
    resolve({
      "@mangrovedao/commonlib.js": "../../shims/commonlib.ts",
      "./util/readJsonWallet": "../shims/readJsonWallet.ts",
    }),
  ],
});
