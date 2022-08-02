// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {ToyENS} from "./lib/ToyENS.sol";
import {LocalDeployScript} from "./lib/LocalDeployScript.sol";

import "mgv_src/Mangrove.sol";
import "mgv_src/periphery/MgvReader.sol";
import {IERC20} from "mgv_src/MgvLib.sol";
import {TestToken} from "mgv_test/lib/tokens/TestToken.sol";
import {SimpleTestMaker} from "mgv_test/lib/agents/TestMaker.sol";
import {MangroveOrder, MangroveOrderEnriched} from "mgv_src/periphery/MangroveOrderEnriched.sol";
import {MgvCleaner} from "mgv_src/periphery/MgvCleaner.sol";
import {MgvOracle} from "mgv_src/periphery/MgvOracle.sol";
import {IMangrove} from "mgv_src/IMangrove.sol";

contract MangroveJsDeploy is LocalDeployScript {
  function deploy() public override {
    vm.startBroadcast();

    /* Token A
     ******************************/
    IERC20 tokenA = new TestToken({
      admin: msg.sender,
      name: "Token A",
      symbol: "TokenA",
      _decimals: 18
    });

    ens.set("TokenA", address(tokenA), true);

    /* Token B
     ******************************/
    IERC20 tokenB = new TestToken({
      admin: msg.sender,
      name: "Token B",
      symbol: "TokenB",
      _decimals: 18
    });

    ens.set("TokenB", address(tokenB), true);

    /* DAI
     ******************************/
    IERC20 dai = new TestToken({
      admin: msg.sender,
      name: "DAI",
      symbol: "DAI",
      _decimals: 18
    });

    ens.set("DAI", address(dai), true);

    /* USDC
     ******************************/
    IERC20 usdc = new TestToken({
      admin: msg.sender,
      name: "USD Coin",
      symbol: "USDC",
      _decimals: 6
    });

    ens.set("USDC", address(usdc), true);

    /* WETH
     ******************************/
    IERC20 weth = new TestToken({
      admin: msg.sender,
      name: "Wrapped Ether",
      symbol: "WETH",
      _decimals: 18
    });

    ens.set("WETH", address(weth), true);

    /* Mangrove
     ******************************/
    Mangrove mgv = new Mangrove({
      governance: msg.sender,
      gasprice: 1,
      gasmax: 2_000_000
    });

    ens.set("Mangrove", payable(mgv), false);

    /* Mangrove Reader
     ******************************/
    MgvReader reader = new MgvReader({_mgv: payable(mgv)});

    ens.set("MgvReader", address(reader), false);

    /* Mangrove Cleaner
     ******************************/
    MgvCleaner cleaner = new MgvCleaner({_MGV: address(mgv)});

    ens.set("MgvCleaner", address(cleaner), false);

    /* Mangrove Oracle
     ******************************/
    MgvOracle oracle = new MgvOracle({
      _governance: msg.sender,
      _initialMutator: msg.sender
    });

    ens.set("MgvOracle", address(oracle), false);

    /* Simple Test Maker
     ******************************/
    // FIXME from maker???
    SimpleTestMaker simpleTestMaker = new SimpleTestMaker({
      mgv: AbstractMangrove(payable(mgv)),
      base: tokenA,
      quote: tokenB
    });

    ens.set("SimpleTestMaker", address(simpleTestMaker), false);

    // /* Mangrove Order
    //  ******************************/
    MangroveOrder mgo = new MangroveOrder({
      _MGV: IMangrove(payable(mgv)),
      deployer: msg.sender
    });

    ens.set("MangroveOrder", address(mgo), false);

    // /* Mangrove Order Enriched
    //  ******************************/
    MangroveOrderEnriched mgoe = new MangroveOrderEnriched({
      _MGV: IMangrove(payable(mgv)),
      deployer: msg.sender
    });

    ens.set("MangroveOrderEnriched", address(mgoe), false);

    vm.stopBroadcast();
  }
}
