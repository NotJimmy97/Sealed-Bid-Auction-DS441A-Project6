# Đề cương Báo cáo Kỹ thuật (4 – 6 Trang · AC-DEL-03)

> **Bản báo cáo kỹ thuật hoàn chỉnh (4–6 trang)**: [**`docs/report/technical-report.md`**](technical-report.md)

Tài liệu này là khung cấu trúc chuẩn cho bản báo cáo nộp cuối kỳ của **Team 21 (Project 6: Sealed-Bid Auction)**. Toàn bộ nội dung chi tiết, biểu đồ và bảng biểu đã được biên soạn trong các file `docs/01..09` và được tổng hợp thành văn bản thống nhất tại [`docs/report/technical-report.md`](technical-report.md).

---

## Phân bổ Dung lượng (Tổng: 5.0 – 5.5 trang A4, cỡ chữ 11pt)

| Mục | Tiêu đề Phần trong Báo cáo ([`technical-report.md`](technical-report.md)) | Độ dài mục tiêu | Nguồn nội dung lắp ghép từ `docs/` | Hình vẽ / Bảng biểu bắt buộc |
|---|---|---:|---|---|
| **1** | **Giới thiệu & Bài toán Đấu giá Phi tập trung** | `0.5 trang` | [`01-requirements.md`](../01-requirements.md) §1–2 | Bảng phạm vi hệ thống |
| **2** | **Kiến trúc Hệ thống & Thiết kế Hợp đồng** | `1.5 trang` | [`02-architecture.md`](../02-architecture.md) §1–6<br>[`03-contract-spec.md`](../03-contract-spec.md) §1–2 | • Sơ đồ bối cảnh hệ thống (`02` §1)<br>• Bảng so sánh Sealed-Bid vs English Auction (`02` §5)<br>• Bảng quyết định thiết kế ADR-01..08 (`02` §6) |
| **3** | **Sơ đồ Thiết kế Hợp đồng (UML / Mermaid)** | `1.0 trang` | [`04-diagrams.md`](../04-diagrams.md) §1–5 | • Class Diagram (`04` §1)<br>• FSM State Diagram (`04` §2)<br>• Sequence Diagram Commit-Reveal-Withdraw (`04` §3)<br>• Flowchart `revealBid` (`04` §5) |
| **4** | **Phân tích Bảo mật (Security Considerations)** | `1.0 trang` | [`05-security.md`](../05-security.md) §1–3 | • Bảng Threat Matrix T-01..T-10 (`05` §1)<br>• Giải thích chi tiết: Reentrancy (CEI + Pull), Front-running/MEV, Commit-Copy Attack, DoS, Timestamp |
| **5** | **Phân tích & Tối ưu hóa Chi phí Gas** | `0.75 trang` | [`06-gas-optimization.md`](../06-gas-optimization.md) §1–4 | • Bảng Gas theo hàm từ `hardhat-gas-reporter` (`06` §2)<br>• Bảng so sánh Trước/Sau tối ưu hóa Struct Packing (`uint96` + `bool`), `immutable`, Custom Errors, Storage Caching (`06` §4) |
| **6** | **Kiểm thử Tự động, DApp & Kết luận** | `0.75 trang` | [`07-test-plan.md`](../07-test-plan.md)<br>[`08-frontend-spec.md`](../08-frontend-spec.md)<br>[`09-demo-script.md`](../09-demo-script.md) | • Tóm tắt ma trận 28 test cases (`28 passing`, `100% coverage`) & bằng chứng tại [`docs/evidence/`](../evidence/)<br>• Kiến trúc DApp Dual-Mode kết nối Ganache / MetaMask |

---

## Danh mục Kiểm tra Hoàn tất Báo cáo (`AC-DEL-03`)

- [x] Toàn bộ bảng số liệu trong [`docs/06-gas-optimization.md`](../06-gas-optimization.md) và [`docs/report/technical-report.md`](technical-report.md) đã được điền số đo thực tế từ [`docs/evidence/gas-report.txt`](../evidence/gas-report.txt).
- [x] Đính kèm log chạy `npx hardhat test` ([`docs/evidence/test-output.txt`](../evidence/test-output.txt) — `28 passing`, 100% pass, bao gồm các ca revert `TooEarly`, `TooLate`, `InvalidReveal`, `InsufficientDeposit`, `NothingToWithdraw`, `OwnableUnauthorizedAccount`) và `npx hardhat coverage` ([`docs/evidence/coverage-output.txt`](../evidence/coverage-output.txt) — `100%` Statements/Branches/Functions/Lines).
- [x] Công thức commitment trong báo cáo khớp 100% với code:
  $$\text{commitment} = \text{keccak256}(\text{abi.encodePacked}(\text{value}, \text{secret}, \text{msg.sender}, \text{address(this)}))$$
- [x] Giải thích rõ lý do chọn chính sách **tịch thu tiền cọc (forfeit)** đối với các bid không reveal dưới góc nhìn Lý thuyết Trò chơi.
