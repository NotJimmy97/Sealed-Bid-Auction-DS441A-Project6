// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IAuction} from "./interfaces/IAuction.sol";

/// @title SealedBidAuction - Đấu giá kín Commit-Reveal (Project 6, Team 21)
/// @author Team 21
/// @notice Pha Bidding: gửi commitment + đặt cọc. Pha Reveal: tiết lộ (value, secret).
///         Kết thúc: auctionEnd() ghi có cho beneficiary; mọi khoản hoàn tiền rút qua withdraw().
/// @dev Commitment = keccak256(abi.encodePacked(uint256 value, bytes32 secret, address bidder, address auction)).
///      Bind `bidder` + `address(this)` để chặn sao chép/replay commitment của người khác.
///      Pha (FSM) suy ra từ block.timestamp + cờ `ended`/`cancelled`, không cần owner chuyển pha.
contract SealedBidAuction is IAuction, Ownable, Pausable, ReentrancyGuard {
    // ------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------

    /// @notice Một lượt bid đã cam kết.
    /// @dev Packing: commitment (slot 0, 32B) | deposit uint96 (12B) + revealed bool (1B) (slot 1) => 2 slots thay vì 3.
    struct Bid {
        bytes32 commitment;
        uint96 deposit;
        bool revealed;
    }

    /// @notice Các pha của phiên đấu giá.
    enum Phase {
        Bidding,
        Reveal,
        Ended,
        Cancelled
    }

    // ------------------------------------------------------------------
    // Immutable config (không tốn SLOAD)
    // ------------------------------------------------------------------

    /// @notice Người nhận tiền thắng + tiền cọc bị tịch thu.
    address payable public immutable beneficiary;
    /// @notice Hết pha Bidding (unix timestamp).
    uint256 public immutable biddingEnd;
    /// @notice Hết pha Reveal (unix timestamp).
    uint256 public immutable revealEnd;

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    /// @notice Bid của mỗi địa chỉ (tối đa 1 bid / địa chỉ).
    mapping(address => Bid) public bids;
    /// @notice Người đang giữ giá cao nhất đã reveal.
    /// @dev highestBidder (20B) + ended (1B) + cancelled (1B) dùng chung 1 slot.
    address public highestBidder;
    /// @notice auctionEnd() đã được gọi.
    bool public ended;
    /// @notice Owner đã hủy phiên trong pha Bidding.
    bool public cancelled;
    /// @notice Giá cao nhất đã reveal (wei).
    uint256 public highestBid;
    /// @notice Tổng tiền cọc của các bid chưa reveal (bị tịch thu khi auctionEnd).
    uint256 public unrevealedDeposits;
    /// @inheritdoc IAuction
    mapping(address => uint256) public pendingReturns;

    // ------------------------------------------------------------------
    // Events (HighestBidIncreased, AuctionEnded, Withdrawal kế thừa từ IAuction)
    // ------------------------------------------------------------------

    /// @notice Một commitment mới được ghi nhận.
    event BidCommitted(address indexed bidder, bytes32 commitment, uint256 deposit);
    /// @notice Một bid được reveal hợp lệ.
    event BidRevealed(address indexed bidder, uint256 value, bool isHighest);
    /// @notice Owner hủy phiên.
    event AuctionCancelled();

    // ------------------------------------------------------------------
    // Custom errors (rẻ gas hơn require string)
    // ------------------------------------------------------------------

    error TooEarly(uint256 deadline);
    error TooLate(uint256 deadline);
    error ZeroCommitment();
    error ZeroDeposit();
    error AlreadyCommitted();
    error NoCommitment();
    error AlreadyRevealed();
    error InvalidReveal();
    error InsufficientDeposit(uint256 deposit, uint256 value);
    error AuctionAlreadyEnded();
    error AuctionCancelledError();
    error NothingToWithdraw();
    error TransferFailed();

    // ------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------

    /// @dev Revert TooLate nếu block.timestamp >= deadline.
    modifier onlyBefore(uint256 deadline) {
        if (block.timestamp >= deadline) revert TooLate(deadline);
        _;
    }

    /// @dev Revert TooEarly nếu block.timestamp < deadline.
    modifier onlyAfter(uint256 deadline) {
        if (block.timestamp < deadline) revert TooEarly(deadline);
        _;
    }

    /// @dev Revert nếu phiên đã bị hủy.
    modifier notCancelled() {
        if (cancelled) revert AuctionCancelledError();
        _;
    }

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    /// @param biddingDuration Độ dài pha Bidding (giây).
    /// @param revealDuration Độ dài pha Reveal (giây).
    /// @param beneficiary_ Người nhận tiền thắng.
    constructor(uint256 biddingDuration, uint256 revealDuration, address payable beneficiary_)
        Ownable(msg.sender)
    {
        beneficiary = beneficiary_;
        biddingEnd = block.timestamp + biddingDuration;
        revealEnd = biddingEnd + revealDuration;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice Pha hiện tại suy ra từ thời gian và cờ trạng thái.
    /// @dev Trả về Ended ngay khi block.timestamp >= revealEnd, kể cả khi auctionEnd() chưa được gọi.
    function currentPhase() public view returns (Phase) {
        if (cancelled) return Phase.Cancelled;
        if (ended || block.timestamp >= revealEnd) return Phase.Ended;
        if (block.timestamp >= biddingEnd) return Phase.Reveal;
        return Phase.Bidding;
    }

    // ------------------------------------------------------------------
    // Bidding phase
    // ------------------------------------------------------------------

    /// @notice Gửi commitment kèm tiền cọc. Nên đặt cọc > value để che giấu giá.
    /// @param commitment keccak256(abi.encodePacked(value, secret, msg.sender, address(this))).
    function commitBid(bytes32 commitment)
        external
        payable
        whenNotPaused
        notCancelled
        onlyBefore(biddingEnd)
    {
        if (commitment == bytes32(0)) revert ZeroCommitment();
        if (msg.value == 0) revert ZeroDeposit();
        if (bids[msg.sender].commitment != bytes32(0)) revert AlreadyCommitted();
        uint96 dep = SafeCast.toUint96(msg.value);
        bids[msg.sender] = Bid({commitment: commitment, deposit: dep, revealed: false});
        unrevealedDeposits += msg.value;
        emit BidCommitted(msg.sender, commitment, msg.value);
    }

    // ------------------------------------------------------------------
    // Reveal phase
    // ------------------------------------------------------------------

    /// @notice Tiết lộ bid. Hash phải khớp commitment đã lưu và deposit >= value.
    /// @param value Giá bid thật (wei).
    /// @param secret Salt 32 byte đã dùng khi commit.
    function revealBid(uint256 value, bytes32 secret)
        external
        whenNotPaused
        notCancelled
        onlyAfter(biddingEnd)
        onlyBefore(revealEnd)
    {
        Bid storage b = bids[msg.sender];
        if (b.commitment == bytes32(0)) revert NoCommitment();
        if (b.revealed) revert AlreadyRevealed();
        if (keccak256(abi.encodePacked(value, secret, msg.sender, address(this))) != b.commitment) revert InvalidReveal();
        uint256 dep = b.deposit;
        if (dep < value) revert InsufficientDeposit(dep, value);
        b.revealed = true;
        unrevealedDeposits -= dep;
        bool isHighest = value > highestBid;
        if (isHighest) {
            if (highestBidder != address(0)) {
                pendingReturns[highestBidder] += highestBid;
            }
            highestBid = value;
            highestBidder = msg.sender;
            uint256 refund = dep - value;
            if (refund > 0) {
                pendingReturns[msg.sender] += refund;
            }
            emit HighestBidIncreased(msg.sender, value);
        } else {
            pendingReturns[msg.sender] += dep;
        }
        emit BidRevealed(msg.sender, value, isHighest);
    }

    // ------------------------------------------------------------------
    // End & withdrawal
    // ------------------------------------------------------------------

    /// @inheritdoc IAuction
    /// @dev Ai cũng gọi được sau revealEnd. Cọc chưa reveal bị tịch thu cho beneficiary.
    function auctionEnd() external onlyAfter(revealEnd) notCancelled {
        if (ended) revert AuctionAlreadyEnded();
        ended = true;
        uint256 payout = highestBid + unrevealedDeposits;
        unrevealedDeposits = 0;
        if (payout > 0) {
            pendingReturns[beneficiary] += payout;
        }
        emit AuctionEnded(highestBidder, highestBid);
    }

    /// @inheritdoc IAuction
    /// @dev Vẫn hoạt động khi paused. CEI: zero số dư trước khi chuyển ETH.
    function withdraw() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        if (cancelled) {
            Bid storage b = bids[msg.sender];
            if (!b.revealed && b.deposit > 0) {
                uint256 dep = b.deposit;
                amount += dep;
                unrevealedDeposits -= dep;
                b.deposit = 0;
                b.revealed = true;
            }
        }
        if (amount == 0) revert NothingToWithdraw();
        pendingReturns[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    /// @notice Hủy phiên (chỉ trong pha Bidding). Người đã commit rút lại cọc qua withdraw().
    function cancelAuction() external onlyOwner notCancelled onlyBefore(biddingEnd) {
        cancelled = true;
        emit AuctionCancelled();
    }

    /// @notice Dừng khẩn cấp commit/reveal. withdraw() vẫn mở.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Mở lại sau dừng khẩn cấp.
    function unpause() external onlyOwner {
        _unpause();
    }
}
