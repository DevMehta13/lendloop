// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";
import "./IReputation.sol";
import "./LateFee.sol";

/// [LAB] Smart contract and inheritance: main escrow inherits admin ownership.
contract LendLoop is Owned {
    // [LAB] Enum values retain the full workflow's numbering for Remix.
    enum Status { Requested, Approved, Active, ReturnClaimed, Completed, Disputed, Resolved, Cancelled, Defaulted }

    struct Item { // [LAB] Struct groups listing data.
        uint256 id;
        address lender;
        string name;
        uint256 rentPerUnit;
        uint256 deposit;
        uint256 lateFeePerUnit;
        uint256 maxUnits;
        bool available;
    }

    struct Rental {
        uint256 id;
        uint256 itemId;
        address lender;
        address borrower;
        uint256 rent;
        uint256 deposit;
        uint256 units;
        uint256 dueAt;
        uint256 returnedAt;
        Status status;
    }

    uint256 public constant CONFIRM_WINDOW_UNITS = 2; // [LAB] Constant.
    uint256 public constant DEFAULT_AFTER_UNITS = 3;
    IReputation public immutable reputation; // [LAB] Immutable interface reference.
    uint256 public immutable timeUnit;
    uint256 public itemCount; // [LAB] Public state variables expose automatic getters.
    uint256 public rentalCount;
    mapping(uint256 => Item) public items; // [LAB] Mapping keyed by item ID.
    mapping(uint256 => Rental) public rentals;
    mapping(address => bool) public isStudent;
    mapping(address => uint256[]) private userRentals; // [LAB] Dynamic array inside mapping.
    mapping(address => uint256) private pendingWithdrawals; // [LAB] Private state.
    mapping(uint256 => uint256) private activeRentalId; // Occupancy is separate from listing availability.
    bool private locked;

    // [LAB] Custom errors used with revert.
    error NotAStudent(address account);
    error InvalidStatus(uint256 rentalId, Status expected, Status actual);
    error TooEarly(uint256 availableAt);

    // [LAB] Event declarations; indexed parameters allow off-chain filtering.
    event StudentRegistered(address indexed student);
    event StudentRemoved(address indexed student);
    event ItemListed(uint256 indexed itemId, address indexed lender, string name, uint256 rentPerUnit, uint256 deposit);
    event RentalRequested(uint256 indexed rentalId, uint256 indexed itemId, address indexed borrower, uint256 amountLocked);
    event RentalApproved(uint256 indexed rentalId);
    event RentalCancelled(uint256 indexed rentalId, address cancelledBy);
    event ItemAvailabilityChanged(uint256 indexed itemId, bool available);
    event HandoverConfirmed(uint256 indexed rentalId, uint256 dueAt);
    event ReturnMarked(uint256 indexed rentalId, uint256 returnedAt);
    event RentalSettled(uint256 indexed rentalId, uint256 toLender, uint256 toBorrower, uint256 lateFee);
    event DisputeRaised(uint256 indexed rentalId, string reason);
    event DisputeResolved(uint256 indexed rentalId, uint256 toLender, uint256 toBorrower);
    event RentalDefaulted(uint256 indexed rentalId);
    event UserRated(uint256 indexed rentalId, address indexed rater, address indexed ratee, uint8 stars);
    event Withdrawn(address indexed user, uint256 amount);
    event ReputationUpdateFailed(uint256 indexed rentalId);

    modifier onlyStudent() {
        if (!isStudent[msg.sender]) revert NotAStudent(msg.sender);
        _;
    }

    modifier onlyLender(uint256 id) { // [LAB] Modifier with parameters.
        require(msg.sender == rentals[id].lender, "Only lender");
        _;
    }

    modifier onlyBorrower(uint256 id) {
        require(msg.sender == rentals[id].borrower, "Only borrower");
        _;
    }

    modifier inStatus(uint256 id, Status expected) {
        Status actual = rentals[id].status;
        if (actual != expected) revert InvalidStatus(id, expected, actual);
        _;
    }

    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(address _reputation, uint256 _timeUnit) { // [LAB] Constructor with parameters.
        require(_reputation != address(0), "Reputation address required");
        require(_timeUnit > 0, "Time unit must be > 0");
        reputation = IReputation(_reputation);
        timeUnit = _timeUnit;
    }

    function registerStudent(address student) external onlyOwner {
        require(student != address(0), "Student address required");
        isStudent[student] = true;
        emit StudentRegistered(student);
    }

    function removeStudent(address student) external onlyOwner {
        isStudent[student] = false;
        emit StudentRemoved(student);
    }

    function listItem(string memory name, uint256 rentPerUnit, uint256 deposit, uint256 lateFeePerUnit, uint256 maxUnits)
        public onlyStudent returns (uint256 id)
    {
        require(deposit > 0, "Deposit must be > 0"); // [LAB] Require validates input.
        require(maxUnits > 0, "Max units must be > 0");
        id = ++itemCount;
        items[id] = Item(id, msg.sender, name, rentPerUnit, deposit, lateFeePerUnit, maxUnits, true);
        emit ItemListed(id, msg.sender, name, rentPerUnit, deposit);
    }

    // [LAB] Overloading; calldata input passed to the public overload internally.
    function listItem(string calldata name, uint256 rentPerUnit, uint256 deposit) external returns (uint256) {
        return listItem(name, rentPerUnit, deposit, deposit / 10, 7);
    }

    function getItem(uint256 itemId) external view returns (Item memory) { // [LAB] Struct returned in memory.
        require(itemId > 0 && itemId <= itemCount, "Item does not exist");
        return items[itemId];
    }

    function getRental(uint256 id) external view returns (Rental memory) {
        require(id > 0 && id <= rentalCount, "Rental does not exist");
        return rentals[id];
    }

    function getUserRentals(address user) external view returns (uint256[] memory) { // [LAB] Dynamic array return.
        return userRentals[user];
    }

    function setItemAvailability(uint256 itemId, bool available) external {
        require(itemId > 0 && itemId <= itemCount, "Item does not exist");
        require(msg.sender == items[itemId].lender, "Only lender");
        require(activeRentalId[itemId] == 0, "Item has ongoing rental");
        items[itemId].available = available;
        emit ItemAvailabilityChanged(itemId, available);
    }

    function requiredPayment(uint256 itemId, uint256 units, address borrower)
        public view returns (uint256 rent, uint256 deposit, uint256 total)
    {
        require(itemId > 0 && itemId <= itemCount, "Item does not exist");
        Item storage item = items[itemId];
        require(units > 0 && units <= item.maxUnits, "Invalid rental units");
        rent = item.rentPerUnit * units;
        deposit = _discountedDeposit(item.deposit, borrower);
        total = rent + deposit;
    }

    function _discountedDeposit(uint256 deposit, address borrower) private view returns (uint256) { // [LAB] Private view function.
        uint256 pct = reputation.discountPercent(borrower);
        require(pct <= 100, "Invalid discount");
        return deposit - deposit * pct / 100;
    }

    function requestRental(uint256 itemId, uint256 units) external payable onlyStudent returns (uint256 id) {
        require(itemId > 0 && itemId <= itemCount, "Item does not exist");
        Item storage item = items[itemId];
        require(item.available, "Item not available");
        require(msg.sender != item.lender, "Cannot rent own item");
        (uint256 rent, uint256 deposit, uint256 total) = requiredPayment(itemId, units, msg.sender);
        require(msg.value == total, "Send exact rent + deposit"); // [LAB] msg.value in payable function.
        item.available = false;
        id = ++rentalCount;
        activeRentalId[itemId] = id;
        rentals[id] = Rental(id, itemId, item.lender, msg.sender, rent, deposit, units, 0, 0, Status.Requested);
        userRentals[item.lender].push(id);
        userRentals[msg.sender].push(id);
        emit RentalRequested(id, itemId, msg.sender, total);
    }

    function approveRental(uint256 id) external onlyLender(id) inStatus(id, Status.Requested) { // [LAB] External function.
        rentals[id].status = Status.Approved;
        emit RentalApproved(id);
    }

    function rejectRental(uint256 id) external onlyLender(id) inStatus(id, Status.Requested) {
        _cancel(id);
    }

    function cancelRental(uint256 id) external onlyBorrower(id) {
        Status status = rentals[id].status;
        require(status == Status.Requested || status == Status.Approved, "Cannot cancel now");
        _cancel(id);
    }

    function _cancel(uint256 id) private {
        Rental storage rental = rentals[id];
        rental.status = Status.Cancelled;
        delete activeRentalId[rental.itemId];
        items[rental.itemId].available = true;
        _credit(rental.borrower, rental.rent + rental.deposit);
        emit RentalCancelled(id, msg.sender); // [LAB] Emit an event for off-chain listeners.
    }

    function confirmHandover(uint256 id) external onlyBorrower(id) inStatus(id, Status.Approved) {
        Rental storage rental = rentals[id];
        rental.status = Status.Active;
        rental.dueAt = block.timestamp + rental.units * timeUnit; // [LAB] Global block.timestamp.
        emit HandoverConfirmed(id, rental.dueAt);
    }

    function markReturned(uint256 id) external onlyBorrower(id) inStatus(id, Status.Active) {
        rentals[id].status = Status.ReturnClaimed;
        rentals[id].returnedAt = block.timestamp;
        emit ReturnMarked(id, block.timestamp);
    }

    function confirmReturn(uint256 id) external onlyLender(id) inStatus(id, Status.ReturnClaimed) {
        _settle(id);
    }

    function raiseDispute(uint256 id, string calldata reason)
        external onlyLender(id) inStatus(id, Status.ReturnClaimed)
    { // [LAB] Calldata string is logged without storing it.
        require(block.timestamp < rentals[id].returnedAt + CONFIRM_WINDOW_UNITS * timeUnit, "Dispute window closed");
        rentals[id].status = Status.Disputed;
        emit DisputeRaised(id, reason);
    }

    function resolveDispute(uint256 id, uint256 lenderSharePercent)
        external onlyOwner inStatus(id, Status.Disputed)
    {
        require(lenderSharePercent <= 100, "Share must be <= 100");
        Rental storage rental = rentals[id];
        uint256 share = rental.deposit * lenderSharePercent / 100;
        uint256 toLender = rental.rent + share;
        uint256 toBorrower = rental.deposit - share;
        assert(toLender + toBorrower == rental.rent + rental.deposit);
        rental.status = Status.Resolved;
        delete activeRentalId[rental.itemId];
        items[rental.itemId].available = true;
        _credit(rental.lender, toLender);
        _credit(rental.borrower, toBorrower);
        emit DisputeResolved(id, toLender, toBorrower);
    }

    function claimTimeout(uint256 id) external {
        require(id > 0 && id <= rentalCount, "Rental does not exist");
        Rental storage rental = rentals[id];
        if (rental.status == Status.ReturnClaimed) {
            uint256 availableAt = rental.returnedAt + CONFIRM_WINDOW_UNITS * timeUnit;
            if (block.timestamp < availableAt) revert TooEarly(availableAt);
            _settle(id);
        } else if (rental.status == Status.Active) {
            uint256 availableAt = rental.dueAt + DEFAULT_AFTER_UNITS * timeUnit;
            if (block.timestamp < availableAt) revert TooEarly(availableAt);
            rental.status = Status.Defaulted;
            delete activeRentalId[rental.itemId];
            // Keep unavailable until the lender explicitly relists a recovered item.
            _credit(rental.lender, rental.rent + rental.deposit);
            emit RentalDefaulted(id);
        } else {
            revert InvalidStatus(id, Status.Active, rental.status);
        }
    }

    function rateUser(uint256 id, uint8 stars) external {
        Rental storage rental = rentals[id];
        require(rental.status == Status.Completed || rental.status == Status.Resolved, "Rental not completed or resolved");
        require(msg.sender == rental.lender || msg.sender == rental.borrower, "Only rental participants");
        address ratee = msg.sender == rental.lender ? rental.borrower : rental.lender;
        reputation.recordRating(id, msg.sender, ratee, stars); // [LAB] Contract-to-contract call through interface.
        emit UserRated(id, msg.sender, ratee, stars);
    }

    function _settle(uint256 id) internal { // [LAB] Internal function and storage reference.
        Rental storage rental = rentals[id];
        (uint256 fee, ) = LateFee.calculate(rental.dueAt, rental.returnedAt, timeUnit,
            items[rental.itemId].lateFeePerUnit, rental.deposit); // [LAB] Library call.
        uint256 toLender = rental.rent + fee;
        uint256 toBorrower = rental.deposit - fee;
        assert(toLender + toBorrower == rental.rent + rental.deposit); // [LAB] Accounting invariant.
        rental.status = Status.Completed;
        delete activeRentalId[rental.itemId];
        items[rental.itemId].available = true;
        _credit(rental.lender, toLender);
        _credit(rental.borrower, toBorrower);

        // [LAB] try/catch: reputation failure must not block settlement.
        try reputation.recordCompletion(rental.borrower, rental.lender, rental.returnedAt > rental.dueAt) {
        } catch {
            emit ReputationUpdateFailed(id);
        }
        emit RentalSettled(id, toLender, toBorrower, fee);
    }

    function _credit(address to, uint256 amount) private {
        pendingWithdrawals[to] += amount;
    }

    function withdraw() external nonReentrant { // [LAB] Pull payment, checks-effects-interactions.
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}(""); // [LAB] Low-level ETH call.
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function pendingBalance(address user) external view returns (uint256) {
        return pendingWithdrawals[user];
    }

    function contractBalance() external view returns (uint256) {
        return address(this).balance; // [LAB] Global contract balance; view reads state.
    }

    receive() external payable { // [LAB] Receive handler for empty calldata.
        revert("Use requestRental");
    }

    fallback() external payable { // [LAB] Fallback handler for unknown selectors.
        revert("Function does not exist");
    }

    function contractName() public pure override returns (string memory) { // [LAB] Pure override.
        return "LendLoop";
    }
}
