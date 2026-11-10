# 07 · Kế hoạch Kiểm thử Tự động (Automated Test Plan)

Tài liệu định nghĩa ma trận kiểm thử cho `test/SealedBidAuction.test.js` và `test/EnglishAuction.test.js`, ánh xạ trực tiếp tới các tiêu chí nghiệm thu trong [01-requirements.md](01-requirements.md).

---

## 1. Công cụ & Quy ước

- **Framework**: Hardhat 2 + Mocha + Chai (`@nomicfoundation/hardhat-chai-matchers`) + `@nomicfoundation/hardhat-network-helpers` (`loadFixture`, `time.increaseTo`, `time.latest`).
- **Tách biệt trạng thái**: Mọi test case khởi tạo qua `loadFixture(deployFixture)` để chạy từ snapshot sạch, không phụ thuộc thứ tự.
- **Lệnh thực thi**:
  ```bash
  npm test                  # chạy toàn bộ unit + integration tests
  npm run coverage          # đo độ bao phủ bằng solidity-coverage
  npm run gas               # chạy test kèm bảng đo gas
  ```
- **Mục tiêu độ bao phủ (AC-QA-05)**: Statements $\ge 95\%$, Branches $\ge 90\%$, Functions $100\%$ trên cả `SealedBidAuction.sol` và `EnglishAuction.sol`.

---

## 2. Ma trận Test Cases — `SealedBidAuction` (`test/SealedBidAuction.test.js`)

| Test ID | Nhóm | Mô tả & Các bước chính | Kết quả Kỳ vọng (Expected Assertion) | Ánh xạ AC |
|---|---|---|---|---|
| **TC-SB-00** | Deployment | Deploy với `biddingDuration=300`, `revealDuration=300`, `beneficiary` | `owner`, `beneficiary`, `biddingEnd`, `revealEnd` đúng; `currentPhase() == Phase.Bidding (0)` | AC-SC-06 |
| **TC-SB-00b** | Deployment | Tua thời gian qua `biddingEnd` rồi `revealEnd` | `currentPhase()` chuyển lần lượt `0 -> 1 (Reveal) -> 2 (Ended)` | AC-SC-06 |
| **TC-SB-00c** | Helper | Gọi `makeCommitment(value, secret, bidder, auction)` cho Alice và Bob | Trả về chuỗi hex 32 byte hợp lệ; hash của Alice $\ne$ hash của Bob dù cùng `(value, secret)` | AC-SC-02 |
| **TC-SB-01** | Happy Path | 1. Alice commit (value=1, deposit=1), Bob commit (value=2, deposit=3), Carol commit (value=1.5, deposit=1.5).<br>2. Tua tới `biddingEnd`.<br>3. Cả 3 reveal hợp lệ.<br>4. Tua tới `revealEnd`, gọi `auctionEnd()`.<br>5. Alice, Carol, Bob (phần dư 1 ETH) và `beneficiary` (2 ETH) gọi `withdraw()`. | • `highestBidder == Bob`, `highestBid == 2 ETH`.<br>• Phát đầy đủ `BidCommitted`, `BidRevealed`, `HighestBidIncreased`, `AuctionEnded`, `Withdrawal`.<br>• Biến động số dư ETH thực tế khớp tuyệt đối (`changeEtherBalances`). | AC-SC-01, AC-SC-03, AC-SC-04, AC-SC-05, AC-SC-08, AC-QA-01 |
| **TC-SB-02** | Phase Revert #1 | Tua `time.increaseTo(biddingEnd)` rồi gọi `commitBid` | Revert `revertedWithCustomError(auction, "TooLate")` | AC-SC-01, AC-QA-02 |
| **TC-SB-03** | Phase Revert #2 | Gọi `revealBid` khi `block.timestamp < biddingEnd` | Revert `revertedWithCustomError(auction, "TooEarly")` | AC-SC-03, AC-QA-02 |
| **TC-SB-04** | Phase Revert #3 | Gọi `auctionEnd` khi `block.timestamp < revealEnd` | Revert `revertedWithCustomError(auction, "TooEarly")` | AC-SC-05, AC-QA-02 |
| **TC-SB-05** | Phase Revert #4 | Tua `time.increaseTo(revealEnd)` rồi gọi `revealBid` | Revert `revertedWithCustomError(auction, "TooLate")` | AC-SC-03, AC-QA-02 |
| **TC-SB-06** | Fraud Revert #1 | Alice commit với `secret1`, sang pha Reveal gửi `secret2` | Revert `revertedWithCustomError(auction, "InvalidReveal")` | AC-SC-03, AC-QA-03 |
| **TC-SB-07** | Fraud Revert #2 | Alice commit `value = 1 ETH`, sang pha Reveal khai `value = 2 ETH` | Revert `revertedWithCustomError(auction, "InvalidReveal")` | AC-SC-03, AC-QA-03 |
| **TC-SB-08** | Fraud Revert #3 | Attacker copy nguyên `bytes32 commitment` của Alice để `commitBid`, sau đó gọi `revealBid(value_Alice, secret_Alice)` | Revert `revertedWithCustomError(auction, "InvalidReveal")` (do `msg.sender` khác nhau) | AC-SC-02, AC-QA-03 |
| **TC-SB-09** | Fraud Revert #4 | Alice commit hash của `value = 2 ETH` nhưng chỉ gửi `msg.value = 1 ETH` lúc commit; sang pha Reveal mở `(2 ETH, secret)` | Revert `revertedWithCustomError(auction, "InsufficientDeposit")` với tham số `(1 ETH, 2 ETH)` | AC-SC-03, AC-QA-03 |
| **TC-SB-10** | Access / Pull #1 | Tài khoản có `pendingReturns == 0` gọi `withdraw()` | Revert `revertedWithCustomError(auction, "NothingToWithdraw")` | AC-SC-04, AC-QA-04 |
| **TC-SB-11** | Access / Pull #2 | Tài khoản không phải `owner` gọi `pause()`, `unpause()`, hoặc `cancelAuction()` | Revert `revertedWithCustomError(auction, "OwnableUnauthorizedAccount")` | AC-SC-07, AC-QA-04 |
| **TC-SB-12** | Guard | Cùng 1 địa chỉ gọi `commitBid` lần thứ 2 trong pha Bidding (hoặc gửi commitment=0 / deposit=0) | Revert `AlreadyCommitted` (và `ZeroCommitment`, `ZeroDeposit`) | AC-SC-01 |
| **TC-SB-13** | Guard | Alice gọi `revealBid` hợp lệ 2 lần liên tiếp (hoặc người chưa commit gọi `revealBid`) | Revert `AlreadyRevealed` (và `NoCommitment`) | AC-SC-03 |
| **TC-SB-14** | Guard | Gọi `auctionEnd()` lần thứ 2 sau khi đã kết thúc | Revert `revertedWithCustomError(auction, "AuctionAlreadyEnded")` | AC-SC-05 |
| **TC-SB-15** | Forfeit Policy | Alice reveal 1 ETH (thắng), Carol commit 2 ETH nhưng **không reveal**; gọi `auctionEnd()` | `pendingReturns[beneficiary] == 1 ETH + 2 ETH = 3 ETH`; `unrevealedDeposits == 0` | AC-SC-05 |
| **TC-SB-16** | Cancel Flow | Alice commit 2 ETH; `owner` gọi `cancelAuction()` trước `biddingEnd`; Alice gọi `withdraw()` | `currentPhase() == Phase.Cancelled`; Alice nhận lại đủ 2 ETH; gọi `commitBid`/`revealBid` sau đó revert `AuctionCancelledError` | AC-SC-06, AC-SC-07 |
| **TC-SB-17** | Emergency Pause | `owner` gọi `pause()`; thử `commitBid` (bị chặn), nhưng người có `pendingReturns > 0` gọi `withdraw()` | `commitBid` revert `EnforcedPause`; `withdraw()` **thành công** | AC-SC-04, AC-SC-07 |
| **TC-SB-18** | Reentrancy | Deploy contract độc hại tự gọi lại `auction.withdraw()` trong hàm `receive()` | Cuộc gọi tái nhập bị chặn, số dư hợp đồng không bị rút lố (`INV-1` giữ nguyên) | AC-SC-04 |
| **TC-SB-19** | Tie-Break | Alice và Bob cùng commit `value = 2 ETH`; Alice reveal trước, Bob reveal sau | `highestBidder` giữ nguyên là Alice; toàn bộ deposit của Bob chuyển vào `pendingReturns[Bob]` | AC-SC-03 |

---

## 3. Ma trận Test Cases — `EnglishAuction` (`test/EnglishAuction.test.js`)

| Test ID | Nhóm | Mô tả & Các bước chính | Kết quả Kỳ vọng | Ánh xạ AC |
|---|---|---|---|---|
| **TC-EN-00** | Deployment | Deploy với `biddingDuration`, `minIncrement`, `beneficiary` | Tham số `immutable` khớp; `minNextBid() == 1 wei` | AC-SC-09 |
| **TC-EN-01** | Happy Path | Alice bid 1.0 ETH -> Bob bid 1.5 ETH -> tua qua `biddingEnd` -> `auctionEnd()` -> Alice & `beneficiary` gọi `withdraw()` | `highestBidder == Bob`, `highestBid == 1.5 ETH`; Alice rút 1.0 ETH, `beneficiary` rút 1.5 ETH | AC-SC-09, AC-QA-01 |
| **TC-EN-02** | Revert | Alice đã bid 1.0 ETH; Bob gửi `1.0 ETH + minIncrement - 1 wei` | Revert `revertedWithCustomError(auction, "BidTooLow")` | AC-SC-09 |
| **TC-EN-03** | Pull Refund | Alice bị Bob vượt giá, gọi `withdraw()` ngay khi phiên còn đang diễn ra | Alice nhận lại 1.0 ETH; gọi `withdraw()` lần 2 revert `NothingToWithdraw` | AC-SC-04, AC-SC-09 |
| **TC-EN-04** | Phase Revert | Gọi `bid()` sau `biddingEnd` hoặc gọi `auctionEnd()` trước `biddingEnd` | Revert `TooLate` / `TooEarly` | AC-SC-09, AC-QA-02 |
| **TC-EN-05** | Guard | Gọi `auctionEnd()` lần thứ 2 | Revert `AuctionAlreadyEnded` | AC-SC-09 |

---

## 4. Thu thập Bằng chứng Kiểm thử cho Bàn giao (AC-DEL-02)

Sau khi toàn bộ 28 test cases đạt trạng thái passing, lưu nhật ký kiểm thử làm minh chứng nộp kèm báo cáo:

```bash
mkdir -p docs/evidence
npx hardhat test > docs/evidence/test-output.txt
REPORT_GAS=true GAS_REPORT_FILE=docs/evidence/gas-report.txt npx hardhat test
npx hardhat coverage > docs/evidence/coverage-output.txt
```
