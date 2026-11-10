// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAuction
/// @notice Interface + events dùng chung cho SealedBidAuction và EnglishAuction.
/// @dev Cả hai hợp đồng hoàn tiền theo Pull-Payment: tiền chờ rút nằm trong `pendingReturns`.
interface IAuction {
    /// @notice Phát ra khi giá cao nhất được cập nhật.
    event HighestBidIncreased(address indexed bidder, uint256 amount);
    /// @notice Phát ra khi phiên đấu giá được chốt.
    event AuctionEnded(address winner, uint256 amount);
    /// @notice Phát ra khi một tài khoản rút tiền thành công.
    event Withdrawal(address indexed account, uint256 amount);

    /// @notice Rút toàn bộ số dư chờ hoàn của msg.sender.
    function withdraw() external;

    /// @notice Chốt phiên, ghi có tiền thắng cho beneficiary.
    function auctionEnd() external;

    /// @notice Số dư đang chờ rút của `account`.
    function pendingReturns(address account) external view returns (uint256);
}
