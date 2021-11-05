// Rollup builds only the browser version using the Node.js build.
import { nodeResolve as resolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "rollup-plugin-terser";
import json from "@rollup/plugin-json";

const BrowserBuildPath = "./dist/browser/mangrove.min.js";

export default [
  {
    input: "./dist/nodejs/index.js",
    onwarn: (message) => {
      if (message.code === "MISSING_NODE_BUILTINS") return;
    },
    output: {
      name: "Mangrove",
      file: BrowserBuildPath,
      format: "iife",
      sourcemap: false,
      globals: {
        http: "{}",
        https: "{}",
      },
    },
    plugins: [
      resolve({
        preferBuiltins: true,
        mainFields: ["main"],
        browser: true,
      }),
      commonjs(),
      terser(),
      json(),
    ],
    external: ["http", "https"],
  },
];
