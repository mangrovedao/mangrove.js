import assert from "assert";
import { describe, it } from "mocha";
import KandelConfiguration from "../../../src/kandel/kandelConfiguration";

describe(`${KandelConfiguration.prototype.constructor.name} unit tests suite`, () => {
  let sut: KandelConfiguration;
  let sutWithOverride: KandelConfiguration;
  beforeEach(() => {
    sut = new KandelConfiguration();
    sutWithOverride = new KandelConfiguration({
      gaspriceFactor: 10,
      maxOffersInPopulateChunk: 50,
      maxOffersInRetractChunk: 50,
      aaveEnabled: false,
      stepSize: 1,
      baseQuoteTickOffset: 99,
      networks: {
        configTest: {
          stepSize: 2,
          markets: {
            TokenA: {
              TokenB: {
                minimumBasePerOfferFactor: 2,
                minimumQuotePerOfferFactor: "3",
                baseQuoteTickOffset: 1,
                aaveEnabled: true,
              },
              FailingConfig0: {
                aaveEnabled: undefined,
                minimumBasePerOfferFactor: 1,
                minimumQuotePerOfferFactor: 1,
                stepSize: undefined,
                baseQuoteTickOffset: undefined,
              },
              FailingConfig1: {},
              FailingConfig2: { minimumBasePerOfferFactor: 1 },
              FailingConfig3: {
                minimumBasePerOfferFactor: 1,
                minimumQuotePerOfferFactor: 1,
                stepSize: undefined,
              },
              FailingConfig4: {
                minimumBasePerOfferFactor: 1,
                minimumQuotePerOfferFactor: 1,
                baseQuoteTickOffset: undefined,
              },
            },
          },
        },
      },
    });
  });

  describe(
    KandelConfiguration.prototype.getConfiguredMarketsForNetwork.name,
    () => {
      it(`configTest`, () => {
        // Act
        const markets =
          sutWithOverride.getConfiguredMarketsForNetwork("configTest");
        // Assert
        assert.deepStrictEqual(markets, [
          { base: "TokenA", quote: "TokenB" },
          { base: "TokenA", quote: "FailingConfig0" },
          { base: "TokenA", quote: "FailingConfig1" },
          { base: "TokenA", quote: "FailingConfig2" },
          { base: "TokenA", quote: "FailingConfig3" },
          { base: "TokenA", quote: "FailingConfig4" },
        ]);
      });

      it(`maticmum`, () => {
        // Act
        const markets = sut.getConfiguredMarketsForNetwork("maticmum");
        // Assert
        assert.deepStrictEqual(markets, [
          { base: "WETH.T/MGV", quote: "DAI.T/AAVEv3" },
          { base: "WETH.T/MGV", quote: "USDC.T/MGV" },
          { base: "DAI.T/AAVEv3", quote: "USDC.T/MGV" },
          { base: "WMATIC.T/MGV", quote: "USDT.T/MGV" },
          { base: "WBTC.T/AAVEv3", quote: "USDT.T/MGV" },
          { base: "WBTC.T/AAVEv3", quote: "DAI.T/AAVEv3" },
          { base: "CRV.T/AAVEv3", quote: "WBTC.T/AAVEv3" },
        ]);
      });

      it(`unknown`, () => {
        // Act
        const markets = sut.getConfiguredMarketsForNetwork("unknown");
        // Assert
        assert.deepStrictEqual(markets, []);
      });
    },
  );

  describe(KandelConfiguration.prototype.getConfigForBaseQuote.name, () => {
    it("inherits and overrides for market", () => {
      // Arrange/act
      const config = sutWithOverride.getConfigForBaseQuote(
        "configTest",
        "TokenA",
        "TokenB",
      );

      // Assert
      assert.equal(config.stepSize, 2, "overriden for network");
      assert.equal(config.baseQuoteTickOffset, 1, "overridden for market");
      assert.equal(
        config.maxOffersInPopulateChunk,
        50,
        "inherited from global",
      );
      // Assert all others are also read
      assert.equal(config.aaveEnabled, true);
      assert.equal(config.maxOffersInRetractChunk, 50);
      assert.equal(config.gaspriceFactor, 10);
      assert.equal(config.minimumBasePerOfferFactor.toNumber(), 2);
      assert.equal(config.minimumQuotePerOfferFactor.toNumber(), 3);
    });

    [
      "aaveEnabled is not configured for pair TokenA/FailingConfig0 on network configTest.",
      "minimumBasePerOfferFactor is not configured for pair TokenA/FailingConfig1 on network configTest.",
      "minimumQuotePerOfferFactor is not configured for pair TokenA/FailingConfig2 on network configTest.",
      "stepSize is not configured for pair TokenA/FailingConfig3 on network configTest.",
      "baseQuoteTickOffset is not configured for pair TokenA/FailingConfig4 on network configTest.",
    ].forEach((message, index) => {
      it(`throws on missing config ${index} - ${message}`, () => {
        // Act/Assert
        assert.throws(
          () =>
            sutWithOverride.getConfigForBaseQuote(
              "configTest",
              "TokenA",
              `FailingConfig${index}`,
            ),
          { message },
        );
      });
    });

    it("parses all expected valid", () => {
      sut.getNetworks().forEach((network) => {
        sut.getConfiguredMarketsForNetwork(network).forEach((market) => {
          // Act/assert - simply do not throw.
          sut.getConfigForBaseQuote(network, market.base, market.quote);
        });
      });
    });
  });

  describe(KandelConfiguration.prototype.getMostSpecificConfig.name, () => {
    it("does not fail on missing network", () => {
      const config = sutWithOverride.getMostSpecificConfig(
        "unknown",
        "unknown",
        "unknown",
      );
      assert.equal(config.stepSize, 1);
    });

    it("does not fail on missing base", () => {
      const config = sutWithOverride.getMostSpecificConfig(
        "configTest",
        "unknown",
        "unknown",
      );
      assert.equal(config.stepSize, 2);
    });

    it("does not fail on missing quote", () => {
      const config = sutWithOverride.getMostSpecificConfig(
        "configTest",
        "TokenA",
        "unknown",
      );
      assert.equal(config.stepSize, 2);
    });

    it("does not fail on missing properties", () => {
      const config = sutWithOverride.getMostSpecificConfig(
        "configTest",
        "TokenA",
        "FailingConfig0",
      );
      assert.equal(config.stepSize, undefined);
      assert.equal(config.minimumBasePerOfferFactor, 1);
    });
  });
});
