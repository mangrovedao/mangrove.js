import Mangrove from "../mangrove";
import { typechain } from "../types";
import { BigNumber, ethers } from "ethers";
import logger from "../util/logger";
import { createTxWithOptionalGasEstimation } from "../util/transactions";
import { AbstractRoutingLogic } from "../logics/AbstractRoutingLogic";
import { z } from "zod";
import { evmAddress, liberalBigInt, liberalPositiveBigInt } from "../schemas";

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

const retractBundleParams = z.object({
  bundleId: liberalBigInt,
  outboundToken: evmAddress,
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
