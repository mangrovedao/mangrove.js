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
type offerDetailT is uint;
using OfferDetailLibrary for offerDetailT global;

uint constant offerDetail_maker_bits = 160;
uint constant offerDetail_gasreq_bits = 24;
uint constant offerDetail_offer_gasbase_bits = 24;
uint constant offerDetail_gasprice_bits = 16;

uint constant offerDetail_maker_before = 0;
uint constant offerDetail_gasreq_before = offerDetail_maker_before + offerDetail_maker_bits;
uint constant offerDetail_offer_gasbase_before = offerDetail_gasreq_before + offerDetail_gasreq_bits;
uint constant offerDetail_gasprice_before = offerDetail_offer_gasbase_before + offerDetail_offer_gasbase_bits;

uint constant offerDetail_maker_mask = 0x0000000000000000000000000000000000000000ffffffffffffffffffffffff;
uint constant offerDetail_gasreq_mask = 0xffffffffffffffffffffffffffffffffffffffff000000ffffffffffffffffff;
uint constant offerDetail_offer_gasbase_mask = 0xffffffffffffffffffffffffffffffffffffffffffffff000000ffffffffffff;
uint constant offerDetail_gasprice_mask = 0xffffffffffffffffffffffffffffffffffffffffffffffffffff0000ffffffff;

library OfferDetailLibrary {
  function to_struct(offerDetailT __packed) internal pure returns (OfferDetailStruct memory __s) { unchecked {
    __s.maker = address(uint160((offerDetailT.unwrap(__packed) << offerDetail_maker_before) >> (256-offerDetail_maker_bits)));
    __s.gasreq = (offerDetailT.unwrap(__packed) << offerDetail_gasreq_before) >> (256-offerDetail_gasreq_bits);
    __s.offer_gasbase = (offerDetailT.unwrap(__packed) << offerDetail_offer_gasbase_before) >> (256-offerDetail_offer_gasbase_bits);
    __s.gasprice = (offerDetailT.unwrap(__packed) << offerDetail_gasprice_before) >> (256-offerDetail_gasprice_bits);
  }}

  function eq(offerDetailT __packed1, offerDetailT __packed2) internal pure returns (bool) { unchecked {
    return offerDetailT.unwrap(__packed1) == offerDetailT.unwrap(__packed2);
  }}

  function unpack(offerDetailT __packed) internal pure returns (address __maker, uint __gasreq, uint __offer_gasbase, uint __gasprice) { unchecked {
    __maker = address(uint160((offerDetailT.unwrap(__packed) << offerDetail_maker_before) >> (256-offerDetail_maker_bits)));
    __gasreq = (offerDetailT.unwrap(__packed) << offerDetail_gasreq_before) >> (256-offerDetail_gasreq_bits);
    __offer_gasbase = (offerDetailT.unwrap(__packed) << offerDetail_offer_gasbase_before) >> (256-offerDetail_offer_gasbase_bits);
    __gasprice = (offerDetailT.unwrap(__packed) << offerDetail_gasprice_before) >> (256-offerDetail_gasprice_bits);
  }}

  function maker(offerDetailT __packed) internal pure returns(address) { unchecked {
    return address(uint160((offerDetailT.unwrap(__packed) << offerDetail_maker_before) >> (256-offerDetail_maker_bits)));
  }}

  function maker(offerDetailT __packed,address val) internal pure returns(offerDetailT) { unchecked {
    return offerDetailT.wrap((offerDetailT.unwrap(__packed) & offerDetail_maker_mask)
                        | ((uint(uint160(val)) << (256-offerDetail_maker_bits) >> offerDetail_maker_before)));
  }}
  function gasreq(offerDetailT __packed) internal pure returns(uint) { unchecked {
    return (offerDetailT.unwrap(__packed) << offerDetail_gasreq_before) >> (256-offerDetail_gasreq_bits);
  }}

  function gasreq(offerDetailT __packed,uint val) internal pure returns(offerDetailT) { unchecked {
    return offerDetailT.wrap((offerDetailT.unwrap(__packed) & offerDetail_gasreq_mask)
                        | ((val << (256-offerDetail_gasreq_bits) >> offerDetail_gasreq_before)));
  }}
  function offer_gasbase(offerDetailT __packed) internal pure returns(uint) { unchecked {
    return (offerDetailT.unwrap(__packed) << offerDetail_offer_gasbase_before) >> (256-offerDetail_offer_gasbase_bits);
  }}

  function offer_gasbase(offerDetailT __packed,uint val) internal pure returns(offerDetailT) { unchecked {
    return offerDetailT.wrap((offerDetailT.unwrap(__packed) & offerDetail_offer_gasbase_mask)
                        | ((val << (256-offerDetail_offer_gasbase_bits) >> offerDetail_offer_gasbase_before)));
  }}
  function gasprice(offerDetailT __packed) internal pure returns(uint) { unchecked {
    return (offerDetailT.unwrap(__packed) << offerDetail_gasprice_before) >> (256-offerDetail_gasprice_bits);
  }}

  function gasprice(offerDetailT __packed,uint val) internal pure returns(offerDetailT) { unchecked {
    return offerDetailT.wrap((offerDetailT.unwrap(__packed) & offerDetail_gasprice_mask)
                        | ((val << (256-offerDetail_gasprice_bits) >> offerDetail_gasprice_before)));
  }}
}

function offerDetail_t_of_struct(OfferDetailStruct memory __s) pure returns (offerDetailT) { unchecked {
  return offerDetail_pack(__s.maker, __s.gasreq, __s.offer_gasbase, __s.gasprice);
}}

function offerDetail_pack(address __maker, uint __gasreq, uint __offer_gasbase, uint __gasprice) pure returns (offerDetailT) { unchecked {
  return offerDetailT.wrap(((((0
                      | ((uint(uint160(__maker)) << (256-offerDetail_maker_bits)) >> offerDetail_maker_before))
                      | ((__gasreq << (256-offerDetail_gasreq_bits)) >> offerDetail_gasreq_before))
                      | ((__offer_gasbase << (256-offerDetail_offer_gasbase_bits)) >> offerDetail_offer_gasbase_before))
                      | ((__gasprice << (256-offerDetail_gasprice_bits)) >> offerDetail_gasprice_before)));
}}