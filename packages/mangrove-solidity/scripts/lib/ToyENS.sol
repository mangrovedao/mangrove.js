// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.13;

contract ToyENS {
  mapping(string => address) _addrs;
  mapping(string => bool) _isToken;
  string[] _names;

  function get(string calldata name)
    public
    view
    returns (address addr, bool isToken)
  {
    addr = _addrs[name];
    isToken = _isToken[name];
  }

  function setAddr(string calldata name, address addr) public {
    _addrs[name] = addr;
    _names.push(name);
  }

  function setIsToken(string calldata name, bool isToken) public {
    require(
      _addrs[name] != address(0),
      "only nonzero addresse can be marked as tokens"
    );
    _isToken[name] = isToken;
  }

  // shorthand
  function setIsToken(string calldata name) public {
    setIsToken(name, true);
  }

  // shorthand
  function set(string calldata name, address addr) public {
    setAddr(name, addr);
  }

  // shorthand
  function set(
    string calldata name,
    address addr,
    bool isToken
  ) public {
    setAddr(name, addr);
    setIsToken(name, isToken);
  }

  // shorthand
  function set(
    string[] calldata names,
    address[] calldata addrs,
    bool[] calldata isToken
  ) public {
    for (uint i = 0; i < names.length; i++) {
      set(names[i], addrs[i], isToken[i]);
    }
  }

  function all()
    public
    view
    returns (
      string[] memory names,
      address[] memory addrs,
      bool[] memory isToken
    )
  {
    names = _names;
    addrs = new address[](names.length);
    isToken = new bool[](names.length);
    for (uint i = 0; i < _names.length; i++) {
      addrs[i] = _addrs[names[i]];
      isToken[i] = _isToken[names[i]];
    }
  }
}
