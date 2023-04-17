import logger from "../../util/logger";
import WebSocket from "ws";

export type ReliableWebsocketOptions = {
  wsUrl: string;
  pingIntervalMs: number;
  pingTimeoutMs: number;
  msgHandler: (msg: string) => void;
  initMessages: string[];
};

/*
 * The ReliableWebSocket class is a wrapper arround WebSocket class, this wrapper handle
 * reconnection.
 */

export class ReliableWebSocket {
  private shouldStop: boolean = false;

  private ws: WebSocket | undefined;
  private pingTimeoutId: NodeJS.Timeout | undefined = undefined;
  private initCb: ((value: unknown) => void) | undefined = undefined;

  private heartbeatTimeoutID: NodeJS.Timeout | undefined;

  private lastCloseTimestampMs: number = 0;

  constructor(protected options: ReliableWebsocketOptions) {}

  public async initialize() {
    this.shouldStop = false;
    try {
      await new Promise((resolve, reject) => {
        try {
          this.initCb = resolve;

          this.ws! = new WebSocket(this.options.wsUrl);

          clearTimeout(this.heartbeatTimeoutID);
          this.heartbeatTimeoutID = undefined;

          clearTimeout(this.pingTimeoutId);
          this.pingTimeoutId = undefined;

          this.ws!.on("error", this.onError.bind(this));
          this.ws!.on("open", this.onOpen.bind(this));
          this.ws!.on("close", this.onClose.bind(this));
          this.ws!.on("pong", this.onPong.bind(this));

          this.ws!.on("message", (message: string) => {
            if (this.options.msgHandler) {
              this.options.msgHandler(message.toString());
            }
          });
        } catch (e) {
          return reject(e);
        }
      });
    } catch (e) {
      throw e;
    }
  }

  public stop() {
    this.shouldStop = true;
    this.ws!.terminate();
  }

  private onOpen() {
    this.options.initMessages.forEach((msg) => this.ws!.send(msg));
    this.heartbeat();
  }

  private heartbeat() {
    logger.debug("client heartbeat");
    this.heartbeatTimeoutID = setTimeout(() => {
      logger.debug("Ping response is too slow");
      this.ws!.terminate();
    }, this.options.pingTimeoutMs);

    this.ws!.ping();
    this.pingTimeoutId = setTimeout(
      this.heartbeat.bind(this),
      this.options.pingIntervalMs
    );
  }

  private onPong() {
    if (this.initCb) {
      logger.debug("initialized");
      this.initCb(true);
      this.initCb = undefined;
    }

    logger.debug("client pong");
    clearTimeout(this.heartbeatTimeoutID);
    this.heartbeatTimeoutID = undefined;
  }

  private onError(error: Error) {
    this.ws!.terminate();
  }

  private onClose() {
    const now = Date.now();
    if (now - this.lastCloseTimestampMs < 200) {
      setTimeout(this.onClose.bind(this), 200);
      return;
    }
    this.lastCloseTimestampMs = now;

    logger.debug("connection is dead try to reconnect");
    if (!this.shouldStop) {
      this.initialize();
    }
  }
}
