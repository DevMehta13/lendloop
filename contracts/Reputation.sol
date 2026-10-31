// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Owned.sol";
import "./IReputation.sol";

/// [LAB] Multiple inheritance: an abstract contract and an interface.
contract Reputation is Owned, IReputation {
    struct Profile { // [LAB] Struct groups a student's reputation counters.
        uint32 onTimeReturns;
        uint32 lateReturns;
        uint32 lendsCompleted;
        uint32 ratingSum;
        uint32 ratingCount;
    }

    address public lendLoop;
    mapping(address => Profile) private profiles; // [LAB] Private mapping.
    mapping(uint256 => mapping(address => bool)) public hasRated; // [LAB] Nested mapping.

    event LendLoopSet(address lendLoop);
    event CompletionRecorded(address indexed borrower, address indexed lender, bool wasLate);
    event RatingRecorded(uint256 indexed rentalId, address indexed ratee, uint8 stars);

    modifier onlyLendLoop() { // [LAB] Modifier restricts reputation writes.
        require(msg.sender == lendLoop, "Reputation: caller is not LendLoop");
        _;
    }

    /// @dev Accepts an account for standalone testing; production uses LendLoop's address.
    function setLendLoop(address _lendLoop) external onlyOwner {
        require(lendLoop == address(0), "Reputation: LendLoop already set");
        require(_lendLoop != address(0), "Reputation: zero address");
        lendLoop = _lendLoop;
        emit LendLoopSet(_lendLoop);
    }

    function recordCompletion(address borrower, address lender, bool wasLate) external override onlyLendLoop {
        if (wasLate) {
            profiles[borrower].lateReturns++;
        } else {
            profiles[borrower].onTimeReturns++;
        }
        profiles[lender].lendsCompleted++;
        emit CompletionRecorded(borrower, lender, wasLate);
    }

    /// @dev LendLoop validates rental completion and the rater/ratee participants.
    function recordRating(uint256 rentalId, address rater, address ratee, uint8 stars)
        external override onlyLendLoop
    {
        require(!hasRated[rentalId][rater], "Reputation: already rated");
        require(stars >= 1 && stars <= 5, "Reputation: stars must be 1 to 5");
        hasRated[rentalId][rater] = true;
        profiles[ratee].ratingSum += stars;
        profiles[ratee].ratingCount++;
        emit RatingRecorded(rentalId, ratee, stars);
    }

    function discountPercent(address user) external view override returns (uint256) {
        Profile storage profile = profiles[user]; // [LAB] Storage reference to persisted data.
        if (profile.lateReturns > profile.onTimeReturns) return 0;
        if (profile.onTimeReturns >= 5) return 50;
        if (profile.onTimeReturns >= 3) return 25;
        if (profile.onTimeReturns >= 1) return 10;
        return 0;
    }

    function getProfile(address user) external view returns (Profile memory) { // [LAB] Return a struct in memory.
        return profiles[user];
    }

    /// @return Rating scaled by 100, e.g. 450 means 4.50 stars; zero means unrated.
    function averageRating(address user) external view returns (uint256) {
        Profile storage profile = profiles[user];
        if (profile.ratingCount == 0) return 0;
        return uint256(profile.ratingSum) * 100 / profile.ratingCount;
    }

    function contractName() public pure override returns (string memory) { // [LAB] Pure override.
        return "Reputation";
    }
}
