/*
 * This is a TypeScript implementation of Mangrove's TickAndBinTest tests. Only the tests that are relevant to TickLib are included as the Bin functions from TickTreeLib have not been ported.
 *
 * The implementation follows the original TickAndBinTest implementation as closely as possible:
 * - types int and uint are defined as BigNumber
 * - int and uint operations are replaced by functions from int.ts and uint.ts
 * - unchecked code is assumed not to over-/underflow
 * - literal constants are precomputed BigNumbers called _constant, eg _0 or _0xffffffff
 *   - This avoids the need to use BigNumber.from() everywhere
 *   - When a literal is small enough to fit in `number` and used in a context where BigNumberish allowed, it is left as a literal
 * - wrap/unwrap have been removed as TypeScript uses structural typing and we do not wish to introduce a wrapper around BigNumber
 * - fuzz testing has been approximated
 * - a problem in the original test_tickFromNormalizedRatio_ko has been fixed.
 * 
 * The original TickAndBinTest implementation can be found here: https://github.com/mangrovedao/mangrove-core/blob/596ed77be48838b10364b7eda1a4f4a4970c0cad/test/core/TickAndBin.t.sol
 * This is the audited version of Mangrove v2.0.0.
 */

import { assertEq, vm_expectRevert } from "./coreCalculationsTestUtils";
import { BigNumber, ethers } from "ethers";
import { uint } from "../../../src/util/coreCalculations/uint";
import * as UInt from "../../../src/util/coreCalculations/uint";
import * as Int from "../../../src/util/coreCalculations/int";

// Literal constants are precomputed for readability and efficiency.
const _neg_1 = BigNumber.from("-1");
const _neg_6932 = BigNumber.from("-6932");
const _neg_499091 = BigNumber.from("-499091");
const _neg_665455 = BigNumber.from("-665455");

const _0 = BigNumber.from(0);
const _1 = BigNumber.from(1);
const _2 = BigNumber.from(2);
const _10 = BigNumber.from(10);
const _108 = BigNumber.from(108);
const _127 = BigNumber.from(127);
const _128 = BigNumber.from(128);
const _138162 = BigNumber.from(138162);
const _414486 = BigNumber.from(414486);
const _499090 = BigNumber.from(499090);
const _665454 = BigNumber.from(665454);
const _6931 = BigNumber.from(6931);
const _999999 = BigNumber.from(999999);
const _1000000 = BigNumber.from(1000000);
const _324518124673179235464474464787774551547 = BigNumber.from("324518124673179235464474464787774551547");
const _340248342086729790484326174814286782777 = BigNumber.from("340248342086729790484326174814286782777");
const _170141183460469231731687303715884105728 = BigNumber.from("170141183460469231731687303715884105728");
const _170158197578815278654860472446255694138 = BigNumber.from("170158197578815278654860472446255694138");

const _1e18 = _10.pow(18);

const type_uint96_max = _2.pow(96).sub(1);
const type_uint72_max = _2.pow(72).sub(1);
const type_uint_max = ethers.constants.MaxUint256;

// # TickAndBin.t.sol

// SPDX-License-Identifier:	MIT

// pragma solidity ^0.8.10;

// import "@mgv/lib/Test2.sol";
// import "@mgv/src/core/MgvLib.sol";
// import "@mgv/test/lib/MangroveTest.sol";
import * as TickLib from "../../../src/util/coreCalculations/TickLib";
import { Tick } from "../../../src/util/coreCalculations/TickLib";
import { MAX_RATIO_EXP, MAX_RATIO_MANTISSA, MAX_TICK, MIN_RATIO_EXP, MIN_RATIO_MANTISSA, MIN_TICK } from "../../../src/util/coreCalculations/Constants";

// contract TickAndBinTest is MangroveTest {
describe("TickLibNew unit test suite", () => {
  // The following tests are not relevant for TickLib and have therefore not been ported:

  // it(`test_posInLeaf_auto(int bin)`, () => {
  //   bin = bound(bin, MIN_BIN, MAX_BIN);
  //   tn: int = NUM_BINS / 2 + bin; // normalize to positive
  //   assertEq(int(Bin.wrap(bin).posInLeaf()), tn % LEAF_SIZE);
  // })};

  // it(`test_posInLevel3_auto(int bin)`, () => {
  //   bin = bound(bin, MIN_BIN, MAX_BIN);
  //   tn: int = NUM_BINS / 2 + bin; // normalize to positive
  //   assertEq(int(Bin.wrap(bin).posInLevel3()), tn / LEAF_SIZE % LEVEL_SIZE);
  // });

  // it(`test_posInLevel2_auto(int bin)`, () => {
  //   bin = bound(bin, MIN_BIN, MAX_BIN);
  //   tn: int = NUM_BINS / 2 + bin; // normalize to positive
  //   assertEq(int(Bin.wrap(bin).posInLevel2()), tn / (LEAF_SIZE * LEVEL_SIZE) % LEVEL_SIZE);
  // });

  // it(`test_posInLevel1_auto(int bin)`, () => {
  //   bin = bound(bin, MIN_BIN, MAX_BIN);
  //   tn: int = NUM_BINS / 2 + bin; // normalize to positive
  //   assertEq(int(Bin.wrap(bin).posInLevel1()), tn / (LEAF_SIZE * (LEVEL_SIZE ** 2)) % LEVEL_SIZE, "wrong posInLevel1");
  // });

  // note that tick(p) is max {t | ratio(t) <= p}
  it(`test_tickFromVolumes()`, () => {
    assertEq(TickLib.tickFromVolumes(_1, _1), _0);
    assertEq(TickLib.tickFromVolumes(_2, _1), _6931);
    assertEq(TickLib.tickFromVolumes(_1, _2), _neg_6932);
    assertEq(TickLib.tickFromVolumes(_1e18, _1), _414486);
    assertEq(TickLib.tickFromVolumes(type_uint96_max, _1), _665454);
    assertEq(TickLib.tickFromVolumes(_1, type_uint96_max), _neg_665455);
    assertEq(TickLib.tickFromVolumes(type_uint72_max, _1), _499090);
    assertEq(TickLib.tickFromVolumes(_1, type_uint72_max), _neg_499091);
    assertEq(TickLib.tickFromVolumes(_999999, _1000000), _neg_1);
    assertEq(TickLib.tickFromVolumes(_1000000, _999999), _0);
    assertEq(TickLib.tickFromVolumes(_1000000.mul(_1e18), _999999.mul(_1e18)), _0);
  });

  it(`test_ratioFromTick()`, () => {
    // The expected values given below are computed by doing:
    // let price = 1.0001^tick
    // let sig = round(price * 2^exp) with exp chosen such that sig uses 128 bits
    // add or remove as necessary to match the error of the `ratioFromTick` function
    inner_test_ratioFromTick({
      tick: MAX_TICK,
      expected_sig: MAX_RATIO_MANTISSA,
      expected_exp: uint(MAX_RATIO_EXP)
    });

    inner_test_ratioFromTick({
      tick: MIN_TICK,
      expected_sig: MIN_RATIO_MANTISSA,
      expected_exp: uint(MIN_RATIO_EXP)
    });

    // The +12 is the error
    inner_test_ratioFromTick({
      tick: _138162,
      expected_sig: _324518124673179235464474464787774551547.add(12),
      expected_exp: _108
    });

    inner_test_ratioFromTick({
      tick: _neg_1,
      expected_sig: _340248342086729790484326174814286782777,
      expected_exp: _128
    });

    inner_test_ratioFromTick({
      tick: _0,
      expected_sig: _170141183460469231731687303715884105728,
      expected_exp: _127
    });

    inner_test_ratioFromTick({
      tick: _1,
      expected_sig: _170158197578815278654860472446255694138,
      expected_exp: _127
    });
  });

  function inner_test_ratioFromTick({tick, expected_sig, expected_exp}: {tick: Tick, expected_sig: uint, expected_exp: uint}) {
    const {man: sig, exp} = TickLib.ratioFromTick(tick);
    assertEq(expected_sig, sig, "wrong sig");
    assertEq(expected_exp, exp, "wrong exp");
  };

  // NB: These functions are not used in the tests and have therefore not been ported:
  // function showTickApprox(wants: uint, gives: uint) {
  //   const tick: Tick = TickLib.tickFromVolumes(wants, gives);
  //   const wants2: uint = TickLib.inboundFromOutbound(tick, gives);
  //   const gives2: uint = TickLib.outboundFromInbound(tick, wants);
  //   console.log("tick  ", toString(tick));
  //   console.log("wants ", wants);
  //   console.log("wants2", wants2);
  //   console.log("--------------");
  //   console.log(wants < wants2);
  //   console.log(wants > wants2);
  //   console.log(gives < gives2);
  //   console.log(gives > gives2);
  //   console.log("===========");
  // };

  // function tickShifting() {
  //   showTickApprox(30 ether, 1 ether);
  //   showTickApprox(30 ether, 30 * 30 ether);
  //   showTickApprox(1 ether, 1 ether);
  // };

  // The following tests are not relevant for TickLib and have therefore not been ported:
  // it(`test_leafIndex_auto(int bin)`, () => {
  //   bin = bound(bin, MIN_BIN, MAX_BIN);
  //   tn: int = NUM_BINS / 2 + bin; // normalize to positive
  //   index: int = tn / LEAF_SIZE - NUM_LEAFS / 2;
  //   assertEq(Bin.wrap(bin).leafIndex(), index);
  // });

  // it(`test_level3Index_auto(int bin)`, () => {
  //   bin = bound(bin, MIN_BIN, MAX_BIN);
  //   tn: int = NUM_BINS / 2 + bin; // normalize to positive
  //   index: int = tn / (LEAF_SIZE * LEVEL_SIZE) - NUM_LEVEL3 / 2;
  //   assertEq(Bin.wrap(bin).level3Index(), index);
  // });

  // it(`test_level2Index_auto(int bin)`, () => {
  //   bin = bound(bin, MIN_BIN, MAX_BIN);
  //   tn: int = NUM_BINS / 2 + bin; // normalize to positive
  //   index: int = tn / (LEAF_SIZE * (LEVEL_SIZE ** 2)) - NUM_LEVEL2 / 2;
  //   assertEq(Bin.wrap(bin).level2Index(), index);
  // });

  it(`test_normalizeRatio_ko()`, () => {
    vm_expectRevert("mgv/normalizeRatio/mantissaIs0",
    () => TickLib.normalizeRatio(_0, _0));
    vm_expectRevert("mgv/normalizeRatio/lowExp",
    () => TickLib.normalizeRatio(type_uint_max, _0));
  });

  it(`test_tickFromNormalizedRatio_ko()`, () => {
    vm_expectRevert("mgv/tickFromRatio/tooLow",
    () => TickLib.tickFromNormalizedRatio(UInt.sub(MIN_RATIO_MANTISSA, 1), uint(MIN_RATIO_EXP)));
    vm_expectRevert("mgv/tickFromRatio/tooLow",
    () => TickLib.tickFromNormalizedRatio(MIN_RATIO_MANTISSA, uint(Int.add(MIN_RATIO_EXP, 1))));
    vm_expectRevert("mgv/tickFromRatio/tooHigh",
    () => TickLib.tickFromNormalizedRatio(UInt.add(MAX_RATIO_MANTISSA, 1), uint(MAX_RATIO_EXP)));
    // NB: The original test was incorrect: It incorrectly expected the ratio to be too high, but it is too low.
    //     There is a problem in mangrove-core's use of vm.expectRevert() before internal calls, so the test don't work 
    //     See https://github.com/foundry-rs/foundry/issues/3437
    // vm.expectRevert("mgv/tickFromRatio/tooHigh");
    // TickLib.tickFromNormalizedRatio(MAX_RATIO_MANTISSA, uint(MAX_RATIO_EXP - 1));
    vm_expectRevert("mgv/tickFromRatio/tooLow",
    () => TickLib.tickFromNormalizedRatio(MAX_RATIO_MANTISSA, uint(Int.sub(MAX_RATIO_EXP, 1))));
  });

  // check no revert
  it(`function test_tickFromNormalizedRatio_ok()`, () =>{
    TickLib.tickFromNormalizedRatio(MIN_RATIO_MANTISSA, uint(MIN_RATIO_EXP));
    TickLib.tickFromNormalizedRatio(MAX_RATIO_MANTISSA, uint(MAX_RATIO_EXP));
  });

  // The following tests are not relevant for TickLib and have therefore not been ported:

  // it(`test_bestBinFromBranch_matches_positions_accessor(
  //   uint binPosInLeaf,
  //   uint _level3,
  //   uint _level2,
  //   uint _level1,
  //   uint _root
  // )`, () => {
  //   const binPosInLeaf = bound(binPosInLeaf, 0, 3);
  //   let level3: Field = Field.wrap(bound(_level3, 1, uint(LEVEL_SIZE) - 1));
  //   let level2: Field = Field.wrap(bound(_level2, 1, uint(LEVEL_SIZE) - 1));
  //   let level1: Field = Field.wrap(bound(_level1, 1, uint(LEVEL_SIZE) - 1));
  //   let root: Field = Field.wrap(bound(_root, 1, uint(ROOT_SIZE) - 1));
  //   let local: Local;
  //   local = local.binPosInLeaf(binPosInLeaf);
  //   local = local.level3(level3);
  //   local = local.level2(level2);
  //   local = local.level1(level1);
  //   local = local.root(root);
  //   let bin: Bin = TickTreeLib.bestBinFromLocal(local);
  //   assertEq(bin.posInLeaf(), binPosInLeaf, "wrong pos in leaf");
  //   assertEq(bin.posInLevel3(), BitLib.ctz64(Field.unwrap(level3)), "wrong pos in level3");
  //   assertEq(bin.posInLevel2(), BitLib.ctz64(Field.unwrap(level2)), "wrong pos in level2");
  //   assertEq(bin.posInLevel1(), BitLib.ctz64(Field.unwrap(level1)), "wrong pos in level1");
  //   assertEq(bin.posInRoot(), BitLib.ctz64(Field.unwrap(root)), "wrong pos in root");
  // });

  // HELPER FUNCTIONS
  // function assertEq(bin: Bin, ticknum: int) {
  //   assertEq(Bin.unwrap(bin), ticknum);
  // }
});
