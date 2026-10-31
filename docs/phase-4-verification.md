# Phase 4 verification

Verified on **31 October 2026**.

## Completed scope

`contracts/LendLoop.sol` now includes rejection and cancellation refunds, both permissionless timeout paths, lender-raised/admin-resolved disputes, participant ratings through Reputation, rental/user getters, lender-controlled listing availability, and explicit receive/fallback rejection. All Section 5 Solidity concepts have `[LAB]` comments in the contracts; event consumption is demonstrated by decoding transaction logs in `tests/phase-4.cjs` and the existing Remix screenshot. The line-number concept map and full demo rehearsal remain Phase 5 work.

## Automated verification

```sh
npm ci --prefix tests
npm test --prefix tests
```

Run only the new checks with `npm run test:phase4 --prefix tests`.

The tests compile the actual sources with pinned **Solidity 0.8.24**, deploy fresh Reputation/LendLoop contracts on **Ganache 7.9.2**, and use **ethers 6.13.4** for transactions and event decoding. Time is advanced deterministically. Compilation produces **zero errors and zero warnings**. Unoptimized LendLoop runtime is **22,819 bytes**, below the 24,576-byte deployment limit. Ganache uses its JavaScript fallback because optional native bindings are unavailable on this Mac.

The full Phase 2, 3, and 4 suites pass. This phase was executed on a local chain; no new Remix browser execution or public deployment is claimed.

## Section 8 test table

| Test | Result | Automated evidence |
|---|---|---|
| T1 — Owner-only registration | Pass | Phase 3 rejects non-owner registration/removal |
| T2 — Students-only listing/request | Pass | Phase 3 checks both operations and removed students |
| T3 — Exact payment | Pass | Phase 3 rejects incorrect payment without consuming IDs or availability |
| T4 — No self-rental | Pass | Phase 3 rejects lender renting own item |
| T5 — No concurrent rental | Pass | Phase 3 rejects unavailable items; Phase 4 blocks availability toggles throughout every open rental state |
| T6 — Rental units | Pass | Phase 3 rejects zero and above-maximum units |
| T7 — Only lender approves | Pass | Phase 3 rejects borrower approval |
| T8 — Return confirmation state | Pass | Phase 4 rejects confirmation while Active |
| T9 — On-time return | Pass | Phase 3 normal completion and Phase 4 silent-lender completion credit rent/full deposit |
| T10 — Late fee/cap | Pass | Phase 3 checks rounding and caps; Phase 4 checks late timeout settlement from stored return time |
| T11 — Reject/cancel refunds | Pass | Phase 4 checks lender rejection, borrower cancellation in Requested and Approved, exact full refunds, availability, and duplicate rejection |
| T12 — Early timeout | Pass | Phase 4 checks one second before both deadlines and the exact `TooEarly(availableAt)` payload |
| T13 — Silent lender | Pass | Phase 4 outsider settles at the exact two-unit boundary, on time and late |
| T14 — Never returned | Pass | Phase 4 outsider defaults at the exact three-unit boundary, credits rent/full paid deposit once, and leaves item unavailable |
| T15 — Dispute share bounds | Pass | Phase 4 rejects 101; verifies 0/50/100 percent splits, rounding, authorization, and duplicate resolution |
| T16 — Duplicate rating | Pass | Phase 4 checks both participants on Completed and Resolved rentals using real Reputation |
| T17 — Premature rating | Pass | Phase 4 rejects Requested, Active, Disputed, Cancelled, and Defaulted rentals; also rejects outsiders and invalid stars |
| T18 — Empty withdrawal | Pass | Phases 3/4 reject repeated withdrawals |
| T19 — Direct ETH | Pass | Phase 4 tests receive/fallback with zero/nonzero value and actual mined reverted transfers |
| T20 — Reputation write restriction | Pass | Phase 2 rejects normal-account completion/rating writes |
| T21 — No stuck rental funds | Pass | Phase 4 verifies credits equal escrow, withdraws all Phase 4 payouts, checks exact wallet changes less gas, and ends with zero balance; Phase 3 also drains all core-flow funds |

Additional checks cover invalid getter/timeout IDs, empty and ordered user rental arrays, dispute reasons/events, the last second inside the dispute window, rejection at its exact end, blocked timeouts while Disputed, two-way rating averages, and existing participant access after student removal. Phase 3 retains failed-reputation, failed-withdrawal, and reentrancy checks.

## Workflow decisions

- **Occupancy and availability are separate.** A private item-to-current-rental mapping prevents a lender from bypassing the rental lock with `setItemAvailability`, including when Requested, Approved, Active, ReturnClaimed, or Disputed. Cancellation, settlement, resolution, and default clear occupancy. A paused free listing can be resumed.
- **Timeout boundaries do not overlap disputes.** The lender can dispute only before `returnedAt + 2 * timeUnit`; anyone can settle from that exact timestamp onward. Late fees use the recorded return time, regardless of when timeout settlement runs.
- **A default does not automatically relist a missing item.** It stays unavailable; its lender can explicitly make it available after physical recovery.
- **Dispute shares apply to the deposit actually paid.** Rent always goes to the lender; the admin divides the deposit, with integer rounding left to the borrower. No extra late fee is added to an admin-selected split.
- **Reputation follows the specified scope.** Normal and silent-lender settlements record completion. Resolved disputes permit ratings but do not record normal completion; defaults and cancellations permit neither completion records nor ratings. Invalid/duplicate ratings revert through Reputation without emitting a successful `UserRated` event.
- **Funds use pull payments throughout.** Refunds, defaults, and dispute resolution credit balances without calling recipients. The existing guarded `withdraw` sends funds. Existing rentals can finish, receive ratings, and withdraw after a participant is removed from registration.

## Repeat the new paths in Remix

Deploy fresh Reputation, then LendLoop(reputationAddress, 60), and configure Reputation's writer to LendLoop. Register lender B and borrower C. Use small wei amounts; always read `requiredPayment` before requesting because completion can change the discount.

1. B lists an item with rent 100, deposit 1001, late fee 100, max units 7. C requests it; B rejects. C's pending balance increases by the full quote. Repeat with C cancelling before approval and after approval.
2. Request, approve, confirm handover, and mark returned. Call `claimTimeout` immediately to see `TooEarly`; after two time units from the return timestamp, call from any account. Check Completed and the rent/deposit credits.
3. Start a fresh rental and do not mark returned. After `dueAt + 180`, call `claimTimeout`. Check Defaulted, full lender credit, and unavailable item. Only B can explicitly relist it.
4. Start another rental and mark returned. Within 120 seconds, B raises a dispute with a reason. Admin resolves at 50. Check Resolved, lender = rent + half deposit rounded down, borrower = remaining deposit. A non-owner resolution or share of 101 must fail.
5. B and C each rate a Completed or Resolved rental once. Check `UserRated`, Reputation profiles, and averages. Duplicate ratings, outsiders, and stars 0 or 6 must fail.
6. Read `getRental` and `getUserRentals`. Attempt to toggle availability during an open rental; it must fail. Pause/resume a free item from B.
7. Use Remix low-level interactions with empty calldata, then `0x1234`; both must reject. Withdraw B's and C's credits and verify `contractBalance()` is zero after every open rental is finalized.
