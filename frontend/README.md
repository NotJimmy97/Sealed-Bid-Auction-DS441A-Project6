# Frontend – Sealed-Bid Auction DApp

Giao diện DApp HTML5/CSS3/JS ES Modules thuần (Zero-build) kết hợp `ethers` v6 (`6.13.4` qua CDN jsDelivr). Hỗ trợ kết nối kép (**Dual-Mode**): ví trình duyệt **MetaMask** (`window.ethereum`) và **Local RPC Role Switcher** (`http://127.0.0.1:8545`) giúp chuyển nhanh giữa 4 vai trò (`Owner`, `Bidder A`, `Bidder B`, `Bidder C / Guest`) khi demo hoặc chạy kiểm thử E2E.

## Chạy ứng dụng

```bash
npm run node             # Khởi chạy nút mạng cục bộ (chainId 1337, cổng 8545)
npm run deploy:ganache   # Triển khai hợp đồng & ghi frontend/src/contracts.json (địa chỉ + ABI)
npm run frontend         # Mở HTTP server tại http://127.0.0.1:5173
```

> Không mở `index.html` trực tiếp bằng giao thức `file://` vì `fetch("src/contracts.json")` yêu cầu HTTP server.

## Cấu trúc thư mục

| File | Vai trò |
|---|---|
| `index.html` | Cấu trúc ngữ nghĩa HTML5, giữ cố định toàn bộ DOM ID cho QA/Playwright |
| `src/app.js` | Kết nối MetaMask / Local RPC, chuyển đổi vai trò, tính commitment ngoài chuỗi, giải mã Custom Error, đồng bộ sự kiện (`queryFilter` + `contract.on`) và điều khiển thời gian (`evm_increaseTime`) |
| `src/styles.css` | Hệ giao diện Editorial Vault (`Fraunces` + `Plus Jakarta Sans` + `JetBrains Mono`), responsive (`375px`, `768px`, `1440px`), `font-size: 16px` cho mọi ô nhập |
| `src/contracts.json` | Sinh tự động bởi `scripts/deploy.js` (gitignored) |

## Danh sách DOM Element IDs

- **Kết nối & Vai trò (`AC-FE-01`)**: `btn-connect`, `role-selector`, `role-badge`, `wallet-address`, `network-status`, `contract-address`
- **Trạng thái & Đếm ngược (`AC-FE-02`)**: `phase-label`, `countdown`, `highest-bid`, `highest-bidder`, `unrevealed-deposits`, `my-bid-status`
- **Pha Commit (`AC-FE-03`)**: `commit-value`, `commit-deposit`, `commit-secret`, `btn-generate-secret`, `commit-hash`, `btn-commit`, `btn-download-secret`
- **Pha Reveal (`AC-FE-04`)**: `reveal-value`, `reveal-secret`, `btn-load-secret`, `btn-reveal`
- **Hoàn tiền & Kết thúc (`AC-FE-05`)**: `pending-returns`, `btn-withdraw`, `btn-auction-end`
- **Quản trị & Tua thời gian Demo**: `btn-pause`, `btn-unpause`, `btn-cancel`, `btn-advance-reveal`, `btn-advance-end`
- **Nhật ký sự kiện & Thông báo (`AC-FE-06`)**: `event-log`, `toast`

## Lưu ý vận hành

- **Lưu trữ Secret**: Secret được lưu tự động vào `localStorage` theo khóa `sba:<auction>:<account>` **ngay trước** khi gửi giao dịch `commitBid`; khuyến nghị bấm **Tải file secret** (`#btn-download-secret`) để sao lưu dự phòng.
- **Tua thời gian cục bộ**: Trên nút Ganache/Hardhat local, có thể bấm **Tua tới Pha Reveal** (`#btn-advance-reveal`) hoặc **Tua tới Pha Ended** (`#btn-advance-end`) ngay trên giao diện để kiểm thử chuyển pha mà không cần chờ hết 300 giây.
- **Khởi động lại Ganache**: Khi khởi động lại nút mạng, dữ liệu chuỗi cũ bị xóa; cần chạy lại `npm run deploy:ganache` (và "Clear activity tab data" trong MetaMask nếu dùng ví extension).
