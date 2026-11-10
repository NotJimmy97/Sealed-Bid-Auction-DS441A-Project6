# 03 · Đặc tả hợp đồng (Contract Specification)

Nguồn sự thật cho [SealedBidAuction.sol](../contracts/SealedBidAuction.sol) và [EnglishAuction.sol](../contracts/EnglishAuction.sol). Mọi thay đổi chữ ký hàm/error/event phải cập nhật đồng thời: file này, contract, `test/helpers/commit.js`, `frontend/src/app.js`.

**Toolchain**: Solidity `0.8.24` (optimizer 200 runs, EVM `paris`), OpenZeppelin `5.x` (`Ownable`, `Pausable`, `ReentrancyGuard`).

---

## 1. SealedBidAuction

`contract SealedBidAuction is IAuction, Ownable, Pausable, ReentrancyGuard`

### 1.1 Constructor

```solidity
constructor(uint256 biddingDuration, uint256 revealDuration, address payable beneficiary_)
```

| Gán | Giá trị |
|---|---|
| `owner` | `msg.sender` (Auctioneer) |
| `beneficiary` (immutable) | `beneficiary_` |
| `biddingEnd` (immutable) | `block.timestamp + biddingDuration` |
| `revealEnd` (immutable) | `biddingEnd + revealDuration` |

### 1.2 Storage layout

| Slot | Biến | Kiểu | Ghi chú |
|---|---|---|---|
| 0 | `_owner` + `_paused` | `address` + `bool` | Kế thừa OZ, đóng gói chung |
| 1 | `bids` | `mapping(address => Bid)` | Mỗi `Bid` = **2 slot** |
| 2 | `highestBidder` + `ended` + `cancelled` | `address` + `bool` + `bool` | 22/32 byte, đóng gói |
| 3 | `highestBid` | `uint256` | |
| 4 | `unrevealedDeposits` | `uint256` | |
| 5 | `pendingReturns` | `mapping(address => uint256)` | |
| — | `beneficiary`, `biddingEnd`, `revealEnd` | immutable | Nằm trong bytecode, không tốn SLOAD |
| ERC-7201 | `ReentrancyGuard` status | `uint256` | OZ 5.x dùng namespaced slot |

```solidity
struct Bid {
    bytes32 commitment; // slot k
    uint96  deposit;    // slot k+1 (12 B)
    bool    revealed;   // slot k+1 (1 B)
}
```

Kiểm tra layout thực tế: thêm `outputSelection: { "*": { "*": ["storageLayout"] } }` vào `hardhat.config.js` rồi đọc `artifacts/build-info/*.json`.

### 1.3 Pha

```solidity
enum Phase { Bidding, Reveal, Ended, Cancelled }
function currentPhase() public view returns (Phase);
```

| Điều kiện (theo thứ tự ưu tiên) | Phase |
|---|---|
| `cancelled` | Cancelled |
| `ended \|\| block.timestamp >= revealEnd` | Ended |
| `block.timestamp >= biddingEnd` | Reveal |
| còn lại | Bidding |

### 1.4 Modifiers

| Modifier | Điều kiện revert |
|---|---|
| `onlyBefore(d)` | `block.timestamp >= d` → `TooLate(d)` |
| `onlyAfter(d)` | `block.timestamp < d` → `TooEarly(d)` |
| `notCancelled` | `cancelled` → `AuctionCancelledError()` |
| `whenNotPaused` (OZ) | `paused()` → `EnforcedPause()` |
| `onlyOwner` (OZ) | `msg.sender != owner` → `OwnableUnauthorizedAccount(msg.sender)` |
| `nonReentrant` (OZ) | tái nhập → `ReentrancyGuardReentrantCall()` |

### 1.5 Hàm

| Hàm | Guard | Thứ tự xử lý (CEI) | Event | Error |
|---|---|---|---|---|
| `commitBid(bytes32 commitment) payable` | `whenNotPaused notCancelled onlyBefore(biddingEnd)` | **C**: commitment≠0, value≠0, chưa commit, `SafeCast.toUint96(msg.value)` → **E**: lưu `Bid`, `unrevealedDeposits += msg.value` | `BidCommitted(bidder, commitment, deposit)` | `ZeroCommitment`, `ZeroDeposit`, `AlreadyCommitted`, `TooLate`, `SafeCastOverflowedUintDowncast` |
| `revealBid(uint256 value, bytes32 secret)` | `whenNotPaused notCancelled onlyAfter(biddingEnd) onlyBefore(revealEnd)` | **C**: có commit, chưa reveal, hash khớp, `deposit ≥ value` → **E**: `revealed=true`, `unrevealedDeposits -= deposit`; nếu `value > highestBid`: hoàn `highestBid` cũ cho `highestBidder` cũ qua `pendingReturns`, cập nhật highest, `pendingReturns[sender] += deposit - value`; ngược lại `pendingReturns[sender] += deposit` | `BidRevealed(bidder, value, isHighest)`; `HighestBidIncreased(bidder, value)` nếu cao nhất | `TooEarly`, `TooLate`, `NoCommitment`, `AlreadyRevealed`, `InvalidReveal`, `InsufficientDeposit(deposit, value)` |
| `auctionEnd()` | `onlyAfter(revealEnd) notCancelled` | **C**: `!ended` → **E**: `ended=true`, `pendingReturns[beneficiary] += highestBid + unrevealedDeposits`, `unrevealedDeposits=0` | `AuctionEnded(winner, amount)` | `TooEarly`, `AuctionAlreadyEnded`, `AuctionCancelledError` |
| `withdraw()` | `nonReentrant` (**không** `whenNotPaused`) | **C**: `amount = pendingReturns[sender]` (+ deposit chưa reveal nếu `cancelled`), `amount>0` → **E**: zero số dư/đánh dấu bid → **I**: `call{value: amount}("")` | `Withdrawal(account, amount)` | `NothingToWithdraw`, `TransferFailed` |
| `cancelAuction()` | `onlyOwner notCancelled onlyBefore(biddingEnd)` | `cancelled = true` | `AuctionCancelled()` | `OwnableUnauthorizedAccount`, `AuctionCancelledError`, `TooLate` |
| `pause()` / `unpause()` | `onlyOwner` | OZ `_pause/_unpause` | `Paused/Unpaused(account)` | `OwnableUnauthorizedAccount`, `EnforcedPause`, `ExpectedPause` |
| `currentPhase()` view | — | §1.3 | — | — |

Getter tự sinh: `bids(address)`, `highestBidder()`, `highestBid()`, `unrevealedDeposits()`, `ended()`, `cancelled()`, `pendingReturns(address)`, `beneficiary()`, `biddingEnd()`, `revealEnd()`, `owner()`, `paused()`.

### 1.6 Commitment

```solidity
keccak256(abi.encodePacked(value, secret, msg.sender, address(this)))
```
```js
ethers.solidityPackedKeccak256(["uint256","bytes32","address","address"], [value, secret, bidder, auction])
```

### 1.7 Events & Errors

```solidity
event BidCommitted(address indexed bidder, bytes32 commitment, uint256 deposit);
event BidRevealed(address indexed bidder, uint256 value, bool isHighest);
event HighestBidIncreased(address indexed bidder, uint256 amount); // IAuction
event AuctionEnded(address winner, uint256 amount);                // IAuction
event Withdrawal(address indexed account, uint256 amount);         // IAuction
event AuctionCancelled();

error TooEarly(uint256 deadline);
error TooLate(uint256 deadline);
error ZeroCommitment();
error ZeroDeposit();
error AlreadyCommitted();
error NoCommitment();
error AlreadyRevealed();
error InvalidReveal();
error InsufficientDeposit(uint256 deposit, uint256 value);
error AuctionAlreadyEnded();
error AuctionCancelledError();
error NothingToWithdraw();
error TransferFailed();
```

### 1.8 Bất biến (invariants)

Ký hiệu `P = Σ pendingReturns`, `U = unrevealedDeposits`, `H = highestBid` (chỉ tính khi `!ended`).

| ID | Bất biến |
|---|---|
| INV-1 | `address(this).balance ≥ P + U + (ended ? 0 : H)` (≥ vì ETH có thể bị ép vào qua `selfdestruct`) |
| INV-2 | `U == Σ bids[a].deposit` với mọi `a` có `!bids[a].revealed` |
| INV-3 | `highestBidder == address(0) ⇔ H == 0` |
| INV-4 | `H ≤ bids[highestBidder].deposit` |
| INV-5 | `ended` chỉ chuyển `false → true` đúng 1 lần; `cancelled` và `ended` không đồng thời `true` |
| INV-6 | Mỗi địa chỉ commit ≤ 1 lần, reveal ≤ 1 lần |
| INV-7 | Không hàm nào duyệt vòng lặp theo số bidder (O(1) gas / lời gọi) |

---

## 2. EnglishAuction

`contract EnglishAuction is IAuction, Ownable, ReentrancyGuard`

```solidity
constructor(uint256 biddingDuration, uint256 minIncrement_, address payable beneficiary_)
```

| Slot | Biến |
|---|---|
| 0 | `_owner` |
| 1 | `highestBidder` + `ended` |
| 2 | `highestBid` |
| 3 | `pendingReturns` |
| immutable | `beneficiary`, `biddingEnd`, `minIncrement` |

| Hàm | Guard | Logic | Event | Error |
|---|---|---|---|---|
| `bid() payable` | `onlyBefore(biddingEnd)` | `required = minNextBid()`; `msg.value ≥ required`; hoàn `highestBid` cũ vào `pendingReturns[highestBidder cũ]`; cập nhật highest | `HighestBidIncreased` | `TooLate`, `BidTooLow(required)` |
| `minNextBid()` view | — | `highestBid == 0 ? 1 : highestBid + minIncrement` | — | — |
| `withdraw()` | `nonReentrant` | Pull-payment như §1.5 | `Withdrawal` | `NothingToWithdraw`, `TransferFailed` |
| `auctionEnd()` | `onlyAfter(biddingEnd)` | `ended=true`; `pendingReturns[beneficiary] += highestBid` | `AuctionEnded` | `TooEarly`, `AuctionAlreadyEnded` |

Errors: `TooEarly`, `TooLate`, `BidTooLow(uint256 required)`, `AuctionAlreadyEnded`, `NothingToWithdraw`, `TransferFailed`.

Bất biến: `address(this).balance ≥ Σ pendingReturns + (ended ? 0 : highestBid)`.
