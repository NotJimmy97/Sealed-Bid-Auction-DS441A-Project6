// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAuction} from "./interfaces/IAuction.sol";

/// @title EnglishAuction - Đấu giá mở kiểu Anh (baseline đối chuẩn)
/// @author Team 21
/// @notice Mọi bid công khai; bid sau phải >= highestBid + minIncrement. Người bị vượt giá rút tiền qua withdraw().
contract EnglishAuction is IAuction, Ownable, ReentrancyGuard {
    /// @notice Người nhận tiền thắng.
    address payable public immutable beneficiary;
    /// @notice Hết hạn đặt giá (unix timestamp).
    uint256 public immutable biddingEnd;
    /// @notice Bước giá tối thiểu (wei).
    uint256 public immutable minIncrement;

    /// @notice Người giữ giá cao nhất.
    /// @dev highestBidder (20B) + ended (1B) dùng chung 1 slot.
    address public highestBidder;
    /// @notice auctionEnd() đã được gọi.
    bool public ended;
    /// @notice Giá cao nhất (wei).
    uint256 public highestBid;
    /// @inheritdoc IAuction
    mapping(address => uint256) public pendingReturns;

    error TooEarly(uint256 deadline);
    error TooLate(uint256 deadline);
    error BidTooLow(uint256 required);
    error AuctionAlreadyEnded();
    error NothingToWithdraw();
    error TransferFailed();

    modifier onlyBefore(uint256 deadline) {
        if (block.timestamp >= deadline) revert TooLate(deadline);
        _;
    }

    modifier onlyAfter(uint256 deadline) {
        if (block.timestamp < deadline) revert TooEarly(deadline);
        _;
    }

    /// @param biddingDuration Độ dài pha đặt giá (giây).
    /// @param minIncrement_ Bước giá tối thiểu (wei).
    /// @param beneficiary_ Người nhận tiền thắng.
    constructor(uint256 biddingDuration, uint256 minIncrement_, address payable beneficiary_)
        Ownable(msg.sender)
    {
        beneficiary = beneficiary_;
        biddingEnd = block.timestamp + biddingDuration;
        minIncrement = minIncrement_;
    }

    /// @notice Giá tối thiểu cho lượt bid kế tiếp.
    function minNextBid() public view returns (uint256) {
        return highestBid == 0 ? 1 : highestBid + minIncrement;
    }

    /// @notice Đặt giá công khai bằng msg.value.
    function bid() external payable onlyBefore(biddingEnd) {
        uint256 required = minNextBid();
        if (msg.value < required) revert BidTooLow(required);
        if (highestBidder != address(0)) {
            pendingReturns[highestBidder] += highestBid;
        }
        highestBidder = msg.sender;
        highestBid = msg.value;
        emit HighestBidIncreased(msg.sender, msg.value);
    }

    /// @inheritdoc IAuction
    function withdraw() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingReturns[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    /// @inheritdoc IAuction
    function auctionEnd() external onlyAfter(biddingEnd) {
        if (ended) revert AuctionAlreadyEnded();
        ended = true;
        if (highestBid > 0) {
            pendingReturns[beneficiary] += highestBid;
        }
        emit AuctionEnded(highestBidder, highestBid);
    }
}
