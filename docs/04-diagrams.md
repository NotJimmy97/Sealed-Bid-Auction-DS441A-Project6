# 04 · Sơ đồ Kiến trúc & Luồng Hoạt động (Mermaid v11 Diagrams)

Tài liệu tập hợp toàn bộ sơ đồ UML/Mermaid dùng cho thiết kế kỹ thuật và Báo cáo 4–6 trang ([report-outline.md](report/report-outline.md)).

---

## 1. Sơ đồ Lớp Hợp đồng (Contract Class Diagram)

```mermaid
classDiagram
    direction TB

    class IAuction {
        <<interface>>
        +withdraw() external
        +auctionEnd() external
        +pendingReturns(address account) uint256
        +HighestBidIncreased(address bidder, uint256 amount)*
        +AuctionEnded(address winner, uint256 amount)*
        +Withdrawal(address account, uint256 amount)*
    }

    class Ownable {
        <<OpenZeppelin v5>>
        -address _owner
        +owner() address
        +transferOwnership(address newOwner)
    }

    class Pausable {
        <<OpenZeppelin v5>>
        -bool _paused
        +paused() bool
    }

    class ReentrancyGuard {
        <<OpenZeppelin v5 ERC-7201>>
        #nonReentrant()
    }

    class SealedBidAuction {
        +address payable beneficiary
        +uint256 biddingEnd
        +uint256 revealEnd
        +mapping~address, Bid~ bids
        +address highestBidder
        +bool ended
        +bool cancelled
        +uint256 highestBid
        +uint256 unrevealedDeposits
        +mapping~address, uint256~ pendingReturns
        +currentPhase() Phase
        +commitBid(bytes32 commitment) payable
        +revealBid(uint256 value, bytes32 secret)
        +auctionEnd()
        +withdraw()
        +cancelAuction()
        +pause()
        +unpause()
    }

    class Bid {
        <<struct 2 slots>>
        +bytes32 commitment
        +uint96 deposit
        +bool revealed
    }

    class EnglishAuction {
        +address payable beneficiary
        +uint256 biddingEnd
        +uint256 minIncrement
        +address highestBidder
        +bool ended
        +uint256 highestBid
        +mapping~address, uint256~ pendingReturns
        +minNextBid() uint256
        +bid() payable
        +withdraw()
        +auctionEnd()
    }

    IAuction <|.. SealedBidAuction
    IAuction <|.. EnglishAuction
    Ownable <|-- SealedBidAuction
    Pausable <|-- SealedBidAuction
    ReentrancyGuard <|-- SealedBidAuction
    Ownable <|-- EnglishAuction
    ReentrancyGuard <|-- EnglishAuction
    SealedBidAuction *-- Bid : "bids[address]"
```

---

## 2. Máy Trạng thái Hữu hạn — SealedBidAuction (State Machine Diagram)

Pha của hợp đồng được suy diễn hàm thuần theo thời gian (`block.timestamp`) kết hợp cờ `ended` / `cancelled`:

```mermaid
stateDiagram-v2
    [*] --> Bidding : "constructor(biddingDuration, revealDuration, beneficiary)"

    state Bidding {
        [*] --> AcceptingCommits
        AcceptingCommits --> AcceptingCommits : "commitBid(commitment) [msg.value > 0]"
    }

    Bidding --> Cancelled : "cancelAuction() [onlyOwner, t < biddingEnd]"
    Bidding --> Reveal : "block.timestamp >= biddingEnd"

    state Reveal {
        [*] --> AcceptingReveals
        AcceptingReveals --> AcceptingReveals : "revealBid(value, secret) [hash match & deposit >= value]"
    }

    Reveal --> Ended : "block.timestamp >= revealEnd"

    state Ended {
        [*] --> AwaitingSettlement
        AwaitingSettlement --> Settled : "auctionEnd() [pendingReturns[beneficiary] += highestBid + unrevealedDeposits]"
    }

    Cancelled --> [*] : "withdraw() hoàn 100% deposit"
    Ended --> [*] : "withdraw() hoàn tiền dư / tiền thắng"

    note right of Bidding
        Khi Paused (pause()):
        - commitBid() và revealBid() bị chặn (EnforcedPause)
        - withdraw() luôn mở để bảo vệ tài sản người dùng
    end note
```

---

## 3. Biểu đồ Tuần tự — Luồng Commit-Reveal-Withdraw (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor A as Bidder A (1.0 ETH)
    actor B as Bidder B (1.5 ETH, cọc 3.0 ETH)
    actor C as Bidder C (2.0 ETH, quên reveal)
    participant FE as Frontend (ethers v6)
    participant SC as SealedBidAuction
    actor Ben as Beneficiary

    Note over A,SC: Pha 1: Bidding (block.timestamp < biddingEnd)
    A->>FE: Nhập value=1.0, deposit=1.0, sinh secret_A
    FE->>FE: C_A = keccak256(1.0, secret_A, A, SC)
    A->>SC: commitBid(C_A) {value: 1.0 ETH}
    SC-->>FE: emit BidCommitted(A, C_A, 1.0 ETH)

    B->>FE: Nhập value=1.5, deposit=3.0 (che giá), sinh secret_B
    FE->>FE: C_B = keccak256(1.5, secret_B, B, SC)
    B->>SC: commitBid(C_B) {value: 3.0 ETH}
    SC-->>FE: emit BidCommitted(B, C_B, 3.0 ETH)

    C->>SC: commitBid(C_C) {value: 2.0 ETH}
    SC-->>FE: emit BidCommitted(C, C_C, 2.0 ETH)

    Note over A,SC: Pha 2: Reveal (biddingEnd <= block.timestamp < revealEnd)
    A->>SC: revealBid(1.0 ETH, secret_A)
    SC-->>FE: highestBidder=A, highestBid=1.0 ETH, emit HighestBidIncreased

    B->>SC: revealBid(1.5 ETH, secret_B)
    SC-->>FE: pendingReturns[A]+=1.0, pendingReturns[B]+=1.5 (dư), highestBidder=B, highestBid=1.5

    Note over C,SC: Bidder C không gọi revealBid trước revealEnd (unrevealedDeposits = 2.0 ETH)

    Note over A,Ben: Pha 3: Ended & Pull-Payment Withdrawal (block.timestamp >= revealEnd)
    A->>SC: withdraw()
    SC-->>A: Chuyển 1.0 ETH (emit Withdrawal)

    B->>SC: withdraw()
    SC-->>B: Chuyển 1.5 ETH phần cọc dư (emit Withdrawal)

    Ben->>SC: auctionEnd()
    SC-->>FE: pendingReturns[Ben] += 1.5 (highestBid) + 2.0 (forfeited C) = 3.5 ETH
    Ben->>SC: withdraw()
    SC-->>Ben: Chuyển 3.5 ETH (emit Withdrawal)
```

---

## 4. Biểu đồ Tuần tự — EnglishAuction Đối chuẩn

```mermaid
sequenceDiagram
    autonumber
    actor A as Bidder A
    actor B as Bidder B
    participant EA as EnglishAuction
    actor Ben as Beneficiary

    Note over A,EA: Bidding Phase (t < biddingEnd)
    A->>EA: bid() {value: 1.0 ETH}
    EA-->>A: highestBidder=A, highestBid=1.0 ETH

    B->>EA: bid() {value: 1.5 ETH >= 1.0 + minIncrement}
    EA-->>B: pendingReturns[A] += 1.0 ETH, highestBidder=B, highestBid=1.5 ETH

    A->>EA: withdraw()
    EA-->>A: Hoàn 1.0 ETH (Pull-Payment)

    Note over A,Ben: Sau biddingEnd (t >= biddingEnd)
    Ben->>EA: auctionEnd()
    EA-->>Ben: pendingReturns[Ben] += 1.5 ETH (emit AuctionEnded)
    Ben->>EA: withdraw()
    EA-->>Ben: Chuyển 1.5 ETH
```

---

## 5. Lưu đồ Xử lý `revealBid(value, secret)` (Control-Flow Flowchart)

```mermaid
flowchart TD
    Start(["revealBid(value, secret)"]) --> G1{"!paused & !cancelled &<br/>biddingEnd <= t < revealEnd?"}
    G1 -- "Sai" --> RevPhase["Revert EnforcedPause / AuctionCancelledError / TooEarly / TooLate"]
    G1 -- "Đúng" --> G2{"bids[sender].commitment != 0?"}
    G2 -- "Sai" --> RevNo["Revert NoCommitment()"]
    G2 -- "Đúng" --> G3{"!bids[sender].revealed?"}
    G3 -- "Sai" --> RevDup["Revert AlreadyRevealed()"]
    G3 -- "Đúng" --> G4{"keccak256(value, secret, sender, this)<br/>== commitment?"}
    G4 -- "Sai" --> RevHash["Revert InvalidReveal()"]
    G4 -- "Đúng" --> G5{"deposit >= value?"}
    G5 -- "Sai" --> RevDep["Revert InsufficientDeposit(deposit, value)"]
    G5 -- "Đúng" --> Mark["bids[sender].revealed = true<br/>unrevealedDeposits -= deposit"]
    Mark --> G6{"value > highestBid?"}
    G6 -- "Đúng (New Highest)" --> UpdHigh["Nếu highestBidder != 0:<br/>pendingReturns[highestBidder] += highestBid<br/>highestBidder = sender; highestBid = value<br/>pendingReturns[sender] += (deposit - value)<br/>emit HighestBidIncreased + BidRevealed(true)"]
    G6 -- "Sai (Loser / Tie)" --> RefundAll["pendingReturns[sender] += deposit<br/>emit BidRevealed(false)"]
    UpdHigh --> End(["Kết thúc giao dịch"])
    RefundAll --> End
```
