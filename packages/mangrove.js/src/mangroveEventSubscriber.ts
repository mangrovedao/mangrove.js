import { Log, Provider } from "@ethersproject/providers";
import { Contract } from "ethers";
import Market from "./market";
import Semibook from "./semibook";
import BlockManager from "./tracker/blockManager";
import LogSubscriber from "./tracker/logSubscriber";
import logger from "./util/logger";

const BookSubscriptionEventsSet = new Set([
  "OfferWrite",
  "OfferFail",
  "OfferSuccess",
  "OfferRetract",
  "SetGasbase",
]);

class MangroveEventSubscriber extends LogSubscriber<Market.BookSubscriptionEvent> {
  private bookEventSubscribers: Record<
    string,
    LogSubscriber<Market.BookSubscriptionEvent>
  >;

  constructor(
    private provider: Provider,
    private contract: Contract,
    private blockManager: BlockManager
  ) {
    super();
    this.bookEventSubscribers = {};
  }

  public async enableSubscriptions() {
    await this.blockManager.subscribeToLogs(
      {
        address: this.contract.address,
        topics: [],
      },
      this
    );
  }

  public async subscribeToSemibook(semibook: Semibook) {
    const identifier =
      semibook.ba === "asks"
        ? `${semibook.market.base.address}_${semibook.market.quote.address}`.toLowerCase()
        : `${semibook.market.quote.address}_${semibook.market.base.address}`.toLowerCase();

    logger.debug(
      `[MangroveEventSubscriber] subscribeToSemibook() ${semibook.ba} ${semibook.market.base.name}/${semibook.market.quote.name}`
    );
    await semibook.initialize(this.blockManager.lastBlock); // TODO: (!!!WARNING!!!) verifySubscriber needs to be forwarded somehow
    logger.debug(
      `[MangroveEventSubscriber] Semibook initialized ${semibook.ba} ${semibook.market.base.name}/${semibook.market.quote.name}`
    );

    this.bookEventSubscribers[identifier] = semibook;
  }

  /**
   * initialize subscriber at block number `blockNumber`.
   */
  public async initialize(
    wantedBlock: BlockManager.BlockWithoutParentHash
  ): Promise<LogSubscriber.InitialzeErrorOrBlock> {
    this.initializedAt = undefined;
    this.lastSeenEventBlock = undefined;

    try {
      const block = await this.provider.getBlock(wantedBlock.number);
      this.initializedAt = {
        hash: block.hash,
        number: block.number,
      };

      this.lastSeenEventBlock = block;
      return { error: undefined, ok: this.initializedAt };
    } catch {
      return { error: "FailedInitialize", ok: undefined };
    }
  }

  /**
   * handle log
   */
  public async handleLog(log: Log): Promise<void> {
    const event: Market.BookSubscriptionEvent =
      this.contract.interface.parseLog(log) as any; // wrap this in try catch
    const identifier = `${event.args[0]}_${event.args[1]}`.toLowerCase(); // outbound_tkn_inbound_tkn

    if (!BookSubscriptionEventsSet.has(event.name)) {
      return; // ignore events
    }

    const sub = this.bookEventSubscribers[identifier];
    if (!sub) {
      return;
    }
    return sub.handleLog(log, event);
  }

  /**
   * rollback subscriber to block `block`
   */
  public rollback(block: BlockManager.Block): void {
    for (const sub of Object.values(this.bookEventSubscribers)) {
      if (
        sub.lastSeenEventBlock &&
        block.number < sub.lastSeenEventBlock.number
      ) {
        sub.rollback(block);
      }
    }
  }
}

export default MangroveEventSubscriber;
