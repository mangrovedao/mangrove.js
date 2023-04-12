import { Block } from "@ethersproject/providers";
import { sleep } from "../../util/sleep";
import ReliableProvider from "./reliableProvider";

namespace ReliableHttpProvider {
  export type Options = {
    estimatedBlockTimeMs: number;
  };
}

class ReliableHttpProvider extends ReliableProvider {
  private shouldStop: boolean = false;

  constructor(
    options: ReliableProvider.Options,
    private httpOptions: ReliableHttpProvider.Options
  ) {
    super(options);
  }

  async _initialize(): Promise<void> {
    this.shouldStop = false;
    await this.getLatestBlock();
  }

  async getLatestBlock() {
    if (this.shouldStop) {
      return;
    }

    try {
      const blockHeader: Block = await this.options.provider.getBlock("latest");
      await this.blockManager.handleBlock({
        parentHash: blockHeader.parentHash,
        hash: blockHeader.hash,
        number: blockHeader.number,
      });
      await this.blockManager.handleBlock(blockHeader);
    } catch (e) {}

    await sleep(this.httpOptions.estimatedBlockTimeMs);
    this.getLatestBlock();
  }

  stop(): void {
    this.shouldStop = true;
  }
}

export default ReliableHttpProvider;
