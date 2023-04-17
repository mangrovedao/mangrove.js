import assert from "assert";
import { describe, it } from "mocha";
import { enableLogging } from "../../../src/util/logger";

enableLogging();

import ReliableWebSocketProvider from "../../../src/tracker/providers/reliableWebsocketProvider";
import { JsonRpcProvider } from "@ethersproject/providers";
import BlockManager from "../../../src/tracker/blockManager";
import { WebSocketServer, WebSocket } from "ws";
import { sleep } from "@mangrovedao/commonlib.js";

const mockRPCMessages = [
  '{"jsonrpc":"2.0","method":"eth_subscription","params":{"result":{"baseFeePerGas":"0x788da4e57","difficulty":"0x0","extraData":"0x496c6c756d696e61746520446d6f63726174697a6520447374726962757465","gasLimit":"0x1c9c380","gasUsed":"0xc5718a","hash":"0x4ad7be68fcc73e24d114b249096c2cf43ad6d29c6667a1af89f86d45b5ad9ad4","logsBloom":"0x5fa010464104d1483149ca24cb90522269e94094ec894615142310605c9005060ce80380550053f464411989c85a05302b29143c9b18bac6360d45001c256c2adc66709042e2c86c688b5a0ef0b03cbc891402c344451a18ecaa3c4088c33181e24826c286260c8b90e6ba4c04d6196d4e129b55035c355bd812c4f01e597805bc95ba9008fb61c8fadde54816b1e013d14bd821f70d41ac4578c4d08e3485ae8a5ec9e6d94265136a5266cc9b350dca9042021538f6adaa03fb1d7661fc5203cd18058a749ba741580e035e00dd70b84bb9b5ac506ba0154585310e8800e8d491f6fe580594841c72af569418071c829d72425b12aa8463a18fe8929284fc07","miner":"0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5","mixHash":"0xe2529b54095ed47e44e5b579e19edeadab29961d4a112f26878aa9751a6d06da","nonce":"0x0000000000000000","number":"0x1033e8c","parentHash":"0x330a7e7d51b9cef001d39c149505414ca581fdfcae90b7acd0da8dfd729f6c16","receiptsRoot":"0x96f5caeb18d6cbdbdc89e357a56054817f1be38d3a3de0bd05175cd1cb79e8e0","sha3Uncles":"0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347","size":"0x25540","stateRoot":"0x253cbb9422e406f538fe9094a3388a1f1d46461df5e264f622a238be64089116","timestamp":"0x642ec7e3","transactionsRoot":"0x1ec1d358e25029da30dc79632ec9c2ed462ff9cd6b8a7e61e565c0acfdef098b"},"subscription":"0xc75d722ad5a585755f47bd368ce29308"}}',
  '{"jsonrpc":"2.0","method":"eth_subscription","params":{"result":{"baseFeePerGas":"0x767bc3bdb","difficulty":"0x0","extraData":"0x496c6c756d696e61746520446d6f63726174697a6520447374726962757465","gasLimit":"0x1c9c380","gasUsed":"0xb0c50c","hash":"0x900171311bb44d46968a67d307103b680f47a1b1cd0b3b9ebfb5843c58c36ff3","logsBloom":"0x11b1495455cc926318a060b9af500d2525394e04484e13114a798084eeb34d0460449110d5030329b0201b457233074c0e6199a0ae8aba0b3320c111006d2d0334a64171485d887c7a23407de8619b7880914081094508e00a061c4888400a587206a0ea261ad00b01340dc88c20ae458017a976489c86011675c3d00419a1c5181a16720240a06e5d5bc900862a002a3388a689e14108fccca121c0123861f98b4a93427088ee1e311645c57fa6072d4d826202cbabc25e04232646408ad043cc5673524f4297130e06c2d3a9a7b6d042c547a636aa88118425e542b920f1ec043aae9d88959204afa5529082411880846a2a9290d9b942a41dd87088121d08","miner":"0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5","mixHash":"0x4f1fdb440370387e442b88d450a3d62e60f14fd644d9c521cd5220ddcefa7e4b","nonce":"0x0000000000000000","number":"0x1033e8d","parentHash":"0x4ad7be68fcc73e24d114b249096c2cf43ad6d29c6667a1af89f86d45b5ad9ad4","receiptsRoot":"0x10673a70dca1daa5bdd2a376625f72609a3db2eba55771f25b20ce7742ea989f","sha3Uncles":"0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347","size":"0x1675b","stateRoot":"0x41d59ca2a470f4520326c2348065d3101b20ac974f5b62c617efff776cb39a5a","timestamp":"0x642ec7ef","transactionsRoot":"0x340842278a36fc736d0a6904523fdd4364679e7312d8b92cf7da24fb3d58920f"},"subscription":"0xc75d722ad5a585755f47bd368ce29308"}}',
  '{"jsonrpc":"2.0","method":"eth_subscription","params":{"result":{"baseFeePerGas":"0x731c847d5","difficulty":"0x0","extraData":"0x6279206275696c64657230783639","gasLimit":"0x1c9c380","gasUsed":"0x161352e","hash":"0xdbef5434edba8466172daace9df8cfb5405d4f3b2bd043d8e1e8695d7c526083","logsBloom":"0xffe5fdffd3ca192fc65f9f2fc4d4df6b5fd1fde77f9ff77cf62ff6fe9c9ee4ffcb1590d6d4ddebed73d6bbedc07a4f7b5ae3fd7bfcb7baef6edfcfabf9ff71d3ccd6d6d7dfc81a2ffad9f5baee7ebdfdbdef1db5ccd45c1e6b6f0fefab3e7bbfffddb6c6bf17761f951bf3d70ff8bef7eafeb9f67ffbffbe9b335ebfb69df3258b95cd77e7df9a95dffebd3676faf6fabffbae63fdef6bcf6dd5adefca37b160ffedabe4694ffe6f9d975bf7cfd5af6c3f7f8f71abf63b93fbfceefe9dfdcd7fff7f7feae40e9d49cc2ff19b27fcff5bffde7752964ee55c72cc72bbadf7feebb2fffeffb4f6eebf7eefdeac9bdffdec8ff84a1154adb37e265bef76eff5fd0f","miner":"0x690b9a9e9aa1c9db991c7721a92d351db4fac990","mixHash":"0x6cd136bace29a820156e6d917f14e4fc735ca5c9fdb3992b3709840744b1a9c9","nonce":"0x0000000000000000","number":"0x1033e8e","parentHash":"0x900171311bb44d46968a67d307103b680f47a1b1cd0b3b9ebfb5843c58c36ff3","receiptsRoot":"0xf2a7a13fa27afae635ed9bfc4d192502cca63d19032f783c7a19745089bea2f4","sha3Uncles":"0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347","size":"0x18cb6","stateRoot":"0x5e686bd8d6bc156cd1811aeb007b1d863596c9085214aaeec3ff00a2d2a06ca4","timestamp":"0x642ec7fb","transactionsRoot":"0x4743379a6ded13745631206450a62b3a2141406b034f0af4d998e3960b298996"},"subscription":"0xc75d722ad5a585755f47bd368ce29308"}}',
  '{"jsonrpc":"2.0","method":"eth_subscription","params":{"result":{"baseFeePerGas":"0x7aed62dbc","difficulty":"0x0","extraData":"0x496c6c756d696e61746520446d6f63726174697a6520447374726962757465","gasLimit":"0x1c9c380","gasUsed":"0xa97f3f","hash":"0x87aecf2514dc1ee692e258d907c49a5099b92803bab439522b7a053876f40d45","logsBloom":"0x3e22318000409022000cd04c830165f0e0b41294cb3814b106a3be03561c4f12890c4aa03f1438a4042b03c8cac80740833c8005db222e3036e4011b75e429c10c86d89c60ee092e3aa2eb4ae81430b0a1130050c456eed0b95e12fbaa90426afe05e7442223400be18000c4046009513858111d0810a460b20a0150583800c1a44da00262446d0016db0d4002a9a3a804183403415022c8511402684331d790bf29454602206c3319b746d4d96b8d4957460ed041f7a883819658430e0102407e8074079121420062604406081c55d0c8c07638508b695c8c701a071800f87b8c92233cc28368284684baa40001d43288d2c191722a804214d428bee025c500","miner":"0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5","mixHash":"0x20b63b529a5b5e758a516f2c142d47ed66eb46cca1bc6612d69084fee6cfeb1b","nonce":"0x0000000000000000","number":"0x1033e8f","parentHash":"0xdbef5434edba8466172daace9df8cfb5405d4f3b2bd043d8e1e8695d7c526083","receiptsRoot":"0x503132cca97320a2639b4ee830243211eb14419268908fe62181b8d33e658e85","sha3Uncles":"0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347","size":"0x2cb10","stateRoot":"0xb3885fd45ac357dbcf61ddd23235afa27cc7afb7686c4cbbb776fc680dc8ac0a","timestamp":"0x642ec807","transactionsRoot":"0x339e3fc09e3949cb7258cb384003069557fd2d4f5209481a99a08e38816a5c02"},"subscription":"0xc75d722ad5a585755f47bd368ce29308"}}',
  '{"jsonrpc":"2.0","method":"eth_subscription","params":{"result":{"baseFeePerGas":"0x76f0c5515","difficulty":"0x0","extraData":"0x6d616e74612d6275696c646572","gasLimit":"0x1c9c380","gasUsed":"0xa2d10c","hash":"0x4a3857b13e82638bcc49e806a44ec2c520b7b445dd18bab84641e98b1e9f6150","logsBloom":"0x2bb7115cc309910ab22010c08e101aa442e407d4e00a502e4c3932533c224fea1d66120b9100210b2a081a8a0e5641031a6911b0b99722f2760b0305563e488d098409126d4bbecc6829d16914b319719a96684169740c012b12190c90f0487ce63840146622d67308550dc5dd8d0983c252f0c448966e8c0a43d5d0371c1b201b2152629c2051a48045110506300483e788ef91f19aa24a3df110c3ad1108b99b6dc3415101e979b067108af1040e0dd5e24a3210a403cb40e38e48300845144958530f002828910898fdb28c2804a544d081081904907eb41520120a2aee2c6e14bf0dd00d22310e26120007239002c4b6c215c918504cca0fb873d0470d49","miner":"0x5f927395213ee6b95de97bddcb1b2b1c0f16844f","mixHash":"0x275d242f1d01b0a458dc05f17b47842e3d681fc0f7c6246613f8e724ad830580","nonce":"0x0000000000000000","number":"0x1033e90","parentHash":"0x87aecf2514dc1ee692e258d907c49a5099b92803bab439522b7a053876f40d45","receiptsRoot":"0x3a76325553e1ab84829f898c7b952ca3e09e9d5fc5992bff95d1023093352402","sha3Uncles":"0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347","size":"0xd36f","stateRoot":"0x110bdff51a98a9bcc212a26630357dba38e41de4fa03c73688367b2691f7a357","timestamp":"0x642ec813","transactionsRoot":"0x8264c9ec813dc3d396ea7428c2c63a66971a359ce74110b6e1e9f033b425ffc8"},"subscription":"0xc75d722ad5a585755f47bd368ce29308"}}',
];

const firstBlock: BlockManager.Block = {
  parentHash:
    "0x9dce047bce43b984cd6bfcd462dce9a384049867e7ec644acae11c03bcf0d4ca",
  hash: "0x330a7e7d51b9cef001d39c149505414ca581fdfcae90b7acd0da8dfd729f6c16",
  number: 16989835,
};

describe("ReliableWebSocketProvider", () => {
  const host = "127.0.0.1";
  const port = 9997;
  const wsUrl = `ws://${host}:${port}`;

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

  it("no reorg 2 block simulation", async () => {
    const provider = new JsonRpcProvider(wsUrl);
    const reliableWebsocketProvider = new ReliableWebSocketProvider(
      {
        provider: provider,
        maxBlockCached: 50,
        maxRetryGetBlock: 5,
        retryDelayGetBlockMs: 200,
        maxRetryGetLogs: 5,
        retryDelayGetLogsMs: 200,
      },
      {
        wsUrl: wsUrl,
        pingIntervalMs: 1000,
        pingTimeoutMs: 200,
      }
    );

    await reliableWebsocketProvider.initialize(firstBlock);

    connection.send(mockRPCMessages[0]);
    await sleep(200);

    assert.equal(
      reliableWebsocketProvider.blockManager.getLastBlock().hash,
      "0x4ad7be68fcc73e24d114b249096c2cf43ad6d29c6667a1af89f86d45b5ad9ad4"
    );
    connection.send(mockRPCMessages[1]);
    await sleep(200);

    assert.equal(
      reliableWebsocketProvider.blockManager.getLastBlock().hash,
      "0x900171311bb44d46968a67d307103b680f47a1b1cd0b3b9ebfb5843c58c36ff3"
    );
  });
});
