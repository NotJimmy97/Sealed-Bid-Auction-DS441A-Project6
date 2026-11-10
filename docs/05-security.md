# 05 · Phân tích Bảo mật & Mô hình Đe dọa (Security Considerations)

Phân tích bảo mật cho `SealedBidAuction` và `EnglishAuction` theo khung STRIDE và các lỗ hổng đặc thù của EVM/Solidity `0.8.24`.

---

## 1. Bảng Mô hình Đe dọa & Biện pháp Giảm thiểu (Threat Matrix)

| # | Mối đe dọa (Threat) | Kịch bản tấn công | Tác động | Cơ chế phòng vệ trong Contract | Rủi ro còn lại (Residual Risk) |
|---|---|---|---|---|---|
| **T-01** | **Reentrancy** (Tái nhập khi rút tiền) | Contract độc hại đóng vai bidder, gọi `withdraw()` và trong `receive()` gọi ngược lại `withdraw()` trước khi số dư bị trừ. | Rút cạn toàn bộ ETH của hợp đồng. | 1. Mẫu **Pull-over-Push**: tách riêng `withdraw()`.<br>2. **CEI (Checks-Effects-Interactions)**: gán `pendingReturns[msg.sender] = 0` trước khi `.call{value}()`.<br>3. Modifier `nonReentrant` (OpenZeppelin v5 ERC-7201). | **0** (được kiểm chứng bằng hợp đồng tấn công ở `TC-SB-18`). |
| **T-02** | **Front-running / MEV** (Chặn đầu giao dịch) | Trong EnglishAuction, bot đọc mempool thấy bid của Alice và chèn tx với gas price cao hơn. | Alice thua ở block cuối hoặc phải trả giá đắt hơn. | Trong `SealedBidAuction`, `commitBid` chỉ gửi hash `bytes32` và `deposit`. Bot không biết `value` thật. Ở pha Reveal, giá đã khóa nên thứ tự reveal không làm thay đổi người thắng (trừ trường hợp bằng giá). | `msg.value` (deposit) hiển thị công khai tiết lộ **cận trên** của bid. Giảm thiểu bằng cách đặt `deposit > value`. |
| **T-03** | **Commit Copy / Replay Attack** | Kẻ tấn công copy nguyên `commitment` của Alice ở pha Bidding; đợi Alice reveal `(value, secret)` rồi gửi cùng cặp đó để đặt giá trùng. | Thao túng kết quả hoặc ăn theo thông tin định giá của Alice. | Công thức hash bắt buộc bind `msg.sender` và `address(this)`:<br>`keccak256(abi.encodePacked(value, secret, msg.sender, address(this)))`. | **0** (`TC-SB-08` chứng minh kẻ sao chép bị revert `InvalidReveal`). |
| **T-04** | **DoS qua vòng lặp hoặc Push Refund** | 1. Duyệt mảng `bidders[]` để hoàn tiền gây vượt Block Gas Limit.<br>2. Bidder là contract luôn `revert` trong `receive()`, làm kẹt hàm `revealBid` hoặc `auctionEnd`. | Đóng băng vĩnh viễn phiên đấu giá. | **Không dùng mảng/vòng lặp** (độ phức tạp $O(1)$ mọi hàm). Toàn bộ khoản hoàn trả được cộng vào `pendingReturns` để người dùng tự kéo về (`withdraw()`). | **0** (INV-7 trong `03-contract-spec.md`). |
| **T-05** | **Griefing qua Non-Reveal** (Đặt cọc ảo không mở) | Kẻ tấn công commit nhiều bid với giá cao nhưng cố tình không reveal để hù dọa đối thủ hoặc tạo "quyền chọn miễn phí". | Làm lệch tâm lý đấu giá, hủy hoại tính công bằng. | Biến `unrevealedDeposits` theo dõi tổng cọc chưa mở; khi `auctionEnd()`, toàn bộ khoản này **bị tịch thu (forfeited)** chuyển cho `beneficiary`. | Người dùng thật quên `secret` cũng bị mất cọc — giảm thiểu ở tầng UI bằng lưu tự động `localStorage` + tải file backup JSON. |
| **T-06** | **Thao túng `block.timestamp`** | Validator/Miner dịch chuyển `block.timestamp` trong biên độ ~15 giây để ép mở/đóng pha có lợi. | Gian lận ở sát ranh giới `biddingEnd` hoặc `revealEnd`. | Thời lượng mỗi pha (`biddingDuration`, `revealDuration`) trong thực tế đặt từ vài phút đến hàng giờ (>> 15s). | Không nên đặt duration < 60 giây trên mạng thực. |
| **T-07** | **Brute-force Hash Commitment** | Kẻ tấn công vét cạn `value` (vì mệnh giá ETH thường chẵn) nếu `secret` ngắn hoặc dễ đoán. | Lộ giá bid ngay trong pha Bidding. | Bắt buộc `secret` là `bytes32` sinh từ CSPRNG (`ethers.randomBytes(32)` — 256-bit entropy). | Nếu người dùng tự nhập secret yếu trên UI, entropy giảm; UI mặc định dùng nút sinh ngẫu nhiên 32 byte. |
| **T-08** | **Tràn số & Ép kiểu `uint96`** | Gửi `msg.value >= 2^96` làm tràn kiểu `uint96 deposit` khi đóng gói struct. | Ghi nhận thiếu tiền cọc, sai lệch kế toán. | Solidity `0.8.24` tự động kiểm tra tràn số học; ép kiểu `deposit` dùng `SafeCast.toUint96(msg.value)` ($2^{96}\text{ wei} \approx 79.2\text{ tỷ ETH}$, vượt tổng cung ETH). | **0**. |
| **T-09** | **Forced Ether (`selfdestruct` / coinbase)** | Kẻ tấn công ép gửi ETH vào contract mà không qua `commitBid()` nhằm phá vỡ điều kiện `address(this).balance == ...`. | Hỏng logic nếu contract dùng `address(this).balance` để tính toán. | Kế toán nội bộ tách biệt hoàn toàn qua `highestBid`, `unrevealedDeposits`, `pendingReturns`. Không bao giờ dùng `address(this).balance` trong biểu thức logic. | **0** (bất biến INV-1 dùng dấu $\ge$). |
| **T-10** | **Lạm quyền Quản trị (Admin Abuse)** | Owner hủy đấu giá sau khi đã thấy giá ở pha Reveal, hoặc `pause()` để khóa tiền người dùng. | Mất tính phi tập trung, giam tiền bidder. | 1. `cancelAuction()` chỉ gọi được khi `block.timestamp < biddingEnd` (`onlyBefore(biddingEnd)`).<br>2. `withdraw()` **không** gắn `whenNotPaused` — luôn rút được tiền kể cả khi contract đang pause. | Owner vẫn có thể pause trong pha Reveal để chặn reveal; trên thực tế nên giao `owner` cho Multisig/Timelock. |

---

## 2. Tóm tắt theo Khung STRIDE

- **Spoofing (Giả mạo)**: Chặn bằng chữ ký ECDSA của EVM (`msg.sender`) và ràng buộc `msg.sender` vào trong preimage của `commitment`.
- **Tampering (Sửa đổi dữ liệu)**: Cấu hình phiên (`beneficiary`, `biddingEnd`, `revealEnd`, `minIncrement`) dùng từ khóa `immutable` (ghi thẳng vào bytecode khi deploy, không thể sửa đổi).
- **Repudiation (Chối bỏ hành động)**: Mọi giao dịch thay đổi trạng thái đều phát sự kiện (`BidCommitted`, `BidRevealed`, `HighestBidIncreased`, `AuctionEnded`, `Withdrawal`, `AuctionCancelled`) lưu vết vĩnh viễn trên chuỗi.
- **Information Disclosure (Lộ thông tin)**: Giá bid được ẩn bằng hàm băm mật mã `keccak256` kèm salt 256-bit và cơ chế đặt cọc vượt mức (`deposit >= value`).
- **Denial of Service (Từ chối dịch vụ)**: Loại bỏ hoàn toàn vòng lặp và lệnh chuyển tiền cưỡng bức (Push); áp dụng Pull-Payment cô lập lỗi cho từng tài khoản.
- **Elevation of Privilege (Leo thang đặc quyền)**: Phân quyền qua `Ownable` (OpenZeppelin v5) và giới hạn chặt thời점 gọi hàm của chính `owner`.

---

## 3. Danh mục Kiểm tra Bảo mật Trước Bàn giao (Security Checklist)

| Kiểm tra | Bất biến / Test Case đối chiếu |
|---|---|
| Không có lệnh `.transfer()` / `.send()` (dễ gãy khi EIP-1884 đổi gas cost); chỉ dùng `.call{value: amount}("")` kèm kiểm tra `bool ok` | `SealedBidAuction.sol`, `EnglishAuction.sol` |
| Mọi đường rút tiền đều cập nhật state về `0` trước khi gọi ra ngoài (CEI) | `INV-1`, `TC-SB-18` |
| Không hàm nào chứa vòng lặp `for`/`while` phụ thuộc số lượng người chơi | `INV-7` |
| Không ai (kể cả `owner`) hủy được phiên sau khi bước sang pha Reveal | `TC-SB-11`, guard `onlyBefore(biddingEnd)` |
| Người dùng luôn rút được tiền của mình khi hợp đồng bị `pause()` hoặc `cancelAuction()` | `TC-SB-16`, `TC-SB-17` |
