# LendLoop

Peer-to-peer campus item lending with smart-contract deposits.

## Current progress

Phase 1 is complete. The ownership, reputation interface, and late-fee helpers are ready for the main contracts.

| File | Purpose |
|---|---|
| `contracts/Owned.sol` | Abstract admin ownership, restricted ownership transfer, and contract naming |
| `contracts/IReputation.sol` | Interface for completion records, ratings, and deposit discounts |
| `contracts/LateFee.sol` | Pure late-fee calculation with rounded-up time units and a deposit cap |

All files use `pragma solidity ^0.8.24`, require no external Solidity imports, and include `[LAB]` concept comments.

## Compile in Remix

1. Open [Remix IDE](https://remix.ethereum.org).
2. Upload the `contracts` folder.
3. Select Solidity compiler **0.8.24** and compile each file.

`Owned` is abstract and `IReputation` is an interface, so neither is deployed independently. `LateFee.calculate` is internal and needs no separate library deployment or linking.

## Verification

The helpers compiled without warnings or errors using Solidity 0.8.24. A temporary contract on a local test blockchain verified ownership behavior and nine late-fee scenarios. Results and manual reproduction instructions are in [Phase 1 verification](docs/phase-1-verification.md).

See [the implementation plan](LendLoop_Implementation_Plan.md) for subsequent phases and the full design.
