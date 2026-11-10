---
title: Complete Sealed-Bid Auction Project (Mục tiêu 1 -> 5, AC-SC/QA/GAS/FE/DEL)
status: completed
priority: P1
effort: high
branch: main
tags: [solidity, hardhat, gas-optimization, dapp, testing, report]
created: 2026-11-09
---

# Kế hoạch Hoàn thiện Toàn diện Project 6: Sealed-Bid Auction (Team 21)

## Quy trình Thực thi Bắt buộc cho Mỗi Mục tiêu
1. **Triển khai (Subagent Implementation)**: Giao subagent chuyên trách thực thi code/test/docs của mục tiêu.
2. **Đối chiếu Độc lập (Subagent Independent Audit)**: Giao subagent độc lập kiểm tra chéo với `docs/01-requirements.md` và `docs/03-contract-spec.md`, chạy test và đo invariants.
3. **Rà soát Tổng thể (Lead Gate Review)**: Tổng hợp bằng chứng số học, đảm bảo 0 lỗi và đạt 100% tiêu chí nghiệm thu của mục tiêu trước khi sang mục tiêu kế tiếp.

## Danh sách Mục tiêu (Objectives)

- [x] **Mục tiêu 1 & 2: Hoàn thiện Smart Contracts (`SealedBidAuction.sol`, `EnglishAuction.sol`) & Kịch bản Demo (`AC-SC-01..10`)**
  - [x] Implement đầy đủ `commitBid`, `revealBid`, `auctionEnd`, `withdraw`, `cancelAuction` trong `contracts/SealedBidAuction.sol` (dùng `SafeCast.toUint96`, xóa `NotImplemented`).
  - [x] Implement đầy đủ `bid`, `withdraw`, `auctionEnd` trong `contracts/EnglishAuction.sol` (xóa `NotImplemented`).
  - [x] Tạo contract hỗ trợ kiểm thử `contracts/mocks/AuctionTestMocks.sol` (`ReentrancyAttacker` và `EthRejecter` để kiểm thử `TC-SB-18` và nhánh `TransferFailed`).
  - [x] Hoàn thiện `scripts/demo-scenario.js` chạy end-to-end.
  - [x] Đối chiếu độc lập 7 bất biến (`INV-1..7`) và toàn bộ `AC-SC-01..10`.

- [x] **Mục tiêu 3A: Hoàn thiện Bộ Kiểm thử 28+ Test Cases & Độ bao phủ (`AC-QA-01..05`)**
  - [x] Mở khóa (`.skip` -> `it`) và viết đầy đủ `TC-SB-01..19` trong `test/SealedBidAuction.test.js`.
  - [x] Mở khóa (`.skip` -> `it`) và viết đầy đủ `TC-EN-01..05` trong `test/EnglishAuction.test.js`.
  - [x] Cấu hình `.solcover.js` (bỏ qua thư mục `mocks/`) và chạy `npx hardhat coverage` đạt Statements >= 95%, Branches >= 90%, Functions 100%.
  - [x] Đối chiếu độc lập toàn bộ assertions, custom errors, events và invariants.

- [x] **Mục tiêu 3B: Đo kiểm & Tối ưu hóa Chi phí Gas Thực tế (`AC-GAS-01..02`)**
  - [x] Xuất báo cáo `docs/evidence/gas-report.txt` qua `hardhat-gas-reporter`.
  - [x] Đo đạc thực nghiệm Trước/Sau cho 4 kỹ thuật tối ưu hóa (`Struct Packing`, `immutable`, `Custom Errors`, `Storage Caching & Zeroing`).
  - [x] Điền đầy đủ số liệu thực tế thay thế toàn bộ ô `TBD` trong `docs/06-gas-optimization.md`.
  - [x] Đối chiếu độc lập số liệu trong bảng với `docs/evidence/gas-report.txt`.

- [x] **Mục tiêu 4: Hoàn thiện DApp Frontend & Kiểm thử E2E Đa Vai trò (`AC-FE-01..06`)**
  - [x] Nâng cấp `frontend/index.html`, `frontend/src/styles.css`, `frontend/src/app.js` tuân thủ Anti-AI-Slop (`ck:frontend-design`), cỡ chữ input >= 16px, bổ sung hỗ trợ kết nối Local RPC Ganache/Hardhat trực tiếp (Dev Wallet Switcher cho 3 vai trò: Owner/Auctioneer, Bidder A/B, Guest/Restricted khi chạy trên trình duyệt không có extension MetaMask, bên cạnh kết nối `window.ethereum` chuẩn).
  - [x] Đảm bảo đầy đủ 6 tính năng `AC-FE-01..06` + nút quản trị Owner (`pause`, `unpause`, `cancelAuction`) & điều khiển thời gian Dev trên mạng `1337`.
  - [x] Kiểm thử tự động bằng Browser-Use & Playwright MCP trên 3 vai trò (Adversarial Role Matrix), Empty State, Boundary State và kiểm chứng hình học DOM (`overlap === 0`, `scrollWidth <= innerWidth` ở `375px`, `768px`, `1440px`, 0 console/network errors).

- [x] **Mục tiêu 5: Đóng gói Hồ sơ Bàn giao, Bằng chứng & Báo cáo Kỹ thuật 4–6 Trang (`AC-DEL-01..04`)**
  - [x] Tạo đầy đủ `docs/evidence/test-output.txt`, `docs/evidence/gas-report.txt`, `docs/evidence/coverage-output.txt`.
  - [x] Biên soạn bản Báo cáo Kỹ thuật hoàn chỉnh 4–6 trang tại `docs/report/technical-report.md` và cập nhật `docs/report/report-outline.md`.
  - [x] Đồng bộ hóa `docs/03-contract-spec.md`, `docs/08-frontend-spec.md`, `docs/09-demo-script.md`, `README.md` (xóa sạch mọi `SKELETON`/`TODO`/`TBD`).
  - [x] Tổng rà soát độc lập toàn bộ 27 tiêu chí `AC-*` từ máy sạch.
