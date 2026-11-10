// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAuction} from "../interfaces/IAuction.sol";
import {SealedBidAuction} from "../SealedBidAuction.sol";
import {EnglishAuction} from "../EnglishAuction.sol";

/// @title ReentrancyAttacker - Hợp đồng giả lập tấn công tái nhập vào withdraw()
/// @notice Dùng cho kiểm thử bảo mật TC-SB-18 (AC-SC-04).
contract ReentrancyAttacker {
    IAuction public target;
    bool public attacking;
    uint256 public reenterCount;

    /// @notice Gửi commitBid vào SealedBidAuction.
    function commit(SealedBidAuction auction, bytes32 commitment) external payable {
        auction.commitBid{value: msg.value}(commitment);
    }

    /// @notice Gửi revealBid vào SealedBidAuction.
    function reveal(SealedBidAuction auction, uint256 value, bytes32 secret) external {
        auction.revealBid(value, secret);
    }

    /// @notice Đặt giá trên EnglishAuction.
    function bid(EnglishAuction auction) external payable {
        auction.bid{value: msg.value}();
    }

    /// @notice Kích hoạt rút tiền kèm cờ tấn công tái nhập.
    function attackWithdraw(IAuction auction) external {
        target = auction;
        attacking = true;
        auction.withdraw();
        attacking = false;
    }

    /// @dev Khi nhận ETH từ withdraw(), cố gắng gọi ngược lại target.withdraw().
    receive() external payable {
        if (attacking) {
            attacking = false;
            reenterCount += 1;
            target.withdraw();
        }
    }
}

/// @title EthRejecter - Hợp đồng từ chối nhận ETH để kiểm thử nhánh lỗi TransferFailed()
/// @notice Dùng để kiểm thử đường revert TransferFailed() trong withdraw().
contract EthRejecter {
    /// @notice Gửi commitBid vào SealedBidAuction.
    function commit(SealedBidAuction auction, bytes32 commitment) external payable {
        auction.commitBid{value: msg.value}(commitment);
    }

    /// @notice Gửi revealBid vào SealedBidAuction.
    function reveal(SealedBidAuction auction, uint256 value, bytes32 secret) external {
        auction.revealBid(value, secret);
    }

    /// @notice Đặt giá trên EnglishAuction.
    function bid(EnglishAuction auction) external payable {
        auction.bid{value: msg.value}();
    }

    /// @notice Gọi withdraw() từ hợp đồng không nhận ETH -> kích hoạt TransferFailed().
    function triggerWithdraw(IAuction auction) external {
        auction.withdraw();
    }

    /// @dev Luôn revert khi nhận ETH.
    receive() external payable {
        revert("EthRejecter: cannot accept ETH");
    }
}
