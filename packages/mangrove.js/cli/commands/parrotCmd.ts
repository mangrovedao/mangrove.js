import * as yargs from "yargs";
import { Mangrove } from "../../src";
import { fetchJson } from "ethers/lib/utils";
import packageJson from "../../package.json";
import { Big } from "big.js";

export const command = "parrot";
export const aliases = ["env-overview"];
export const describe =
  "reports the current environment and warns of any discrepancies";

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const builder = (yargs) => {
  return yargs
    .option("jsonOutput", { type: "boolean", demandOption: false })
    .option("nodeUrl", { type: "string", demandOption: true });
};

type Arguments = yargs.Arguments<ReturnType<typeof builder>>;

export async function handler(argv: Arguments): Promise<void> {
  const repoEnvironmentInfo = await getRepoEnvironmentInfo();
  const mangroveJsEnvironmentInfo = await getMangroveJsEnvironmentInfo();
  const mangroveConfigurationInfo = await getMangroveConfigurationInfo(
    argv.nodeUrl
  );

  const notes = [
    ...repoEnvironmentInfo.notes,
    ...mangroveJsEnvironmentInfo.notes,
    ...mangroveConfigurationInfo.notes,
  ];
  const warnings = [
    ...repoEnvironmentInfo.warnings,
    ...mangroveJsEnvironmentInfo.warnings,
    ...mangroveConfigurationInfo.warnings,
  ];

  if (argv.jsonOutput) {
    console.log(
      JSON.stringify(
        {
          notes,
          warnings,
          repoEnvironmentInfo: repoEnvironmentInfo.info,
          mangroveJsEnvironmentInfo: mangroveJsEnvironmentInfo.info,
          mangroveConfigurationInfo: mangroveConfigurationInfo.info,
        },
        jsonStringifyReplacer,
        2
      )
    );
  } else {
    if (warnings.length > 0) {
      console.group("WARNINGS");
      warnings.forEach((w) => console.warn(w));
      console.groupEnd();
      console.log();
    }
    if (notes.length > 0) {
      console.group("NOTES");
      notes.forEach((n) => console.log(n));
      console.groupEnd();
      console.log();
    }

    console.group("ADDRESSES");
    console.table(repoEnvironmentInfo.info.contractAddresses);
    console.groupEnd();
  }

  process.exit(0);
}

function jsonStringifyReplacer(key: string, value: any) {
  if (value instanceof Big) {
    return value.toString();
  }
  return value;
}

const contracts = ["Mangrove", "MgvCleaner", "MgvOracle", "MgvReader"];
async function getRepoEnvironmentInfo() {
  const notes = [];
  const warnings = [];
  const contractAddresses = [];
  const fetchPromises = [];
  for (const contractName of contracts) {
    const gitHubUrlForDeploymentJsonFile = `https://raw.githubusercontent.com/mangrovedao/mangrove/master/packages/mangrove-solidity/deployments/mumbai/${contractName}.json`;
    const fetchPromise = fetchJson(gitHubUrlForDeploymentJsonFile)
      .then((json) => {
        if (json.address !== undefined) {
          contractAddresses.push([contractName, json.address]);
        } else {
          console.warn(
            `Deployment json file for contract '${contractName}' did not contain an address`
          );
        }
      })
      .catch((e) => {
        console.error(
          `Error encountered when fetching deployment json file for contract '${contractName}'`,
          e
        );
      });
    fetchPromises.push(fetchPromise);
  }
  await Promise.allSettled(fetchPromises);
  return {
    notes,
    warnings,
    info: {
      contractAddresses,
    },
  };
}

async function getMangroveJsEnvironmentInfo() {
  const notes = [];
  const warnings = [];
  let latestPackageVersion = undefined;
  const npmjsRegistryUrl =
    "https://registry.npmjs.org/@mangrovedao/mangrove.js";
  await fetchJson({
    url: npmjsRegistryUrl,
    headers: {
      Accept: "application/vnd.npm.install-v1+json",
    },
  })
    .then((json) => {
      if (json["dist-tags"]?.latest !== undefined) {
        latestPackageVersion = json["dist-tags"].latest;
        // FIXME: 2022-01-09 Fetch tarball and extract environment info from it.
        // Currently non-trivial, as the addresses are in a TypeScript file;
        // Will be easier once we (hopefully) move addresses to JSON-files.
        // const packageTarballUrl = json.versions[latestPackageVersion].dist.tarball;
      } else {
        console.warn(
          `JSON returned by npmjs registry did not contain dist-tags/latest`,
          npmjsRegistryUrl
        );
      }
    })
    .catch((e) => {
      console.error(
        "Error encountered while fetching package info for mangrove.js",
        e
      );
    });
  // FIXME: 2022-01-09: As a workaround fetching the latest package, we use the local
  // mangrove.js and report an issue if its version number doesn't match the latest
  // published version
  const localPackageVersion = packageJson.version;
  notes.push(
    `mangrove.js: Reported mangrove.js addresses are from the local version (tagged as ${localPackageVersion}, but may include unpublished changes) not the latest package published on npm (${latestPackageVersion})`
  );
  if (localPackageVersion !== latestPackageVersion) {
    warnings.push(
      `mangrove.js: The local version of mangrove.js (tagged as ${localPackageVersion}, but may include unpublished changes) is different from the latest published version on npm ${latestPackageVersion}`
    );
  }

  return {
    notes,
    warnings,
    info: {
      latestPackageVersion,
      localPackageVersion,
      addresses: Mangrove.getAllAddresses("maticmum"),
    },
  };
}

const tokens = ["WETH", "DAI", "USDC"];
async function getMangroveConfigurationInfo(nodeUrl: string) {
  const notes = [];
  const warnings = [];

  const mgv: Mangrove = await Mangrove.connect(nodeUrl).catch((reason) => {
    warnings.push(
      `Could not connect to Mangrove using mangrove.js, reason: ${reason}`
    );
    return undefined;
  });
  if (mgv === undefined) {
    return { notes, warnings };
  }

  const globalConfig = await mgv.config();
  const localConfigs = [];
  // Go through all pairs of tokens
  for (let i = 0; i < tokens.length; ++i) {
    for (let j = i + 1; j < tokens.length; ++j) {
      const market = await mgv.market({
        base: tokens[i],
        quote: tokens[j],
        bookOptions: { maxOffers: 0 },
      });
      const config = await market.config();
      localConfigs.push({
        base: market.base.name,
        quote: market.quote.name,
        config,
      });
    }
  }

  return {
    notes,
    warnings,
    info: {
      globalConfig,
      localConfigs,
    },
  };
}
