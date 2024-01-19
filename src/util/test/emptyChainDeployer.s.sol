// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {MangroveDeployer} from "@mgv/script/core/deployers/MangroveDeployer.s.sol";

import {OLKey} from "@mgv/src/core/MgvLib.sol";
import {TestToken} from "@mgv/test/lib/tokens/TestToken.sol";
import {MangroveOrderDeployer} from "@mgv-strats/script/strategies/mangroveOrder/deployers/MangroveOrderDeployer.s.sol";
import {KandelSeederDeployer} from "@mgv-strats/script/strategies/kandel/deployers/KandelSeederDeployer.s.sol";
import {MangroveOrder} from "@mgv-strats/src/strategies/MangroveOrder.sol";
import {MgvReader} from "@mgv/src/periphery/MgvReader.sol";
import {SimpleTestMaker} from "@mgv/test/lib/agents/TestMaker.sol";
import {Mangrove} from "@mgv/src/core/Mangrove.sol";
import {IMangrove} from "@mgv/src/IMangrove.sol";
import {Deployer} from "@mgv/script/lib/Deployer.sol";
import {ActivateMarket, Market} from "@mgv/script/core/ActivateMarket.s.sol";
import {PoolAddressProviderMock} from "@mgv-strats/script/toy/AaveMock.sol";
import {IERC20} from "@mgv/lib/IERC20.sol";

/* 
This script prepares a local chain for testing by mangrove.js.
*/

contract EmptyChainDeployer is Deployer {
  TestToken public tokenA;
  TestToken public tokenB;
  address public dai;
  address public usdc;
  address public weth;
  SimpleTestMaker public simpleTestMaker;
  MangroveOrder public mgo;

  function run() public {
    innerRun({gasprice: 1000, gasmax: 2_000_000, gasbot: broadcaster()});
    outputDeployment();
  }

  function innerRun(uint gasprice, uint gasmax, address gasbot) public {
    MangroveDeployer mgvDeployer = new MangroveDeployer();

    mgvDeployer.innerRun({chief: broadcaster(), gasprice: gasprice, gasmax: gasmax, gasbot: gasbot});

    IMangrove mgv = mgvDeployer.mgv();
    MgvReader mgvReader = mgvDeployer.reader();

    broadcast();
    mgv.setUseOracle(false);

    broadcast();
    tokenA = new TestToken({admin: broadcaster(), name: "Token A", symbol: "TokenA", _decimals: 18});

    broadcast();
    tokenA.setMintLimit(type(uint).max);
    fork.set("TokenA", address(tokenA));

    broadcast();
    tokenB = new TestToken({admin: broadcaster(), name: "Token B", symbol: "TokenB", _decimals: 6});

    broadcast();
    tokenB.setMintLimit(type(uint).max);
    fork.set("TokenB", address(tokenB));

    broadcast();
    dai = address(new TestToken({admin: broadcaster(), name: "DAI", symbol: "DAI", _decimals: 18}));
    fork.set("DAI", dai);

    broadcast();
    usdc = address(new TestToken({admin: broadcaster(), name: "USD Coin", symbol: "USDC", _decimals: 6}));
    fork.set("USDC", usdc);

    broadcast();
    weth = address(new TestToken({admin: broadcaster(), name: "Wrapped Ether", symbol: "WETH", _decimals: 18}));
    fork.set("WETH", weth);

    broadcast();
    simpleTestMaker =
      new SimpleTestMaker({_mgv: IMangrove(payable(mgv)), _ol: OLKey(address(tokenA), address(tokenB), 1)});
    fork.set("SimpleTestMaker", address(simpleTestMaker));

    ActivateMarket activateMarket = new ActivateMarket();

    activateMarket.innerRun(mgv, mgvReader, Market(address(tokenA), address(tokenB), 1), 2 * 1e12, 3 * 1e12, 250);
    activateMarket.innerRun(mgv, mgvReader, Market(address(tokenA), address(tokenB), 100), 2 * 1e12, 3 * 1e12, 250);
    activateMarket.innerRun(mgv, mgvReader, Market(dai, usdc, 1), 1e12 / 1000, 1e12 / 1000, 0);
    activateMarket.innerRun(mgv, mgvReader, Market(weth, dai, 1), 1e12, 1e12 / 1000, 0);
    activateMarket.innerRun(mgv, mgvReader, Market(weth, usdc, 1), 1e12, 1e12 / 1000, 0);

    MangroveOrderDeployer mangroveDeployer = new MangroveOrderDeployer();
    mangroveDeployer.innerRun({admin: broadcaster(), mgv: IMangrove(payable(mgv))});
    MangroveOrder mangroveOrder = MangroveOrder(fork.get("MangroveOrder"));
    broadcast();
    mangroveOrder.activate(dynamic([IERC20(tokenA), IERC20(tokenB)]));

    address[] memory underlying = dynamic([address(tokenA), address(tokenB), dai, usdc, weth]);
    broadcast();
    address aaveAddressProvider = address(new PoolAddressProviderMock(underlying));

    KandelSeederDeployer kandelSeederDeployer = new KandelSeederDeployer();
    kandelSeederDeployer.innerRun({
      mgv: IMangrove(payable(mgv)),
      addressesProvider: aaveAddressProvider,
      aaveKandelGasreq: 629000, // see CoreKandelGasreqBaseTest
      kandelGasreq: 126000, // see CoreKandelGasreqBaseTest
      deployKandel: true,
      deployAaveKandel: true,
      testBase: IERC20(fork.get("WETH")),
      testQuote: IERC20(fork.get("DAI"))
    });
  }
}
