# Phase 3 verification

Verified on **31 October 2026**.

## Implemented scope

`contracts/LendLoop.sol` implements the Phase 3 core escrow flow from Section 4.5 of the implementation plan:

- Types, state, custom errors, core events, access-control modifiers, constructor, and inherited ownership.
- Admin registration/removal; both listing overloads and `getItem`.
- Exact-payment quotes with reputation discounts and rental-unit validation.
- Request → approval → handover → return claim → confirmation/settlement.
- Pull-payment credits, guarded withdrawals, pending balances, and contract balance.

`contractName()` is implemented ahead of Phase 4 because the inherited abstract function must be overridden to deploy LendLoop. Full enum numbering and the timeout constants are retained for compatibility with the remaining workflow. Other Phase 4 features are still pending; this is a core-flow demo, not the complete application.

## Environment and automated checks

Run from the project root:

```sh
npm ci --prefix tests
npm test --prefix tests
```

Run only this phase with `npm run test:phase3 --prefix tests`.

The tests compile the actual Solidity sources using pinned Solidity **0.8.24**, deploy a fresh Reputation and LendLoop to a temporary **Ganache 7.9.2** chain, configure the real writer address, and execute transactions using **ethers 6.13.4**. Time advances deterministically on the local chain. Test helper contracts are compiled in memory and are not production source files.

The compiler reports **zero errors and zero warnings**. Unoptimized LendLoop deployed bytecode is **15,165 bytes**, below the 24,576-byte runtime limit. Ganache uses its JavaScript fallback on this Mac because optional native bindings are unavailable.

| Area | Verified behavior |
|---|---|
| Deployment | Zero reputation address and zero time unit rejected; owner, interface address, time unit, constants, and contract name correct |
| Students | Owner-only register/remove; zero address rejected; removed students cannot list; existing rentals can finish after removal |
| Listings | Both overloads; default fee = deposit / 10 and max units = 7; item fields and listing event; zero deposit/max units rejected |
| Quotes and requests | Unknown items and invalid units rejected; exact rent + discounted deposit required; nonstudents, self-rental, and unavailable items rejected; invalid payments do not consume an item or rental ID |
| State and authorization | Borrower/lender restrictions; transitions require the expected status; request locks the item immediately; duplicate approval, handover, or settlement rejected |
| On-time lifecycle | Two-unit rent, due-time calculation, return exactly at due time, zero late fee, restored availability, real reputation update, and both wallet withdrawals |
| Discounts | Real completed rentals produce the 10/25/50 percent tiers; each rental snapshots its paid deposit; sequential settlements accumulate pending credits |
| Late fees | 1 second and 60 seconds late cost one unit; 61 seconds costs two; larger fees cap at the actual discounted deposit |
| Return timestamp | Delayed lender confirmation does not increase the fee; a zero-fee late return still increments late reputation |
| Money conservation | Settlement retains ETH in escrow until withdrawal; wallet balance changes match credits less gas; all test rentals settle and all credits drain to zero |
| Reputation failure | Reverting completion writer emits `ReputationUpdateFailed`; settlement and both withdrawals still succeed |
| Withdrawal failure and reentry | A real rejected-payment transaction rolls back and preserves credit; the other party can withdraw; retry pays once; attempted recursive withdrawal fails |

The existing Phase 2 regression suite also passes with LendLoop included in compilation.

## Repeat the core flow in Remix VM

These are reproduction instructions; this phase's recorded execution used the automated local chain, not a new browser Remix deployment.

1. Upload `contracts/`, select compiler **0.8.24**, and compile `LendLoop.sol` and `Reputation.sol`.
2. From account **A**, deploy a **fresh Reputation**, then deploy **LendLoop(reputationAddress, 60)**. Call Reputation's `setLendLoop(lendLoopAddress)` from A.
3. In LendLoop, A registers **B** (lender) and **C** (borrower).
4. From B, use the three-argument `listItem("Camera", 100, 1000)`. All amounts here are **wei**. Item 1 should have fee 100, max units 7, and `available = true`.
5. Read `requiredPayment(1, 1, C)`: a new borrower gets `(100, 1000, 1100)`.
6. From C, set Value to **1100 Wei** and call `requestRental(1, 1)`. Reset Value to **0** for the remaining calls. Rental 1 is Requested (0); item 1 is unavailable.
7. From B call `approveRental(1)`; from C call `confirmHandover(1)`. Rental 1 becomes Active (2), and `dueAt` is handover time + 60 seconds.
8. From C call `markReturned(1)` before `dueAt`, then from B call `confirmReturn(1)`. Rental 1 becomes Completed (4); item 1 is available; pending balances are B = 100 and C = 1000. Reputation records C's on-time return and B's completed lend.
9. From B and C call `withdraw()` separately. Each pending balance and `contractBalance()` should become 0. `withdraw()` again must revert.
10. Rent item 1 again: C now has a 10% discount, so the quote is `(100, 900, 1000)`. After handover, wait until **1–60 seconds after dueAt**, then mark returned and confirm. The fee is 100: B is credited 200 and C 800. Withdraw both; escrow returns to 0.

## Design details

Lateness uses `returnedAt > dueAt`, correcting the plan's sample `fee > 0` test: a listing can have a zero late fee (including the default fee when deposit < 10 wei), and lateness must still affect reputation. Settlement uses the stored return timestamp and stored paid deposit. A reputation failure is observable through an event and is not retried automatically.

Registration controls new listings and requests. Removing a student does not revoke their ability to finish or withdraw from an existing rental. Item IDs and rental units are validated in quotes as well as requests; this prevents misleading quotes for nonexistent items or invalid durations. A defensive check rejects reputation discounts above 100%.

Cancellation, rejection, disputes, timeouts, participant ratings, additional getters, and explicit receive/fallback handlers remain for Phase 4. Until then, participants must complete the core flow to unlock requested funds.
