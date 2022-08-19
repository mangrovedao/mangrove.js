import get from "axios";
import _ from "lodash";
import * as constants from "./constants";

import * as fs from "fs";
import path from "path";

class CompareOnChainAbis {
  async compare() {
    const address = constants.addresses.maticmum.Mangrove;
    //TODO: use other apikey
    const polygonscanApiKey = "PQEZ11BX2ZV2B42YRI1MRWXZ4SDHDEA369";
    const json = await get(
      "https://api-testnet.polygonscan.com/api?module=contract&action=getabi&address=" +
        address +
        "&apikey=" +
        polygonscanApiKey
    );
    const data: {
      status: string;
      message: string;
      result: string;
    } = await json.data;

    const mangroveJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "./abis/Mangrove.json"), "utf8")
    );
    const localAbi = mangroveJson.abi;
    const onchainAbi = JSON.parse(data.result);
    const trimmedOnchainAbi = JSON.stringify(onchainAbi)
      .replaceAll("Local.t", "t")
      .replaceAll("Global.t", "t")
      .replaceAll("OfferDetail.t", "t")
      .replaceAll("Offer.t", "t");

    if (_.isEqual(localAbi, JSON.parse(trimmedOnchainAbi)))
      fs.writeFileSync("AbiAreEqual.json", trimmedOnchainAbi);
  }
}

new CompareOnChainAbis().compare();
