# LendLoop demo and viva preparation

Prepared 31 October 2026. Use with the [report](report.md), [full manual demo](../LendLoop_Implementation_Plan.md#7-demo-script-remix-vm-8-minutes) and [recorded rehearsals](phase-5-verification.md). This guide prepares the team; it does not certify that anyone has practised.

## Opening explanation (about 45 seconds)

LendLoop lets registered students lend campus items using a smart-contract escrow. The borrower locks rent and a reputation-adjusted deposit. After handover and return, the contract credits rent to the lender and refunds the deposit minus any capped late fee. Cancellation, silent-participant timeouts and admin-resolved disputes cover exceptional cases. Reputation is stored separately and can lower the next deposit after on-time returns. The financial rules are visible, but physical handover and damage still need human confirmation. Our evidence is local: all 21 planned tests and two complete scripted Remix VM rehearsals passed. Public Sepolia deployment is awaiting funded accounts.

## Manual presentation rehearsal

Use a fresh Remix VM for each run, compiler 0.8.24, optimizer off, and timeUnit 60. The exact wei values, account switches and 16 steps are in Section 7 of the plan. Allow 8-10 minutes for human operation; the recorded four-minute scripted runs do not establish a human presentation time. Assign admin #0, lender Riya #1, late borrower Aman #2, on-time borrower Neha #3, outsider #4.

| Checkpoint | Narration and expected evidence |
|---|---|
| Deploy and configure | Reputation first, then LendLoop, then setLendLoop once. Read both references and timeUnit. |
| Register and reject outsider | Only admin registers; outsider listing fails with NotAStudent. |
| List both items | Demonstrate the five-argument and three-argument overloads. |
| Request and handover | Read requiredPayment; show wrong-payment rejection, then exact payment. Lender approves; borrower starts dueAt by confirming handover. |
| Fill the late-return wait | Complete Neha's on-time drafter rental; both parties rate; compare her next quote with Aman's. |
| Late return | After the planned wait, return and confirm; show rounded-up capped fee in RentalSettled. |
| Dispute | Rent with Neha's new quote; mark return, lender disputes before the deadline, admin resolves at 50. |
| Silent lender | Mark another return; early timeout fails. Wait 120 seconds from returnedAt; claimTimeout succeeds. |
| Withdraw and close | Read credits, withdraw every account's credit, reject a duplicate withdrawal, show zero contract balance and user rental array. |
| Reject direct calls | Empty calldata and unknown selector reject through receive/fallback. |

Always reset Remix Value to 0 after requestRental. Quote again after any completion because the borrower's discount can change. Click a transaction and expand decoded logs to explain the event, rental ID and payout values. Do not claim that the displayed wallet balance change equals the payout; gas also affects it.

## Money examples to explain without notes

- Calculator: rent 0.01 ETH, deposit 1 ETH, fee 0.1 ETH/unit, one 60-second unit. A first borrower pays 1.01 ETH. Returning one second late costs 0.1 ETH; 61 seconds late costs 0.2 ETH. The fee is capped at the deposit actually paid.
- After one on-time completion: discount is 10%; a 1 ETH base deposit becomes 0.9 ETH, and the same one-unit quote totals 0.91 ETH. Ratings do not produce that discount.
- Admin split at 50% with rent 0.01 and paid deposit 0.9: lender gets 0.46, borrower gets 0.45. The rent is not divided, and no separate automatic late fee is added.
- For integer deposit 1001 wei and lender share 50%, the lender's deposit share is 500 wei and the borrower gets 501 wei. Integer rounding stays with the borrower.
- If all ordinary rentals are finalized, total pending credits equal their remaining escrow. Each account must withdraw for the demo balance to reach zero.

## Viva questions and short answers

| Question | Answer grounded in this implementation |
|---|---|
| Why blockchain instead of an ordinary payments app? | It makes escrow and settlement rules independently inspectable and executable. An ordinary app can be simpler, but needs a platform or provider to enforce comparable rules. Physical disputes still require trust here. |
| Can the admin take all the money? | There is no arbitrary admin withdrawal. The admin can award 0-100% of a disputed deposit to the lender; rent still goes to the lender. This is a significant trusted power. |
| How is real return verified? | It is not verified independently. Borrower claims return; lender confirms or disputes; silence enables timeout settlement. Physical truth remains an oracle problem. |
| What are the trust assumptions? | Admin registration and dispute judgment, participant physical confirmations, correct deployment wiring, and the chosen chain and wallet. |
| public vs external? | Both are externally callable. A public function also supports ordinary internal calls; the short listItem overload calls the public five-argument version. |
| internal vs private? | Internal functions can be used by derived contracts; private functions are accessible only within the defining contract's code. Neither means confidential on-chain. |
| view vs pure? | view may read state without modifying it; pure does not read or write contract state. LateFee.calculate is pure. |
| Why payable only for requesting? | requestRental receives the exact rent plus deposit. Other actions use already locked funds. receive and fallback reject ordinary unsolicited transfers. |
| require, revert, assert? | require validates conditions; revert can report a custom error such as TooEarly(deadline); assert expresses an internal accounting invariant. All revert state changes on failure. |
| Why pull payments? | Settlement does not call recipients. A rejecting receiver cannot stop the other party receiving credit or withdrawing. |
| What is reentrancy and how is it prevented? | A receiver calls back during an ETH send. withdraw clears credit before the call and the locked modifier rejects another withdrawal. A failed send reverts, restoring credit. |
| Why immutable reputation and timeUnit? | They are set by the constructor and cannot later change. This fixes the deployment's linked service and timing policy. |
| What is constant here? | CONFIRM_WINDOW_UNITS is 2 and DEFAULT_AFTER_UNITS is 3; these are compile-time values rather than constructor choices. |
| What does inheritance demonstrate? | LendLoop inherits Owned. Reputation inherits Owned and implements IReputation. Both override the abstract contractName function. |
| Is IReputation deployed? | No. It is an interface used for typed external calls. Owned is also not deployed because it is abstract. |
| Why is LateFee not separately deployed? | Its function is internal, so its code is included in the caller without deployed-library linking. |
| What data locations are used? | storage references persistent records, memory holds copied structs/strings, and calldata is read-only external input such as the dispute reason. |
| Why events and indexed fields? | Receipts expose state transitions to clients. Indexed IDs/addresses permit filtering. The page listens with contract.on and the runner decodes receipts. |
| Why keep the dispute reason in an event? | It avoids storing the string as contract state while preserving a transaction log. It is still public and needs off-chain retrieval. |
| What is the nested mapping for? | hasRated[rentalId][rater] prevents each participant rating the same rental twice. |
| What does try/catch protect? | Only recordCompletion during normal settlement. A failed reputation update emits ReputationUpdateFailed while monetary credits remain. Quotes and ratings can still fail on reputation calls. |
| What earns deposit discounts? | On-time completion counts: 1 gives 10%, 3 gives 25%, 5 gives 50%. If late returns exceed on-time returns the discount is zero. Star ratings are separate. |
| Does resolving a dispute count as on time? | No completion record is added by resolveDispute. Participants can rate Resolved rentals. Defaults and cancellations permit neither completion records nor ratings. |
| How are late units rounded? | ceil((returnedAt - dueAt) / timeUnit) for a positive difference, then fee capped at paid deposit. On or before dueAt gives zero. |
| When does the rental clock start? | confirmHandover sets dueAt to block.timestamp plus units times timeUnit. Request and approval do not start it. |
| Can confirmation delay increase the late fee? | No. The fee uses stored returnedAt rather than confirmation time. |
| Who can claim a timeout? | Anyone, once the applicable deadline and state are satisfied. The function chooses fixed beneficiaries, not the caller. |
| Does a timeout happen automatically? | No. Someone submits a transaction. A ReturnClaimed rental can settle at returnedAt + 2 units; an Active one can default at dueAt + 3 units. |
| Can a dispute and timeout both win? | Transactions execute sequentially. Disputes require time strictly before the return deadline; timeout opens at that deadline. State checks prevent double settlement. |
| What if the admin never resolves a dispute? | Funds remain locked in Disputed; no forced-resolution deadline exists. This is a known limitation. |
| Can an item be rented twice concurrently? | Request locks availability; the occupancy mapping blocks reopening it during every ongoing state. |
| What if a student is removed mid-rental? | New listings and requests are blocked, but existing participant actions and withdrawals remain available. |
| Does default mean the item is available again? | No. It remains unavailable until its lender explicitly relists it after recovery. |
| Can reputation be faked? | Only the configured writer can update counters, but collusion and new addresses remain possible. Address history is not identity proof. |
| What happens if setLendLoop is wrong? | It is one-time configuration. Deploy a fresh correctly wired instance; there is no writer-reset function. |
| Why msg.sender instead of tx.origin? | Authorization should identify the immediate caller; tx.origin-based authorization can be abused through intermediary contracts. |
| Does zero demo escrow prove no ETH can ever be stuck? | No. The tested rental credits drain to zero. Forced ETH and unresolved disputes are separate limitations. |
| How were tests run? | Pinned solc 0.8.24, ethers 6.13.4 and disposable Ganache chains; page tests use a local EIP-1193 adapter. Two additional real-wait rehearsals ran in Remix VM. |
| Is this deployed on Sepolia? | Not yet. Build artifacts and a small-value local rehearsal exist; funded accounts and public receipt evidence are pending. |
| What is not verified? | Physical truth, real identities, production security, every member's manual operation, manual MetaMask popup signing and public deployment. |

For the 44 source locations, use the [README concept map](../README.md#solidity-lab-concept-map). Each member should point to the actual function and explain why it is used, rather than memorize a definition alone.

## Recovery during a live demonstration

| Symptom | Check and recovery |
|---|---|
| Wrong-payment revert | Read a fresh quote for this borrower, item and units; use wei in Remix Value. |
| NotAStudent / Only lender / Only borrower | Verify selected account, deployment and registration; do not bypass the role. |
| InvalidStatus | Read getRental before acting; a completed rental cannot repeat its prior transition. |
| TooEarly | Read the error deadline and rental timestamps; wait for the actual chain time. Do not claim a successful timeout early. |
| Fee unexpectedly zero or larger | Compare returnedAt and dueAt; show the ceil formula and the deposit cap. |
| Missing discount | Read actual borrower profile; check completion, late-majority rule and whether Reputation was wired correctly. |
| Remix state lost | Start a fresh VM and redeploy in the documented order. Never reuse a once-configured standalone Phase 2 Reputation. |
| Wallet account/network changed | Reconnect to refresh role and contract state. Check expected chain and deployed address. |
| Gas estimation fails | Inspect the revert reason, role, state and exact value before resubmitting. |
| Time runs short | Show the recorded receipts/transcripts and explicitly identify them as earlier scripted evidence. Finish the live escrow cleanup if possible. |

## Individual practice and sign-off

Each member must independently do both rounds: (1) run the manual demo from a fresh VM including the exceptional paths and final withdrawals; (2) explain the accounting examples, five randomly selected concept-map entries and ten random viva questions without notes. Rotate roles so everyone can deploy, borrow, lend and resolve a dispute. Correct errors, then repeat the failed segment. Record actual dates and observations; no signature is implied by this document.

| Member name / roll number | Full manual demo date and outcome | Viva round date and corrections | Self sign-off |
|---|---|---|---|
| Not supplied | Not yet recorded | Not yet recorded | Pending |
| Not supplied | Not yet recorded | Not yet recorded | Pending |
| Not supplied | Not yet recorded | Not yet recorded | Pending |

Adapt the number of rows to the actual team. Before submission, add academic details to the report and regenerate the PDF. Keep the optional Sepolia phase pending until successful public receipts exist.
