import { logger } from "../logger";
import * as ethers from "ethers";

import Market from "../../market";
// syntactic sugar
import { Bigish } from "../../types";
import Mangrove from "../../mangrove";

/* Note on big.js:
ethers.js's BigNumber (actually BN.js) only handles integers
big.js handles arbitrary precision decimals, which is what we want
for more on big.js vs decimals.js vs. bignumber.js (which is *not* ethers's BigNumber):
  github.com/MikeMcl/big.js/issues/45#issuecomment-104211175
*/
import Big from "big.js";
import { OfferLogic } from "../..";
import PrettyPrint, { prettyPrintFilter } from "../prettyPrint";
import { LiquidityProvider } from "../..";
import * as typechain from "../../types/typechain";
import { waitForTransaction } from "./mgvIntegrationTestUtil";

/** Usage example
  Terminal 1: 
  $ npx mgv node
 
  Terminal 2:
  $ ts-node --skipProject
  > import {Mangrove,TestMaker} from './src'
  > const mgv = await Mangrove.connect(); // localhost:8545 by default
  > const tm = await TestMaker.create({mgv,base:"TokenA",quote:"TokenB"});
  > await tm.newOffer({ba:"asks",wants:1,gives:1,shouldRevert:true});
  > // We posted an offer.
  > // * Notice the shouldRevert:true
  > // * The base token must be mintable
  >
  > // We're done. To test that the offer does fail:
  > await tm.market.requestBook() // show the current book
  > const quote = tm.market.quote;
  > await quote.approveMangrove();
  > await quote.contract.mint(await mgv.signer.getAddress(),quote.toUnits(10));
  > // will contain a revert
  > const {result,response} = await tm.market.buy({volume:2,price:1});
*/
namespace TestMaker {
  export type OfferParams = LiquidityProvider.OfferParams & {
    shouldRevert?: boolean;
    executeData?: string;
    gasreq?: number;
    gasprice?: number;
  };

  export type CreateParams = {
    mgv: Mangrove;
    base: string;
    quote: string;
  };
}

/* Prevent directly calling Mangrove constructor
   use Mangrove.connect to make sure the network is reached during construction */
let canConstructTestMaker = false;

let PROVISION_AMOUNT_IN_ETHERS = 2;

class TestMaker {
  mgv: Mangrove;
  contract: typechain.SimpleTestMaker;
  market: Market;
  prettyP = new PrettyPrint();

  constructor(p: { mgv: Mangrove; market: Market; address: string }) {
    if (!canConstructTestMaker) {
      throw Error(
        "TestMaker must be initialized async with Market.create (constructors cannot be async)"
      );
    }
    this.mgv = p.mgv;
    this.contract = typechain.SimpleTestMaker__factory.connect(
      p.address,
      p.mgv.signer
    );
    this.market = p.market;
  }

  static async create(
    p: TestMaker.CreateParams & Partial<Market.OptionalParams>
  ): Promise<TestMaker> {
    const baseAddress = p.mgv.getAddress(p.base);
    const quoteAddress = p.mgv.getAddress(p.quote);
    const contract = await new typechain.SimpleTestMaker__factory(
      p.mgv.signer
    ).deploy(p.mgv.address, baseAddress, quoteAddress);
    await contract.deployTransaction.wait();

    const amount = Mangrove.toUnits(PROVISION_AMOUNT_IN_ETHERS, 18);
    const tx = await contract.provisionMgv(amount, { value: amount });
    await tx.wait();

    const market = await Market.connect(p);

    canConstructTestMaker = true;
    const testMaker = new TestMaker({
      mgv: p.mgv,
      market,
      address: contract.address,
    });
    canConstructTestMaker = false;
    return testMaker;
  }

  async newOffer(
    p: { ba: Market.BA } & TestMaker.OfferParams,
    overrides: ethers.Overrides = {}
  ): Promise<{ id: number; pivot: number; event: ethers.providers.Log }> {
    const defaults = {
      shouldRevert: false,
      executeData: "executeData",
      gasreq: 100_000,
      gasprice: 0,
    };

    p = { ...defaults, ...p };

    const { wants, gives, price, fund } =
      LiquidityProvider.normalizeOfferParams(p);

    const { outbound_tkn, inbound_tkn } = this.market.getOutboundInbound(p.ba);

    // ensure mangrove is approved
    await waitForTransaction(
      this.contract.approveMgv(
        outbound_tkn.address,
        ethers.constants.MaxUint256
      )
    );

    await waitForTransaction(
      this.contract.approveMgv(inbound_tkn.address, ethers.constants.MaxUint256)
    );

    //TODO impersonate admin/someone with tokens
    await waitForTransaction(
      typechain.TestToken__factory.connect(
        outbound_tkn.address,
        this.mgv.signer
      ).mint(this.contract.address, ethers.BigNumber.from(gives))
    );

    const payableOverrides = LiquidityProvider.optValueToPayableOverride(
      overrides,
      fund
    );

    const amount = payableOverrides.value ?? 0;

    const offerData = {
      shouldRevert: p.shouldRevert,
      executeData: p.executeData,
    };

    const pivot = (await this.market.getPivotId(p.ba, price)) ?? 0;

    const txPromise = this.contract[
      "newOfferWithFunding(address,address,uint256,uint256,uint256,uint256,uint256,uint256,(bool,string))"
    ](
      this.market.base.address,
      this.market.quote.address,
      inbound_tkn.toUnits(wants),
      outbound_tkn.toUnits(gives),
      p.gasreq,
      p.gasprice,
      pivot,
      amount,
      offerData,
      payableOverrides
    );

    return this.market.onceWithTxPromise(
      txPromise,
      (cbArg, _event, ethersEvent) => ({
        id: cbArg.offerId,
        event: ethersEvent,
        pivot: pivot,
      }),
      (_cbArg, evt /*, _ethersEvent*/) => evt.name === "OfferWrite"
    );
  }

  /** Post a new ask */
  newAsk(
    p: TestMaker.OfferParams,
    overrides: ethers.Overrides = {}
  ): Promise<{ id: number; event: ethers.providers.Log }> {
    return this.newOffer({ ba: "asks", ...p }, overrides);
  }

  /** Post a new bid */
  newBid(
    p: TestMaker.OfferParams,
    overrides: ethers.Overrides = {}
  ): Promise<{ id: number; event: ethers.providers.Log }> {
    return this.newOffer({ ba: "bids", ...p }, overrides);
  }

  /** List all of the maker's asks in the cache */
  asks(): Market.Offer[] {
    return this.market
      .getBook()
      .asks.iter()
      .filter((ofr) => ofr.maker === this.contract.address)
      .toArray();
  }

  /** List all of the maker's bids in the cache */
  bids(): Market.Offer[] {
    return this.market
      .getBook()
      .bids.iter()
      .filter((ofr) => ofr.maker === this.contract.address)
      .toArray();
  }

  /** Pretty prints the current state of the asks for the maker */
  consoleAsks(filter?: prettyPrintFilter): void {
    this.prettyP.consoleOffers(this.asks(), filter);
  }

  /** Pretty prints the current state of the bids for the maker */
  consoleBids(filter?: prettyPrintFilter): void {
    this.prettyP.consoleOffers(this.bids(), filter);
  }
}

export default TestMaker;
