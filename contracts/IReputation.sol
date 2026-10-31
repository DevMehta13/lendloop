// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// [LAB] Interface: defines how LendLoop communicates with Reputation.
interface IReputation {
    function recordCompletion(address borrower, address lender, bool wasLate) external;

    function recordRating(uint256 rentalId, address rater, address ratee, uint8 stars) external;

    function discountPercent(address user) external view returns (uint256);
}
