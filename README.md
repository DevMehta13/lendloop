# LendLoop

Peer-to-peer campus item lending with smart-contract deposits.

## Current progress

Phases 1–3 are complete. The main escrow now supports listing, reputation-discounted rental requests, approval, handover, return, settlement, and withdrawals. Phase 4 adds cancellations, timeouts, disputes, ratings, and remaining convenience functions.

| File | Purpose |
|---|---|
| `contracts/Owned.sol` | Shared admin ownership, restricted ownership transfer, and abstract contract naming |
| `contracts/IReputation.sol` | Interface for completion records, ratings, and deposit discounts |
| `contracts/LateFee.sol` | Pure late-fee calculation with rounded-up time units and a deposit cap |
| `contracts/LendLoop.sol` | Core rental escrow, student registration, discounted deposits, late-fee settlement, and guarded pull-payment withdrawals |
| `contracts/Reputation.sol` | Completion records, one rating per rental/rater, average ratings, and reputation-based deposit discounts |

All files use `pragma solidity ^0.8.24`, require no external Solidity imports, and include `[LAB]` concept comments.

## Compile in Remix

1. Open [Remix IDE](https://remix.ethereum.org).
2. Upload the `contracts` folder.
3. Select Solidity compiler **0.8.24** and compile each file.

`Owned` is abstract and `IReputation` is an interface, so neither is deployed independently. `LateFee.calculate` is internal and needs no separate library deployment or linking.

For Phase 2, deploy `Reputation`, then call `setLendLoop` from the owner with a different Remix account's address. Switch to that account to record completions and ratings. Configuration is permanent for that instance. For the core rental demo, deploy a **fresh** `Reputation`, deploy `LendLoop` with its address, and call `setLendLoop` with the deployed `LendLoop` address.

## Verification

The Phase 1 helpers compiled without warnings or errors using Solidity 0.8.24. A temporary contract on a local test blockchain verified ownership behavior and nine late-fee scenarios. Results and manual reproduction instructions are in [Phase 1 verification](docs/phase-1-verification.md).

Phase 2 compiled with zero errors or warnings using Solidity 0.8.24. Automated local-chain checks passed for all discount tiers, late-return penalties, rating validation, duplicate prevention, events, and ownership restrictions. The core flow also passed in Remix VM. See [Phase 2 verification](docs/phase-2-verification.md) for results and a step-by-step Remix check.

Phase 3 compiled with zero errors or warnings using Solidity 0.8.24. Automated local-chain checks passed for full on-time and late rentals, real reputation discounts, exact payouts, fee caps, failed reputation updates, failed withdrawals, and reentrancy protection. See [Phase 3 verification](docs/phase-3-verification.md) for results and Remix reproduction steps.

Optional automated verification (Node.js required; Solidity files still need no external imports):

```sh
npm ci --prefix tests
npm test --prefix tests
```

See [the implementation plan](LendLoop_Implementation_Plan.md) for subsequent phases and the full design.
