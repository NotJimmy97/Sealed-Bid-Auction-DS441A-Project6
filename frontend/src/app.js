// Sealed-Bid Auction DApp — HTML/JS thuần + ethers v6 (ESM qua CDN).
// Hỗ trợ Dual-Mode: MetaMask (window.ethereum) + Local RPC Role Switcher (http://127.0.0.1:8545).
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.min.js";

const GANACHE_CHAIN_ID = 1337n;
const LOCAL_RPC_URL = "http://127.0.0.1:8545";
const PHASES = ["Bidding", "Reveal", "Ended", "Cancelled"];
const $ = (id) => document.getElementById(id);

const state = {
  provider: null,
  signer: null,
  account: null,
  auction: null,
  meta: null,
  timer: null,
  useLocalRpc: false,
  seenEvents: new Set(),
};

// ---------------------------------------------------------------- UI helpers
function toast(msg, isError = false) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = `show${isError ? " error" : ""}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.className = ""), 6000);
}

function setNetwork(text, kind) {
  const el = $("network-status");
  if (!el) return;
  el.textContent = text;
  el.className = `pill pill-${kind}`;
}

function logEvent(name, detail, eventKey = null) {
  if (eventKey) {
    if (state.seenEvents.has(eventKey)) return;
    state.seenEvents.add(eventKey);
  }
  const list = $("event-log");
  if (!list) return;
  list.querySelector(".empty")?.remove();
  const li = document.createElement("li");
  const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });
  li.innerHTML = `<span class="ev"></span> <span class="detail"></span>`;
  li.querySelector(".ev").textContent = `[${time}] ${name}`;
  li.querySelector(".detail").textContent = detail; // textContent: chống XSS
  list.prepend(li);
}

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const fmtEth = (wei) => `${ethers.formatEther(wei ?? 0n)} ETH`;

function fmtDuration(s) {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
}

function extractHexErrorData(err) {
  const candidates = [
    err?.data,
    err?.error?.data,
    err?.error?.error?.data,
    err?.info?.error?.data,
    err?.info?.error?.data?.data,
    err?.info?.error?.data?.result,
    err?.info?.error?.originalError?.data,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("0x") && c.length >= 10) return c;
  }
  const raw = `${JSON.stringify(err?.info ?? err?.error ?? "")} ${err?.shortMessage ?? ""} ${err?.message ?? ""}`;
  const match = raw.match(/0x[0-9a-fA-F]{8,}/);
  return match ? match[0] : null;
}

/** Giải mã custom error từ contract (Solidity 0.8.24 + OpenZeppelin 5.x). */
function decodeError(err) {
  if (err?.revert?.name) {
    return `${err.revert.name}(${(err.revert.args ?? []).join(", ")})`;
  }
  const hexData = extractHexErrorData(err);
  if (hexData && state.auction) {
    try {
      const parsed = state.auction.interface.parseError(hexData);
      if (parsed) return `${parsed.name}(${(parsed.args ?? []).join(", ")})`;
    } catch {
      /* không phải custom error trong ABI */
    }
  }
  const msg = `${err?.shortMessage ?? ""} ${err?.message ?? ""} ${err?.info?.error?.message ?? ""}`;
  const customMatch = msg.match(/custom error ['"]?([A-Za-z0-9_]+)\(([^)]*)\)/i);
  if (customMatch) return `${customMatch[1]}(${customMatch[2]})`;
  if (err?.code === "ACTION_REJECTED") return "Người dùng từ chối giao dịch";
  return err?.shortMessage || err?.message || String(err);
}

async function send(label, fn) {
  try {
    const tx = await fn();
    toast(`${label}: đã gửi ${short(tx.hash)}`);
    await tx.wait();
    await refresh();
    toast(`${label}: thành công`);
  } catch (err) {
    toast(`${label} thất bại: ${decodeError(err)}`, true);
  }
}

// ---------------------------------------------------------------- Secret storage
const secretKey = () => `sba:${state.meta?.address}:${state.account}`.toLowerCase();

function saveSecret(record) {
  localStorage.setItem(secretKey(), JSON.stringify(record));
}

function loadSecret() {
  const raw = localStorage.getItem(secretKey());
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------- Commitment
function computeCommitment() {
  const out = $("commit-hash");
  if (!out) return null;
  try {
    const valueStr = $("commit-value").value;
    const secret = $("commit-secret").value.trim();
    if (!valueStr || !ethers.isHexString(secret, 32) || !state.account || !state.meta) {
      out.textContent = "—";
      return null;
    }
    const value = ethers.parseEther(valueStr);
    const hash = ethers.solidityPackedKeccak256(
      ["uint256", "bytes32", "address", "address"],
      [value, secret, state.account, state.meta.address]
    );
    out.textContent = hash;
    return { value, secret, hash };
  } catch {
    out.textContent = "—";
    return null;
  }
}

// ---------------------------------------------------------------- Wallet & contract
async function loadContractMeta() {
  const res = await fetch("src/contracts.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Chưa có src/contracts.json — chạy `npm run deploy:ganache` trước.");
  return res.json();
}

async function connect(forceLocalRpc = false) {
  try {
    const roleIndex = Number($("role-selector")?.value ?? 0);
    const useRpc = forceLocalRpc || state.useLocalRpc || !window.ethereum;

    if (!useRpc && window.ethereum) {
      state.provider = new ethers.BrowserProvider(window.ethereum);
      await state.provider.send("eth_requestAccounts", []);
      await ensureGanache();
      state.signer = await state.provider.getSigner();
      state.account = await state.signer.getAddress();
    } else {
      state.useLocalRpc = true;
      state.provider = new ethers.JsonRpcProvider(LOCAL_RPC_URL, undefined, { cacheTimeout: -1 });
      const { chainId } = await state.provider.getNetwork();
      state.signer = await state.provider.getSigner(roleIndex);
      state.account = await state.signer.getAddress();
      setNetwork(
        chainId === GANACHE_CHAIN_ID ? `Ganache RPC · 1337 (Role ${roleIndex})` : `RPC · ${chainId}`,
        chainId === GANACHE_CHAIN_ID ? "ok" : "warn"
      );
    }

    $("wallet-address").textContent = short(state.account);
    $("wallet-address").title = state.account;
    $("btn-connect").textContent = "Đã kết nối";

    const meta = await loadContractMeta();
    const prevAddress = state.meta?.address;
    state.meta = meta.sealedBidAuction;

    const code = await state.provider.getCode(state.meta.address);
    if (code === "0x") {
      throw new Error("Không có contract tại địa chỉ đã lưu — Ganache đã restart? Chạy lại deploy.");
    }

    if (prevAddress && prevAddress.toLowerCase() !== state.meta.address.toLowerCase()) {
      state.seenEvents.clear();
      $("event-log").innerHTML = '<li class="empty">Chưa có sự kiện.</li>';
    }

    state.auction = new ethers.Contract(state.meta.address, state.meta.abi, state.signer);
    $("contract-address").textContent = state.meta.address;

    subscribeEvents();
    computeCommitment();
    await refresh();
    clearInterval(state.timer);
    state.timer = setInterval(tick, 1000);
  } catch (err) {
    toast(decodeError(err), true);
  }
}

async function ensureGanache() {
  const { chainId } = await state.provider.getNetwork();
  if (chainId === GANACHE_CHAIN_ID) return setNetwork("Ganache · 1337", "ok");
  setNetwork(`Sai mạng · ${chainId}`, "warn");
  const hex = ethers.toQuantity(GANACHE_CHAIN_ID);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err) {
    if (err.code !== 4902) throw err;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: "Ganache Local",
          rpcUrls: [LOCAL_RPC_URL],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        },
      ],
    });
  }
  state.provider = new ethers.BrowserProvider(window.ethereum);
  setNetwork("Ganache · 1337", "ok");
}

// ---------------------------------------------------------------- State refresh & Events
function renderParsedEvent(name, args, key) {
  if (name === "BidCommitted") {
    const [bidder, commitment, deposit] = args;
    logEvent("BidCommitted", `${short(bidder)} cọc ${fmtEth(deposit)} · ${commitment.slice(0, 14)}…`, key);
  } else if (name === "BidRevealed") {
    const [bidder, value, isHighest] = args;
    logEvent("BidRevealed", `${short(bidder)} = ${fmtEth(value)}${isHighest ? " (cao nhất)" : ""}`, key);
  } else if (name === "HighestBidIncreased") {
    const [bidder, amount] = args;
    logEvent("HighestBidIncreased", `${short(bidder)} ${fmtEth(amount)}`, key);
  } else if (name === "AuctionEnded") {
    const [winner, amount] = args;
    logEvent("AuctionEnded", `winner ${short(winner)} · ${fmtEth(amount)}`, key);
  } else if (name === "Withdrawal") {
    const [account, amount] = args;
    logEvent("Withdrawal", `${short(account)} rút ${fmtEth(amount)}`, key);
  } else if (name === "AuctionCancelled") {
    logEvent("AuctionCancelled", "Owner đã hủy phiên", key);
  }
}

async function syncEvents() {
  if (!state.auction) return;
  const a = state.auction;
  try {
    const eventNames = [
      "BidCommitted",
      "BidRevealed",
      "HighestBidIncreased",
      "AuctionEnded",
      "Withdrawal",
      "AuctionCancelled",
    ];
    const batches = await Promise.all(
      eventNames.map((name) => a.queryFilter(a.filters[name](), 0, "latest"))
    );
    const allLogs = batches.flat().sort((x, y) => {
      if (x.blockNumber !== y.blockNumber) return x.blockNumber - y.blockNumber;
      if (x.transactionIndex !== y.transactionIndex) return x.transactionIndex - y.transactionIndex;
      return x.index - y.index;
    });
    for (const ev of allLogs) {
      const name = ev.fragment?.name;
      if (!name) continue;
      const key = `${ev.transactionHash}:${ev.index}`;
      renderParsedEvent(name, ev.args, key);
    }
  } catch {
    /* ignore transient filter errors */
  }
}

async function refresh() {
  if (!state.auction || !state.account) return;
  const a = state.auction;
  const [phase, highestBid, highestBidder, unrevealed, pending, myBid, owner, isPaused] = await Promise.all([
    a.currentPhase(),
    a.highestBid(),
    a.highestBidder(),
    a.unrevealedDeposits(),
    a.pendingReturns(state.account),
    a.bids(state.account),
    a.owner(),
    a.paused(),
  ]);

  const phaseText = PHASES[Number(phase)] ?? "?";
  $("phase-label").textContent = phaseText;
  $("phase-label").dataset.paused = String(isPaused);

  $("highest-bid").textContent = fmtEth(highestBid);
  if ($("highest-bidder")) {
    $("highest-bidder").textContent =
      highestBidder === ethers.ZeroAddress ? "Chưa có (0x0)" : short(highestBidder);
    $("highest-bidder").title = highestBidder;
  }
  if ($("unrevealed-deposits")) {
    $("unrevealed-deposits").textContent = fmtEth(unrevealed);
  }
  $("pending-returns").textContent = fmtEth(pending);

  if ($("role-badge")) {
    const isOwner = state.account.toLowerCase() === owner.toLowerCase();
    const roleIdx = $("role-selector")?.value;
    if (isOwner) {
      $("role-badge").textContent = "Owner · Auctioneer";
      $("role-badge").className = "pill pill-owner";
    } else if (state.useLocalRpc && roleIdx === "3") {
      $("role-badge").textContent = "Bidder · Guest (Restricted)";
      $("role-badge").className = "pill pill-warn";
    } else {
      $("role-badge").textContent = "Bidder";
      $("role-badge").className = "pill pill-ok";
    }
  }

  if ($("my-bid-status")) {
    const [commitment, deposit, revealed] = myBid;
    if (commitment === ethers.ZeroHash) {
      $("my-bid-status").textContent = "Chưa có cam kết (0 ETH)";
    } else if (revealed) {
      $("my-bid-status").textContent = `Đã mở giá · Cọc ${fmtEth(deposit)} (${commitment.slice(0, 10)}…)`;
    } else {
      $("my-bid-status").textContent = `Đã cam kết · Cọc ${fmtEth(deposit)} (${commitment.slice(0, 10)}…)`;
    }
  }

  await syncEvents();
  await tick();
}

async function tick() {
  if (!state.auction || !state.provider) return;
  try {
    const block = await state.provider.getBlock("latest");
    if (!block) return;
    const now = BigInt(block.timestamp);
    const [biddingEnd, revealEnd, phase] = await Promise.all([
      state.auction.biddingEnd(),
      state.auction.revealEnd(),
      state.auction.currentPhase(),
    ]);
    $("phase-label").textContent = PHASES[Number(phase)] ?? "?";
    let text;
    if (Number(phase) === 3) text = "Phiên đã hủy";
    else if (now < biddingEnd) text = `Bidding còn ${fmtDuration(Number(biddingEnd - now))}`;
    else if (now < revealEnd) text = `Reveal còn ${fmtDuration(Number(revealEnd - now))}`;
    else text = "Đã hết thời gian";
    $("countdown").textContent = text;
  } catch {
    /* ignore transient polling error */
  }
}

function subscribeEvents() {
  const a = state.auction;
  if (!a) return;
  a.removeAllListeners();
  const keyOf = (payload) =>
    payload?.log?.transactionHash ? `${payload.log.transactionHash}:${payload.log.index}` : null;

  a.on("BidCommitted", (bidder, commitment, deposit, payload) =>
    renderParsedEvent("BidCommitted", [bidder, commitment, deposit], keyOf(payload))
  );
  a.on("BidRevealed", (bidder, value, isHighest, payload) =>
    renderParsedEvent("BidRevealed", [bidder, value, isHighest], keyOf(payload))
  );
  a.on("HighestBidIncreased", (bidder, amount, payload) =>
    renderParsedEvent("HighestBidIncreased", [bidder, amount], keyOf(payload))
  );
  a.on("AuctionEnded", (winner, amount, payload) =>
    renderParsedEvent("AuctionEnded", [winner, amount], keyOf(payload))
  );
  a.on("Withdrawal", (account, amount, payload) =>
    renderParsedEvent("Withdrawal", [account, amount], keyOf(payload))
  );
  a.on("AuctionCancelled", (payload) =>
    renderParsedEvent("AuctionCancelled", [], keyOf(payload))
  );
}

// ---------------------------------------------------------------- Local RPC Time-Travel
async function advancePhase(targetPhase) {
  if (!state.auction) return toast("Hãy kết nối ví trước", true);
  try {
    const rpc = new ethers.JsonRpcProvider(LOCAL_RPC_URL, undefined, { cacheTimeout: -1 });
    const block = await rpc.getBlock("latest");
    const now = Number(block.timestamp);
    const deadline =
      targetPhase === "reveal"
        ? Number(await state.auction.biddingEnd())
        : Number(await state.auction.revealEnd());
    const delta = deadline - now + 1;
    if (delta > 0) {
      await rpc.send("evm_increaseTime", [delta]);
    }
    await rpc.send("evm_mine", []);
    await refresh();
    toast(
      targetPhase === "reveal"
        ? "Đã tua thời gian sang Pha Reveal"
        : "Đã tua thời gian sang Pha Ended"
    );
  } catch (err) {
    toast(`Tua thời gian thất bại: ${decodeError(err)}`, true);
  }
}

// ---------------------------------------------------------------- Actions
$("btn-connect").addEventListener("click", () => connect(state.useLocalRpc));

if ($("role-selector")) {
  $("role-selector").addEventListener("change", () => {
    state.useLocalRpc = true;
    connect(true);
  });
}

$("btn-generate-secret").addEventListener("click", () => {
  $("commit-secret").value = ethers.hexlify(ethers.randomBytes(32));
  computeCommitment();
});

["commit-value", "commit-secret"].forEach((id) => $(id).addEventListener("input", computeCommitment));

$("btn-commit").addEventListener("click", () => {
  if (!state.auction) return toast("Hãy kết nối ví trước", true);
  const c = computeCommitment();
  if (!c) return toast("Nhập giá bid và secret hợp lệ (bytes32)", true);
  const depositStr = $("commit-deposit").value || $("commit-value").value;
  const deposit = ethers.parseEther(depositStr);
  if (deposit < c.value) return toast("Tiền cọc phải ≥ giá bid", true);
  // Lưu secret TRƯỚC khi gửi giao dịch để không mất nếu trình duyệt đóng giữa chừng.
  saveSecret({
    value: ethers.formatEther(c.value),
    secret: c.secret,
    commitment: c.hash,
    auction: state.meta.address,
  });
  send("Commit", () => state.auction.commitBid(c.hash, { value: deposit }));
});

$("btn-download-secret").addEventListener("click", () => {
  const rec =
    loadSecret() ??
    (() => {
      const c = computeCommitment();
      return (
        c && {
          value: ethers.formatEther(c.value),
          secret: c.secret,
          commitment: c.hash,
          auction: state.meta?.address,
        }
      );
    })();
  if (!rec) return toast("Chưa có secret để tải", true);
  const blob = new Blob([JSON.stringify({ ...rec, account: state.account }, null, 2)], {
    type: "application/json",
  });
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `sealed-bid-secret-${short(state.account)}.json`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
});

$("btn-load-secret").addEventListener("click", () => {
  const rec = state.account && loadSecret();
  if (!rec) return toast("Không tìm thấy secret đã lưu cho tài khoản này", true);
  $("reveal-value").value = rec.value;
  $("reveal-secret").value = rec.secret;
  toast(`Đã tải secret đã lưu (${rec.value} ETH)`);
});

$("btn-reveal").addEventListener("click", () => {
  if (!state.auction) return toast("Hãy kết nối ví trước", true);
  const secret = $("reveal-secret").value.trim();
  if (!$("reveal-value").value || !ethers.isHexString(secret, 32)) {
    return toast("Nhập giá bid và secret hợp lệ", true);
  }
  send("Reveal", () => state.auction.revealBid(ethers.parseEther($("reveal-value").value), secret));
});

$("btn-withdraw").addEventListener("click", () =>
  state.auction ? send("Withdraw", () => state.auction.withdraw()) : toast("Hãy kết nối ví trước", true)
);

$("btn-auction-end").addEventListener("click", () =>
  state.auction ? send("auctionEnd", () => state.auction.auctionEnd()) : toast("Hãy kết nối ví trước", true)
);

if ($("btn-pause")) {
  $("btn-pause").addEventListener("click", () =>
    state.auction ? send("Pause", () => state.auction.pause()) : toast("Hãy kết nối ví trước", true)
  );
}

if ($("btn-unpause")) {
  $("btn-unpause").addEventListener("click", () =>
    state.auction ? send("Unpause", () => state.auction.unpause()) : toast("Hãy kết nối ví trước", true)
  );
}

if ($("btn-cancel")) {
  $("btn-cancel").addEventListener("click", () =>
    state.auction ? send("Cancel", () => state.auction.cancelAuction()) : toast("Hãy kết nối ví trước", true)
  );
}

if ($("btn-advance-reveal")) {
  $("btn-advance-reveal").addEventListener("click", () => advancePhase("reveal"));
}

if ($("btn-advance-end")) {
  $("btn-advance-end").addEventListener("click", () => advancePhase("end"));
}

// Đổi tài khoản / mạng trong MetaMask -> kết nối lại
if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", () => {
    state.useLocalRpc = false;
    connect(false);
  });
  window.ethereum.on?.("chainChanged", () => window.location.reload());
}

// Tự động kết nối khi mở trang (MetaMask hoặc fallback Local RPC Ganache/Hardhat)
connect();
