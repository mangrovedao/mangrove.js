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
type offerT is uint;
using OfferLibrary for offerT global;

uint constant offer_prev_bits = 32;
uint constant offer_next_bits = 32;
uint constant offer_wants_bits = 96;
uint constant offer_gives_bits = 96;

uint constant offer_prev_before = 0;
uint constant offer_next_before = offer_prev_before + offer_prev_bits;
uint constant offer_wants_before = offer_next_before + offer_next_bits;
uint constant offer_gives_before = offer_wants_before + offer_wants_bits;

uint constant offer_prev_mask = 0x00000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
uint constant offer_next_mask = 0xffffffff00000000ffffffffffffffffffffffffffffffffffffffffffffffff;
uint constant offer_wants_mask = 0xffffffffffffffff000000000000000000000000ffffffffffffffffffffffff;
uint constant offer_gives_mask = 0xffffffffffffffffffffffffffffffffffffffff000000000000000000000000;

library OfferLibrary {
  function to_struct(offerT __packed) internal pure returns (OfferStruct memory __s) { unchecked {
    __s.prev = (offerT.unwrap(__packed) << offer_prev_before) >> (256-offer_prev_bits);
    __s.next = (offerT.unwrap(__packed) << offer_next_before) >> (256-offer_next_bits);
    __s.wants = (offerT.unwrap(__packed) << offer_wants_before) >> (256-offer_wants_bits);
    __s.gives = (offerT.unwrap(__packed) << offer_gives_before) >> (256-offer_gives_bits);
  }}

  function eq(offerT __packed1, offerT __packed2) internal pure returns (bool) { unchecked {
    return offerT.unwrap(__packed1) == offerT.unwrap(__packed2);
  }}

  function unpack(offerT __packed) internal pure returns (uint __prev, uint __next, uint __wants, uint __gives) { unchecked {
    __prev = (offerT.unwrap(__packed) << offer_prev_before) >> (256-offer_prev_bits);
    __next = (offerT.unwrap(__packed) << offer_next_before) >> (256-offer_next_bits);
    __wants = (offerT.unwrap(__packed) << offer_wants_before) >> (256-offer_wants_bits);
    __gives = (offerT.unwrap(__packed) << offer_gives_before) >> (256-offer_gives_bits);
  }}

  function prev(offerT __packed) internal pure returns(uint) { unchecked {
    return (offerT.unwrap(__packed) << offer_prev_before) >> (256-offer_prev_bits);
  }}

  function prev(offerT __packed,uint val) internal pure returns(offerT) { unchecked {
    return offerT.wrap((offerT.unwrap(__packed) & offer_prev_mask)
                        | ((val << (256-offer_prev_bits) >> offer_prev_before)));
  }}
  function next(offerT __packed) internal pure returns(uint) { unchecked {
    return (offerT.unwrap(__packed) << offer_next_before) >> (256-offer_next_bits);
  }}

  function next(offerT __packed,uint val) internal pure returns(offerT) { unchecked {
    return offerT.wrap((offerT.unwrap(__packed) & offer_next_mask)
                        | ((val << (256-offer_next_bits) >> offer_next_before)));
  }}
  function wants(offerT __packed) internal pure returns(uint) { unchecked {
    return (offerT.unwrap(__packed) << offer_wants_before) >> (256-offer_wants_bits);
  }}

  function wants(offerT __packed,uint val) internal pure returns(offerT) { unchecked {
    return offerT.wrap((offerT.unwrap(__packed) & offer_wants_mask)
                        | ((val << (256-offer_wants_bits) >> offer_wants_before)));
  }}
  function gives(offerT __packed) internal pure returns(uint) { unchecked {
    return (offerT.unwrap(__packed) << offer_gives_before) >> (256-offer_gives_bits);
  }}

  function gives(offerT __packed,uint val) internal pure returns(offerT) { unchecked {
    return offerT.wrap((offerT.unwrap(__packed) & offer_gives_mask)
                        | ((val << (256-offer_gives_bits) >> offer_gives_before)));
  }}
}

function offer_t_of_struct(OfferStruct memory __s) pure returns (offerT) { unchecked {
  return offer_pack(__s.prev, __s.next, __s.wants, __s.gives);
}}

function offer_pack(uint __prev, uint __next, uint __wants, uint __gives) pure returns (offerT) { unchecked {
  return offerT.wrap(((((0
                      | ((__prev << (256-offer_prev_bits)) >> offer_prev_before))
                      | ((__next << (256-offer_next_bits)) >> offer_next_before))
                      | ((__wants << (256-offer_wants_bits)) >> offer_wants_before))
                      | ((__gives << (256-offer_gives_bits)) >> offer_gives_before)));
}}