import { Block } from "@ethersproject/providers";
import { sleep } from "@mangrovedao/commonlib.js";
import ReliableProvider from "./reliableProvider";

export namespace ReliableHTTProvider {
  export type Options = {
    estimatedBlockTimeMs: number;
  };
}

class ReliableHTTProvider extends ReliableProvider {
  constructor(
    options: ReliableProvider.Options,
    private httpOptions: ReliableHTTProvider.Options
  ) {
    super(options);
  }

  async getLatestBlock() {
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
}

export default ReliableHTTProvider;
