import config from "config";
import path from "path";

const packageConfigDir = path.join(__dirname, "../../../config");
const baseConfig = config.util.loadFileConfigs(packageConfigDir);
config.util.setModuleDefaults("MangroveJs", baseConfig);

export default config;
export { config };
