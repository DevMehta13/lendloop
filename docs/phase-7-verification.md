# Phase 7 — Sepolia deployment preparation

Started 31 October 2026. **Public deployment is pending:** the user confirmed that no funded Sepolia accounts are available. No public contract addresses, transaction hashes, or successful MetaMask signing are claimed. Phase 7 cannot be marked complete until the public deployment and shortened demo have mined successfully.

## Prepared locally

- `scripts/sepolia.cjs build` compiles the current sources with Solidity 0.8.24, Shanghai EVM, optimizer disabled, and rejects warnings/errors or oversized runtime code. It exports ABI/bytecode plus the full standard JSON input into ignored `build/sepolia/`.
- `scripts/sepolia.cjs preflight` checks the RPC chain ID, 3–4 distinct nonzero public addresses, current fee data, and each account's funding against conservative demo allowances. It is read-only and accepts no signing keys.
- `tests/phase-7.cjs` rehearses the shortened demo on a disposable local chain with a 0.001 ETH deposit, verifies exact settlement, both ratings, the next deposit discount, and withdrawals to zero escrow. It checks wrong-network and invalid-account rejection and insufficient-funding reporting. This does not establish public-chain success.

Validation on 31 October 2026: `npm run sepolia:build --prefix tests` succeeded with zero compiler warnings/errors. `npm test --prefix tests` passed all Phase 2, 3, 4, 6, and 7 suites, including the new shortened rehearsal. Ganache used its JavaScript fallback because native bindings are unavailable for the installed Node version; all suites completed successfully. No live Sepolia RPC funding check was run because account addresses and a configured RPC endpoint were not supplied.

## Fund the accounts

Use three MetaMask accounts: **admin**, **lender**, and **borrower**. A fourth borrower is optional. Each needs Sepolia ETH for gas; the borrower also needs the 0.002 ETH rental payment below. Use dedicated test accounts and keep seed phrases/private keys in the wallet.

Sepolia's chain ID is **11155111**, with explorer **https://sepolia.etherscan.io**. Confirm the wallet network before each signature. See the [Ethereum client-maintained Sepolia configuration](https://github.com/eth-clients/sepolia) for network details and faucet options. The [Google Cloud Sepolia faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) requires sign-in. Faucet availability, eligibility, and allocations can change; a faucet claim may require the account holder to sign in or complete a challenge.

After funding, install the pinned tools and build from the project root:

```sh
npm ci --prefix tests
npm run sepolia:build --prefix tests
```

Optional read-only check, with a Sepolia RPC URL configured in the terminal environment:

```sh
node scripts/sepolia.cjs preflight ADMIN_PUBLIC_ADDRESS LENDER_PUBLIC_ADDRESS BORROWER_PUBLIC_ADDRESS
```

Replace all three address arguments with public `0x…` addresses. Set `SEPOLIA_RPC_URL` to your provider's Sepolia endpoint locally. The readiness check budgets 8 million gas for the admin and 1.5 million for each participant at the current maximum fee, plus 0.002 ETH for each borrower. These are planning allowances, not exact costs or spending limits; review MetaMask's actual estimate for every transaction. Recheck after fee changes. Never use the printed public keys from the local demo on Sepolia.

## Deploy through Remix and MetaMask

1. Open [Remix](https://remix.ethereum.org) in the browser containing MetaMask. Upload the current `contracts/` folder. Set Solidity **0.8.24**, EVM **Shanghai**, and **optimizer off** to match the exported artifacts. Compile `Reputation.sol` and `LendLoop.sol`.
2. In Deploy & Run, choose the browser wallet / **Injected Provider – MetaMask** environment. Check that MetaMask shows **Sepolia**, chain ID **11155111**, and the funded admin account. [Remix's deployment documentation](https://github.com/remix-project-org/remix-ide/blob/master/docs/create_deploy.md) describes the browser wallet environment.
3. With **Value = 0**, deploy `Reputation`. Save its address and successful deployment transaction link.
4. Deploy `LendLoop` with `_reputation =` that address and `_timeUnit = 60`. Save its address and successful deployment transaction link.
5. On `Reputation`, call `setLendLoop` with the new LendLoop address. This setting is permanent for that Reputation instance. Confirm `lendLoop()` matches; on LendLoop, confirm `reputation()` points back and `timeUnit()` is 60.
6. As admin, call `registerStudent` for the lender and borrower (and fourth account if used). Confirm `isStudent` for each.

Wait for a successful receipt after every transaction before continuing. Do not redeploy if a transaction is simply pending; check its receipt first.

## Shortened public demo

Use Remix for all steps, or serve `frontend/` locally and enter the deployed LendLoop address and expected chain **11155111**. Reconnect the page after every wallet account switch.

1. **Lender:** call the five-argument `listItem` with name `Sepolia calculator`, rent per unit **100000000000000** (0.0001 ETH), deposit **1000000000000000** (0.001 ETH), late fee per unit **100000000000000** (0.0001 ETH), max units **10**. Record the item ID from `ItemListed`.
2. **Borrower:** call `requiredPayment(itemId, 10, borrowerAddress)`. For a fresh borrower, total is **2000000000000000 wei = 0.002 ETH** (0.001 rent + 0.001 deposit). Call `requestRental(itemId, 10)` with **Value equal to the returned total**, in wei. Record the rental ID from `RentalRequested`. Reset Remix's Value to **0** afterward.
3. **Lender:** `approveRental(rentalId)`.
4. **Borrower:** `confirmHandover(rentalId)`, then `markReturned(rentalId)` before `dueAt`. Ten 60-second units give ten minutes to return, allowing for public block inclusion and wallet switching.
5. **Lender:** `confirmReturn(rentalId)`. Verify status **4 (Completed)**. For an on-time first rental, `pendingBalance(lender)` is **0.001 ETH**, and `pendingBalance(borrower)` is **0.001 ETH**. If the return was mined late, check the actual capped late fee instead.
6. **Each participant:** `rateUser(rentalId, 5)`. For an on-time first rental, `discountPercent(borrower)` is **10**, and the next ten-unit quote has deposit **0.0009 ETH**, total **0.0019 ETH**.
7. **Each participant:** `withdraw()`. Check both pending balances and `contractBalance()` are zero. Wallet balance changes include gas, so use the contract's accounting and receipt events to verify payouts.

## Evidence required to finish

Save successful receipt links from Sepolia Etherscan for both deployments, `setLendLoop`, registrations, listing, request, approval, handover, return, settlement, ratings, and withdrawals. Include screenshots of the settled rental, reputation discount, and final zero escrow. Check receipt status and emitted IDs/addresses; copying a hash alone does not prove success.

Then add the two real contract address links and key demo transaction links to the README, record the observed outcomes here, and mark the Phase 7 deployment checklist complete. No placeholder addresses should be presented as deployed contracts.
