// Rollup builds only the browser version
const BrowserBuildPath = "./dist/browser/mangrove.min.js";

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "url";

const currentFilePath = fileURLToPath(import.meta.url);

function getPath(absoluteResolvePath, shim) {
  const relativePath = path.relative(
    absoluteResolvePath,
    path.dirname(currentFilePath)
  );
  return path.join(absoluteResolvePath, relativePath, shim);
}

const shimOnResolvePlugin = {
  name: "shimOnResolvePlugin",
  setup(build) {
    build.onResolve({ filter: /^@mangrovedao\/commonlib.js$/ }, (args) => {
      return { path: getPath(args.resolveDir, "shims/commonlib.ts") };
    });

    build.onResolve({ filter: /^\.\/util\/readJsonWallet$/ }, (args) => {
      return { path: getPath(args.resolveDir, "shims/readJsonWallet.ts") };
    });
  },
};

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
  plugins: [shimOnResolvePlugin],
});
