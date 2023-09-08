/* ***** Mangrove tooling script ********* *
This script dynamically creates an index.js file for the dist directory of mangrove-core.

For instance, if the `dist/abis` directory contains `Mangrove.json` and
`Maker.json`, it will include the following in `index.js`:

    exports.abis = {};
    exports.abis.Mangrove = require('abis/Mangrove.json');
    exports.abis.Maker = require('abis/Maker.json');

*/

const fs = require("fs");
const path = require("path");

const exportAllIn = (exportName, dir) => {
  const lines = [];
  lines.push(`exports.${exportName} = {};`);

  for (const fileName of fs.readdirSync(`${dir}`)) {
    const parsed = path.parse(fileName);
    lines.push(
      `exports.${exportName}['${parsed.name}'] = require("./${dir}/${fileName}");`,
    );
  }
  return lines.join("\n");
};

const indexLines = [];
indexLines.push("// DO NOT MODIFY -- GENERATED BY buildIndex.js");
indexLines.push(exportAllIn("abis", "dist/abis"));
indexLines.push("exports.addresses = {};");
indexLines.push(exportAllIn("addresses.deployed", "addresses/deployed"));
indexLines.push(exportAllIn("addresses.context", "addresses/context"));

fs.writeFileSync("index.js", indexLines.join("\n"));

console.log("Wrote index.js");
