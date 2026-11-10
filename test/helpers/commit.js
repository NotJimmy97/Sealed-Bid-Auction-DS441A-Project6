const { ethers } = require("hardhat");

/**
 * Commitment khớp với contract:
 * keccak256(abi.encodePacked(uint256 value, bytes32 secret, address bidder, address auction))
 * @param {bigint} value  giá bid (wei)
 * @param {string} secret bytes32 hex
 * @param {string} bidder địa chỉ người bid
 * @param {string} auction địa chỉ hợp đồng SealedBidAuction
 */
function makeCommitment(value, secret, bidder, auction) {
  return ethers.solidityPackedKeccak256(
    ["uint256", "bytes32", "address", "address"],
    [value, secret, bidder, auction]
  );
}

/** Secret ngẫu nhiên 32 byte. */
function randomSecret() {
  return ethers.hexlify(ethers.randomBytes(32));
}

const BIDDING_DURATION = 300n; // giây
const REVEAL_DURATION = 300n;
const MIN_INCREMENT = ethers.parseEther("0.01");

module.exports = { makeCommitment, randomSecret, BIDDING_DURATION, REVEAL_DURATION, MIN_INCREMENT };
