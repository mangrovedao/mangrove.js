import { sleep } from "@mangrovedao/commonlib.js";
import assert from "assert";
import { describe, it } from "mocha";
import { WebSocketServer, WebSocket } from "ws";
import {
  ReliableWebSocket,
  ReliableWebsocketOptions,
} from "../../../src/tracker/providers/reliableWebsocket";
import { enableLogging } from "../../../src/util/logger";

enableLogging();

describe("Reliable Websocket", () => {
  const host = "127.0.0.1";
  const port = 9999;
  const wsUrl = `ws://${host}:${port}`;

  const pingIntervalMs = 1000;
  const pingTimeoutMs = 1000;

  const options: ReliableWebsocketOptions = {
    wsUrl,
    pingIntervalMs,
    pingTimeoutMs,
    msgHandler: (msg: string) => {},
    initMessages: [],
  };

  let websocketServer: WebSocketServer;
  let connection: WebSocket;

  const startWebSocketServer = () => {
    websocketServer = new WebSocketServer({
      host,
      port,
    });

    websocketServer.on("connection", (_connection) => {
      console.log("new connection");
      connection = _connection;
    });
  };

  beforeEach(() => {
    startWebSocketServer();
  });

  afterEach(() => {
    websocketServer.close();
  });

  it("ReliableWebSocket simple send msg", async () => {
    const wsClient = new ReliableWebSocket({
      ...options,
      msgHandler: (msg: string) => {
        assert.equal(msg, "test1");
      },
    });

    await wsClient.initialize();

    connection.send("test1");
  });

  it("ReliableWebSocket with reconnect", async () => {
    let i = 0;
    const wsClient = new ReliableWebSocket({
      ...options,
      msgHandler: (msg: string) => {
        if (msg === "test1") {
          ++i;
        }
      },
    });

    await wsClient.initialize();

    connection.send("test1");

    await sleep(1000);

    websocketServer.close();
    connection.close();

    await sleep(1000);

    startWebSocketServer();

    await sleep(1000);

    connection.send("test1");

    await sleep(1000);

    assert.equal(i, 2);
  });
});
