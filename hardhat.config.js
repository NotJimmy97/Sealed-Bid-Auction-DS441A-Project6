require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const GANACHE_RPC_URL = process.env.GANACHE_RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEYS = (process.env.PRIVATE_KEYS || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { chainId: 1337 },
    ganache: {
      url: GANACHE_RPC_URL,
      chainId: 1337,
      // Không khai báo PRIVATE_KEYS -> dùng unlocked accounts của Ganache node.
      ...(PRIVATE_KEYS.length ? { accounts: PRIVATE_KEYS } : {}),
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    noColors: Boolean(process.env.GAS_REPORT_FILE),
    outputFile: process.env.GAS_REPORT_FILE || undefined,
  },
  mocha: { timeout: 60000 },
};
