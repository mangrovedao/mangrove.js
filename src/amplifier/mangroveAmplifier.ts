import Mangrove from "../mangrove";
import { typechain } from "../types";
import { BigNumber, ethers } from "ethers";
import logger from "../util/logger";
import { createTxWithOptionalGasEstimation } from "../util/transactions";
import { AbstractRoutingLogic } from "../logics/AbstractRoutingLogic";
import { z } from "zod";
import { evmAddress, liberalBigInt, liberalPositiveBigInt } from "../schemas";
import { OLKeyStruct } from "../types/typechain/MangroveAmplifier";

export type Transaction<TResult> = {
  /** The result of the market transaction.
   *
   * Resolves when the transaction has been included on-chain.
   *
   * Rejects if the transaction fails.
   */
  result: Promise<TResult>;

  /** The low-level transaction that has been submitted to the chain. */
  response: Promise<ethers.ContractTransaction>;
};

const inboundTokenSchema = z.object({
  inboundToken: evmAddress,
  inboundLogic: z
    .instanceof(AbstractRoutingLogic)
    .refine((v) => ethers.utils.isAddress(v.address), "Invalid EVM Address"),
  tickSpacing: liberalPositiveBigInt,
  tick: z.number(),
});

const addBundleParams = z.object({
  outboundToken: evmAddress,
  outboundVolume: liberalPositiveBigInt,
  outboundLogic: z.instanceof(AbstractRoutingLogic),
  expiryDate: liberalBigInt,
  inboundTokens: z.array(inboundTokenSchema),
});

const updateBundleParams = z.object({
  bundleId: liberalBigInt,
  outboundToken: evmAddress,
  outboundVolume: liberalBigInt,
  updateExpiry: z.boolean(),
  expiryDate: liberalBigInt,
});

const updateBundleOfferParams = z.object({
  bundleId: liberalBigInt,
  inboundToken: evmAddress,
  newTick: z.number().optional(),
  newInboundLogic: z.instanceof(AbstractRoutingLogic).optional(),
  outboundToken: evmAddress,
});

const retractBundleParams = z.object({
  bundleId: liberalBigInt,
  outboundToken: evmAddress,
});

const setRoutingLogicParams = z.object({
  token: evmAddress,
  logic: z.instanceof(AbstractRoutingLogic),
  offerId: liberalBigInt,
  olKeyHash: z.string(),
});

/**
 * @title MangroveAmplifier
 * @desc Defines the interaction for Mangrove Amplifier.
 */
class MangroveAmplifier {
  mgv: Mangrove;
  amplifier: typechain.MangroveAmplifier;

  constructor(params: {
    mgv: Mangrove;
    amplifier: typechain.MangroveAmplifier;
  }) {
    this.mgv = params.mgv;
    this.amplifier = params.amplifier;
  }

  /**
   * @param data The data to add a bundle
   * @param data.outboundToken The outbound token of the bundle
   * @param data.outboundVolume The volume of the outbound token
   * @param data.outboundLogic The logic of the outbound token
   * @param data.expiryDate The expiry date of the bundle
   * @param data.inboundTokens The inbound tokens of the bundle
   * @returns
   */
  public async addBundle(
    data: z.input<typeof addBundleParams>,
  ): Promise<BigNumber> {
    const {
      outboundToken,
      outboundVolume,
      outboundLogic,
      expiryDate,
      inboundTokens,
    } = addBundleParams.parse(data);
    const fx = {
      outbound_tkn: outboundToken,
      outVolume: outboundVolume,
      outboundLogic: outboundLogic.address,
      expiryDate,
    };

    const gasPrice = BigNumber.from(10 ** 9).mul(this.mgv.config().gasprice);

    // Check for inbound token being duplicated
    const vr = [];

    const inboundSet = new Set<string>();

    let total = BigNumber.from(160_000);
    for (const token of inboundTokens) {
      const gasreq = BigNumber.from(token.inboundLogic.gasOverhead);
      const provision = gasPrice.mul(gasreq);
      if (inboundSet.has(token.inboundToken)) {
        throw new Error("Inbound token duplicated in bundle");
      }
      inboundSet.add(token.inboundToken);
      vr.push({
        gasreq,
        provision,
        inboundLogic: token.inboundLogic.address,
        inbound_tkn: token.inboundToken,
        tickSpacing: token.tickSpacing,
        tick: token.tick,
      });
      total = total.add(provision).add(BigNumber.from(64_000));
    }

    const response = await createTxWithOptionalGasEstimation(
      this.amplifier.newBundle,
      this.amplifier.estimateGas.newBundle,
      1,
      {},
      [fx, vr, { value: total }],
    );

    const receipt = await response.wait();

    logger.debug("Amplified order raw receipt", {
      contextInfo: "amplifiedOrder.addBundle",
      data: { receipt },
    });

    const bundleId = receipt.events?.filter((e) => e.event === "InitBundle")[0]
      .args?.bundleId;
    return BigNumber.from(bundleId);
  }

  public async getBundle(
    bundleId: BigNumber | string,
    outboundToken: string,
  ): Promise<{
    expiryDate: BigNumber;
    offers: Array<{
      inboundToken: string;
      tickSpacing: BigNumber;
      offerId: BigNumber;
    }>;
  }> {
    bundleId = BigNumber.from(bundleId);
    const data = await this.amplifier.offersOf(bundleId);
    const otherData = await this.amplifier.reneging(
      ethers.constants.HashZero,
      bundleId,
    );

    return {
      expiryDate: otherData.date,
      offers: data.map((offer) => {
        return {
          inboundToken: offer.inbound_tkn,
          tickSpacing: offer.tickSpacing,
          offerId: offer.offerId,
        };
      }),
    };
  }

  /**
   * @param bundleId the bundle identifier
   * @param outboundToken the outbound token of the bundle
   * @param outboundVolume the new volume that each offer of the bundle should now offer. Use 0 to skip volume update.
   * @param updateExpiry whether the update also changes expiry date of the bundle
   * @param expiryDate the new date (if `updateExpiry` is true) for the expiry of the offers of the bundle. 0 for no expiry
   */
  public async updateBundle(
    data: z.input<typeof updateBundleParams>,
  ): Promise<void> {
    const {
      bundleId,
      outboundToken,
      outboundVolume,
      updateExpiry,
      expiryDate,
    } = updateBundleParams.parse(data);
    const response = await createTxWithOptionalGasEstimation(
      this.amplifier.updateBundle,
      this.amplifier.estimateGas.updateBundle,
      0,
      {},
      [bundleId, outboundToken, outboundVolume, updateExpiry, expiryDate],
    );
    const receipt = await response.wait();

    logger.debug("Amplified order update raw receipt", {
      contextInfo: "amplifiedOrder.updateBundle",
      data: { receipt },
    });
    return;
  }

  /**
   */
  public async updateOfferInBundle(
    data: z.input<typeof updateBundleOfferParams>,
  ): Promise<void> {
    const { bundleId, inboundToken, newTick, newInboundLogic, outboundToken } =
      updateBundleOfferParams.parse(data);

    const offers = await this.amplifier.offersOf(bundleId);

    const offer = offers.filter((o) => o.inbound_tkn === inboundToken)[0];
    const { offerId, tickSpacing } = offer;

    const base = await this.mgv.tokenFromAddress(inboundToken);
    const quote = await this.mgv.tokenFromAddress(outboundToken);
    const market = await this.mgv.market({
      base,
      quote,
      tickSpacing: tickSpacing.toNumber(),
    });

    const gives = await market.offerInfo("bids", offerId.toNumber());

    const olKey: OLKeyStruct = {
      tickSpacing,
      outbound_tkn: outboundToken,
      inbound_tkn: inboundToken,
    };

    const olKeyHash = this.mgv.getOlKeyHash(olKey);
    const user = await this.mgv.signer.getAddress();
    const router = await this.mgv.orderContract.router(user);
    const userRouter = typechain.SmartRouter__factory.connect(
      router,
      this.mgv.signer,
    );

    const existingLogic = await userRouter.getLogic({
      offerId,
      fundOwner: ethers.constants.AddressZero,
      olKeyHash,
      token: outboundToken,
    });

    const existingLogicKey = Object.entries(this.mgv.logics).filter(
      ([key, value]) => {
        if (value.address === existingLogic) {
          return true;
        }
      },
    );

    if (existingLogicKey.length === 0) {
      throw new Error("No logic found for the given address");
    }

    const existingLogicInstance = (this.mgv.logics as any)[
      existingLogicKey[0][0]
    ];

    const gasReq = (newInboundLogic ?? existingLogicInstance)?.gasOverhead;

    if (newTick) {
      const response = await createTxWithOptionalGasEstimation(
        this.amplifier.updateOffer,
        this.amplifier.estimateGas.updateOffer,
        0,
        {},
        [olKey, newTick, gives.gives.toString(), gasReq, offerId],
      );
      const receipt = await response.wait();

      logger.debug("Amplified order update tick receipt", {
        contextInfo: "amplifiedOrder.updateOfferInBundle",
        data: { receipt },
      });
    }

    if (newInboundLogic) {
      await this.setRoutingLogic(
        {
          token: inboundToken,
          logic: newInboundLogic,
          offerId: offerId.toNumber(),
          olKeyHash,
        },
        {},
      );
    }
    return;
  }

  private async setRoutingLogic(
    params: z.input<typeof setRoutingLogicParams>,
    overrides?: ethers.Overrides,
  ): Promise<Transaction<boolean>> {
    const { olKeyHash, token, offerId, logic } =
      setRoutingLogicParams.parse(params);
    const user = await this.mgv.signer.getAddress();
    const router = await this.mgv.orderContract.router(user);
    const userRouter = typechain.SmartRouter__factory.connect(
      router,
      this.mgv.signer,
    );
    const txPromise = userRouter.setLogic(
      { olKeyHash, token, offerId, fundOwner: ethers.constants.AddressZero },
      logic.address,
      overrides,
    );
    const wasSet = new Promise<boolean>((res, rej) => {
      txPromise
        .then((tx) => tx.wait())
        .then((receipt) => {
          res(receipt.status === 1);
        })
        .catch(rej);
    });
    return {
      response: txPromise,
      result: wasSet,
    };
  }

  /**
   * Retracts a bundle, removing all offers
   * @param bundleId the bundle identifier
   * @param token the token that the bundle was for
   */
  public async retractBundle(
    data: z.input<typeof retractBundleParams>,
  ): Promise<void> {
    const { bundleId, outboundToken } = retractBundleParams.parse(data);
    const response = await createTxWithOptionalGasEstimation(
      this.amplifier.retractBundle,
      this.amplifier.estimateGas.retractBundle,
      0,
      {},
      [bundleId, outboundToken],
    );
    const receipt = await response.wait();

    logger.debug("Amplified order update raw receipt", {
      contextInfo: "amplifiedOrder.retractBundle",
      data: { receipt },
    });
    return;
  }
}

export default MangroveAmplifier;
