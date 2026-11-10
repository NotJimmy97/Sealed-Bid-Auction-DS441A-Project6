# 06 · Phân tích & Tối ưu hóa Chi phí Gas (Gas Cost Analysis)

Tài liệu báo cáo phương pháp đo kiểm Gas, số liệu thực nghiệm trích xuất từ bộ kiểm thử tự động (`docs/evidence/gas-report.txt`), và giải trình định lượng 04 kỹ thuật tối ưu hóa đã áp dụng trong `SealedBidAuction.sol` và `EnglishAuction.sol`.

---

## 1. Phương pháp & Môi trường Đo lường

- **Công cụ**: `hardhat-gas-reporter` (tích hợp trong `@nomicfoundation/hardhat-toolbox`).
- **Trình biên dịch**: Solidity `0.8.24`, `optimizer: { enabled: true, runs: 200 }`, EVM target `paris`, Block gas limit `60,000,000`.
- **Lệnh chạy đo kiểm**:
  ```bash
  npm run gas
  # Xuất báo cáo bằng chứng phục vụ nghiệm thu:
  CI=true REPORT_GAS=true GAS_REPORT_FILE=docs/evidence/gas-report.txt npx hardhat test
  ```
- **Lưu ý mạng**: Chi phí gas của các opcode EVM trên Hardhat Network và Ganache là tương đương nhau vì cùng tuân theo bảng phí EVM chuẩn (EIP-2929 / EIP-3529: `SSTORE` zero $\to$ non-zero = `20,000` gas, `SSTORE` cập nhật warm = `2,900` gas, `SLOAD` cold = `2,100` gas, `SLOAD` warm = `100` gas, `SSTORE` xóa về zero hoàn trả `4,800` gas, base tx = `21,000` gas).

---

## 2. Bảng Chi phí Gas theo Hàm (`AC-GAS-01`)

Số liệu thực tế trích xuất trực tiếp từ `docs/evidence/gas-report.txt` trên 28 kịch bản kiểm thử tự động:

| Hợp đồng | Hàm | Min Gas | Max Gas | Avg Gas | Số lời gọi (Calls) | Giải thích biến thiên Min/Max |
|---|---|---:|---:|---:|---:|---|
| `SealedBidAuction` | `deploy` | `1,059,725` | `1,059,725` | `1,059,725` | `18` | Khởi tạo `Ownable`, `Pausable`, `ReentrancyGuard` và gán 3 biến `immutable` (`beneficiary`, `biddingEnd`, `revealEnd`) — chiếm `1.8%` block limit |
| `SealedBidAuction` | `commitBid(bytes32)` | `77,683` | `94,795` | `88,846` | `23` | Lần commit đầu tiên trong phiên khởi tạo `unrevealedDeposits` (0 $\to$ non-zero: `+17,100` gas so với lần cập nhật sau) |
| `SealedBidAuction` | `revealBid(uint256,bytes32)` | `60,807` | `107,447` | `82,154` | `16` | **Max (`107,447`)** khi bid vượt `highestBid` (ghi mới `highestBid`, `highestBidder`, cộng `pendingReturns` phần cọc dư); **Min (`60,807`)** khi bid thua và `unrevealedDeposits` còn khác 0 |
| `SealedBidAuction` | `auctionEnd()` | `49,731` | `54,921` | `52,445` | `5` | Ghi `ended = true` (chung slot với `highestBidder`), cộng `pendingReturns[beneficiary]`, xóa `unrevealedDeposits = 0` (nhận `4,800` gas refund khi có cọc bị tịch thu) |
| `SealedBidAuction` | `withdraw()` | `34,494` | `42,428` | `35,937` | `22` | **Min (`34,494`)** khi rút `pendingReturns` thông thường (nhận `4,800` gas refund EIP-3529); **Max (`42,428`)** khi rút cọc sau `cancelAuction()` (cập nhật thêm `bids[msg.sender]`) |
| `SealedBidAuction` | `cancelAuction()` | `46,557` | `46,557` | `46,557` | `2` | Kiểm tra `onlyOwner`, ghi `cancelled = true` và phát sự kiện `AuctionCancelled` |
| `SealedBidAuction` | `pause()` | `27,736` | `27,736` | `27,736` | `2` | Ghi cờ `_paused = true` của OpenZeppelin `Pausable` (chung slot với `_owner`) |
| `SealedBidAuction` | `unpause()` | `27,707` | `27,707` | `27,707` | `1` | Xóa cờ `_paused = false` (nhận gas refund xóa trạng thái) |
| `EnglishAuction` | `deploy` | `557,325` | `557,325` | `557,325` | `6` | Bytecode nhỏ hơn `47.4%` so với `SealedBidAuction` vì không có pha Reveal và `Pausable` (`0.9%` block limit) |
| `EnglishAuction` | `bid()` | `55,648` | `67,175` | `60,588` | `7` | **Max (`67,175`)** ở lượt bid đầu tiên khởi tạo `highestBid` và `highestBidder` (0 $\to$ non-zero); **Min (`55,648`)** ở các lượt nâng giá kế tiếp |
| `EnglishAuction` | `auctionEnd()` | `47,224` | `52,517` | `49,871` | `4` | Ghi `ended = true`, cộng `pendingReturns[beneficiary] += highestBid` |
| `EnglishAuction` | `withdraw()` | `32,398` | `32,398` | `32,398` | `12` | Xóa `pendingReturns[msg.sender] = 0` (`4,800` gas refund) + `.call{value}` chuyển ETH |

---

## 3. So sánh Tổng Gas trên mỗi Người chơi: Sealed-Bid vs English Auction

Sử dụng số liệu **Avg Gas** đo được ở Mục 2 để tính tổng chi phí gas cho một người chơi trong suốt phiên đấu giá:

- **Sealed-Bid Auction**: Mỗi người chơi thực hiện cố định **2 giao dịch ghi trạng thái** (`commitBid` + `revealBid`) và **1 giao dịch rút tiền** (`withdraw` nếu thua cuộc hoặc đặt cọc lớn hơn giá bid thật để che giấu định giá):
  $$\text{Gas}_{\text{Sealed}}(\text{bidder}) = \underbrace{88,846}_{\text{commitBid}} + \underbrace{82,154}_{\text{revealBid}} + \underbrace{35,937}_{\text{withdraw}} = \mathbf{206,937\text{ gas}}$$
  *(Trường hợp người thắng đặt cọc đúng bằng giá bid thật `deposit == value` và không cần gọi `withdraw()`: $\text{Gas}_{\text{Sealed}} = 88,846 + 82,154 = \mathbf{171,000\text{ gas}}$).*

- **English Auction**: Mỗi lượt nâng giá tốn trung bình `60,588` gas cho `bid()`, cộng thêm `32,398` gas khi gọi `withdraw()` để rút lại tiền sau khi bị người khác vượt giá. Nếu một người chơi nâng giá $k$ lần trong cuộc đua giá:
  $$\text{Gas}_{\text{English}}(k) = k \times 60,588 + 32,398$$

| Số lượt trả giá ($k$) của 1 Bidder | Tổng Gas `EnglishAuction` ($k \times \text{bid} + \text{withdraw}$) | Tổng Gas `SealedBidAuction` (`commit` + `reveal` + `withdraw`) | Chênh lệch (`English` $-$ `Sealed`) | Nhận xét |
|---:|---:|---:|---:|---|
| $k = 1$ | `92,986` gas | `206,937` gas | `-113,951` gas (`-55.07%`) | English Auction tiết kiệm hơn khi mỗi người chỉ trả giá đúng 1 lần |
| $k = 2$ | `153,574` gas | `206,937` gas | `-53,363` gas (`-25.79%`) | Khoảng cách thu hẹp khi có 1 lượt trả giá đáp trả |
| $k = 3$ | `214,162` gas | `206,937` gas | **`+7,225` gas (`+3.49%`)** | **Điểm đảo chiều ($k \ge 3$)**: English Auction bắt đầu tốn nhiều gas hơn Sealed-Bid |
| $k = 4$ | `274,750` gas | `206,937` gas | **`+67,813` gas (`+32.77%`)** | Chi phí English Auction tăng tuyến tính theo cường độ cạnh tranh |

**Kết luận kinh tế học & kỹ thuật**: Điểm hòa vốn gas nằm ở $k^* = \frac{206,937 - 32,398}{60,588} \approx 2.88$ lượt bid/người. Từ lượt nâng giá thứ 3 trở đi ($k \ge 3$), `SealedBidAuction` không chỉ bảo vệ quyền riêng tư giá và chống MEV/sniping mà còn **rẻ gas hơn** `EnglishAuction`, đồng thời loại bỏ hoàn toàn chi phí gas lãng phí do giao dịch `bid()` bị revert khi hai người cùng gửi lệnh nâng giá trong một block.

---

## 4. Giải trình 04 Kỹ thuật Tối ưu hóa Gas đã Áp dụng (`AC-GAS-02`)

Để định lượng chính xác hiệu quả của từng kỹ thuật, nhóm thực hiện benchmark đối chứng trên cùng kịch bản giao dịch chuẩn (3 bidder commit cọc 6 ETH $\to$ 2 bidder reveal giá 2 ETH và 5 ETH, 1 bidder bỏ cọc $\to$ `auctionEnd()`, kèm kịch bản gọi revert) giữa hợp đồng `SealedBidAuction` đã tối ưu và các biến thể baseline chưa tối ưu.

### Kỹ thuật 1: Đóng gói Struct & Biến Trạng thái (Storage Variable Packing)

- **Trước tối ưu (Unpacked — 3 slots / `Bid` + 3 slots rời cho biến trạng thái)**:
  ```solidity
  struct BidUnpacked {
      bytes32 commitment; // Slot 0 (32 bytes)
      uint256 deposit;    // Slot 1 (32 bytes)
      bool    revealed;   // Slot 2 (1 byte, lãng phí 31 bytes)
  }
  ```
  Và các biến `highestBidder` (`address`), `ended` (`bool`), `cancelled` (`bool`) nằm xen kẽ với `uint256` nên chiếm 3 storage slot riêng biệt.
- **Sau tối ưu (Packed — 2 slots / `Bid` + 1 slot chung cho biến trạng thái)**:
  ```solidity
  struct Bid {
      bytes32 commitment; // Slot 0 (32 bytes)
      uint96  deposit;    // Slot 1 (12 bytes) — tối đa ~79.2 tỷ ETH, dư cho tổng cung ETH
      bool    revealed;   // Slot 1 (1 byte)   — đóng gói chung Slot 1 với deposit
  }
  ```
  Đồng thời ở cấp contract, `address highestBidder` (20B) + `bool ended` (1B) + `bool cancelled` (1B) được xếp liền kề trong **1 slot duy nhất** (22/32 bytes).
- **Hiệu quả thực nghiệm**:
  - Trong `commitBid` (Avg): Giảm từ `85,448` gas xuống `83,391` gas (**tiết kiệm `2,057` gas / tx**, `-2.41%`).
  - Trong `revealBid` (Avg): Giảm từ `114,080` gas xuống `93,044` gas (**tiết kiệm `21,036` gas / tx**, `-18.44%`). Nguyên nhân: ở bản Unpacked, lệnh `b.revealed = true` phải ghi vào một slot thứ 3 hoàn toàn mới (0 $\to$ non-zero `SSTORE` tốn `22,100` gas); trong khi ở bản Packed, `b.revealed` nằm chung slot đã khác 0 và đã warm của `b.deposit`, chỉ tốn `100` gas cập nhật!
  - Trong `auctionEnd`: Giảm từ `73,975` gas xuống `52,921` gas (**tiết kiệm `21,054` gas**, `-28.46%`) nhờ ghi `ended = true` vào cùng slot đã khác 0 của `highestBidder` thay vì khởi tạo một slot 0 $\to$ non-zero mới.

### Kỹ thuật 2: Sử dụng `immutable` cho Cấu hình Phiên (`beneficiary`, `biddingEnd`, `revealEnd`)

- **Trước tối ưu**: Lưu `beneficiary`, `biddingEnd`, `revealEnd` làm biến storage thông thường $\to$ mỗi giao dịch phải thực hiện `SLOAD` cold (`2,100` gas/lần) để kiểm tra modifier `onlyBefore` / `onlyAfter` và trả tiền cho `beneficiary`.
- **Sau tối ưu**: Khai báo `immutable` $\to$ giá trị được nhúng trực tiếp vào runtime bytecode (`PUSH32`), chi phí đọc giảm từ `2,100` gas (`SLOAD` cold) xuống **3 gas**.
- **Hiệu quả thực nghiệm**:
  - `commitBid` (Avg): Giảm từ `85,494` gas xuống `83,391` gas (**tiết kiệm `2,103` gas / tx**, `-2.46%` — bớt 1 `SLOAD` cold cho `biddingEnd`).
  - `revealBid` (Avg): Giảm từ `97,244` gas xuống `93,044` gas (**tiết kiệm `4,200` gas / tx**, `-4.32%` — bớt 2 `SLOAD` cold cho `biddingEnd` và `revealEnd`).
  - `auctionEnd`: Giảm từ `57,121` gas xuống `52,921` gas (**tiết kiệm `4,200` gas / tx**, `-7.35%` — bớt 2 `SLOAD` cold cho `revealEnd` và `beneficiary`).
  - Tổng cộng trên 1 chu kỳ (`commitBid` + `revealBid` + `auctionEnd`): Giảm từ `239,859` gas xuống `229,356` gas (**tiết kiệm `10,503` gas**, `-4.38%`).

### Kỹ thuật 3: Custom Errors thay cho Chuỗi `require(..., "error message")`

- **Trước tối ưu**: Sử dụng `require(block.timestamp < deadline, "SealedBidAuction: action called too late")` và các chuỗi báo lỗi ASCII dài phải lưu trong runtime bytecode và mã hóa ABI `Error(string)` động trong bộ nhớ khi revert.
- **Sau tối ưu**: Định nghĩa 13 custom errors (`TooEarly`, `TooLate`, `ZeroCommitment`, `InvalidReveal`, `InsufficientDeposit`, ...) chỉ mã hóa đúng 4-byte selector + tham số cố định.
- **Hiệu quả thực nghiệm**:
  - Chi phí triển khai hợp đồng (`deploy`): Giảm từ `1,256,192` gas xuống `1,059,725` gas (**tiết kiệm `196,467` gas**, **`-15.64%`**).
  - Chi phí giao dịch bị revert (`commitBid(bytes32(0))`): Giảm từ `30,280` gas xuống `30,166` gas (**tiết kiệm `114` gas** ở nhánh revert sớm).

### Kỹ thuật 4: Cache Biến Storage vào Memory & Hoàn trả SSTORE (EIP-3529 Refund)

- **Trước tối ưu**: Truy cập lặp lại `bids[msg.sender].deposit` nhiều lần trong `revealBid` (tốn thêm phép băm `keccak256` tìm vị trí mapping + `SLOAD` warm `100` gas + dịch bit `uint96`), và không xóa `unrevealedDeposits` về `0` trong `auctionEnd`.
- **Sau tối ưu**:
  - Trong `revealBid`: Dùng con trỏ `Bid storage b = bids[msg.sender]` và cache `uint256 dep = b.deposit` lên stack cục bộ một lần duy nhất.
  - Trong `auctionEnd`: Đặt `unrevealedDeposits = 0` sau khi đã cộng vào `pendingReturns[beneficiary]` để nhận khoản hoàn gas (`4,800` gas refund theo EIP-3529) khi xóa storage slot từ non-zero về zero.
- **Hiệu quả thực nghiệm**:
  - `revealBid` (Avg): Giảm từ `93,841` gas xuống `93,044` gas (**tiết kiệm `797` gas / tx**, `-0.85%`).
  - `auctionEnd` (khi có tiền cọc không reveal): Giảm từ `55,089` gas xuống `52,921` gas (**tiết kiệm `2,168` gas**, `-3.94%`).
  - Chi phí `deploy`: Giảm từ `1,102,281` gas xuống `1,059,725` gas (**tiết kiệm `42,556` gas**, `-3.86%` nhờ giảm các đoạn mã lặp tính địa chỉ mapping).

### Bảng Tổng hợp Trước / Sau Tối ưu hóa (`AC-GAS-02`)

| Kỹ thuật | Thành phần tác động | Tiết kiệm Lý thuyết (Gas) | Trước tối ưu (Measured) | Sau tối ưu (Measured) | Chênh lệch (Gas & %) |
|---|---|---:|---:|---:|---:|
| 1. Struct & State Packing (`Bid` 2 slots + gộp `highestBidder`/`ended`/`cancelled`) | Chu kỳ `commitBid` + `revealBid` + `auctionEnd` | `~2,100 – 44,000` / chu kỳ | `273,503` gas (`85,448` + `114,080` + `73,975`) | `229,356` gas (`83,391` + `93,044` + `52,921`) | **`-44,147` gas (`-16.14%`)** |
| 2. `immutable` (`beneficiary`, `biddingEnd`, `revealEnd`) | Chu kỳ `commitBid` + `revealBid` + `auctionEnd` | `~2,100 – 4,200` / tx (`~10,500` / chu kỳ) | `239,859` gas (`85,494` + `97,244` + `57,121`) | `229,356` gas (`83,391` + `93,044` + `52,921`) | **`-10,503` gas (`-4.38%`)** |
| 3. Custom Errors vs chuỗi `require(..., "string")` | Deploy `SealedBidAuction` (+ đường revert) | `~150,000 – 200,000` deploy + `~114` / revert | `1,256,192` gas deploy (`30,280` gas revert) | `1,059,725` gas deploy (`30,166` gas revert) | **`-196,467` gas (`-15.64%` deploy)** |
| 4. Storage caching (`dep`) & zeroing slot (`unrevealedDeposits = 0`) | `revealBid` + `auctionEnd` | `~800` (`revealBid`) + `~2,100` (`auctionEnd`) | `148,930` gas (`93,841` + `55,089`) | `145,965` gas (`93,044` + `52,921`) | **`-2,965` gas (`-1.99%`)** |
| **Tổng hợp cả 04 kỹ thuật đồng thời** | **Deploy / Tổng chu kỳ (`commit` + `reveal` + `end`)** | **Cộng hưởng cả 4 kỹ thuật** | **`1,228,904` deploy / `286,978` chu kỳ** | **`1,059,725` deploy / `229,356` chu kỳ** | **`-169,179` deploy (`-13.77%`) / `-57,622` chu kỳ (`-20.08%`)** |
