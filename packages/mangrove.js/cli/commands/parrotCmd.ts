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

const COMPONENT_MANGROVE_REPO = "repo";
const COMPONENT_MANGROVE_JS = "mangrove.js";
const COMPONENT_MANGROVE_CONFIGURATION = "config";
const COMPONENT_DAPP = "dApp";
const COMPONENT_BOT_CLEANER = "bot:cleaner";
const COMPONENT_BOT_OBFILLER = "bot:obfiller";
const COMPONENT_BOT_UPDATEGAS = "bot:updategas";

const CONTRACT_MANGROVE = "Mangrove";
const CONTRACT_MGV_CLEANER = "MgvCleaner";
const CONTRACT_MGV_ORACLE = "MgvOracle";
const CONTRACT_MGV_READER = "MgvReader";
const CONTRACTS = [
  CONTRACT_MANGROVE,
  CONTRACT_MGV_CLEANER,
  CONTRACT_MGV_ORACLE,
  CONTRACT_MGV_READER,
];

const DAPP_URL = "https://testnet.mangrove.exchange";
const CLEANING_BOT_URL = "https://mangrove-cleaning-bot.herokuapp.com/";
const OB_FILLER_BOT_URL = "https://mangrove-obfiller-bot.herokuapp.com/";
const UPDATE_GAS_BOT_URL = "https://mangrove-updategas-bot.herokuapp.com/";

type Address = string;
type ContractAddresses = Map<string, Address>; // contract name |-> address

type Annotation = {
  components: string[];
  content: string;
};
type Note = Annotation;
type Warning = Annotation;

type RepoEnvironmentInfo = {
  contractAddresses: ContractAddresses;
};
type MangroveJsEnvironmentInfo = {
  latestPackageVersion: string;
  localPackageVersion: string;
  contractAddresses: ContractAddresses;
};
type MangroveConfigurationInfo = {
  globalConfig: Mangrove.globalConfig;
  localConfigs: { base: string; quote: string; config: Mangrove.localConfig }[];
};
type MangroveJsAppEnvironmentInfo = {
  url: string;
  mangroveJsVersion: string;
};

type AnnotatedInfo<TInfo> = {
  notes: Note[];
  warnings: Warning[];
  info: TInfo;
};

type Arguments = yargs.Arguments<ReturnType<typeof builder>>;

export async function handler(argv: Arguments): Promise<void> {
  const repoEnvironmentInfoPromise = getRepoEnvironmentInfo();
  const mangroveJsEnvironmentInfoPromise = getMangroveJsEnvironmentInfo();
  const mangroveConfigurationInfoPromise = getMangroveConfigurationInfo(
    argv.nodeUrl
  );
  const dAppEnvironmentInfoPromise = getMangroveJsAppEnvironmentInfo(
    COMPONENT_DAPP,
    DAPP_URL
  );
  const cleanerBotEnvironmentInfoPromise = getMangroveJsAppEnvironmentInfo(
    COMPONENT_BOT_CLEANER,
    CLEANING_BOT_URL
  );
  const obFillerBotEnvironmentInfoPromise = getMangroveJsAppEnvironmentInfo(
    COMPONENT_BOT_OBFILLER,
    OB_FILLER_BOT_URL
  );
  const updateGasBotEnvironmentInfoPromise = getMangroveJsAppEnvironmentInfo(
    COMPONENT_BOT_UPDATEGAS,
    UPDATE_GAS_BOT_URL
  );

  const repoEnvironmentInfo = await repoEnvironmentInfoPromise;
  const mangroveJsEnvironmentInfo = await mangroveJsEnvironmentInfoPromise;
  const mangroveConfigurationInfo = await mangroveConfigurationInfoPromise;
  const dAppEnvironmentInfo = await dAppEnvironmentInfoPromise;
  const cleanerBotEnvironmentInfo = await cleanerBotEnvironmentInfoPromise;
  const obFillerBotEnvironmentInfo = await obFillerBotEnvironmentInfoPromise;
  const updateGasBotEnvironmentInfo = await updateGasBotEnvironmentInfoPromise;

  const { notes: crossComponentNotes, warnings: crossComponentWarnings } =
    analyzeEnvironment(
      repoEnvironmentInfo.info,
      mangroveJsEnvironmentInfo.info,
      mangroveConfigurationInfo.info,
      dAppEnvironmentInfo.info,
      cleanerBotEnvironmentInfo.info,
      obFillerBotEnvironmentInfo.info,
      updateGasBotEnvironmentInfo.info
    );

  const notes = [
    ...crossComponentNotes,
    ...repoEnvironmentInfo.notes,
    ...mangroveJsEnvironmentInfo.notes,
    ...mangroveConfigurationInfo.notes,
    ...dAppEnvironmentInfo.notes,
    ...cleanerBotEnvironmentInfo.notes,
    ...obFillerBotEnvironmentInfo.notes,
    ...updateGasBotEnvironmentInfo.notes,
  ];
  const warnings = [
    ...crossComponentWarnings,
    ...repoEnvironmentInfo.warnings,
    ...mangroveJsEnvironmentInfo.warnings,
    ...mangroveConfigurationInfo.warnings,
    ...dAppEnvironmentInfo.warnings,
    ...cleanerBotEnvironmentInfo.warnings,
    ...obFillerBotEnvironmentInfo.warnings,
    ...updateGasBotEnvironmentInfo.warnings,
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
          dAppEnvironmentInfo: dAppEnvironmentInfo.info,
          cleanerBotEnvironmentInfo: cleanerBotEnvironmentInfo.info,
          obFillerBotEnvironmentInfo: obFillerBotEnvironmentInfo.info,
          updateGasBotEnvironmentInfo: updateGasBotEnvironmentInfo.info,
        },
        jsonStringifyReplacer,
        2
      )
    );
  } else {
    if (warnings.length > 0) {
      console.group("WARNINGS");
      warnings.forEach((w) =>
        console.warn(`${w.components.join(", ")}: ${w.content}`)
      );
      console.groupEnd();
      console.log();
    }
    if (notes.length > 0) {
      console.group("NOTES");
      notes.forEach((n) =>
        console.log(`${n.components.join(", ")}: ${n.content}`)
      );
      console.groupEnd();
      console.log();
    }

    console.group("ADDRESSES");
    console.table(repoEnvironmentInfo.info.contractAddresses);
    console.groupEnd();
  }

  process.exit(0);
}

function analyzeEnvironment(
  repoEnvInfo: RepoEnvironmentInfo,
  mangroveJsEnvInfo: MangroveJsEnvironmentInfo,
  mangroveConfInfo: MangroveConfigurationInfo,
  dAppEnvironmentInfo: MangroveJsAppEnvironmentInfo,
  cleanerBotEnvironmentInfo: MangroveJsAppEnvironmentInfo,
  obFillerBotEnvironmentInfo: MangroveJsAppEnvironmentInfo,
  updateGasBotEnvironmentInfo: MangroveJsAppEnvironmentInfo
): { notes: Note[]; warnings: Warning[] } {
  let notes: Note[] = [];
  let warnings: Warning[] = [];

  const mgvOracleAddress =
    repoEnvInfo.contractAddresses.get(CONTRACT_MGV_ORACLE);
  if (
    !mangroveConfInfo.globalConfig.useOracle ||
    mangroveConfInfo.globalConfig.monitor !== mgvOracleAddress
  ) {
    warnings.push({
      components: [COMPONENT_MANGROVE_CONFIGURATION, COMPONENT_MANGROVE_REPO],
      content: `Mangrove is not configured to use the latest ${CONTRACT_MGV_ORACLE} contract - globalConfig.useOracle=${mangroveConfInfo.globalConfig.useOracle}, globalConfig.monitor=${mangroveConfInfo.globalConfig.monitor}, address of ${CONTRACT_MGV_ORACLE}=${mgvOracleAddress}`,
    });
  }

  const { notes: dAppNotes, warnings: dAppWarnings } = analyzeMangroveJsApp(
    COMPONENT_DAPP,
    dAppEnvironmentInfo,
    mangroveJsEnvInfo
  );
  notes = [...notes, ...dAppNotes];
  warnings = [...warnings, ...dAppWarnings];

  const { notes: cleanerBotNotes, warnings: cleanerBotWarnings } =
    analyzeMangroveJsApp(
      COMPONENT_BOT_CLEANER,
      cleanerBotEnvironmentInfo,
      mangroveJsEnvInfo
    );
  notes = [...notes, ...cleanerBotNotes];
  warnings = [...warnings, ...cleanerBotWarnings];

  const { notes: obFillerBotNotes, warnings: obFillerBotWarnings } =
    analyzeMangroveJsApp(
      COMPONENT_BOT_OBFILLER,
      obFillerBotEnvironmentInfo,
      mangroveJsEnvInfo
    );
  notes = [...notes, ...obFillerBotNotes];
  warnings = [...warnings, ...obFillerBotWarnings];

  const { notes: updateGasBotNotes, warnings: updateGasBotWarnings } =
    analyzeMangroveJsApp(
      COMPONENT_BOT_UPDATEGAS,
      updateGasBotEnvironmentInfo,
      mangroveJsEnvInfo
    );
  notes = [...notes, ...updateGasBotNotes];
  warnings = [...warnings, ...updateGasBotWarnings];

  return {
    notes,
    warnings,
  };
}

function analyzeMangroveJsApp(
  component: string,
  mangroveJsAppEnvironmentInfo: MangroveJsAppEnvironmentInfo,
  mangroveJsEnvInfo: MangroveJsEnvironmentInfo
): { notes: Note[]; warnings: Warning[] } {
  const notes: Note[] = [];
  const warnings: Warning[] = [];

  if (
    mangroveJsAppEnvironmentInfo.mangroveJsVersion !==
    mangroveJsEnvInfo.latestPackageVersion
  ) {
    warnings.push({
      components: [component, COMPONENT_MANGROVE_JS],
      content: `${component} is not using the latest mangrove.js version - dApp mangrove.js version=${mangroveJsAppEnvironmentInfo.mangroveJsVersion}, mangrove.js latest version=${mangroveJsEnvInfo.latestPackageVersion}`,
    });
  }

  return {
    notes,
    warnings,
  };
}

function jsonStringifyReplacer(key: string, value: any) {
  if (value instanceof Big) {
    return value.toString();
  }
  return value;
}

async function getRepoEnvironmentInfo(): Promise<
  AnnotatedInfo<RepoEnvironmentInfo>
> {
  const notes: Note[] = [];
  const warnings: Warning[] = [];
  const contractAddresses = new Map<string, Address>();
  const fetchPromises = [];
  for (const contractName of CONTRACTS) {
    const gitHubUrlForDeploymentJsonFile = `https://raw.githubusercontent.com/mangrovedao/mangrove/master/packages/mangrove-solidity/deployments/mumbai/${contractName}.json`;
    const fetchPromise = fetchJson(gitHubUrlForDeploymentJsonFile)
      .then((json) => {
        if (json.address !== undefined) {
          contractAddresses.set(contractName, json.address);
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

async function getMangroveJsEnvironmentInfo(): Promise<
  AnnotatedInfo<MangroveJsEnvironmentInfo>
> {
  const notes: Note[] = [];
  const warnings: Warning[] = [];
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
  notes.push({
    components: [COMPONENT_MANGROVE_JS],
    content: `Reported mangrove.js addresses are from the local version (tagged as ${localPackageVersion}, but may include unpublished changes) not the latest package published on npm (${latestPackageVersion})`,
  });
  if (localPackageVersion !== latestPackageVersion) {
    warnings.push({
      components: [COMPONENT_MANGROVE_JS],
      content: `The local version of mangrove.js (tagged as ${localPackageVersion}, but may include unpublished changes) is different from the latest published version on npm ${latestPackageVersion}`,
    });
  }

  return {
    notes,
    warnings,
    info: {
      latestPackageVersion,
      localPackageVersion,
      contractAddresses: new Map(Mangrove.getAllAddresses("maticmum")),
    },
  };
}

const tokens = ["WETH", "DAI", "USDC"];
async function getMangroveConfigurationInfo(
  nodeUrl: string
): Promise<AnnotatedInfo<MangroveConfigurationInfo>> {
  const notes: Note[] = [];
  const warnings: Warning[] = [];

  const mgv: Mangrove = await Mangrove.connect(nodeUrl).catch((reason) => {
    warnings.push({
      components: [COMPONENT_MANGROVE_CONFIGURATION],
      content: `Could not connect to Mangrove using mangrove.js, reason: ${reason}`,
    });
    return undefined;
  });
  if (mgv === undefined) {
    return {
      notes,
      warnings,
      info: { globalConfig: undefined, localConfigs: undefined },
    };
  }

  const globalConfigPromise = mgv.config();
  const localConfigPromises = [];
  const localConfigs = [];
  // Go through all pairs of tokens
  for (let i = 0; i < tokens.length; ++i) {
    for (let j = i + 1; j < tokens.length; ++j) {
      localConfigPromises.push(
        mgv
          .market({
            base: tokens[i],
            quote: tokens[j],
            bookOptions: { maxOffers: 0 },
          })
          .then((market) => market.config())
          .then((localConfig) => {
            localConfigs.push({
              base: tokens[i],
              quote: tokens[j],
              config: localConfig,
            });
          })
      );
    }
  }

  const globalConfig = await globalConfigPromise;
  Promise.allSettled(localConfigPromises);

  if (globalConfig.dead) {
    warnings.push({
      components: [COMPONENT_MANGROVE_CONFIGURATION],
      content: `Mangrove at ${mgv.contract.address} is dead`,
    });
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

async function getMangroveJsAppEnvironmentInfo(
  component: string,
  url: string
): Promise<AnnotatedInfo<MangroveJsAppEnvironmentInfo>> {
  const notes: Note[] = [];
  const warnings: Warning[] = [];

  let mangroveJsVersion: string;
  const urlForEnvInfoJsonFile = `${url}/environmentInformation.json`;
  await fetchJson(urlForEnvInfoJsonFile)
    .then((json) => {
      mangroveJsVersion = json.mangroveJsVersion;
    })
    .catch((e) => {
      warnings.push({
        components: [component],
        content: `Error encountered when fetching environment info json file: URL=${urlForEnvInfoJsonFile}, error=${e}`,
      });
    });

  return {
    notes,
    warnings,
    info: {
      url: url,
      mangroveJsVersion,
    },
  };
}
