// SPDX-License-Identifier:	AGPL-3.0

pragma solidity ^0.8.16;

/// @author Giry SAS
/** @notice 

An Address Set contract contains versioned name=>address mappings. When you
request a version v of name n, the address set will return a Record with the
highest version v' such that v'<v, or a 'not found' special value (the empty
Record where addr=version=0). We say that v' (and the Record of v') *match* v.

The goal is to specify the contract set you wish to interact with using a single
version number and not let further deployments interfere. For instance, if
contract A has version numbers 2 and 4, contract B has version number 3, and
your library depends on A2 and B3, you can set '3' as the version number.
Retrieving A with v=3 will return A2.

A consequence of this scheme is that you should be careful when deploying. If
you deploy A4, but not B5, and request 'version 4', you will get B3 which may be
setup to talk to A2, not to A4.

We store all strings as bytes32 to avoid ~doubling storage writes.
*/
contract AddressSet {
  /// @notice set of contract admins
  mapping(address=>bool) public admins;
  /// @notice array of names registered at least once
  bytes32[] existingNames;
  /// @notice name=>array database of all versions of all records
  mapping(bytes32=>Record[]) public addresses;
  /// @notice version counter
  uint48 public latestVersion;

  /// @notice contains info about a specific contract version
  struct Record {
    uint48 version;
    address addr;
  }

  /// @dev Give admin rights to msg.sender by default
  constructor() {
    admins[msg.sender] = true;
  }

  /// @notice check whether the caller is an admin
  function checkAdmin() internal view {
    require(admins[msg.sender], "AddressSet/unauthorized");
  }

  /// @notice Add a new admin (admin only)
  /// @param addr the address of the new admin
  function addAdmin(address addr) external {
    checkAdmin();
    admins[addr] = true;
  }

  /// @notice Remove an admin (admin only)
  /// @param addr the address of the removed admin
  function removeAdmin(address addr) external {
    checkAdmin();
    admins[addr] = false;
  }

  /// @notice Register a set of (name,address) pairs under a new version number.
  /// @param names Array of contract names
  /// @param addrs Array of contract addresses.
  /// @dev All records will be registered under the same version. Will throw if |addrs|<|names|. Extra addresses will be ignored. Will throw if names contains a repeat occurrence.
  function register(string[] memory names, address[] memory addrs) external {
    latestVersion += 1;
    for (uint i = 0; i < names.length; i++) {
      _register(names[i],addrs[i]);
    }
  }

  /// @notice Register a (name,address) pair under a new version number.
  /// @param name Contract name
  /// @param addr Contract address
  function register(string memory name, address addr) external {
    latestVersion += 1;
    _register(name,addr);
  }

  /// @notice Get all (name,address) pairs at given version
  /// @param version Target version number
  /// @return names All registered names
  /// @return addrs Names' addresses, in same order
  /// @return versions Names' found version (may be < argument version)
  /// @dev versions[i] = 0 means 'no record found'
  function all(uint48 version) public view returns (string[] memory, address[] memory, uint[] memory) {
    bytes32[] memory names = existingNames;
    (address[] memory addrs, uint[] memory versions) = _find(names,version);
    return (bytes32ArrayToStringArray(names),addrs,versions);
  }

  /// @notice Get all (name,address) pairs at latest version
  /// @return names All registered names
  /// @return addrs Names' addresses, in same order
  /// @return versions Names' found version (may be < argument version)
  function all() external view returns (string[] memory names, address[] memory addrs, uint[] memory) {
    return all(type(uint48).max);
  }

  /// @notice Get address that matches the given name and version, or the 'not found' value.
  /// @param name Name to look up
  /// @param version Version to match
  /// @return address Address of matching record
  /// @return uint Version of matching record
  function findOne(string memory name, uint48 version) internal view returns (address,uint) {
    require(bytes(name).length <= 32, "AddressSets/nameLengthAtMost32Bytes");
    return _findOne(bytes32(bytes(name)),version);
  }

  /// @notice Get address that matches the given name at the latest version, or the 'not found' value.
  /// @param name Name to look up
  /// @return address Address of matching record
  /// @return uint Version of matching record
  function findOne(string memory name) external view returns (address, uint) {
    return _findOne(bytes32(bytes(name)),type(uint48).max);
  }

  /// @notice Get addresss that matches the given names and version, or the 'not found' value when no match is found.
  /// @param names Names to look up
  /// @param version Version to match
  /// @return addrs Addresses of matching records
  /// @return versions Versions of matching records
  function find(string[] memory names, uint48 version) internal view returns (address[] memory addrs, uint[] memory versions) {
    bytes32[] memory _names = new bytes32[](names.length);
    for (uint i = 0; i < names.length; i++) { 
      _names[i] = bytes32(bytes(names[i])); 
    }
    return _find(_names,version);
  }

  /// @notice Get addresss that matches the given names at the latest version, or the 'not found' value when no match is found.
  /// @param names Names to look up
  /// @return addrs Addresses of matching records
  /// @return versions Versions of matching records
  function find(string[] memory names) external view returns (address[] memory, uint[] memory) {
    return find(names,type(uint48).max);
  }

  /**
    Internal implementations. Called by external/public functions.
  */

  /// @notice Register a (name,address) record. Internal implementation.
  /// @param name The name of the new record
  /// @param addr The address of the new record
  /// @dev The latestVersion must be incremented by callers if necessary.
  function _register(string memory name, address addr) internal {
    checkAdmin();
    require(bytes(name).length <= 32, "AddressSets/nameLengthAtMost32Bytes");
    bytes32 _name = bytes32(bytes(name));
    Record memory latest = Record({
      version: latestVersion,
      addr: addr
    });
    uint length = addresses[_name].length ;
    if (length == 0) {
      existingNames.push(_name);
    } else if (addresses[_name][length-1].version == latestVersion) {
      revert("AddressSets/noDuplicateRecord");
    }
    addresses[_name].push(latest);
  }

  /// @notice Get address that matches the given name and version, or the 'not found' value.
  /// @param name Name to look up
  /// @param version Version to match
  /// @return address Address of matching record
  /// @return uint Version of matching record
  /// @dev This version takes a bytes32 name, unlike external ones which take a string.
  function _findOne(bytes32 name, uint48 version) internal view returns (address, uint) {
    uint length = addresses[name].length;
    Record memory current = addresses[name][length-1];
    // shortcut: will check last element first
    if (current.version <= version) {
      return (current.addr,current.version);
    }
    // empty previous means "not found", aka all versions of name are > version
    Record memory previous; 
    // binary search
    // needle = argmax \i -> versions[name][i] <= version
    // invariant: needle is >= from, <= from+length
    // progress&termination: return or length=length/2
    uint from = 0;
    while (true) {
      length = length / 2;
      current = addresses[name][from+length];
      if (current.version == version) {
        return (current.addr,current.version);
      } else if (current.version < version) {
        if (length == 0) { 
          return (current.addr,current.version); 
        }
        // a previous that wasn't < version has no chance of being returned
        from = from + length;
      } else {
        if (length == 0) { 
          return (previous.addr,previous.version); 
        }
      }
    } 
  }


  /// @notice Get addresss that matches the given names and version, or the 'not found' value when no match is found.
  /// @param names Names to look up
  /// @param version Version to match
  /// @return addrs Addresses of matching records
  /// @return versions Versions of matching records
  /// @dev This version takes a bytes32 names array, unlike external ones which take a string array.
  function _find(bytes32[] memory names, uint48 version) internal view returns (address[] memory addrs, uint[] memory versions) {
    addrs = new address[](names.length);
    versions = new uint[](names.length);
    for (uint i = 0; i < names.length; i++) {
      (address addr, uint ver) = _findOne(names[i],version);
      addrs[i] = addr;
      versions[i] = ver;
    }
  }


  /** 
    Utility conversion functions. Used because while we store names as bytes32 (and bytes32 arrays), we expose a string interface for convenience.
  */
  /// @notice Convert a bytes32 array to a string array
  /// @param bs an array of bytes32
  /// @return ss an array of strings
  function bytes32ArrayToStringArray(bytes32[] memory bs) internal pure returns (string[] memory) {
    string[] memory ss = new string[](bs.length);
    for (uint i = 0; i < bs.length; i++) { 
      ss[i] = string.concat(bs[i]); 
    }
    return ss;
  }

  /// @notice Convert a strings array to a bytes32 array
  /// @param ss an array of strings
  /// @return bs an array of bytes32
  function stringArrayToBytes32Array(string[] memory ss) internal pure returns (bytes32[] memory) {
    bytes32[] memory bs = new bytes32[](ss.length);
    for (uint i = 0; i < ss.length; i++) { 
      bs[i] = bytes32(bytes(ss[i])); 
    }
    return bs;
  }


}
