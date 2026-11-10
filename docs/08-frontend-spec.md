# 08 · Đặc tả Giao diện DApp (Frontend Specification)

Đặc tả kỹ thuật cho ứng dụng web trong thư mục [`frontend/`](../frontend/index.html) đáp ứng 6 tính năng bắt buộc (`AC-FE-01..06`) cùng bộ công cụ chuyển đổi vai trò (Multi-Role Switcher) và điều khiển thời gian phục vụ kiểm thử E2E / trình diễn trực tiếp.

---

## 1. Ngăn xếp, Kiến trúc Kết nối Kép (Dual-Mode) & Thiết kế Thị giác

- **Công nghệ**: HTML5 + CSS3 + JavaScript ES Modules thuần (Zero-build, chạy trực tiếp qua `http-server`).
- **Thư viện Web3**: `ethers` v6 (`6.13.4`) nạp qua CDN ESM (`https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js`).
- **Kết nối Kép (Dual-Mode Connection)**:
  1. **Chế độ Ví trình duyệt (MetaMask)**: Nếu có `window.ethereum` và người dùng chưa ép chế độ RPC cục bộ, DApp kết nối qua `ethers.BrowserProvider(window.ethereum)`, kiểm tra và tự động chuyển sang mạng **Ganache Local (`chainId = 1337` / `0x539`)** bằng `wallet_switchEthereumChain` / `wallet_addEthereumChain`.
  2. **Chế độ Local RPC & Bộ chuyển vai trò (`#role-selector`)**: Nếu trình duyệt không có extension MetaMask (như trình duyệt kiểm thử tự động Playwright) hoặc khi người dùng chọn một vai trò trong `<select id="role-selector">`, DApp tự động kết nối tới `http://127.0.0.1:8545` qua `ethers.JsonRpcProvider` (`cacheTimeout: -1`) và lấy `provider.getSigner(roleIndex)` tương ứng với 4 tài khoản chuẩn trên nút Ganache/Hardhat:
     - `Role 0`: Owner / Beneficiary (Auctioneer)
     - `Role 1`: Bidder A (Standard)
     - `Role 2`: Bidder B (Standard)
     - `Role 3`: Bidder C / Guest (Restricted)
- **Hệ chữ & Thẩm mỹ (Editorial Vault & Ledger)**:
  - Tiêu đề hiển thị: `Fraunces` (serif biên tập tạo điểm nhấn thị giác).
  - Nội dung tiếng Việt & điều khiển: `Plus Jakarta Sans` (`input, select { font-size: 16px; }` chống tự động phóng to trên thiết bị di động).
  - Địa chỉ, mã băm `bytes32`, số liệu ETH và đồng hồ đếm ngược: `JetBrains Mono` (`font-variant-numeric: tabular-nums`).
  - Đảm bảo không tràn ngang (`scrollWidth <= innerWidth`) và không chồng lấp phần tử (`overlap === 0`) trên cả 3 kích thước khung nhìn `375px`, `768px`, `1440px`.
- **Cầu nối Artifact**: Script [`scripts/deploy.js`](../scripts/deploy.js) tự động xuất địa chỉ hợp đồng và ABI vào `frontend/src/contracts.json` mỗi khi deploy.

---

## 2. Ánh xạ 6 Tính năng Bắt buộc & Công cụ Quản trị sang DOM Elements

| Mã AC / Nhóm | Tính năng yêu cầu | DOM Element IDs (`frontend/index.html`) | Hàm xử lý (`frontend/src/app.js`) |
|---|---|---|---|
| **AC-FE-01** | Kết nối ví (MetaMask / Local RPC), chuyển vai trò, hiển thị mạng & địa chỉ | `#btn-connect`, `#role-selector`, `#role-badge`, `#wallet-address`, `#network-status`, `#contract-address` | `connect()`, `ensureGanache()`, listener `change` / `accountsChanged` / `chainChanged` |
| **AC-FE-02** | Hiển thị pha hiện tại, đếm ngược thời gian & thông tin trạng thái phiên | `#phase-label`, `#countdown`, `#highest-bid`, `#highest-bidder`, `#unrevealed-deposits`, `#my-bid-status` | `refresh()`, `tick()` (đọc `block.timestamp` mỗi giây) |
| **AC-FE-03** | Sinh `secret` 32 byte, băm `commitment` ngoài chuỗi, gửi `commitBid` kèm ETH đặt cọc | `#commit-value`, `#commit-deposit`, `#commit-secret`, `#btn-generate-secret`, `#commit-hash`, `#btn-commit`, `#btn-download-secret` | `computeCommitment()`, `saveSecret()`, `state.auction.commitBid(hash, { value: deposit })` |
| **AC-FE-04** | Khôi phục `(value, secret)` đã lưu và gửi giao dịch `revealBid` | `#reveal-value`, `#reveal-secret`, `#btn-load-secret`, `#btn-reveal` | `loadSecret()`, `state.auction.revealBid(value, secret)` |
| **AC-FE-05** | Hiển thị số dư chờ hoàn (`pendingReturns`), rút tiền và kết thúc phiên | `#pending-returns`, `#btn-withdraw`, `#btn-auction-end` | `state.auction.withdraw()`, `state.auction.auctionEnd()` |
| **AC-FE-06** | Bảng nhật ký sự kiện thời gian thực kết hợp truy vấn lịch sử | `#event-log`, `#toast` | `syncEvents()` (`queryFilter`), `subscribeEvents()` (`contract.on`), `logEvent()` |
| **Admin / Demo** | Quản trị khẩn cấp (`onlyOwner`) & Tua thời gian nút Local RPC (`evm_increaseTime`) | `#btn-pause`, `#btn-unpause`, `#btn-cancel`, `#btn-advance-reveal`, `#btn-advance-end` | `state.auction.pause()`, `unpause()`, `cancelAuction()`, `advancePhase()` |

---

## 3. Công thức Băm Ngoài chuỗi & Lưu trữ Secret An toàn

Frontend sử dụng chính xác cùng công thức băm với Smart Contract và bộ test (`test/helpers/commit.js`):

```javascript
const hash = ethers.solidityPackedKeccak256(
  ["uint256", "bytes32", "address", "address"],
  [valueWei, secretBytes32, state.account, state.meta.address]
);
```

- **Quy tắc chống mất cọc**: Ngay **trước** khi gọi `state.auction.commitBid(...)`, ứng dụng tự động lưu `{ value, secret, commitment, auction }` vào `localStorage` theo khóa riêng của từng hợp đồng và từng ví:
  ```
  sba:<contract_address>:<wallet_address>
  ```
- Người dùng có thể bấm `#btn-download-secret` để tải file JSON backup và bấm `#btn-load-secret` ở pha Reveal để tự động điền lại.

---

## 4. Giải mã Custom Error, Đồng bộ Sự kiện & Xử lý Trạng thái Biên

- **Giải mã lỗi Solidity 0.8.24 & OpenZeppelin 5.x**: Hàm `decodeError(err)` trích xuất revert data 4-byte và dùng `state.auction.interface.parseError(data)` để dịch thành tên lỗi tường minh (`OwnableUnauthorizedAccount(...)`, `NothingToWithdraw()`, `InvalidReveal()`, `TooEarly(...)`, `InsufficientDeposit(...)`, `EnforcedPause()`) hiển thị trực tiếp lên `#toast`.
- **Đồng bộ sự kiện kép (Past Query + Live Listener)**: Hàm `syncEvents()` dùng `queryFilter` cho cả 6 sự kiện (`BidCommitted`, `BidRevealed`, `HighestBidIncreased`, `AuctionEnded`, `Withdrawal`, `AuctionCancelled`) kết hợp `Set` khử trùng lặp theo `transactionHash:logIndex`, đảm bảo `#event-log` cập nhật tức thì ngay sau mỗi giao dịch trên cả MetaMask lẫn `JsonRpcProvider`.
- **Chống XSS trên Event Log**: `logEvent()` gán dữ liệu sự kiện qua `.textContent` (không nối chuỗi `innerHTML`).
- **Kiểm tra hợp đồng sống**: Khi kết nối, `app.js` gọi `provider.getCode(address)` — nếu trả về `"0x"` (do Ganache vừa khởi động lại), UI báo rõ cần chạy lại `npm run deploy:ganache`.
