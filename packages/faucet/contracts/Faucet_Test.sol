// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.6;

import {Test} from "@giry/hardhat-test-solidity/test.sol";

import "./Faucet.sol";

contract Token {
    mapping(address => uint256) public balanceOf;

    constructor() {}

    function transfer(address dest, uint256 amt) external {
        uint256 bal_sender = balanceOf[msg.sender];
        require(bal_sender >= amt, "insufficient funds");
        balanceOf[msg.sender] = bal_sender - amt;
        balanceOf[dest] += amt;
    }

    function mint(address to, uint256 amt) external {
        balanceOf[to] += amt;
    }
}

contract Faucet_Test {
    Faucet faucet;
    Token token;

    uint256 constant INIT_MAXPULL = 7 * 10**18;
    address constant Z = 0x0000000000000000000000000000000000000000;

    receive() external payable {}

    function _beforeAll() public {
        token = new Token();
        faucet = new Faucet(address(token), "faucet", INIT_MAXPULL);
        token.mint(address(faucet), 1000 * 10**18);
    }

    function pull_test() public {
        uint256 amt = 4 * 10**18;
        uint256 bal_this = token.balanceOf(address(this));
        uint256 bal_faucet = token.balanceOf(address(faucet));
        faucet.pull(amt);
        Test.eq(
            token.balanceOf(address(this)),
            bal_this + amt,
            "wrong user balance"
        );
        Test.eq(
            token.balanceOf(address(faucet)),
            bal_faucet - amt,
            "wrong faucet balance"
        );
    }

    function pullTo_test() public {
        uint256 bal_z = token.balanceOf(Z);
        uint256 bal_faucet = token.balanceOf(address(faucet));

        uint256 amt = 3 * 10**18;
        faucet.pullTo(Z, amt);

        Test.eq(token.balanceOf(Z), bal_z + amt, "wrong user balance");
        Test.eq(
            token.balanceOf(address(faucet)),
            bal_faucet - amt,
            "wrong faucet balance"
        );
    }

    function cant_pull_above_maxpull_test() public {
        uint256 bal_z = token.balanceOf(address(this));
        uint256 bal_faucet = token.balanceOf(address(faucet));

        uint256 amt = INIT_MAXPULL + 1;
        faucet.pull(amt);

        Test.eq(
            token.balanceOf(address(this)),
            bal_z + amt - 1,
            "wrong user balance"
        );
        Test.eq(
            token.balanceOf(address(faucet)),
            bal_faucet - amt + 1,
            "wrong faucet balance"
        );
    }

    function change_maxpull_test() public {
        faucet.setMaxpull(INIT_MAXPULL * 2);
        Test.eq(faucet.maxpull(), INIT_MAXPULL * 2, "wrong maxpull balance");
    }

    function rainTo_test() public {
        uint256 bal_z = token.balanceOf(address(this));
        uint256 bal_faucet = token.balanceOf(address(faucet));

        uint256 amt = INIT_MAXPULL + 1;
        faucet.drainTo(address(this), amt);

        Test.eq(
            token.balanceOf(address(this)),
            bal_z + amt,
            "wrong user balance"
        );
        Test.eq(
            token.balanceOf(address(faucet)),
            bal_faucet - amt,
            "wrong faucet balance"
        );
    }
}
