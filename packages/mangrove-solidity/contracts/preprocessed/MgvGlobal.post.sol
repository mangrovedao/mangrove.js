pragma solidity ^0.8.13;

// SPDX-License-Identifier: Unlicense

// This is free and unencumbered software released into the public domain.

// Anyone is free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means.

// In jurisdictions that recognize copyright laws, the author or authors of this software dedicate any and all copyright interest in the software to the public domain. We make this dedication for the benefit of the public at large and to the detriment of our heirs and successors. We intend this dedication to be an overt act of relinquishment in perpetuity of all present and future rights to this software under copyright law.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// For more information, please refer to <https://unlicense.org/>

// fields are of the form [name,bits,type]

import "./MgvStructs.post.sol";

// struct_defs are of the form [name,obj]

/* ************************************************** *
            GENERATED FILE. DO NOT EDIT.
 * ************************************************** */

//some type safety for each struct
type globalT is uint;
using GlobalLibrary for globalT global;

uint constant global_monitor_bits = 160;
uint constant global_useOracle_bits = 8;
uint constant global_notify_bits = 8;
uint constant global_gasprice_bits = 16;
uint constant global_gasmax_bits = 24;
uint constant global_dead_bits = 8;

uint constant global_monitor_before = 0;
uint constant global_useOracle_before = global_monitor_before + global_monitor_bits;
uint constant global_notify_before = global_useOracle_before + global_useOracle_bits;
uint constant global_gasprice_before = global_notify_before + global_notify_bits;
uint constant global_gasmax_before = global_gasprice_before + global_gasprice_bits;
uint constant global_dead_before = global_gasmax_before + global_gasmax_bits;

uint constant global_monitor_mask = 0x0000000000000000000000000000000000000000ffffffffffffffffffffffff;
uint constant global_useOracle_mask = 0xffffffffffffffffffffffffffffffffffffffff00ffffffffffffffffffffff;
uint constant global_notify_mask = 0xffffffffffffffffffffffffffffffffffffffffff00ffffffffffffffffffff;
uint constant global_gasprice_mask = 0xffffffffffffffffffffffffffffffffffffffffffff0000ffffffffffffffff;
uint constant global_gasmax_mask = 0xffffffffffffffffffffffffffffffffffffffffffffffff000000ffffffffff;
uint constant global_dead_mask = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffff00ffffffff;

library GlobalLibrary {
  function to_struct(globalT __packed) internal pure returns (GlobalStruct memory __s) { unchecked {
    __s.monitor = address(uint160((globalT.unwrap(__packed) << global_monitor_before) >> (256-global_monitor_bits)));
    __s.useOracle = (((globalT.unwrap(__packed) << global_useOracle_before) >> (256-global_useOracle_bits)) > 0);
    __s.notify = (((globalT.unwrap(__packed) << global_notify_before) >> (256-global_notify_bits)) > 0);
    __s.gasprice = (globalT.unwrap(__packed) << global_gasprice_before) >> (256-global_gasprice_bits);
    __s.gasmax = (globalT.unwrap(__packed) << global_gasmax_before) >> (256-global_gasmax_bits);
    __s.dead = (((globalT.unwrap(__packed) << global_dead_before) >> (256-global_dead_bits)) > 0);
  }}

  function eq(globalT __packed1, globalT __packed2) internal pure returns (bool) { unchecked {
    return globalT.unwrap(__packed1) == globalT.unwrap(__packed2);
  }}

  function unpack(globalT __packed) internal pure returns (address __monitor, bool __useOracle, bool __notify, uint __gasprice, uint __gasmax, bool __dead) { unchecked {
    __monitor = address(uint160((globalT.unwrap(__packed) << global_monitor_before) >> (256-global_monitor_bits)));
    __useOracle = (((globalT.unwrap(__packed) << global_useOracle_before) >> (256-global_useOracle_bits)) > 0);
    __notify = (((globalT.unwrap(__packed) << global_notify_before) >> (256-global_notify_bits)) > 0);
    __gasprice = (globalT.unwrap(__packed) << global_gasprice_before) >> (256-global_gasprice_bits);
    __gasmax = (globalT.unwrap(__packed) << global_gasmax_before) >> (256-global_gasmax_bits);
    __dead = (((globalT.unwrap(__packed) << global_dead_before) >> (256-global_dead_bits)) > 0);
  }}

  function monitor(globalT __packed) internal pure returns(address) { unchecked {
    return address(uint160((globalT.unwrap(__packed) << global_monitor_before) >> (256-global_monitor_bits)));
  }}

  function monitor(globalT __packed,address val) internal pure returns(globalT) { unchecked {
    return globalT.wrap((globalT.unwrap(__packed) & global_monitor_mask)
                        | ((uint(uint160(val)) << (256-global_monitor_bits) >> global_monitor_before)));
  }}
  function useOracle(globalT __packed) internal pure returns(bool) { unchecked {
    return (((globalT.unwrap(__packed) << global_useOracle_before) >> (256-global_useOracle_bits)) > 0);
  }}

  function useOracle(globalT __packed,bool val) internal pure returns(globalT) { unchecked {
    return globalT.wrap((globalT.unwrap(__packed) & global_useOracle_mask)
                        | ((uint_of_bool(val) << (256-global_useOracle_bits) >> global_useOracle_before)));
  }}
  function notify(globalT __packed) internal pure returns(bool) { unchecked {
    return (((globalT.unwrap(__packed) << global_notify_before) >> (256-global_notify_bits)) > 0);
  }}

  function notify(globalT __packed,bool val) internal pure returns(globalT) { unchecked {
    return globalT.wrap((globalT.unwrap(__packed) & global_notify_mask)
                        | ((uint_of_bool(val) << (256-global_notify_bits) >> global_notify_before)));
  }}
  function gasprice(globalT __packed) internal pure returns(uint) { unchecked {
    return (globalT.unwrap(__packed) << global_gasprice_before) >> (256-global_gasprice_bits);
  }}

  function gasprice(globalT __packed,uint val) internal pure returns(globalT) { unchecked {
    return globalT.wrap((globalT.unwrap(__packed) & global_gasprice_mask)
                        | ((val << (256-global_gasprice_bits) >> global_gasprice_before)));
  }}
  function gasmax(globalT __packed) internal pure returns(uint) { unchecked {
    return (globalT.unwrap(__packed) << global_gasmax_before) >> (256-global_gasmax_bits);
  }}

  function gasmax(globalT __packed,uint val) internal pure returns(globalT) { unchecked {
    return globalT.wrap((globalT.unwrap(__packed) & global_gasmax_mask)
                        | ((val << (256-global_gasmax_bits) >> global_gasmax_before)));
  }}
  function dead(globalT __packed) internal pure returns(bool) { unchecked {
    return (((globalT.unwrap(__packed) << global_dead_before) >> (256-global_dead_bits)) > 0);
  }}

  function dead(globalT __packed,bool val) internal pure returns(globalT) { unchecked {
    return globalT.wrap((globalT.unwrap(__packed) & global_dead_mask)
                        | ((uint_of_bool(val) << (256-global_dead_bits) >> global_dead_before)));
  }}
}

function global_t_of_struct(GlobalStruct memory __s) pure returns (globalT) { unchecked {
  return global_pack(__s.monitor, __s.useOracle, __s.notify, __s.gasprice, __s.gasmax, __s.dead);
}}

function global_pack(address __monitor, bool __useOracle, bool __notify, uint __gasprice, uint __gasmax, bool __dead) pure returns (globalT) { unchecked {
  return globalT.wrap(((((((0
                      | ((uint(uint160(__monitor)) << (256-global_monitor_bits)) >> global_monitor_before))
                      | ((uint_of_bool(__useOracle) << (256-global_useOracle_bits)) >> global_useOracle_before))
                      | ((uint_of_bool(__notify) << (256-global_notify_bits)) >> global_notify_before))
                      | ((__gasprice << (256-global_gasprice_bits)) >> global_gasprice_before))
                      | ((__gasmax << (256-global_gasmax_bits)) >> global_gasmax_before))
                      | ((uint_of_bool(__dead) << (256-global_dead_bits)) >> global_dead_before)));
}}