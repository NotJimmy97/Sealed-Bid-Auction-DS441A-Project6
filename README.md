# Project 6: Sealed-Bid Auction (Team 21)

Hệ thống đấu giá kín phi tập trung theo cơ chế **Commit-Reveal (`SealedBidAuction`)** kèm phiên bản đối chuẩn **Đấu giá mở kiểu Anh (`EnglishAuction`)**, triển khai trên Solidity `0.8.24`, Hardhat, ethers.js v6 và mạng cục bộ Ganache.

---

## 1. Kiến trúc & Tính năng Cốt lõi

- **Commit-Reveal chống Front-running & Replay**:
  $$\text{commitment} = \text{keccak256}(\text{abi.encodePacked}(\text{uint256 value}, \text{bytes32 secret}, \text{address bidder}, \text{address auction}))$$
  Ràng buộc `bidder` (`msg.sender`) và địa chỉ hợp đồng vào hash để chặn tấn công sao chép cam kết (commit-copy); cho phép đặt cọc `deposit >= value` để ẩn cận trên của giá đấu thầu.
- **Máy trạng thái hữu hạn (FSM)**: Chuyển pha tự động theo `block.timestamp` (`Bidding → Reveal → Ended` hoặc `Cancelled`).
- **Hoàn tiền an toàn (Pull-over-Push)**: Mọi khoản hoàn cọc, phần cọc dư và doanh thu của `beneficiary` được rút qua `withdraw()` tuân thủ mẫu CEI + `ReentrancyGuard`.
- **Tối ưu hóa Gas**: Đóng gói `struct Bid` từ 3 xuống 2 storage slots (`bytes32 commitment` + `uint96 deposit` + `bool revealed`), dùng biến `immutable`, Custom Errors và Storage Caching — giúp giảm **13.77%** chi phí deploy và **20.08%** chi phí gas toàn chu kỳ.
- **Chất lượng Kiểm thử**: **28/28 test cases passing (`100% coverage`** trên cả Statements, Branches, Functions và Lines cho cả 2 hợp đồng).

---

## 2. Cấu trúc Thư mục Dự án

```text
Sealed-Bid Auction/
├── contracts/
│   ├── interfaces/IAuction.sol      # Interface & sự kiện dùng chung
│   ├── mocks/AuctionTestMocks.sol   # Hợp đồng giả lập tấn công Reentrancy & DoS phục vụ test
│   ├── SealedBidAuction.sol         # Hợp đồng đấu giá kín Commit-Reveal
│   └── EnglishAuction.sol           # Hợp đồng đấu giá mở kiểu Anh (baseline)
├── test/
│   ├── helpers/commit.js            # Hàm tạo commitment & secret dùng chung
│   ├── SealedBidAuction.test.js     # Unit & integration tests cho Sealed-Bid (22 tests: TC-SB-00..19)
│   └── EnglishAuction.test.js       # Unit & integration tests cho English Auction (6 tests: TC-EN-00..05)
├── scripts/
│   ├── deploy.js                    # Deploy cả 2 hợp đồng & xuất frontend/src/contracts.json
│   └── demo-scenario.js             # Kịch bản demo tự động trên CLI (Auctioneer + Bidders A/B/C)
├── frontend/
│   ├── index.html                   # Giao diện DApp (HTML/JS thuần + ethers v6 ESM)
│   ├── src/app.js                   # Kết nối Dual-Mode (MetaMask / Local RPC), băm off-chain, giải mã lỗi
│   ├── src/styles.css               # Thiết kế giao diện Editorial Vault responsive
│   └── README.md                    # Hướng dẫn riêng cho Frontend
├── docs/
│   ├── 01-requirements.md           # Mục tiêu & Tiêu chí nghiệm thu (AC-SC, AC-QA, AC-GAS, AC-FE, AC-DEL)
│   ├── 02-architecture.md           # Kiến trúc Commit-Reveal, FSM, Pull-Payment, so sánh & ADR
│   ├── 03-contract-spec.md          # Đặc tả chi tiết storage layout, hàm, modifier, event, bất biến
│   ├── 04-diagrams.md               # Sơ đồ Mermaid v11 (Class, FSM State, Sequence, Flowchart)
│   ├── 05-security.md               # Phân tích bảo mật (Threat Matrix T-01..T-10 & STRIDE)
│   ├── 06-gas-optimization.md       # Phương pháp đo & giải trình 4 kỹ thuật tối ưu hóa Gas
│   ├── 07-test-plan.md              # Kế hoạch & Ma trận kiểm thử tự động (28 test cases)
│   ├── 08-frontend-spec.md          # Đặc tả kỹ thuật 6 tính năng DApp Frontend
│   ├── 09-demo-script.md            # Kịch bản Live Demo 10 phút trên Ganache
│   ├── evidence/                    # Nhật ký bằng chứng kiểm thử, gas, coverage & demo CLI (AC-DEL-02)
│   │   ├── test-output.txt          # Kết quả chạy npx hardhat test (28 passing)
│   │   ├── gas-report.txt           # Bảng đo gas chi tiết từ hardhat-gas-reporter
│   │   ├── coverage-output.txt      # Báo cáo solidity-coverage (100% Stmts/Branch/Funcs/Lines)
│   │   └── demo-output.txt          # Nhật ký chạy kịch bản end-to-end scripts/demo-scenario.js
│   └── report/
│       ├── report-outline.md        # Đề cương kiểm tra hoàn tất Báo cáo kỹ thuật
│       └── technical-report.md      # Báo cáo kỹ thuật hoàn chỉnh 4–6 trang (AC-DEL-03)
├── .env.example                     # Mẫu cấu hình biến môi trường
├── hardhat.config.js                # Cấu hình Solidity 0.8.24, mạng Ganache (1337) & Gas Reporter
└── package.json                     # Scripts & dependencies
```

---

## 3. Hướng dẫn Cài đặt & Vận hành Từng bước

### Bước 1: Yêu cầu môi trường & Cài đặt thư viện
- Node.js `>= 18.x`, npm `>= 9.x`, trình duyệt có cài tiện ích **MetaMask** (hoặc dùng chế độ Local RPC Role Switcher tích hợp sẵn).
```bash
npm install
cp .env.example .env
```

### Bước 2: Biên dịch, Kiểm thử Tự động & Chạy Demo CLI
```bash
npm run compile          # Biên dịch hợp đồng Solidity 0.8.24
npm test                 # Chạy 28 kịch bản kiểm thử Mocha/Chai (28 passing)
npm run gas              # Chạy kiểm thử kèm báo cáo chi phí Gas (hardhat-gas-reporter)
npm run coverage         # Đo độ bao phủ mã nguồn (100% coverage)
npm run demo             # Chạy kịch bản mô phỏng 4 vai tự động trên CLI
```

### Bước 3: Khởi chạy mạng cục bộ Ganache & Deploy hợp đồng
Mở **Terminal 1** để chạy Ganache cố định (`chainId = 1337`, 6 tài khoản):
```bash
npm run node
```
Mở **Terminal 2** để deploy cả 2 hợp đồng lên Ganache và tự động sinh `frontend/src/contracts.json`:
```bash
npm run deploy:ganache
```

### Bước 4: Khởi chạy DApp Frontend & Kết nối MetaMask / Local RPC
```bash
npm run frontend
```
1. Mở trình duyệt tại `http://localhost:5173`.
2. Bấm **Kết nối MetaMask** — ứng dụng sẽ tự động thêm/chuyển sang mạng **Ganache Local (`http://127.0.0.1:8545`, Chain ID `1337`)**, hoặc chọn trực tiếp vai trò trong thanh **Vai trò Demo (`#role-selector`)** để ký giao dịch qua Local RPC.
3. Thực hiện kịch bản đấu giá 4 vai theo hướng dẫn chi tiết tại [`docs/09-demo-script.md`](docs/09-demo-script.md).

---

## 4. Danh mục Tài liệu Kỹ thuật, Báo cáo & Bằng chứng (`docs/`)

| Tài liệu | Nội dung chính |
|---|---|
| **[`docs/report/technical-report.md`](docs/report/technical-report.md)** | **Báo cáo kỹ thuật hoàn chỉnh 4–6 trang (`AC-DEL-03`) hợp nhất toàn bộ 6 phần** |
| [`docs/report/report-outline.md`](docs/report/report-outline.md) | Đề cương cấu trúc và danh mục kiểm tra hoàn tất báo cáo (`[x]`) |
| [`docs/01-requirements.md`](docs/01-requirements.md) | Phân rã yêu cầu và mã hóa tiêu chí nghiệm thu (`AC-*`) |
| [`docs/02-architecture.md`](docs/02-architecture.md) | Kiến trúc hệ thống, lý thuyết trò chơi, bảng so sánh với English Auction & ADR |
| [`docs/03-contract-spec.md`](docs/03-contract-spec.md) | Đặc tả chi tiết từng storage slot, chữ ký hàm, custom errors và 7 bất biến (`INV-1..7`) |
| [`docs/04-diagrams.md`](docs/04-diagrams.md) | Bộ sơ đồ Class, State Machine, Sequence và Flowchart (Mermaid v11) |
| [`docs/05-security.md`](docs/05-security.md) | Phân tích 10 mối đe dọa bảo mật (`T-01..T-10`) và checklist nghiệm thu |
| [`docs/06-gas-optimization.md`](docs/06-gas-optimization.md) | Số liệu đo kiểm Gas thực nghiệm và giải trình 4 kỹ thuật tối ưu hóa |
| [`docs/07-test-plan.md`](docs/07-test-plan.md) | Ma trận 28 ca kiểm thử (`TC-SB-*`, `TC-EN-*`) ánh xạ tới từng `AC-*` |
| [`docs/08-frontend-spec.md`](docs/08-frontend-spec.md) | Đặc tả 6 tính năng UI, kiến trúc Dual-Mode, lưu secret an toàn và giải mã custom error |
| [`docs/09-demo-script.md`](docs/09-demo-script.md) | Kịch bản trình diễn trực tiếp 10 phút phân vai trên Ganache (`AC-DEL-04`) |
| [`docs/evidence/`](docs/evidence/) | Bộ bằng chứng kiểm thử (`test-output.txt`, `gas-report.txt`, `coverage-output.txt`, `demo-output.txt` — `AC-DEL-02`) |
