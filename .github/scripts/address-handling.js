import fs from 'fs';
import path from 'path';

function getAddr(deploymentFolder, contract, jsonPath) {
  try {
    const filePath = path.join(deploymentFolder, contract + ".json");
    if (!fs.existsSync(filePath)){
      return null;
    };

    const deployJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return deployJson[jsonPath];
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

export const readContractAddresses = function(deploymentFolder, contractAddressNames, suffix = "") {
  return contractAddressNames.reduce(
    (prev, contract) => { 
      return {...prev, [contract]: getAddr(deploymentFolder, contract.concat(suffix), "address") } 
    }, 
    {});
}
