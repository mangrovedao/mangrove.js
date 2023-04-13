import { Log, Provider } from "@ethersproject/providers";
import { Contract } from "ethers";
import Market from "./market";
import BlockManager from "./tracker/blockManager";
import LogSubscriber from "./tracker/logSubscriber";

class MangroveEventSubscriber extends LogSubscriber<Market.BookSubscriptionEvent> {
  private bookEventSubscribers: Record<
    string,
    LogSubscriber<Market.BookSubscriptionEvent>
  > = {};

  constructor(
    private provider: Provider,
    private contract: Contract,
    private blockManager: BlockManager
  ) {
    super();
    this.blockManager.subscribeToLogs(
      {
        address: this.contract.address,
        topics: [],
      },
      this
    );
  }

  public async subscribeToMarket(
    market: Market,
    asksSemibook: LogSubscriber<Market.BookSubscriptionEvent>,
    bidsSemibook: LogSubscriber<Market.BookSubscriptionEvent>
  ) {
    const identifier =
      `${market.base.address}_${market.quote.address}`.toLowerCase();
    this.bookEventSubscribers[identifier] = asksSemibook;

    const reversedIdentifier =
      `${market.quote.address}_${market.base.address}`.toLowerCase();
    this.bookEventSubscribers[reversedIdentifier] = bidsSemibook;
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
  public handleLog(log: Log): Promise<void> {
    const event: Market.BookSubscriptionEvent = this.contract.parseLog(log);

    const identifier = `${event.args[0]}_${event.args[1]}`.toLowerCase(); // outbound_tkn_inbound_tkn

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
