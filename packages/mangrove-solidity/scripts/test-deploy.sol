// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script, console} from "forge-std/Script.sol";
import {Utilities} from "mgv_test/lib/Utilities.sol";
import "mgv_src/Mangrove.sol";
import "mgv_src/periphery/MgvReader.sol";
import {IERC20} from "mgv_src/MgvLib.sol";
import {TestToken} from "mgv_test/lib/tokens/TestToken.sol";
import {SimpleTestMaker} from "mgv_test/lib/agents/TestMaker.sol";
import {MangroveOrder, MangroveOrderEnriched} from "mgv_src/periphery/MangroveOrderEnriched.sol";
import {MgvCleaner} from "mgv_src/periphery/MgvCleaner.sol";
import {MgvOracle} from "mgv_src/periphery/MgvOracle.sol";
import {IMangrove} from "mgv_src/IMangrove.sol";

contract MyScript is Script, Utilities {
  struct Deploy {
    string name;
    address addr;
    bool isToken;
  }

  Deploy[] deploys;

  function push_deploy(
    string memory name,
    address addr,
    bool isToken
  ) internal {
    deploys.push(Deploy({name: name, addr: addr, isToken: isToken}));
  }

  function last_deploy() internal returns (Deploy storage) {
    return deploys[deploys.length - 1];
  }

  // overload with isToken false by default
  function push_deploy(string memory name, address addr) internal {
    push_deploy(name, addr, false);
  }

  function write_deploys() internal {
    string memory output = "";
    for (uint i = 0; i < deploys.length; i++) {
      output = string.concat(
        output,
        deploys[i].name,
        ", ",
        vm.toString(deploys[i].addr),
        ", ",
        deploys[i].isToken ? "true" : "false",
        "\n"
      );
    }
    console.log(vm.envString("MGV_DEPLOY_FILE"));
    vm.writeFile(vm.envString("MGV_DEPLOY_FILE"), output);
  }

  function run() external {
    /* Token A
     ******************************/
    vm.broadcast();
    IERC20 tokenA = new TestToken({
      admin: msg.sender,
      name: "Token A",
      symbol: "TokenA",
      _decimals: 18
    });

    push_deploy("TokenA", address(tokenA), true);

    /* Token B
     ******************************/
    vm.broadcast();
    IERC20 tokenB = new TestToken({
      admin: msg.sender,
      name: "Token B",
      symbol: "TokenB",
      _decimals: 18
    });

    push_deploy("TokenB", address(tokenB), true);

    /* DAI
     ******************************/
    vm.broadcast();
    IERC20 dai = new TestToken({
      admin: msg.sender,
      name: "DAI",
      symbol: "DAI",
      _decimals: 18
    });

    push_deploy("DAI", address(dai), true);

    /* USDC
     ******************************/
    vm.broadcast();
    IERC20 usdc = new TestToken({
      admin: msg.sender,
      name: "USD Coin",
      symbol: "USDC",
      _decimals: 6
    });

    push_deploy("USDC", address(usdc), true);

    /* WETH
     ******************************/
    vm.broadcast();
    IERC20 weth = new TestToken({
      admin: msg.sender,
      name: "Wrapped Ether",
      symbol: "WETH",
      _decimals: 18
    });

    push_deploy("WETH", address(weth), true);

    /* Mangrove
     ******************************/
    vm.broadcast();
    Mangrove mgv = new Mangrove({
      governance: msg.sender,
      gasprice: 1,
      gasmax: 2_000_000
    });

    push_deploy("Mangrove", payable(mgv));

    /* Mangrove Reader
     ******************************/
    vm.broadcast();
    MgvReader reader = new MgvReader({_mgv: payable(mgv)});

    push_deploy("MgvReader", address(reader));

    /* Mangrove Cleaner
     ******************************/
    vm.broadcast();
    MgvCleaner cleaner = new MgvCleaner({_MGV: address(mgv)});

    push_deploy("MgvCleaner", address(cleaner));

    /* Mangrove Oracle
     ******************************/
    vm.broadcast();
    MgvOracle oracle = new MgvOracle({
      _governance: payable(mgv),
      _initialMutator: address(0) // FIXME who should this be
    });

    push_deploy("MgvOracle", address(oracle));

    /* Simple Test Maker
     ******************************/
    vm.broadcast();
    // FIXME from maker???
    SimpleTestMaker simpleTestMaker = new SimpleTestMaker({
      mgv: AbstractMangrove(payable(mgv)),
      base: tokenA,
      quote: tokenB
    });

    push_deploy("SimpleTestMaker", address(simpleTestMaker));

    /* Mangrove Order
     ******************************/
    vm.broadcast();
    MangroveOrder mgo = new MangroveOrder({
      _MGV: IMangrove(payable(mgv)),
      deployer: msg.sender
    });

    push_deploy("MangroveOrder", address(mgo));

    /* Mangrove Order Enriched
     ******************************/
    vm.broadcast();
    MangroveOrderEnriched mgoe = new MangroveOrderEnriched({
      _MGV: IMangrove(payable(mgv)),
      deployer: msg.sender
    });

    push_deploy("MangroveOrderEnriched", address(mgoe));

    /*****************************
     *  Write deploys
     *****************************/
    write_deploys();
  }
}
