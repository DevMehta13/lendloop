# Phase 6 — One-page wallet interface

Completed 31 October 2026. The application is a single buildless `frontend/index.html`, loading the plan's pinned ethers 6.13.4 UMD bundle from jsDelivr. No React, frontend package installation, or build step is required. Solidity contracts are unchanged.

## Included behavior

- Explicit wallet connection, deployed-address and expected-chain inputs, connected address, admin/student roles, and contract time-unit duration.
- Validation of chain, deployed contract code/name, and Reputation's configured LendLoop writer. No automatic wallet signing or network switching.
- Admin registration/removal of students; registered-student listing form with all five contract arguments.
- Listing table, integer rental units, reputation-adjusted quote with rent/deposit/total, and a separate Rent button. The contract quote is checked again before submitting the exact payable value. Amounts stay in integer wei.
- Participant-specific approval, rejection, cancellation, handover, return, dispute, rating, and timeout controls. Admins can inspect and resolve all disputes even if they are not rental participants.
- Pending balance and withdrawal, reputation discount/rating, bounded live event log using `contract.on`, confirmation notices, and readable errors.
- Account/network/disconnection invalidation, listener cleanup, serialized refreshes, and safe text rendering for untrusted listing names. Only deployment address and chain ID are saved locally; private keys never enter the page.

## Reproduce locally

From the project root:

```sh
npm ci --prefix tests
npm run demo --prefix tests
```

Keep that terminal running. This starts a disposable Ganache chain at **127.0.0.1:8545**, chain ID **31337**, deploys and wires both contracts with a **60-second unit**, registers three students, and creates one calculator listing. It prints the deployed addresses and four **public local test keys** (admin, lender, two borrowers). These known keys must never hold real funds. Restarting the command resets all rental activity. It binds only to loopback and fails if port 8545 is already occupied.

In a second terminal, from the same root:

```sh
python3 -m http.server 8000 --directory frontend
```

1. Open **http://localhost:8000** in a browser with MetaMask enabled. The in-app preview can display the page, but wallet signing requires an extension-enabled browser.
2. Add the local network in MetaMask: RPC **http://127.0.0.1:8545**, chain ID **31337**, symbol **ETH**. Import the printed local test accounts.
3. Paste the printed LendLoop address into the page, leave expected chain ID at 31337, and connect as lender or borrower. The demo command already registered them. Connect as admin to change access.
4. As borrower, request a quote and rent for one unit. Switch to lender and reconnect to approve. Switch to borrower and reconnect to confirm handover and mark returned. Switch to lender and reconnect to confirm return.
5. Reconnect as each participant, rate the other participant, and withdraw credits. The first on-time rental refunds the 0.5 ETH deposit, pays 0.01 ETH to the lender, and earns the borrower a 10% discount on their next deposit.
6. For a timeout demo, mark returned, wait 120 seconds, then refresh and claim timeout. For a dispute demo, have the lender raise a dispute during that window and the admin resolve it with a deposit share of 0–100%.

You can instead use Anvil and deploy/configure through Remix as described in Phase 6 of the plan. Use the same compiler/source revision as the embedded ABI. If contract interfaces change, replace the embedded ABI with the newly compiled LendLoop ABI; the Phase 6 test checks this match.

## Validation

Run `npm run test:phase6 --prefix tests`, or `npm test --prefix tests` for all phases. Phase 6 uses a DOM harness with the real ethers library and an injected EIP-1193 adapter backed by a fresh in-memory Ganache chain. Actions are driven through the page's forms and buttons, and contract storage and payouts are checked independently.

Verified:

- Embedded ABI matches a zero-warning/error Solidity 0.8.24 compile.
- Missing library, missing wallet, wrong chain, student-only listing, admin-only access, and student registration.
- HTML-like item names remain text; listing, exact quote/payment, approval, handover, return, settlement, two-way role visibility, rating, and both withdrawals. The first flow drains escrow to zero.
- Live `RentalSettled` event receipt; 10% discounted second deposit; disabled early timeout, dispute raising and admin resolution; enabled timeout settlement after the deadline.
- Account/network changes clear stale wallet data and transaction controls.
- Local demo startup independently checked over JSON-RPC: chain 31337, one listing, 60-second unit, and registered lender.
- Existing Phase 2–4 regression suites pass; contracts were not modified.
- HTTP preview returns 200; the page was visually inspected in the in-app browser at a narrow viewport. [Saved interface screenshot](screenshots/phase-6-interface.png).

The automated wallet adapter approves test transactions directly. A manual MetaMask popup-signing rehearsal was not performed, and no public-chain deployment is claimed. Timeout controls use the later of latest block time and the browser clock so idle local chains can expose a ready action; the contract enforces the actual deadline. Refreshes run every ten seconds except while editing table controls or reviewing a quote. Contract reads are sequential for listings and rentals, suitable for this classroom demo rather than a large marketplace. Internet access is needed for the pinned CDN library.
