# LendLoop — Implementation Plan
**Peer-to-peer campus item lending with on-chain deposits**
Blockchain Technology Lab — Final Project

---

## 0. Read this first

**What we are building:** Students lend items to each other (calculators, drafters, cameras, cycles). The borrower's rent + deposit is locked in a smart contract, not given to the lender. When the item comes back, the contract automatically pays the rent (plus any late fee) to the lender and refunds the rest of the deposit to the borrower. Good borrowers earn reputation, which lowers their deposit next time.

**Ground rules for this project (keep it simple):**
- 3 main contract files (+ 2 tiny helper files). No NFTs, no IPFS, no tokens, no jury, no backend, no database.
- The **demo runs entirely in Remix IDE** in the browser. No website is required.
- A one-page HTML site is **optional** (Phase 6), only if the examiner wants a UI.
- Every Solidity concept from the lab instructions must be visible in the code and tagged with a `// [LAB] ...` comment.

**Final deliverables**
1. Solidity source files (`contracts/` folder)
2. Live demo in Remix (script in Section 7)
3. `README.md` with the concept map (Section 5) and screenshots
4. Short project report (outline in Section 9)
5. *(Optional)* `frontend/index.html`

**Estimated effort:** 4–6 working days for one person; 2–3 days if split across a team.

---

## 1. How the system works

### Roles
| Role | Who | What they can do |
|---|---|---|
| Admin | Account that deploys the contract (faculty / class rep) | Register students, resolve disputes. **Never holds anyone's money.** |
| Lender | Any registered student | List items, approve rentals, confirm returns, raise disputes |
| Borrower | Any registered student | Rent items, confirm handover, mark returned |
| Anyone | Any address | Trigger a timeout once a deadline has passed |

### When money moves (example: rent 0.01 ETH/day × 1 day, deposit 1 ETH)
| Step | Function | Money |
|---|---|---|
| Borrower requests | `requestRental()` | Borrower sends **1.01 ETH → contract** (locked) |
| Lender approves | `approveRental()` | nothing moves |
| Borrower receives item | `confirmHandover()` | nothing moves; due-date clock starts |
| Borrower returns item | `markReturned()` | nothing moves; return time recorded |
| Lender confirms | `confirmReturn()` | contract credits lender rent + late fee, borrower deposit − late fee |
| Each person | `withdraw()` | ETH actually leaves the contract to their wallet |

### Rental states (enum `Status`)
```
                 rejectRental / cancelRental
   ┌───────────────────────────────────────────────┐
   │                                               ▼
Requested(0) ──approve──▶ Approved(1) ──handover──▶ Active(2) ──markReturned──▶ ReturnClaimed(3)
                              │                        │                          │
                         cancelRental            claimTimeout after            ├─ confirmReturn ─────────▶ Completed(4)
                              ▼                  due + 3 units                  ├─ claimTimeout (lender    ▶ Completed(4)
                         Cancelled(7)                  ▼                        │   silent 2 units)
                                                 Defaulted(8)                   └─ raiseDispute ─▶ Disputed(5) ─resolveDispute─▶ Resolved(6)
```
Remix shows enums as numbers, so keep this table handy during the demo:

| 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Requested | Approved | Active | ReturnClaimed | Completed | Disputed | Resolved | Cancelled | Defaulted |

### The "time unit" trick
The constructor takes `_timeUnit` (seconds per "day").
- Demo: deploy with **`60`** → 1 rental day = 1 minute, so late fees and timeouts happen within minutes.
- Real use: deploy with **`86400`** → 1 day = 1 day.

---

## 2. Setup on a MacBook

### 2.1 Required (core demo) — ~15 minutes
| # | What | How |
|---|---|---|
| 1 | **Google Chrome or Brave** | Install from the official site. Remix works best in Chrome/Brave; avoid Safari. |
| 2 | **Remix IDE** | Nothing to install. Open https://remix.ethereum.org |
| 3 | **Git + GitHub repo** | Open Terminal and run `git --version`. If macOS asks to install Command Line Tools, click Install (or run `xcode-select --install`). Create a GitHub repo `lendloop`. |
| 4 | **VS Code** (optional but recommended) | Install from code.visualstudio.com. Add the extension **"Solidity" by Nomic Foundation** for syntax highlighting. |

> **Important:** Remix stores files in the browser's local storage. Clearing browser data deletes them. Always keep the real copy in your Git repo.

**Getting code into Remix (pick one):**
- **Simple:** In Remix's File Explorer, click the **"Upload folder"** icon and select your `contracts/` folder. Re-upload after editing in VS Code.
- **Or:** Write directly in Remix and copy the final files back into the repo before committing.
- **Or (live sync, optional):** install Node (below), then
  ```bash
  npm install -g @remix-project/remixd
  cd ~/path/to/lendloop
  remixd -s . --remix-ide https://remix.ethereum.org
  ```
  In Remix, choose **"Connect to localhost"** in the workspace dropdown. Edits in VS Code now appear in Remix.

### 2.2 Only for the optional HTML page (Phase 6)
```bash
# 1. Homebrew (skip if `brew --version` already works)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
#    Apple Silicon: follow the "Next steps" Homebrew prints to add it to your PATH.

# 2. Node.js (for remixd and general tooling)
brew install node
node -v   # should print v20+ 

# 3. Foundry (gives us `anvil`, a local blockchain)
curl -L https://foundry.paradigm.xyz | bash
source ~/.zshenv        # or open a new Terminal window
foundryup
anvil --version
```
- **MetaMask:** install the MetaMask extension in Chrome/Brave and create a wallet. This wallet is for test networks only — never put real money in it.
- **Serving the page:** MetaMask does not work on `file://` pages. Serve the folder with:
  ```bash
  cd ~/path/to/lendloop/frontend
  python3 -m http.server 8000
  ```
  Then open http://localhost:8000. (Alternative: VS Code extension "Live Server".)

### 2.3 Only for optional Sepolia deployment (Phase 7)
- MetaMask → enable **"Show test networks"** → select **Sepolia**.
- Get free Sepolia test ETH from a faucet (e.g. Google Cloud Web3 faucet). Faucets change often and some need a login; search "Sepolia faucet" if one doesn't work. You need ETH in 3–4 accounts, so start this early.

---

## 3. Project structure

```
lendloop/
├── contracts/
│   ├── Owned.sol          # abstract base contract (ownership)
│   ├── IReputation.sol    # interface
│   ├── LateFee.sol        # library (pure maths)
│   ├── Reputation.sol     # contract 2: reputation + ratings
│   └── LendLoop.sol       # contract 1: main escrow
├── frontend/              # optional (Phase 6)
│   └── index.html
├── docs/
│   └── screenshots/
├── README.md              # concept map + how to run
└── report.pdf
```
Compiler: Solidity **0.8.24 or newer** (`pragma solidity ^0.8.24;`). No external imports (no OpenZeppelin), so everything compiles in Remix with zero setup.

---

## 4. Contract design

### 4.1 `Owned.sol` — abstract base contract (complete code)
Shows: abstract contract, constructor, modifier, event, `public virtual`, `internal`, `pure`, unimplemented function.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// [LAB] Abstract contract: cannot be deployed on its own, only inherited
abstract contract Owned {
    address public owner;                                  // [LAB] public state variable -> auto getter

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner); // [LAB] event

    constructor() {                                        // [LAB] constructor
        owner = msg.sender;                                // [LAB] global variable msg.sender
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {                                 // [LAB] modifier
        require(msg.sender == owner, "Owned: caller is not the owner");
        _;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner { // [LAB] public + virtual
        require(newOwner != address(0), "Owned: zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal {               // [LAB] internal
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// [LAB] Unimplemented virtual function -> child contracts must override it
    function contractName() public pure virtual returns (string memory);
}
```

### 4.2 `IReputation.sol` — interface (complete code)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// [LAB] Interface: LendLoop talks to Reputation only through this
interface IReputation {
    function recordCompletion(address borrower, address lender, bool wasLate) external;
    function recordRating(uint256 rentalId, address rater, address ratee, uint8 stars) external;
    function discountPercent(address user) external view returns (uint256);
}
```

### 4.3 `LateFee.sol` — library (complete code)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// [LAB] Library with an internal pure function (inlined at compile time,
///       so it does not need to be deployed or linked separately)
library LateFee {
    function calculate(
        uint256 dueAt,
        uint256 returnedAt,
        uint256 timeUnit,
        uint256 feePerUnit,
        uint256 cap
    ) internal pure returns (uint256 fee, uint256 unitsLate) {
        if (returnedAt <= dueAt) return (0, 0);
        unitsLate = (returnedAt - dueAt + timeUnit - 1) / timeUnit; // round up: 1 second late = 1 unit
        fee = unitsLate * feePerUnit;
        if (fee > cap) fee = cap;                                    // never more than the deposit
    }
}
```

### 4.4 `Reputation.sol` — contract 2 (spec)
`contract Reputation is Owned, IReputation` — **[LAB] multiple inheritance (contract + interface)**

**State**
```solidity
struct Profile {                 // [LAB] struct
    uint32 onTimeReturns;
    uint32 lateReturns;
    uint32 lendsCompleted;
    uint32 ratingSum;
    uint32 ratingCount;
}
address public lendLoop;                                     // only this contract may write
mapping(address => Profile) private profiles;                // [LAB] mapping (private)
mapping(uint256 => mapping(address => bool)) public hasRated; // [LAB] nested mapping
```

**Events:** `LendLoopSet(address lendLoop)`, `CompletionRecorded(address indexed borrower, address indexed lender, bool wasLate)`, `RatingRecorded(uint256 indexed rentalId, address indexed ratee, uint8 stars)`

**Modifier:** `onlyLendLoop` → `require(msg.sender == lendLoop, ...)`

**Functions**
| Function | Visibility / mutability | Logic |
|---|---|---|
| `setLendLoop(address _lendLoop)` | external, `onlyOwner` | Set once after LendLoop is deployed |
| `recordCompletion(borrower, lender, wasLate)` | external, `onlyLendLoop` | `wasLate ? lateReturns++ : onTimeReturns++` for borrower; `lendsCompleted++` for lender |
| `recordRating(rentalId, rater, ratee, stars)` | external, `onlyLendLoop` | `require(!hasRated[rentalId][rater])`, `require(stars 1..5)`; add to ratingSum/ratingCount |
| `discountPercent(address user)` | external **view** | onTime ≥ 5 → 50, ≥ 3 → 25, ≥ 1 → 10, else 0. **Return 0 if lateReturns > onTimeReturns.** |
| `getProfile(address user)` | external **view**, returns `Profile memory` | [LAB] returning a struct |
| `averageRating(address user)` | external **view** | `ratingSum * 100 / ratingCount` (e.g. 450 = 4.50 stars); 0 if no ratings |
| `contractName()` | public **pure override** | returns `"Reputation"` — [LAB] override |

### 4.5 `LendLoop.sol` — contract 1, the main escrow (spec)
`contract LendLoop is Owned`

**Types**
```solidity
enum Status { Requested, Approved, Active, ReturnClaimed, Completed, Disputed, Resolved, Cancelled, Defaulted } // [LAB] enum

struct Item {
    uint256 id;
    address lender;
    string  name;
    uint256 rentPerUnit;     // wei per time unit ("per day")
    uint256 deposit;         // wei
    uint256 lateFeePerUnit;  // wei per late time unit
    uint256 maxUnits;        // max rental length
    bool    available;
}

struct Rental {
    uint256 id;
    uint256 itemId;
    address lender;
    address borrower;
    uint256 rent;            // total rent paid
    uint256 deposit;         // deposit actually paid (after discount)
    uint256 units;
    uint256 dueAt;
    uint256 returnedAt;
    Status  status;
}
```

**State variables**
```solidity
uint256 public constant CONFIRM_WINDOW_UNITS = 2;   // [LAB] constant: lender must confirm/dispute within 2 units
uint256 public constant DEFAULT_AFTER_UNITS  = 3;   // not returned 3 units after due -> default
IReputation public immutable reputation;            // [LAB] immutable (set in constructor)
uint256 public immutable timeUnit;                  // [LAB] immutable

uint256 public itemCount;
uint256 public rentalCount;
mapping(uint256 => Item)    public items;
mapping(uint256 => Rental)  public rentals;
mapping(address => bool)    public isStudent;
mapping(address => uint256[]) private userRentals;  // [LAB] array inside mapping
mapping(address => uint256) private pendingWithdrawals;
bool private locked;                                // for our own nonReentrant modifier
```

**Custom errors** — [LAB] custom errors + `revert`
```solidity
error NotAStudent(address account);
error InvalidStatus(uint256 rentalId, Status expected, Status actual);
error TooEarly(uint256 availableAt);
```

**Events** — [LAB] events with `indexed` params, emitted in every state-changing function
```
StudentRegistered(address indexed student)
StudentRemoved(address indexed student)
ItemListed(uint256 indexed itemId, address indexed lender, string name, uint256 rentPerUnit, uint256 deposit)
RentalRequested(uint256 indexed rentalId, uint256 indexed itemId, address indexed borrower, uint256 amountLocked)
RentalApproved(uint256 indexed rentalId)
RentalCancelled(uint256 indexed rentalId, address cancelledBy)
HandoverConfirmed(uint256 indexed rentalId, uint256 dueAt)
ReturnMarked(uint256 indexed rentalId, uint256 returnedAt)
RentalSettled(uint256 indexed rentalId, uint256 toLender, uint256 toBorrower, uint256 lateFee)
DisputeRaised(uint256 indexed rentalId, string reason)        // reason only in the event, not stored (saves gas)
DisputeResolved(uint256 indexed rentalId, uint256 toLender, uint256 toBorrower)
RentalDefaulted(uint256 indexed rentalId)
UserRated(uint256 indexed rentalId, address indexed rater, address indexed ratee, uint8 stars)
Withdrawn(address indexed user, uint256 amount)
ReputationUpdateFailed(uint256 indexed rentalId)
```

**Modifiers** — [LAB] modifiers, including ones with parameters
| Modifier | Check |
|---|---|
| `onlyOwner` | inherited from `Owned` |
| `onlyStudent` | `if (!isStudent[msg.sender]) revert NotAStudent(msg.sender);` |
| `onlyLender(uint256 id)` | `msg.sender == rentals[id].lender` |
| `onlyBorrower(uint256 id)` | `msg.sender == rentals[id].borrower` |
| `inStatus(uint256 id, Status s)` | `if (rentals[id].status != s) revert InvalidStatus(id, s, rentals[id].status);` |
| `nonReentrant` | `require(!locked); locked = true; _; locked = false;` |

**Constructor**
```solidity
constructor(address _reputation, uint256 _timeUnit) {   // [LAB] constructor with parameters
    require(_reputation != address(0), "Reputation address required");
    require(_timeUnit > 0, "Time unit must be > 0");
    reputation = IReputation(_reputation);              // [LAB] interface type
    timeUnit = _timeUnit;
}
```
(`Owned`'s constructor runs first automatically and sets `owner`.)

**Functions**

| # | Function | Visibility / mutability / modifiers | Logic |
|---|---|---|---|
| 1 | `registerStudent(address s)` | external, `onlyOwner` | `isStudent[s] = true`; emit |
| 2 | `removeStudent(address s)` | external, `onlyOwner` | `isStudent[s] = false`; emit |
| 3 | `listItem(string memory name, uint256 rentPerUnit, uint256 deposit, uint256 lateFeePerUnit, uint256 maxUnits) returns (uint256)` | **public**, `onlyStudent` | Validate (deposit > 0, maxUnits > 0); `itemCount++`; store `Item` with `available = true`; emit `ItemListed`. *`public` (not `external`) because the overload below calls it internally.* |
| 4 | `listItem(string calldata name, uint256 rentPerUnit, uint256 deposit) returns (uint256)` | external, `onlyStudent` | **[LAB] function overloading**: calls #3 with `lateFeePerUnit = deposit / 10`, `maxUnits = 7` |
| 5 | `setItemAvailability(uint256 itemId, bool available)` | external | Only the item's lender; can't make available while rented (keep simple: lender only toggles when no active rental) |
| 6 | `requiredPayment(uint256 itemId, uint256 units, address borrower) returns (uint256 rent, uint256 deposit, uint256 total)` | **public view** | `rent = rentPerUnit * units`; `deposit = _discountedDeposit(item.deposit, borrower)`; `total = rent + deposit`. Used by the demo to get the exact wei value to send. |
| 7 | `requestRental(uint256 itemId, uint256 units) returns (uint256)` | external **payable**, `onlyStudent` | `require(item.available)`, `require(msg.sender != item.lender)`, `require(units > 0 && units <= maxUnits)`; `(rent, dep, total) = requiredPayment(...)`; `require(msg.value == total, "Send exact rent + deposit")`; mark item unavailable; create `Rental` (status Requested); push id to both users' `userRentals`; emit |
| 8 | `approveRental(uint256 id)` | external, `onlyLender(id)`, `inStatus(id, Requested)` | status → Approved; emit |
| 9 | `rejectRental(uint256 id)` | external, `onlyLender(id)`, `inStatus(id, Requested)` | status → Cancelled; credit full amount back to borrower; item available; emit `RentalCancelled` |
| 10 | `cancelRental(uint256 id)` | external, `onlyBorrower(id)` | Allowed only if status is Requested or Approved (item not handed over yet). Same refund as #9. |
| 11 | `confirmHandover(uint256 id)` | external, `onlyBorrower(id)`, `inStatus(id, Approved)` | status → Active; `dueAt = block.timestamp + units * timeUnit` ([LAB] `block.timestamp`); emit |
| 12 | `markReturned(uint256 id)` | external, `onlyBorrower(id)`, `inStatus(id, Active)` | status → ReturnClaimed; `returnedAt = block.timestamp`; emit |
| 13 | `confirmReturn(uint256 id)` | external, `onlyLender(id)`, `inStatus(id, ReturnClaimed)` | `_settle(id)` |
| 14 | `raiseDispute(uint256 id, string calldata reason)` | external, `onlyLender(id)`, `inStatus(id, ReturnClaimed)` | Must be within the confirm window; status → Disputed; emit with reason ([LAB] `calldata`) |
| 15 | `resolveDispute(uint256 id, uint256 lenderSharePercent)` | external, `onlyOwner`, `inStatus(id, Disputed)` | `require(pct <= 100)`; `toLender = rent + deposit * pct / 100`; `toBorrower = deposit - deposit * pct / 100`; credit both; status → Resolved; item available; emit |
| 16 | `claimTimeout(uint256 id)` | external (anyone) | **Case A:** ReturnClaimed and `now >= returnedAt + CONFIRM_WINDOW_UNITS * timeUnit` → `_settle(id)` (lender stayed silent). **Case B:** Active and `now >= dueAt + DEFAULT_AFTER_UNITS * timeUnit` → lender gets rent + full deposit, status → Defaulted, item stays unavailable, emit. **Else:** `revert TooEarly(...)`. |
| 17 | `rateUser(uint256 id, uint8 stars)` | external | Status must be Completed or Resolved; caller must be lender or borrower; ratee = the other party; call `reputation.recordRating(...)`; emit |
| 18 | `withdraw()` | external, `nonReentrant` | Pull payment — see code below |
| 19 | `pendingBalance(address user)` | external **view** | `return pendingWithdrawals[user];` |
| 20 | `getUserRentals(address user)` | external **view** returns `uint256[] memory` | [LAB] returning a dynamic array |
| 21 | `getItem(uint256 itemId)` / `getRental(uint256 id)` | external **view** returns struct `memory` | Convenience getters |
| 22 | `contractBalance()` | external **view** | `return address(this).balance;` |
| 23 | `contractName()` | public **pure override** | returns `"LendLoop"` |
| 24 | `_settle(uint256 id)` | **internal** | see code below |
| 25 | `_discountedDeposit(uint256 deposit, address borrower)` | **private view** | `pct = reputation.discountPercent(borrower)`; `return deposit - deposit * pct / 100;` |
| 26 | `_credit(address to, uint256 amount)` | **private** | `pendingWithdrawals[to] += amount;` |
| 27 | `receive()` | external **payable** | `revert("Use requestRental");` |
| 28 | `fallback()` | external **payable** | `revert("Function does not exist");` |

**Key code — settlement and withdrawal**
```solidity
function _settle(uint256 id) internal {                       // [LAB] internal function
    Rental storage r = rentals[id];                           // [LAB] storage reference (edits the real record)

    (uint256 fee, ) = LateFee.calculate(r.dueAt, r.returnedAt, timeUnit,
                                        items[r.itemId].lateFeePerUnit, r.deposit); // [LAB] library call

    uint256 toLender   = r.rent + fee;
    uint256 toBorrower = r.deposit - fee;
    assert(toLender + toBorrower == r.rent + r.deposit);      // [LAB] assert: money is never created or lost

    r.status = Status.Completed;
    items[r.itemId].available = true;
    _credit(r.lender, toLender);
    _credit(r.borrower, toBorrower);

    // [LAB] try/catch on an external call: a reputation failure must never block payouts
    try reputation.recordCompletion(r.borrower, r.lender, r.returnedAt > r.dueAt) {
    } catch {
        emit ReputationUpdateFailed(id);
    }

    emit RentalSettled(id, toLender, toBorrower, fee);        // [LAB] emitting an event
}

function withdraw() external nonReentrant {                   // [LAB] pull-payment pattern
    uint256 amount = pendingWithdrawals[msg.sender];
    require(amount > 0, "Nothing to withdraw");
    pendingWithdrawals[msg.sender] = 0;                        // update state BEFORE sending (checks-effects-interactions)
    (bool ok, ) = payable(msg.sender).call{value: amount}(""); // [LAB] sending ETH to a payable address
    require(ok, "Transfer failed");
    emit Withdrawn(msg.sender, amount);
}
```

**Size check:** LendLoop ≈ 250–300 lines with comments, Reputation ≈ 80, helpers ≈ 60. If a file grows much beyond that, something is being over-built.

---

## 5. Concept map (put this in the README)

After the code is written, fill in the **Line** column so you can jump straight to each one in the viva.

| # | Lab concept | Where | Line |
|---|---|---|---|
| 1 | Smart contract | `LendLoop`, `Reputation` | |
| 2 | Abstract contract | `Owned` | |
| 3 | Constructor (no params) | `Owned` | |
| 4 | Constructor (with params) | `LendLoop(address, uint256)` | |
| 5 | State variables | `itemCount`, `rentalCount`, `owner` | |
| 6 | `constant` | `CONFIRM_WINDOW_UNITS`, `DEFAULT_AFTER_UNITS` | |
| 7 | `immutable` | `reputation`, `timeUnit` | |
| 8 | **public** function | `listItem` (5-arg), `requiredPayment`, `transferOwnership` | |
| 9 | **external** function | `requestRental`, `withdraw`, `approveRental`, … | |
| 10 | **internal** function | `_settle`, `_transferOwnership` | |
| 11 | **private** function | `_discountedDeposit`, `_credit` | |
| 12 | public state variable (auto getter) | `owner`, `items`, `rentals`, `isStudent` | |
| 13 | private state variable | `pendingWithdrawals`, `locked`, `profiles` | |
| 14 | `view` function | `pendingBalance`, `getItem`, `discountPercent` | |
| 15 | `pure` function | `LateFee.calculate`, `contractName` | |
| 16 | `payable` function | `requestRental` | |
| 17 | `receive()` | `LendLoop` | |
| 18 | `fallback()` | `LendLoop` | |
| 19 | Modifier | `onlyOwner`, `onlyStudent`, `nonReentrant` | |
| 20 | Modifier with parameters | `inStatus(id, status)`, `onlyLender(id)` | |
| 21 | Event declaration | all events in `LendLoop` | |
| 22 | `indexed` event params | `RentalRequested` | |
| 23 | Emitting events | every state-changing function | |
| 24 | Listening to events | Remix logs / `contract.on(...)` in index.html | |
| 25 | `struct` | `Item`, `Rental`, `Profile` | |
| 26 | `enum` | `Status` | |
| 27 | `mapping` | `items`, `rentals`, `isStudent` | |
| 28 | Nested mapping | `hasRated[rentalId][addr]` | |
| 29 | Arrays | `userRentals` → `uint256[]` | |
| 30 | `require` | input checks everywhere | |
| 31 | Custom error + `revert` | `NotAStudent`, `InvalidStatus`, `TooEarly` | |
| 32 | `assert` | `_settle` | |
| 33 | Inheritance | `LendLoop is Owned` | |
| 34 | Multiple inheritance | `Reputation is Owned, IReputation` | |
| 35 | `virtual` / `override` | `contractName()`, `transferOwnership` | |
| 36 | Interface | `IReputation` | |
| 37 | Library | `LateFee` | |
| 38 | Contract-to-contract call | `LendLoop` → `Reputation` | |
| 39 | `try` / `catch` | `_settle` | |
| 40 | Function overloading | two `listItem` versions | |
| 41 | Data locations | `storage` in `_settle`, `memory` returns, `calldata` reason | |
| 42 | Global variables | `msg.sender`, `msg.value`, `block.timestamp`, `address(this).balance` | |
| 43 | Sending ETH | `call{value: ...}` in `withdraw` | |
| 44 | Reentrancy protection | `nonReentrant` + checks-effects-interactions | |

---

## 6. Phase-wise plan

### Phase 0 — Setup (½ day)
- [ ] Install Chrome/Brave, open Remix, (optional) VS Code + Solidity extension
- [ ] Create GitHub repo `lendloop` with the folder structure from Section 3
- [ ] In Remix: Solidity Compiler tab → compiler **0.8.24+**, tick **Auto compile**
- [ ] Quick warm-up: deploy Remix's default `Storage.sol` in **Remix VM**, call `store` and `retrieve`, look at the transaction log. (Ensures everyone knows where Deploy, accounts, value field and logs are.)

**Done when:** every team member can deploy a contract in Remix VM and read an event in the logs.

### Phase 1 — Helper files (½ day)
- [x] Write `Owned.sol`, `IReputation.sol`, `LateFee.sol` (code in Section 4 is complete)
- [x] Compile all three with zero errors
- [x] Sanity test for `LateFee`: checked with a temporary pure wrapper on a local test blockchain

**Done when:** all three compile.

**Completed 31 October 2026:** Solidity 0.8.24 compiled all three helpers and a temporary verification contract with no errors or warnings. Ownership initialization, transfer events, access restrictions, and nine late-fee scenarios passed. See `docs/phase-1-verification.md` for results.

### Phase 2 — Reputation contract (½ day)
- [x] Implement `Reputation.sol` per Section 4.4
- [x] Deploy in Remix VM; call `setLendLoop` with any of your own account addresses (temporary, to test)
- [x] From that account call `recordCompletion` and `recordRating`; check `getProfile`, `averageRating`, `discountPercent`
- [x] From a different account call `recordCompletion` → must revert (`onlyLendLoop`)

**Done when:** discount tiers return 0 / 10 / 25 / 50 correctly.

**Completed 31 October 2026:** Solidity 0.8.24 compiled all four contracts with no errors or warnings. Automated local-chain checks and a Remix VM deployment verified completion records, ratings, averages, all discount tiers, late-return penalties, and unauthorized-write rejection. The automated suite also covered configuration, ownership transfer, duplicate ratings, and events. See `docs/phase-2-verification.md` and `tests/phase-2.cjs`. Deploy a fresh Reputation instance for Phase 3 because the temporary writer configuration is permanent.

### Phase 3 — LendLoop core flow (1–1½ days)
Build in this order, compiling after each step:
- [x] Types, state variables, errors, events, modifiers, constructor
- [x] `registerStudent`, `removeStudent`
- [x] Both `listItem` versions, `getItem`
- [x] `requiredPayment`, `_discountedDeposit`
- [x] `requestRental` (payable), `approveRental`, `confirmHandover`, `markReturned`
- [x] `_settle`, `_credit`, `confirmReturn`
- [x] `withdraw`, `pendingBalance`, `contractBalance`

Deploy order in Remix VM: **Reputation → LendLoop(reputationAddress, 60) → Reputation.setLendLoop(lendLoopAddress)**.

**Done when:** one full rental (request → approve → handover → return → confirm → both withdraw) works, and the late fee is deducted when returned late.

**Completed 31 October 2026:** `contracts/LendLoop.sol` implements the core rental escrow. Solidity 0.8.24 compiles all five contracts without errors or warnings. Local-chain tests cover complete on-time and late rentals, rounded/capped fees, real reputation discounts, exact withdrawals, failed reputation updates, failed receivers, and reentrancy protection. Phase 2 regression checks also pass. See `docs/phase-3-verification.md` and `tests/phase-3.cjs`. `contractName()` was implemented early to make the inherited abstract contract deployable. Lateness is recorded from return/due timestamps, including zero-fee late returns.

### Phase 4 — Edge cases and remaining features (1 day)
- [ ] `rejectRental`, `cancelRental` (refunds)
- [ ] `claimTimeout` — both cases (lender silent / borrower never returns)
- [ ] `raiseDispute`, `resolveDispute`
- [ ] `rateUser` (calls Reputation)
- [ ] `getUserRentals`, `getRental`, `setItemAvailability`
- [ ] `receive`, `fallback` handlers
- [x] `contractName` override (implemented in Phase 3 for deployment)
- [ ] Add `// [LAB] ...` comments for every concept in Section 5

**Done when:** every row of the test table in Section 8 passes.

### Phase 5 — Demo rehearsal (½ day)
- [ ] Run the full demo script (Section 7) from a fresh Remix VM at least twice
- [ ] Take screenshots of each step for the report (`docs/screenshots/`)
- [ ] Fill in line numbers in the concept map
- [ ] Commit everything to GitHub

**Done when:** the full demo runs in under 10 minutes without errors.

### Phase 6 — *(Optional)* One-page HTML site (½–1 day)
Only do this if the examiner wants a UI. No React, no build tools — one `index.html` file.

**Local chain setup (because MetaMask cannot connect to Remix VM):**
1. Terminal: `anvil` → it prints 10 test accounts with private keys and runs at `http://127.0.0.1:8545` (chain ID `31337`). Keep the window open.
2. MetaMask → Add network manually: Name `Anvil`, RPC `http://127.0.0.1:8545`, Chain ID `31337`, Symbol `ETH`.
3. MetaMask → Import account → paste private keys of anvil accounts 0–3 (these are public test keys; never use them on a real network).
4. Remix → Deploy tab → Environment **"Dev - Foundry Provider"** (or "Custom - External Http Provider") → `http://127.0.0.1:8545` → deploy Reputation, LendLoop, call `setLendLoop` exactly as before.
5. Remix → Compiler tab → copy the **ABI** of LendLoop; copy the deployed **address**.

**Page contents (single column, plain HTML + a little CSS):**
- "Connect wallet" button + shows connected address and whether it's admin / student
- **List an item** form (name, rent, deposit, late fee, max days)
- **Items** table with a "Rent" button (calls `requiredPayment`, then `requestRental` with that value)
- **My rentals** table with the right action button for the current status (Approve / Confirm handover / Mark returned / Confirm return / Claim timeout)
- **Balance** + "Withdraw" button
- **Live event log** at the bottom (`contract.on("RentalSettled", ...)` etc.) — this is the "event listening" proof

Load ethers from a CDN, no install needed:
```html
<script src="https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js"></script>
```
Minimal pattern:
```js
const provider = new ethers.BrowserProvider(window.ethereum);
await provider.send("eth_requestAccounts", []);
const signer = await provider.getSigner();
const lendLoop = new ethers.Contract(LENDLOOP_ADDRESS, LENDLOOP_ABI, signer);

// payable call
const [, , total] = await lendLoop.requiredPayment(itemId, units, await signer.getAddress());
await (await lendLoop.requestRental(itemId, units, { value: total })).wait();

// overloaded function must be called by its full signature in ethers
await lendLoop["listItem(string,uint256,uint256)"](name, rent, deposit);

// event listening
lendLoop.on("RentalSettled", (id, toLender, toBorrower, lateFee) => {
  log(`Rental #${id} settled: lender ${ethers.formatEther(toLender)} ETH, borrower ${ethers.formatEther(toBorrower)} ETH`);
});
```
Serve it with `python3 -m http.server 8000` and open http://localhost:8000.

### Phase 7 — *(Optional)* Sepolia deployment (½ day)
Only if you want real transaction links on Etherscan.
- [ ] Fund 3–4 MetaMask accounts with Sepolia ETH (Section 2.3)
- [ ] Remix → Environment **"Injected Provider - MetaMask"** (MetaMask on Sepolia)
- [ ] Deploy Reputation → LendLoop (use `_timeUnit = 60`) → `setLendLoop`
- [ ] Use **small amounts** (e.g. deposit 0.001 ETH) because faucet ETH is limited
- [ ] Run a shortened demo; save the Sepolia Etherscan links in the README

### Phase 8 — Report and viva prep (½–1 day)
- [ ] Write the report (Section 9)
- [ ] Finalise README: project summary, how to run, concept map, screenshots
- [ ] Every team member practises the demo and the viva questions (Section 10)

---

## 7. Demo script (Remix VM, ~8 minutes)

### Wei cheat-sheet (Remix function inputs are in wei)
| ETH | Wei |
|---|---|
| 0.005 | `5000000000000000` |
| 0.01 | `10000000000000000` |
| 0.1 | `100000000000000000` |
| 0.5 | `500000000000000000` |
| 1 | `1000000000000000000` |

**Tip for the payable call:** call `requiredPayment(...)` first, copy the `total` it returns, paste it into the **Value** field above the Deploy button with the unit set to **Wei**, then call `requestRental`.

### Cast (Remix VM accounts dropdown)
| Account | Role |
|---|---|
| #0 | Admin (deploys) |
| #1 | Riya — lender |
| #2 | Aman — borrower (will be late) |
| #3 | Neha — borrower (on time, earns discount) |
| #4 | Outsider (not a student) |

### Steps
| # | Account | Action | Show the examiner |
|---|---|---|---|
| 1 | #0 | Deploy `Reputation`; deploy `LendLoop(<reputation address>, 60)`; call `Reputation.setLendLoop(<lendloop address>)` | Constructors, `owner` getter, `contractName()` (pure override), `timeUnit` (immutable) |
| 2 | #0 | `registerStudent` for #1, #2, #3 | `StudentRegistered` events in the log |
| 3 | #4 | Try `listItem(...)` | Reverts with `NotAStudent` (modifier + custom error) |
| 4 | #1 | `listItem("Casio fx-991EX", 10000000000000000, 1000000000000000000, 100000000000000000, 3)` → item 1 | 5-arg public version |
| 5 | #1 | `listItem("Drafter", 10000000000000000, 500000000000000000)` → item 2 | **Overloaded** 3-arg version (late fee auto = 0.05) |
| 6 | #2 | `requiredPayment(1, 1, <#2>)` → total `1010000000000000000`. First call `requestRental(1, 1)` with a **wrong** value → revert. Then with the correct value. | `payable`, `require`, `contractBalance()` = 1.01 ETH |
| 7 | #1 → #2 | `approveRental(1)`; #2 `confirmHandover(1)` | `getRental(1)` status 1 → 2, `dueAt` set from `block.timestamp`. **Start a 2-minute timer now.** |
| 8 | #3 | While waiting: `requiredPayment(2, 1, <#3>)` → `510000000000000000`; `requestRental(2, 1)` with that value; #1 `approveRental(2)`; #3 `confirmHandover(2)`; #3 `markReturned(2)` immediately; #1 `confirmReturn(2)` | `RentalSettled`: lateFee **0**, Neha gets full 0.5 ETH deposit |
| 9 | #3, #1 | #3 `rateUser(2, 5)`; #1 `rateUser(2, 4)` | Contract-to-contract call; `Reputation.getProfile`, `averageRating` |
| 10 | — | `requiredPayment(1, 1, <#3>)` vs `requiredPayment(1, 1, <#2>)` | Neha's deposit is 10% lower (reputation discount, private function) |
| 11 | #2 | After 2 min: `markReturned(1)`; #1 `confirmReturn(1)` | `RentalSettled` with a **late fee** deducted automatically (library + assert) |
| 12 | #3 | Rent item 1 with the discounted total; #1 approve; #3 handover + `markReturned(3)`; #1 `raiseDispute(3, "Screen cracked")`; #0 `resolveDispute(3, 50)` | Dispute flow; deposit split 50/50 |
| 13 | #2 | Rent item 2 (rental 4), approve, handover, `markReturned(4)`. #1 does nothing. Call `claimTimeout(4)` immediately → `TooEarly`. After 2 min call again → settles | Timeouts protect the borrower |
| 14 | #1 | `pendingBalance(<#1>)`; `withdraw()`; `withdraw()` again | Balance in account dropdown increases; second call reverts "Nothing to withdraw" |
| 15 | any | At the bottom of the LendLoop panel → **Low level interactions** → send 1 ETH with empty calldata; then with calldata `0x1234` | `receive()` and `fallback()` both reject |
| 16 | — | `getUserRentals(<#2>)` | Returns an array |

**Reading events in Remix:** click a transaction line in the terminal (bottom panel) → expand **logs** → decoded event name and arguments are shown.

**Timing tip:** steps 8–10 fill the 2-minute wait from step 7, so there is no dead time.

---

## 8. Test cases (run manually in Remix; record pass/fail in the report)

| # | Test | Expected |
|---|---|---|
| T1 | Non-owner calls `registerStudent` | Revert "Owned: caller is not the owner" |
| T2 | Non-student calls `listItem` / `requestRental` | Revert `NotAStudent` |
| T3 | `requestRental` with wrong `msg.value` | Revert "Send exact rent + deposit" |
| T4 | Lender tries to rent own item | Revert |
| T5 | Request an item that is already rented | Revert (not available) |
| T6 | `units` = 0 or > `maxUnits` | Revert |
| T7 | Borrower calls `approveRental` | Revert (only lender) |
| T8 | `confirmReturn` while status is Active | Revert `InvalidStatus` |
| T9 | On-time return | Lender gets rent, borrower gets full deposit, fee 0 |
| T10 | Late return | Fee = units late × late fee, capped at deposit |
| T11 | `rejectRental` / `cancelRental` before handover | Full refund credited to borrower |
| T12 | `claimTimeout` before window | Revert `TooEarly` |
| T13 | `claimTimeout` after lender silent | Settles like a normal return |
| T14 | `claimTimeout` when item never returned (3 units after due) | Status Defaulted, lender gets rent + deposit |
| T15 | `resolveDispute` with pct > 100 | Revert |
| T16 | Rate the same rental twice | Revert (nested mapping check) |
| T17 | Rate before rental completed | Revert |
| T18 | `withdraw` with zero balance | Revert "Nothing to withdraw" |
| T19 | Send ETH directly to LendLoop | Revert via `receive()` |
| T20 | Call `Reputation.recordCompletion` from a normal account | Revert (only LendLoop) |
| T21 | After all rentals settle and everyone withdraws | `contractBalance()` returns 0 (no money stuck) |

---

## 9. Report outline (8–12 pages)
1. **Title page** — project name, team members, roll numbers, guide
2. **Abstract** — 1 paragraph
3. **Problem statement** — why campus lending fails without trust (deposit risk on both sides)
4. **Why blockchain** — no middleman holds money; rules can't be changed; reputation can't be faked; everything auditable
5. **System design** — roles table, rental state diagram, money-flow table (Section 1)
6. **Smart contract design** — the contracts, inheritance diagram (`Owned` → `LendLoop`, `Owned` + `IReputation` → `Reputation`), key functions
7. **Solidity concepts used** — the concept map table (Section 5)
8. **Implementation & demo** — screenshots of each demo step
9. **Testing** — test table (Section 8) with results
10. **Security considerations** — reentrancy guard, pull payments, checks-effects-interactions, access-control modifiers, `msg.sender` not `tx.origin`, assert invariant
11. **Limitations** — physical handover can't be verified on-chain (oracle problem); admin is trusted for disputes; test ETH only
12. **Future scope** — jury-based disputes, rupee stablecoin / e-rupee payments, mobile app
13. **Conclusion**

---

## 10. Viva preparation

| Question | Short answer |
|---|---|
| Why blockchain and not a normal app with Razorpay? | In a normal app the platform holds the money and can change rules. Here the contract holds deposits, rules are public and fixed, and neither the lender nor the admin can take the money. |
| How do you know the item was really returned? | The blockchain can't see physical items (oracle problem). Both sides confirm each step, timeouts punish silence, and disputes go to the admin. Incentives make honesty the cheapest option. |
| `public` vs `external`? | Both callable from outside; `public` can also be called internally. We use `public` for `listItem` because the overloaded version calls it. |
| `internal` vs `private`? | `internal` is visible to child contracts; `private` only inside the same contract. |
| `view` vs `pure`? | `view` reads state but doesn't change it; `pure` doesn't even read state (`LateFee.calculate`). |
| Why `withdraw()` instead of sending ETH directly in `_settle`? | Pull-payment pattern: avoids reentrancy and a failing receiver can't block settlement for the other party. |
| What is reentrancy? | A malicious contract re-calls `withdraw` before the balance is set to 0. We prevent it by zeroing the balance before sending and with `nonReentrant` (the 2016 DAO hack). |
| `require` vs `assert` vs `revert`? | `require` checks inputs/conditions; `revert` with custom errors does the same but cheaper and with data; `assert` checks invariants that should never fail. |
| Why `immutable` for `reputation`? | Set once in the constructor and never changes; cheaper to read than normal storage. |
| Why are events needed? | Contracts can't push notifications. Events are cheap logs that frontends and explorers listen to. `indexed` params can be filtered. |
| Why is the library not deployed separately? | Its function is `internal`, so the compiler inlines it into LendLoop. |
| Why does the dispute reason only appear in the event? | Storing strings is expensive; events are much cheaper and still permanently visible. |
| What does `try/catch` protect? | If the Reputation contract fails, payouts still go through. |
| Why didn't you use `tx.origin` / `selfdestruct`? | `tx.origin` for auth is phishable; `selfdestruct` is deprecated. |
| What's the one trusted party? | The admin, for student registration and disputes. In production this would be a multi-signature wallet or a jury. |

---

## 11. Troubleshooting (Mac / Remix)

| Problem | Fix |
|---|---|
| "Gas estimation failed" popup in Remix | A `require`/`revert` is failing. Click "Send transaction" anyway to see the exact revert reason in the terminal. |
| My files disappeared from Remix | Remix keeps files in browser storage. Re-upload from the Git repo. Commit often. |
| Contract state is gone after refreshing the page | Remix VM resets on refresh. Redeploy (that's why the demo script starts from deployment). |
| Value sent but `requestRental` reverts | Check the Value unit dropdown is **Wei**, and the amount matches `requiredPayment` exactly. |
| Late fee is 0 during demo | The return happened before `dueAt`. Wait longer than `units × 60` seconds after `confirmHandover`. |
| Overloaded `listItem` not found in ethers | Call it by signature: `contract["listItem(string,uint256,uint256)"](...)` |
| MetaMask "nonce too high" with anvil | You restarted anvil. MetaMask → Settings → Advanced → **Clear activity tab data**. |
| MetaMask doesn't pop up on the HTML page | You opened it as `file://`. Serve with `python3 -m http.server 8000`. |
| `foundryup: command not found` | Open a new Terminal window or run `source ~/.zshenv`. |
| `brew: command not found` (Apple Silicon) | Run the two "Next steps" lines Homebrew printed after installing (adds `/opt/homebrew/bin` to PATH). |
| Remix can't connect to anvil | Make sure `anvil` is running in Terminal and the URL is `http://127.0.0.1:8545`. |

---

## 12. Suggested team split (if 3 people)
| Person | Owns |
|---|---|
| A | `LendLoop.sol` core flow (Phases 3) |
| B | `Owned`, `IReputation`, `LateFee`, `Reputation.sol`, edge cases + tests (Phases 1, 2, 4) |
| C | Demo script rehearsal, screenshots, README, report; optional HTML page (Phases 5, 6, 8) |

Everyone must be able to run the demo and explain every row of the concept map.
