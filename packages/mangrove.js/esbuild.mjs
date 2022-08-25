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
  format: "cjs",
  // FIXME either polyfill or create a browser-build that does not embark node.ts e.g. through a browser-index.ts
  external: ["path", "child_process", "fs", "os", "util", "url", "assert"],
  plugins: [
    resolve({
      "@mangrovedao/commonlib.js": "../../../shims/commonlib.ts",
      "./util/readJsonWallet": "../../shims/readJsonWallet.ts",
    }),
  ],
});
