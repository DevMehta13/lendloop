# Phase 5 — Demo rehearsal

Rehearsal date: **31 October 2026**.

## Method

The Section 7 script is reproduced by `scripts/demo-runner.js`. Both final runs use a separate, newly opened Remix browser tab with a fresh Remix VM, fresh Reputation and LendLoop deployments, the first five built-in test accounts, and `timeUnit = 60`. Remix's bundled ethers **5.8.0** drives the transactions. Solidity **0.8.24** bytecode is compiled from the repository sources with no optimizer and no external Solidity dependencies.

These are scripted rehearsals inside Remix VM. They exercise the same roles, calls, values, events and waits as the manual script; the measured runtime does not establish how quickly a person can operate the Deploy panel. Browser setup and script-loading time are excluded. The late-return wait and the 120-second silent-lender wait use real elapsed time, with no time-travel RPC calls. Expected failures are checked through `eth_call`/`callStatic` to expose their reasons without consuming gas. The runner handles both thrown RPC errors and ABI-encoded `Error(string)` return data, as returned by the current Remix provider; receive/fallback checks also run immediately after deployment. The Phase 4 suite separately verifies mined rejection of direct transfers.

Both independent VMs may produce the same contract addresses because they use the same deterministic test accounts and deployment nonces. Their separate return/due timestamps are preserved in the transcripts.

## Results

| Run | Result | Elapsed | Final escrow | Transcript |
|---|---|---|---|---|
| 1 | All 16 steps pass | 248.864 seconds (4m 9s) | 0 ETH | [Full log](phase-5-run-1.txt) |
| 2 | All 16 steps pass | 249.795 seconds (4m 10s) | 0 ETH | [Full log](phase-5-run-2.txt) |

Each run charged Aman **0.2 ETH** in late fees, quoted Neha **0.91 ETH** after her 10% deposit discount, split her 0.9 ETH disputed deposit into **0.45 ETH each**, and rejected the early timeout. Final withdrawals were **0.69 ETH to Riya**, **1.30 ETH to Aman**, and **0.95 ETH to Neha**, accounting for the full **2.94 ETH** escrowed across four rentals. [Source and script hashes](phase-5-source-manifest.json) identify the rehearsed revision.

The runner asserts every step, including the requested/approved/active/completed/resolved states, exact quotes, reputation counters, and payouts. It additionally withdraws the borrowers' credits at the end and asserts that the escrow balance is zero. All Phase 2–4 regression suites also pass; compilation has zero warnings/errors and LendLoop's unoptimized runtime remains 22,819 bytes.

## Reproduce in Remix

1. Open a **new Remix tab** and use its built-in **Remix VM**, with no injected wallet or public network. The current IDE is reached through [Remix](https://remix.ethereum.org), which redirects to [app.remix.live](https://app.remix.live/).
2. Copy the complete contents of `scripts/phase-5-auto.txt` into the Remix **terminal command input** at the bottom of the page, replacing any placeholder command, then press Enter. This one-line command contains the compiled contracts and runs all 16 steps. Keep the tab open for about five minutes. Expect `EXPECTED REVERT` messages, `PASS STEP 1` through `PASS STEP 16`, and `ALL 16 STEPS PASS`.
3. For a presenter-controlled rehearsal instead, upload `scripts/phase-5-remix.js` as a JavaScript file, select it, and run `remix.exeCurrent()` in the terminal. Then call `window.phase5.step(1)` through `window.phase5.step(16)` in order. Steps 11 and 13 wait for their real deadlines before proceeding.
4. Expand the terminal and scroll to each step's receipt logs. Use Section 7 of the implementation plan for the matching manual Deploy-panel inputs and account switches.
5. Start another new tab to repeat from a fresh VM. Do not reuse the standalone Reputation instance from Phase 2.

After any Solidity edit, rebuild the embedded artifacts before rehearsing:

```sh
npm ci --prefix tests
node scripts/build-demo.cjs
```

The compiler dependency is pinned in `tests/package-lock.json`. The generated `.js` and one-line `.txt` files are included so a demo does not require Node or compilation in the browser. `scripts/demo-runner.js` is the readable runner source; `scripts/build-demo.cjs` embeds the current ABI and bytecode. The normal contract files remain the source to upload for a manual Remix demonstration.

## Screenshots by Section 7 step

Each image is an unedited capture of the Remix terminal with the real decoded receipt logs and pass result. Screenshots are captured by scrolling the completed log to the relevant step. Full transcripts preserve context beyond a single viewport.

| Step | Demonstration | First run | Second run |
|---|---|---|---|
| 1 | Deploy and configure both contracts | [Screenshot](screenshots/phase-5/run-1-step-01.png) | [Screenshot](screenshots/phase-5/run-2-step-01.png) |
| 2 | Register Riya, Aman and Neha | [Screenshot](screenshots/phase-5/run-1-step-02.png) | [Screenshot](screenshots/phase-5/run-2-step-02.png) |
| 3 | Reject an unregistered outsider | [Screenshot](screenshots/phase-5/run-1-step-03.png) | [Screenshot](screenshots/phase-5/run-2-step-03.png) |
| 4 | Five-argument calculator listing | [Screenshot](screenshots/phase-5/run-1-step-04.png) | [Screenshot](screenshots/phase-5/run-2-step-04.png) |
| 5 | Three-argument drafter listing | [Screenshot](screenshots/phase-5/run-1-step-05.png) | [Screenshot](screenshots/phase-5/run-2-step-05.png) |
| 6 | Reject wrong payment; lock exactly 1.01 ETH | [Screenshot](screenshots/phase-5/run-1-step-06.png) | [Screenshot](screenshots/phase-5/run-2-step-06.png) |
| 7 | Approve and hand over; set dueAt | [Screenshot](screenshots/phase-5/run-1-step-07.png) | [Screenshot](screenshots/phase-5/run-2-step-07.png) |
| 8 | On-time return; refund full 0.5 ETH deposit | [Screenshot](screenshots/phase-5/run-1-step-08.png) | [Screenshot](screenshots/phase-5/run-2-step-08.png) |
| 9 | Two-way ratings, 5.00 and 4.00 | [Screenshot](screenshots/phase-5/run-1-step-09.png) | [Screenshot](screenshots/phase-5/run-2-step-09.png) |
| 10 | Compare 0.91 and 1.01 ETH quotes | [Screenshot](screenshots/phase-5/run-1-step-10.png) | [Screenshot](screenshots/phase-5/run-2-step-10.png) |
| 11 | Late return and automatic fee | [Screenshot](screenshots/phase-5/run-1-step-11.png) | [Screenshot](screenshots/phase-5/run-2-step-11.png) |
| 12 | Dispute and admin 50/50 deposit split | [Screenshot](screenshots/phase-5/run-1-step-12.png) | [Screenshot](screenshots/phase-5/run-2-step-12.png) |
| 13 | Reject early timeout; settle after 120 seconds | [Screenshot](screenshots/phase-5/run-1-step-13.png) | [Screenshot](screenshots/phase-5/run-2-step-13.png) |
| 14 | Withdraw lender credit; reject second withdrawal | [Screenshot](screenshots/phase-5/run-1-step-14.png) | [Screenshot](screenshots/phase-5/run-2-step-14.png) |
| 15 | Reject receive and fallback payments | [Screenshot](screenshots/phase-5/run-1-step-15.png) | [Screenshot](screenshots/phase-5/run-2-step-15.png) |
| 16 | Read Aman rentals [1,4]; withdraw all remaining credits | [Screenshot](screenshots/phase-5/run-1-step-16.png) | [Screenshot](screenshots/phase-5/run-2-step-16.png) |
