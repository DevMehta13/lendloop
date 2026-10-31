// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// [LAB] Library: internal functions are included in the calling contract;
/// no separate library deployment or linking is needed.
library LateFee {
    /// @dev timeUnit must be greater than zero (validated by LendLoop's constructor).
    /// @param cap Maximum fee, normally the rental's actual deposit after discount.
    function calculate(
        uint256 dueAt,
        uint256 returnedAt,
        uint256 timeUnit,
        uint256 feePerUnit,
        uint256 cap
    ) internal pure returns (uint256 fee, uint256 unitsLate) { // [LAB] Pure calculation.
        if (returnedAt <= dueAt) return (0, 0);

        // Round up: even one second late counts as one whole unit.
        unitsLate = (returnedAt - dueAt + timeUnit - 1) / timeUnit;
        fee = unitsLate * feePerUnit;
        if (fee > cap) fee = cap;
    }
}
