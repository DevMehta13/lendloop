# Phase 2 verification

Verified on **31 October 2026**.

## Implementation and environment

- `contracts/Reputation.sol` implements Section 4.4 of the implementation plan and inherits `Owned` and `IReputation`.
- Solidity `0.8.24+commit.e11b9ed9.Emscripten.clang` compiled all four project contracts with **zero errors and zero warnings**.
- Automated transactions ran on Ganache 7.9.2 through ethers 6.13.4. The pinned development dependencies and lockfile live in `tests/`; they are not Solidity dependencies.
- The same Solidity 0.8.24 bytecode was deployed in Remix VM through Remix's terminal and bundled ethers library. It passed completion updates, profile reads, lender counters, ratings averaging 4.50, duplicate rejection, unauthorized-write rejection, discount boundaries 0/10/25/50, and the late-majority penalty.
- The browser verification did not use an injected wallet or a public network. Its temporary deployment is for testing only.
- Final Remix VM test deployment: `0xDA0bab807633f07f013f94DD0E6A4F96F8742B53`. [Saved verification screenshot](screenshots/phase-2-remix-verification.png).
- On this Mac's Node build, Ganache reported unavailable optional native bindings and used its JavaScript fallback; all checks completed successfully.

## Automated results

All checks passed in `tests/phase-2.cjs`:

| Area | Verified behavior |
|---|---|
| Initial state | Deployer owns the contract; writer is unset; profile counters, average, and discount start at zero; contract name is `Reputation` |
| Configuration | Only the owner can set the writer; zero address is rejected without consuming configuration; a valid writer is stored and emits `LendLoopSet`; a second configuration reverts |
| Access control | Completions fail before configuration; unauthorized completions and ratings revert; rejected calls leave counters untouched |
| Completion records | On-time and late returns update separate borrower counters; every completion increments the lender's count; events contain borrower, lender, and lateness |
| Discounts | On-time counts 0, 1, 2, 3, 4, 5, 6 produce 0, 10, 10, 25, 25, 50, 50 percent |
| Late penalty | Equal late/on-time counts retain the tier; more late returns force zero; another on-time return restores eligibility; late-only and lender-only profiles receive zero |
| Ratings | Both 1 and 5 stars are accepted; 0, 6, and 255 revert; invalid submissions do not consume the rater's slot |
| Duplicate prevention | Same rental/rater cannot rate twice, even with a different ratee; the rater can rate another rental; another rater can rate the same rental; both participants can rate each other |
| Average | Unrated is 0; one 5-star rating is 500; 5 and 4 give 450; 5, 4, and 1 give 333 (integer truncation) |
| Isolation and events | Rating counters belong to the ratee; return counters survive ratings; ratings do not change discounts; rating events identify rental, ratee, and stars |
| Ownership transfer | New owner can configure an unset instance; previous owner loses that permission; transferring ownership cannot replace an already configured writer or grant reputation-writing permission |

Repeat from the project root:

```sh
npm ci --prefix tests
npm test --prefix tests
```

The runner compiles the real project sources, deploys fresh instances, sends local transactions, asserts state and event values, and exits unsuccessfully on any failed check. It disconnects the temporary chain afterward.

## Repeat manually in Remix VM

1. Upload the `contracts` folder, select Solidity **0.8.24**, and compile `Reputation.sol`.
2. Choose **Remix VM** and deploy `Reputation` from account **A**. Use different accounts **B** (temporary writer), **C** (borrower), **D** (lender), and **E** (unauthorized caller).
3. Confirm `owner()` is A, `contractName()` is `Reputation`, and C's `getProfile`, `averageRating`, and `discountPercent` are all zero.
4. From A, call `setLendLoop(B)`. Confirm `lendLoop()` is B and `LendLoopSet` was emitted. A second call must revert. An owner call using the zero address on a fresh deployment must also revert.
5. Switch to B and call `recordCompletion(C, D, false)` five times. After each call C's discounts must be **10, 10, 25, 25, 50**. C's on-time counter and D's lending counter must each reach 5.
6. From B, call `recordRating(1, D, C, 5)` and `recordRating(2, D, C, 4)`. C's profile must show `ratingSum = 9`, `ratingCount = 2`, and `averageRating(C) = 450`. `hasRated(1, D)` must be true. Repeating rental 1 from rater D must revert; 0 or 6 stars on an unused rental must revert.
7. Switch to E and call `recordCompletion(C, D, false)`. It must revert with `Reputation: caller is not LendLoop`. Unauthorized `recordRating` must also revert.
8. Switch to B and record five late completions. C's late/on-time counts are equal, so its discount remains 50. Record one more late completion: the discount becomes 0.

`setLendLoop` accepts an ordinary test account so this phase can be checked before the rental contract exists. It can only be set once. **Deploy a fresh Reputation instance for Phase 3** and configure it with the actual deployed LendLoop address.

LendLoop will validate completed rentals and participant identities before forwarding ratings. Reputation trusts its configured writer for those validations, as specified in the plan. Completion recording has no rental ID in its interface, so the Phase 3 settlement state transitions must prevent double recording.
