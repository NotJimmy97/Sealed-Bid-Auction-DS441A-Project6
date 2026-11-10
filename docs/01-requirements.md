# 01 · Yêu cầu & Tiêu chí nghiệm thu

> Mỗi tiêu chí có ID để truy vết sang test case ([07-test-plan.md](07-test-plan.md)) và báo cáo. Một tiêu chí chỉ "đạt" khi cột *Kiểm chứng* cho kết quả khách quan.

## 1. Mục tiêu

1. Xây dựng **SealedBidAuction** theo cơ chế Commit-Reveal: giá thật ẩn ngoài chuỗi tới pha Reveal, hoàn tiền theo Pull-Payment.
2. Xây dựng **EnglishAuction** (đấu giá mở) làm baseline để so sánh gas, bảo mật, lý thuyết trò chơi.
3. Kiểm thử tự động bằng Hardhat/Mocha/Chai, đo coverage và gas, áp dụng ≥1 kỹ thuật tối ưu gas có số liệu trước/sau.
4. DApp HTML/JS + ethers v6 + MetaMask chạy trên Ganache.
5. Bàn giao: repo, kết quả test, báo cáo 4–6 trang, demo 10 phút.

## 2. Phạm vi

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| 1 phiên đấu giá / 1 lần deploy, 1 bid / địa chỉ | Factory nhiều phiên, NFT/ERC-721 làm tài sản đấu giá |
| ETH làm tiền tệ | ERC-20, đa tiền tệ |
| Ganache local (chainId 1337) | Testnet/mainnet, MEV relay riêng tư |
| Đấu giá giá thứ nhất (first-price) | Vickrey (second-price) — chỉ thảo luận trong báo cáo |

## 3. Tiêu chí nghiệm thu

### 3.1 Smart contract (AC-SC)

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-SC-01 | `commitBid(bytes32)` lưu commitment + deposit, chỉ trong pha Bidding | TC-SB-01, TC-SB-02 |
| AC-SC-02 | Commitment = `keccak256(abi.encodePacked(value, secret, bidder, auction))`; sao chép commitment của người khác không reveal được | TC-SB-08, TC-SB-00c |
| AC-SC-03 | `revealBid(value, secret)` chỉ trong pha Reveal, kiểm hash và `deposit ≥ value`, cập nhật `highestBid/highestBidder` | TC-SB-01, 03, 05, 06, 07, 09 |
| AC-SC-04 | Toàn bộ hoàn tiền qua `withdraw()` (Pull-Payment), CEI + `nonReentrant` | TC-SB-10, TC-SB-18 |
| AC-SC-05 | `auctionEnd()` chỉ sau `revealEnd`, đúng 1 lần, ghi có `highestBid` + cọc chưa reveal cho beneficiary | TC-SB-04, 14, 15 |
| AC-SC-06 | FSM `Bidding → Reveal → Ended` suy ra từ `block.timestamp`; `Cancelled` khi owner hủy trong Bidding | TC-SB-00b, TC-SB-16 |
| AC-SC-07 | Hàm quản trị (`pause`, `unpause`, `cancelAuction`) chỉ owner | TC-SB-11 |
| AC-SC-08 | Mọi thay đổi trạng thái phát event (`BidCommitted`, `BidRevealed`, `HighestBidIncreased`, `AuctionEnded`, `Withdrawal`, `AuctionCancelled`) | TC-SB-01 (assert `emit`) |
| AC-SC-09 | EnglishAuction: bid sau ≥ `highestBid + minIncrement`, người bị vượt giá rút qua `withdraw()` | TC-EN-01..05 |
| AC-SC-10 | Solidity 0.8.x, custom errors, NatSpec đầy đủ cho mọi hàm public/external | `npx hardhat compile` + review |

### 3.2 Kiểm thử (AC-QA)

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-QA-01 | Happy path end-to-end pass | TC-SB-01, TC-EN-01 |
| AC-QA-02 | Revert sai pha thời gian được bắt đúng custom error | TC-SB-02..05, TC-EN-04 |
| AC-QA-03 | Revert gian lận reveal (sai secret/value, thiếu cọc, copy commit) | TC-SB-06..09 |
| AC-QA-04 | Revert access control / rút tiền khi số dư 0 | TC-SB-10, 11 |
| AC-QA-05 | `npx hardhat test` 0 failing; coverage statements ≥ 95%, branches ≥ 90% cho 2 contract | `npm run coverage` |

### 3.3 Gas (AC-GAS)

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-GAS-01 | Bảng gas min/avg/max cho `commitBid`, `revealBid`, `withdraw`, `auctionEnd`, `bid` (English) | `npm run gas` → [06](06-gas-optimization.md) |
| AC-GAS-02 | ≥1 kỹ thuật tối ưu có số liệu trước/sau và giải trình | [06](06-gas-optimization.md) §4 |

### 3.4 Frontend (AC-FE)

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-FE-01 | Kết nối MetaMask, hiển thị tài khoản, phát hiện/chuyển mạng Ganache 1337 | Demo + [08](08-frontend-spec.md) |
| AC-FE-02 | Hiển thị pha + thời gian còn lại | `#phase-label`, `#countdown` |
| AC-FE-03 | Tạo secret + commitment ngoài chuỗi, gửi commit kèm cọc | `#commit-hash` khớp `test/helpers/commit.js` |
| AC-FE-04 | Form reveal (điền từ bản lưu) | `#btn-reveal` |
| AC-FE-05 | Hiển thị `pendingReturns`, nút withdraw | `#pending-returns` |
| AC-FE-06 | Log sự kiện thời gian thực | `#event-log` |

### 3.5 Bàn giao (AC-DEL)

| ID | Tiêu chí | Kiểm chứng |
|---|---|---|
| AC-DEL-01 | Repo đúng cấu trúc `contracts/ test/ scripts/ frontend/ docs/`, README chạy được từ máy sạch | Làm theo README trên máy khác |
| AC-DEL-02 | Log test 100% pass + ≥3 ca revert lưu ở `docs/evidence/` | file `test-output.txt` |
| AC-DEL-03 | Báo cáo 4–6 trang theo [report-outline](report/report-outline.md) | PDF |
| AC-DEL-04 | Demo 10 phút theo [09-demo-script.md](09-demo-script.md) | Diễn tập ≥1 lần |
