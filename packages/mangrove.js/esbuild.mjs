// Rollup builds only the browser version
const BrowserBuildPath = "./dist/browser/mangrove.min.js";

import { build } from "esbuild";
import resolve from "esbuild-plugin-resolve";

build({
  entryPoints: ["./dist/nodejs/index.js"],
  bundle: true,
  minify: true,
  outfile: BrowserBuildPath,
  platform: "browser",
  format: "iife",
  globalName: "_Mangrove",
  footer: {
    js: "module.exports = _Mangrove; module.exports.default = _Mangrove;",
  },
  plugins: [
    resolve({
      "@mangrovedao/commonlib.js": "../../../shims/commonlib.ts",
      "./util/readJsonWallet": "../../shims/readJsonWallet.ts",
    }),
  ],
});
