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
type localT is uint;
using LocalLibrary for localT global;

uint constant local_active_bits  = 8;
uint constant local_fee_bits     = 16;
uint constant local_density_bits = 112;
uint constant local_offer_gasbase_bits = 24;
uint constant local_lock_bits    = 8;
uint constant local_best_bits    = 32;
uint constant local_last_bits    = 32;

uint constant local_active_before  = 0;
uint constant local_fee_before     = local_active_before  + local_active_bits ;
uint constant local_density_before = local_fee_before     + local_fee_bits    ;
uint constant local_offer_gasbase_before = local_density_before + local_density_bits;
uint constant local_lock_before    = local_offer_gasbase_before + local_offer_gasbase_bits;
uint constant local_best_before    = local_lock_before    + local_lock_bits   ;
uint constant local_last_before    = local_best_before    + local_best_bits   ;

uint constant local_active_mask  = 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
uint constant local_fee_mask     = 0xff0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
uint constant local_density_mask = 0xffffff0000000000000000000000000000ffffffffffffffffffffffffffffff;
uint constant local_offer_gasbase_mask = 0xffffffffffffffffffffffffffffffffff000000ffffffffffffffffffffffff;
uint constant local_lock_mask    = 0xffffffffffffffffffffffffffffffffffffffff00ffffffffffffffffffffff;
uint constant local_best_mask    = 0xffffffffffffffffffffffffffffffffffffffffff00000000ffffffffffffff;
uint constant local_last_mask    = 0xffffffffffffffffffffffffffffffffffffffffffffffffff00000000ffffff;

library LocalLibrary {
  function to_struct(localT __packed) internal pure returns (LocalStruct memory __s) { unchecked {
    __s.active = (((localT.unwrap(__packed) << local_active_before) >> (256-local_active_bits)) > 0);
    __s.fee = (localT.unwrap(__packed) << local_fee_before) >> (256-local_fee_bits);
    __s.density = (localT.unwrap(__packed) << local_density_before) >> (256-local_density_bits);
    __s.offer_gasbase = (localT.unwrap(__packed) << local_offer_gasbase_before) >> (256-local_offer_gasbase_bits);
    __s.lock = (((localT.unwrap(__packed) << local_lock_before) >> (256-local_lock_bits)) > 0);
    __s.best = (localT.unwrap(__packed) << local_best_before) >> (256-local_best_bits);
    __s.last = (localT.unwrap(__packed) << local_last_before) >> (256-local_last_bits);
  }}

  function eq(localT __packed1, localT __packed2) internal pure returns (bool) { unchecked {
    return localT.unwrap(__packed1) == localT.unwrap(__packed2);
  }}

  function unpack(localT __packed) internal pure returns (bool __active, uint __fee, uint __density, uint __offer_gasbase, bool __lock, uint __best, uint __last) { unchecked {
    __active = (((localT.unwrap(__packed) << local_active_before) >> (256-local_active_bits)) > 0);
    __fee = (localT.unwrap(__packed) << local_fee_before) >> (256-local_fee_bits);
    __density = (localT.unwrap(__packed) << local_density_before) >> (256-local_density_bits);
    __offer_gasbase = (localT.unwrap(__packed) << local_offer_gasbase_before) >> (256-local_offer_gasbase_bits);
    __lock = (((localT.unwrap(__packed) << local_lock_before) >> (256-local_lock_bits)) > 0);
    __best = (localT.unwrap(__packed) << local_best_before) >> (256-local_best_bits);
    __last = (localT.unwrap(__packed) << local_last_before) >> (256-local_last_bits);
  }}

  function active(localT __packed) internal pure returns(bool) { unchecked {
    return (((localT.unwrap(__packed) << local_active_before) >> (256-local_active_bits)) > 0);
  }}

  function active(localT __packed,bool val) internal pure returns(localT) { unchecked {
    return localT.wrap((localT.unwrap(__packed) & local_active_mask)
                        | ((uint_of_bool(val) << (256-local_active_bits) >> local_active_before)));
  }}
  function fee(localT __packed) internal pure returns(uint) { unchecked {
    return (localT.unwrap(__packed) << local_fee_before) >> (256-local_fee_bits);
  }}

  function fee(localT __packed,uint val) internal pure returns(localT) { unchecked {
    return localT.wrap((localT.unwrap(__packed) & local_fee_mask)
                        | ((val << (256-local_fee_bits) >> local_fee_before)));
  }}
  function density(localT __packed) internal pure returns(uint) { unchecked {
    return (localT.unwrap(__packed) << local_density_before) >> (256-local_density_bits);
  }}

  function density(localT __packed,uint val) internal pure returns(localT) { unchecked {
    return localT.wrap((localT.unwrap(__packed) & local_density_mask)
                        | ((val << (256-local_density_bits) >> local_density_before)));
  }}
  function offer_gasbase(localT __packed) internal pure returns(uint) { unchecked {
    return (localT.unwrap(__packed) << local_offer_gasbase_before) >> (256-local_offer_gasbase_bits);
  }}

  function offer_gasbase(localT __packed,uint val) internal pure returns(localT) { unchecked {
    return localT.wrap((localT.unwrap(__packed) & local_offer_gasbase_mask)
                        | ((val << (256-local_offer_gasbase_bits) >> local_offer_gasbase_before)));
  }}
  function lock(localT __packed) internal pure returns(bool) { unchecked {
    return (((localT.unwrap(__packed) << local_lock_before) >> (256-local_lock_bits)) > 0);
  }}

  function lock(localT __packed,bool val) internal pure returns(localT) { unchecked {
    return localT.wrap((localT.unwrap(__packed) & local_lock_mask)
                        | ((uint_of_bool(val) << (256-local_lock_bits) >> local_lock_before)));
  }}
  function best(localT __packed) internal pure returns(uint) { unchecked {
    return (localT.unwrap(__packed) << local_best_before) >> (256-local_best_bits);
  }}

  function best(localT __packed,uint val) internal pure returns(localT) { unchecked {
    return localT.wrap((localT.unwrap(__packed) & local_best_mask)
                        | ((val << (256-local_best_bits) >> local_best_before)));
  }}
  function last(localT __packed) internal pure returns(uint) { unchecked {
    return (localT.unwrap(__packed) << local_last_before) >> (256-local_last_bits);
  }}

  function last(localT __packed,uint val) internal pure returns(localT) { unchecked {
    return localT.wrap((localT.unwrap(__packed) & local_last_mask)
                        | ((val << (256-local_last_bits) >> local_last_before)));
  }}
}

function local_t_of_struct(LocalStruct memory __s) pure returns (localT) { unchecked {
  return local_pack(__s.active, __s.fee, __s.density, __s.offer_gasbase, __s.lock, __s.best, __s.last);
}}

function local_pack(bool __active, uint __fee, uint __density, uint __offer_gasbase, bool __lock, uint __best, uint __last) pure returns (localT) { unchecked {
  return localT.wrap((((((((0
                      | ((uint_of_bool(__active) << (256-local_active_bits)) >> local_active_before))
                      | ((__fee << (256-local_fee_bits)) >> local_fee_before))
                      | ((__density << (256-local_density_bits)) >> local_density_before))
                      | ((__offer_gasbase << (256-local_offer_gasbase_bits)) >> local_offer_gasbase_before))
                      | ((uint_of_bool(__lock) << (256-local_lock_bits)) >> local_lock_before))
                      | ((__best << (256-local_best_bits)) >> local_best_before))
                      | ((__last << (256-local_last_bits)) >> local_last_before)));
}}