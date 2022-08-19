import get from "axios";
import _ from "lodash";
import * as constants from "../constants";

import * as fs from "fs";
import path from "path";

class CompareOnChainAbis {
  async compare(contractAddress: string, apikey: string, contractName: string) {
    console.log(
      "check abi for " + contractName + " with address " + contractAddress
    );
    const json = await get(
      "https://api-testnet.polygonscan.com/api?module=contract&action=getabi&address=" +
        contractAddress +
        "&apikey=" +
        apikey
    );
    const data: {
      status: string;
      message: string;
      result: string;
    } = await json.data;

    const localAbiJson = JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../abis/" + contractName + ".json"),
        "utf8"
      )
    );
    const localAbi = localAbiJson.abi;
    const onchainAbi = JSON.parse(data.result);
    //FIXME: workaround for the onchain abi using slightly different types
    const trimmedOnchainAbi = JSON.stringify(onchainAbi)
      .replaceAll("Local.t", "t")
      .replaceAll("Global.t", "t")
      .replaceAll("OfferDetail.t", "t")
      .replaceAll("Offer.t", "t");

    if (!_.isEqual(localAbi, JSON.parse(trimmedOnchainAbi))) {
      //console.log( "======== local ========" )
      //console.log( JSON.stringify( localAbi ) )
      //console.log( "======== onchain =======")
      //console.log( JSON.stringify( onchainAbi ) )
      console.log(
        "::warning :: The onchain abi for " +
          contractName +
          " does not match the local abi in mangrove.js"
      );
    }
  }
}
//TODO: This is a personal api key, should be changed to an official mangrove api ky
const polygonscanApiKey = "PQEZ11BX2ZV2B42YRI1MRWXZ4SDHDEA369";
const contractAddress = constants.addresses.maticmum;
const compareAbis = new CompareOnChainAbis();
compareAbis
  .compare(contractAddress.Mangrove, polygonscanApiKey, "Mangrove")
  .then(() =>
    compareAbis.compare(
      contractAddress.MgvReader,
      polygonscanApiKey,
      "MgvReader"
    )
  )
  .then(() =>
    compareAbis.compare(
      contractAddress.MgvCleaner,
      polygonscanApiKey,
      "MgvCleaner"
    )
  )
  .then(() =>
    compareAbis.compare(
      contractAddress.MgvOracle,
      polygonscanApiKey,
      "MgvOracle"
    )
  )
  .then(() =>
    compareAbis.compare(
      contractAddress.MangroveOrder,
      polygonscanApiKey,
      "MangroveOrder"
    )
  )
  .then(() =>
    setTimeout(
      () =>
        compareAbis.compare(
          contractAddress.MangroveOrderEnriched,
          polygonscanApiKey,
          "MangroveOrderEnriched"
        ),
      1000
    )
  );
