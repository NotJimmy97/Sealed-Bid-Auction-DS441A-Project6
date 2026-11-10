# 09 · Kịch bản Live Demo 10 Phút trên Ganache

Kịch bản trình diễn trực tiếp đáp ứng **AC-DEL-04**, phân vai rõ ràng trên mạng cục bộ Ganache + MetaMask + DApp Frontend, kèm phương án dự phòng bằng CLI.

---

## 1. Phân vai & Dữ liệu Chuẩn bị

Khi khởi chạy `npm run node` (`ganache --chain.chainId 1337 --wallet.deterministic --wallet.totalAccounts 6`), các tài khoản có sẵn 1000 ETH:

| Vai trò | Tài khoản Ganache | Giá Bid thật (`value`) | Tiền cọc gửi (`deposit`) | Hành vi trong Demo | Kết quả kỳ vọng |
|---|---|---:|---:|---|---|
| **Auctioneer / Beneficiary** | Account #0 | — | — | Deploy hợp đồng, nhận tiền thắng cuộc + cọc bị tịch thu | Nhận `1.5 ETH` (từ B) + `2.0 ETH` (cọc phạt của C) = **`3.5 ETH`** |
| **Bidder A** (Trung thực, thua) | Account #1 | `1.0 ETH` | `1.0 ETH` | Commit đúng, Reveal đúng | Rút lại đủ **`1.0 ETH`** qua `withdraw()` |
| **Bidder B** (Trung thực, thắng, che giá) | Account #2 | `1.5 ETH` | `3.0 ETH` | Đặt cọc gấp đôi giá thật để ẩn cận trên; Reveal đúng | Thắng đấu giá; rút lại phần cọc dư **`1.5 ETH`** |
| **Bidder C** (Gian lận / Bỏ cuộc) | Account #3 | `2.0 ETH` | `2.0 ETH` | Thử Reveal sai `secret` (bị Revert `InvalidReveal`), sau đó hết giờ không reveal | Bị tịch thu **`2.0 ETH`** tiền cọc chuyển cho Beneficiary |

---

## 2. Chuẩn bị Trước Giờ Trình diễn (Pre-Demo Checklist — 2 phút trước khi bấm giờ)

1. **Terminal 1 — Khởi chạy Ganache**:
   ```bash
   npm run node
   ```
2. **Terminal 2 — Deploy hợp đồng với thời lượng ngắn phục vụ Demo (90s Bidding + 90s Reveal)**:
   ```bash
   BIDDING_DURATION=90 REVEAL_DURATION=90 npm run deploy:ganache
   ```
3. **Terminal 3 — Mở giao diện DApp**:
   ```bash
   npm run frontend
   # Mở trình duyệt tại http://localhost:5173
   ```
4. **MetaMask**: Đảm bảo đã import Private Key của Account #0, #1, #2, #3 từ màn hình Ganache và đang chọn mạng `Ganache Local (chainId 1337)`.

---

## 3. Dòng thời gian Trình diễn Chi tiết (10 Phút)

| Phút | Giai đoạn | Thao tác trực tiếp trên màn hình | Điểm nhấn thuyết trình & Quan sát trên UI |
|---|---|---|---|
| **00:00 – 01:30** | **Mở đầu & Kiến trúc** | Trình chiếu nhanh sơ đồ Commit-Reveal ([`docs/04-diagrams.md`](04-diagrams.md)) và giao diện DApp vừa kết nối Account #0. | Giải thích tại sao đấu giá mở bị bot MEV front-run và cách `commitment = keccak256(value, secret, bidder, auction)` khóa thông tin. Chỉ ra `#phase-label = Bidding` và đồng hồ đếm ngược. |
| **01:30 – 04:00** | **Pha 1: Commit 3 lượt bid ẩn danh** | • **Chuyển MetaMask sang Account #1 (Bidder A)**: Nhập `Giá bid = 1.0`, `Tiền cọc = 1.0`, bấm **Tạo** secret -> bấm **Gửi commit**.<br>• **Chuyển sang Account #2 (Bidder B)**: Nhập `Giá bid = 1.5`, `Tiền cọc = 3.0`, bấm **Tạo** -> **Tải file secret** -> **Gửi commit**.<br>• **Chuyển sang Account #3 (Bidder C)**: Nhập `Giá bid = 2.0`, `Tiền cọc = 2.0`, bấm **Tạo** -> **Gửi commit**. | • Quan sát `#event-log` hiện 3 sự kiện `BidCommitted` với chuỗi hash `0x...` hoàn toàn không thể suy ngược ra giá.<br>• Nhấn mạnh: Dù Bidder B đặt cọc 3.0 ETH cao hơn Bidder C (2.0 ETH), không ai biết giá thật của B chỉ là 1.5 ETH.<br>• `#highest-bid` vẫn hiển thị `0.0 ETH`. |
| **04:00 – 07:00** | **Pha 2: Reveal hợp lệ & Bắt lỗi gian lận** | *(Đợi đồng hồ qua mốc 90s hoặc chạy lệnh tua thời gian ở Mục 4)* -> `#phase-label` chuyển sang **Reveal**.<br>• **Account #1 (A)**: Bấm **Điền từ bản lưu** -> bấm **Reveal**. Thành công!<br>• **Account #3 (C — Demo Revert)**: Bấm **Điền từ bản lưu**, cố tình sửa 1 ký tự cuối của `Secret` (hoặc nâng `Giá bid` lên `2.5`) -> bấm **Reveal**.<br>• **Account #2 (B)**: Bấm **Điền từ bản lưu** (`value=1.5`) -> bấm **Reveal**. | • Sau khi A reveal: `#highest-bid` tăng lên `1.0 ETH`.<br>• Khi C sửa secret/value: MetaMask/UI bật `#toast` màu đỏ báo **`InvalidReveal()`** — chứng minh hợp đồng chặn đứng hành vi đổi giá sau khi đã cam kết.<br>• Sau khi B reveal `1.5 ETH`: `#highest-bid` cập nhật thành `1.5 ETH`, đồng thời `#pending-returns` của B lập tức có `1.5 ETH` (phần cọc dư `3.0 - 1.5`) và của A có `1.0 ETH`. |
| **07:00 – 09:00** | **Pha 3: Kết thúc & Rút tiền Pull-Payment** | *(Đợi hết 90s pha Reveal)* -> `#phase-label` chuyển sang **Ended** (C không reveal kịp).<br>• Bấm nút **`auctionEnd()`**: Sự kiện `AuctionEnded(winner: B, amount: 1.5 ETH)` xuất hiện.<br>• **Account #1 (A)**: Thấy `#pending-returns = 1.0 ETH` -> bấm **Withdraw**.<br>• **Account #2 (B)**: Thấy `#pending-returns = 1.5 ETH` -> bấm **Withdraw**.<br>• **Account #0 (Beneficiary)**: Thấy `#pending-returns = 3.5 ETH` -> bấm **Withdraw**. | • Giải thích tại sao Beneficiary nhận được `3.5 ETH` (`1.5 ETH` tiền thắng của B + `2.0 ETH` tiền cọc bị tịch thu của C do không reveal).<br>• Giải thích mẫu **Pull-over-Push**: mỗi người tự bấm `Withdraw`, nếu 1 người gặp lỗi không làm ảnh hưởng người khác. |
| **09:00 – 10:00** | **Tổng kết & Đối chiếu Gas / Tests** | Chuyển sang Terminal chạy nhanh `npm test` (`28 passing`), `npm run coverage` (`100% coverage`) hoặc chiếu bảng kết quả kiểm thử tự động & số liệu Gas trong [`docs/report/technical-report.md`](report/technical-report.md). | Tóm tắt 3 ưu thế đã chứng minh: Bảo mật thông tin giá, Chống Reentrancy/DoS bằng Pull-Payment, và Tối ưu Gas qua Struct Packing + Custom Errors (`-13.77%` deploy gas, `-20.08%` lifecycle gas). |

---

## 4. Mẹo Kỹ thuật & Phương án Dự phòng (Troubleshooting)

1. **Tua nhanh thời gian trên Ganache không cần chờ 90 giây**:
   Có thể bấm trực tiếp nút **Tua tới Pha Reveal** (`#btn-advance-reveal`) / **Tua tới Pha Ended** (`#btn-advance-end`) ngay trên giao diện DApp, hoặc mở một terminal phụ và chạy:
   ```bash
   npx hardhat console --network ganache
   > await network.provider.send("evm_increaseTime", [95])
   > await network.provider.send("evm_mine", [])
   ```
2. **Lỗi lệch Nonce trên MetaMask sau khi khởi động lại Ganache**:
   Vào MetaMask → *Settings* → *Advanced* → bấm **Clear activity tab data** (Reset account), hoặc sử dụng trực tiếp bộ chọn vai trò `#role-selector` (Dual-Mode Local RPC) trên thanh đầu trang.
3. **Phương án dự phòng bằng CLI (`scripts/demo-scenario.js`)**:
   Nếu trình duyệt hoặc tiện ích MetaMask gặp sự cố ngoài ý muốn, toàn bộ kịch bản 4 vai trên có thể chạy tự động 100% trên terminal bằng lệnh:
   ```bash
   npm run demo
   ```
   Bằng chứng log thực thi chuẩn đã được lưu tại [`docs/evidence/demo-output.txt`](evidence/demo-output.txt) (cùng bộ bằng chứng [`test-output.txt`](evidence/test-output.txt), [`gas-report.txt`](evidence/gas-report.txt), [`coverage-output.txt`](evidence/coverage-output.txt)).
