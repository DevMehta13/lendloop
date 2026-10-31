// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// [LAB] Abstract contract: inherited by LendLoop and Reputation, not deployed alone.
abstract contract Owned {
    address public owner; // [LAB] Public state variable with an automatic getter.

    // [LAB] Event with indexed parameters for filtering ownership changes.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() { // [LAB] Constructor; msg.sender is the deploying account.
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() { // [LAB] Access-control modifier.
        require(msg.sender == owner, "Owned: caller is not the owner");
        _;
    }

    // [LAB] Public virtual function: child contracts may override it.
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Owned: zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal { // [LAB] Internal function.
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// [LAB] Unimplemented pure virtual function: child contracts must override it.
    function contractName() public pure virtual returns (string memory);
}
