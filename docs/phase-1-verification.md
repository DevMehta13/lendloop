# Phase 1 verification

Verified on **31 October 2026**.

## Environment and compilation

- Solidity compiler: `0.8.24+commit.e11b9ed9.Emscripten.clang`.
- Local test chain: Ganache 7.9.2; contract calls through ethers 6.13.4.
- All three project files and a temporary verification contract compiled with **zero errors and zero warnings**.
- `Owned` and `IReputation` produced no deployable bytecode, as expected.
- The temporary contract used `LateFee.calculate` without external library linking.
- Verification tooling and the temporary contract were kept outside the project. No test dependencies are required to compile the project in Remix.

## Ownership results

All checks passed:

- The deploying account became the owner.
- Deployment emitted `OwnershipTransferred` from the zero address to the deployer.
- A child contract implemented and returned its own `contractName()`.
- A non-owner could not transfer ownership.
- Transfer to the zero address reverted.
- A valid transfer updated the owner and emitted the correct previous/new addresses.
- The previous owner lost transfer permission.
- The new owner could perform another transfer.

## Late-fee results

Unless specified otherwise: `dueAt = 1000`, `timeUnit = 60`, `feePerUnit = 100`, `cap = 500`. Monetary values are integer wei; timestamps are seconds.

| Scenario | returnedAt | Expected fee | Expected unitsLate | Result |
|---|---:|---:|---:|---|
| Early return | 999 | 0 | 0 | Pass |
| Exactly on time | 1000 | 0 | 0 | Pass |
| One second late | 1001 | 100 | 1 | Pass |
| Exactly one unit late | 1060 | 100 | 1 | Pass |
| 61 seconds late | 1061 | 200 | 2 | Pass |
| Calculated fee exceeds cap | 1361 | 500 | 7 | Pass |
| Zero fee rate (`feePerUnit = 0`) | 1061 | 0 | 2 | Pass |
| Zero cap (`cap = 0`) | 1061 | 0 | 2 | Pass |
| Real day (`timeUnit = 86400`) | 87401 | 200 | 2 | Pass |

`timeUnit > 0` is a caller precondition, enforced by the planned LendLoop constructor. Arithmetic uses Solidity 0.8 checked integer operations; overflow reverts.

## Repeat manually in Remix

Upload the project's `contracts` folder. Create a temporary root-level `Phase1Check.sol` with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./contracts/Owned.sol";
import "./contracts/LateFee.sol";

contract Phase1Check is Owned {
    function contractName() public pure override returns (string memory) {
        return "Phase1Check";
    }

    function calculate(
        uint256 dueAt,
        uint256 returnedAt,
        uint256 timeUnit,
        uint256 feePerUnit,
        uint256 cap
    ) public pure returns (uint256 fee, uint256 unitsLate) {
        return LateFee.calculate(dueAt, returnedAt, timeUnit, feePerUnit, cap);
    }
}
```

Compile with Solidity 0.8.24, deploy `Phase1Check` in Remix VM, and call `calculate` with the table inputs. Inspect `owner`, then switch accounts to check rejected unauthorized transfers. From the owner account, transfer to another account and inspect the ownership event and updated `owner` value. The wrapper is for verification only and is not an application contract.
