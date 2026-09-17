# KashLink → Arc: implementation plan

Rewrite KashLink from a Nimiq Pay mini app (NIM + USDT-on-Polygon) into a standalone web app that
sends **USDC on Arc mainnet** as a link, backed by an **escrow contract**. Target: the
[Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail) programme.

- Deadline: **October 14, 2026, 23:59 ET**. Rolling review — submit as early as it works.
- Submission needs: live deployment on **Arc mainnet** (testnet-only is ineligible), a **public repo**,
  a short description of what the project does and *what it uses Arc for*, a builder profile.
- Branding stays **KashLink**.

---

## 0. Rules for the agent doing the work

1. **Commit after every step below.** One step, one commit, on `main`. Commit message = the step
   title (e.g. `Step 2.1: Escrow contract`). Push at the end of every phase. Do not batch steps.
2. **Never commit secrets.** No private keys, RPC keys, or `.env` files. `.env.example` only.
   Deployer keys live in a Foundry keystore (`cast wallet import`), never in `--private-key` flags
   or shell history for mainnet.
3. **Mainnet transactions are irreversible and cost real USDC.** The agent runs everything on
   **testnet (5042002)**. Mainnet deployment and mainnet test links are run by the user from their
   own terminal, with commands the agent prepares. The agent never holds the mainnet key.
4. **Read [EVM differences](https://docs.arc.io/arc/references/evm-differences) before touching
   anything that moves value.** Short version, all of which this plan already accounts for:
   - USDC is the native token. `msg.value`, `eth_getBalance`, and gas are **18 decimals**. The
     ERC-20 view at `0x3600…0000` is **6 decimals** and shares the same balance. **This project uses
     the native interface only** and never calls the ERC-20 contract, so the 6/18 footgun cannot fire.
   - Every tx must set `maxFeePerGas ≥ 20 gwei` or the mempool **silently drops** it.
   - Value transfers to `address(0)` revert. Transfers to blocklisted addresses revert.
   - `PREVRANDAO` is 0, `block.timestamp` is non-decreasing (not strictly increasing). Use block
     number for ordering; timestamp is fine for a 7-day expiry.
   - Finality is instant: one confirmation is final.
5. Keep the existing code style (comment density, naming). Delete dead code rather than leaving it
   behind a flag. When in doubt, simpler.
6. Verify each step in the browser (`npm run dev`) or with `forge test` before committing it.

### Network reference

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `5042` | `5042002` |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Explorer (Blockscout) | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| Faucet | — real USDC | `https://faucet.circle.com` |
| Native token | USDC (18 dec) | USDC (18 dec) |
| Verifier URL | `https://explorer.arc.io/api/` | `https://explorer.testnet.arc.io/api/` |

viem ships `arc` and `arcTestnet` in `viem/chains` (confirm at Step 3.1; if absent, `defineChain`).

---

## 1. Design

### Why this is Arc-native

On Polygon, KashLink needed a gas relayer and EIP-712 meta-transactions because a throwaway link
address held USDT but no POL. On Arc **the USDC in the link is the gas**, so the relayer, the
meta-transaction machinery, and the Supabase edge function all disappear. The escrow contract then
fixes the two limitations the old README had to confess: fees become enforceable, and a sender can
take back an unclaimed link from any device — no key needs to survive in `localStorage` for that.

### How a link works

1. Sender's app generates a fresh secp256k1 key pair. The private key goes in the URL fragment
   (`https://<host>/#<32-byte-hex>`); the address is the **link id**.
2. Sender's wallet calls `KashLinkEscrow.create(linkId, expiry)` with `msg.value =
   amount + fee + stipend`. The contract keeps `amount` in escrow, forwards `fee` to the treasury,
   and forwards `stipend` (0.01 USDC) to the link address so it can pay its own claim gas.
3. Recipient opens the link. The app derives the account from the fragment, asks for a payout
   address (paste, or connect a wallet to fill it), and sends `claim(to)` **signed by the link key,
   gas paid from the stipend**. One transaction, instant finality, no wallet required to claim
   beyond an address to receive at.
4. If nobody claims before `expiry`, the sender presses Return → `refund()` from their wallet.

### Contract: `contracts/src/KashLinkEscrow.sol`

```solidity
struct Link { address sender; uint96 amount; uint64 expiry; Status status; }  // packs to 2 slots
enum Status { None, Pending, Claimed, Refunded }
mapping(address linkId => Link) public links;

address public owner;            // fee governance only; cannot touch escrowed funds
address public treasury;
uint16  public feeBps;           // hard-capped: require(feeBps <= 500)  (5 %)
uint96  public feeMin;           // optional floor; 0 in production (flat 1%)
uint96  public constant STIPEND = 1e16;   // 0.01 USDC, ~8× a claim's gas at the 20 gwei floor

function feeFor(uint256 amount) public view returns (uint256);   // max(amount*feeBps/1e4, feeMin), 0 if feeBps==0 && feeMin==0
function create(address linkId, uint64 expiry) external payable; // msg.value == amount + feeFor(amount) + STIPEND; amount derived
function claim(address to) external;                             // msg.sender == linkId, Pending → Claimed, pay `to`
function refund(address linkId) external;                        // Pending, msg.sender == sender, block.timestamp >= expiry
function setFees(uint16 bps, uint96 min, address treasury) external; // onlyOwner
function transferOwnership(address) external;                    // two-step (Ownable2Step-style)

event LinkCreated(address indexed linkId, address indexed sender, uint256 amount, uint64 expiry);
event LinkClaimed(address indexed linkId, address indexed to, uint256 amount);
event LinkRefunded(address indexed linkId, address indexed sender, uint256 amount);
```

Rules the implementation must satisfy:

- `create`: `links[linkId].status == None`; `linkId != 0`; `expiry > block.timestamp`;
  `msg.value > feeFor(...) + STIPEND`. Because fee depends on amount and amount depends on
  `msg.value`, take `amount` as an explicit parameter and `require(msg.value == amount + feeFor(amount) + STIPEND)` —
  simpler and exact. Update the signature to `create(address linkId, uint96 amount, uint64 expiry)`.
- `claim` is allowed **any time** while `Pending`, including after expiry — money must never be
  stuck if the sender never refunds. `refund` and `claim` cannot both succeed (status check).
- Checks-effects-interactions plus a `nonReentrant` guard. Payouts use `call{value: …}("")` and
  `require(ok)`. A payout to a contract that reverts makes the claim revert; that is correct.
- `to != address(0)` (Arc would revert anyway; fail with a readable reason).
- Owner can change fees and treasury, **nothing else**. No pause, no sweep, no upgrade. State this
  in the NatSpec — it is what a reviewer will look for.
- Solidity `^0.8.28`, `evm_version = "osaka"` if the compiler supports it, else `cancun`.

Foundry tests (`contracts/test/KashLinkEscrow.t.sol`) must cover: create/claim happy path; create
with wrong `msg.value`; duplicate `linkId`; claim by non-link-key; claim after claim; refund before
expiry (revert); refund after expiry; claim after expiry still works; refund by non-sender; fee
maths at both sides of the floor and with fees disabled; stipend actually lands on `linkId`;
`setFees` cap; reentrancy via a malicious `to`; events.

### Client

- **Framework unchanged:** Vue 3 + Vite + TypeScript + viem. No new UI framework.
- **Sender wallet:** any injected EVM wallet via EIP-6963 discovery (MetaMask, Rabby, Coinbase
  Wallet…). On connect, `wallet_switchEthereumChain` → on `4902` `wallet_addEthereumChain` with the
  Arc params. All amounts are 18-decimal `bigint`; format with `formatUnits(v, 18)` and parse with
  `parseUnits(input, 18)`. Never import the ERC-20 ABI.
- **Fees on every write:** `maxFeePerGas = max(estimate, 20 gwei)`, `maxPriorityFeePerGas = 1 gwei`.
  Put this in one helper (`src/lib/arc.ts`) and use it everywhere.
- **Claiming** uses `privateKeyToAccount(fragment)` + `createWalletClient` → `writeContract(claim)`.
  Before sending, read the link (`links(linkId)`) and show the right screen: Pending / Claimed /
  Refunded / unknown link / insufficient stipend (edge: someone drained it — show "ask the sender to
  return and resend").
- **Sender's links:** keys stay in `localStorage` (needed to re-share). Status comes from
  `links(linkId)` on chain. Additionally, on wallet connect, `eth_getLogs` for `LinkCreated` filtered
  by `sender` rebuilds the list on a device that has no keys (status + Return button work; re-share
  does not, and the UI says so).
- **Link URL:** `${VITE_PUBLIC_URL}/#${privateKey}`. Drop the `/u` route and the nimpay.app
  wrapper. Add `<meta name="referrer" content="no-referrer">` and keep the rule that analytics never
  reads `location`.
- **Fiat:** USDC is the unit; delete price fetching. Show "$5.00" directly.
- **Analytics:** keep `src/lib/analytics.ts` and `supabase/schema.sql`, rename events to
  `link_created / link_claimed / link_refunded`, drop token columns.

### What gets deleted

`@nimiq/*` packages, `src/lib/nimiq.ts`, `src/lib/kashlink.ts` (NIM cashlink encoding),
`src/lib/usdt.ts`, `src/lib/usdt-links.ts`, `src/lib/provider.ts` (Nimiq Pay provider),
`src/lib/fiat.ts`, `supabase/functions/relay/`, `supabase/migration-usdt.sql`, the `/u` rewrite in
`vercel.json`, Nimiq Pay dev-menu instructions, the USDT-on-Polygon EIP-712 domain notes.

---

## 2. Phase A — Contract (testnet)

**Step 2.0 — Tooling.** Install Foundry. Prefer Circle's Arc fork
([circlefin/arc-foundry](https://github.com/circlefin/arc-foundry/releases), binaries `arc-forge`,
`arc-cast`, `arc-anvil` — `arc-anvil --network arc` simulates Arc's value-transfer rules locally).
Standard Foundry also works for compile/test/deploy. Create `contracts/` with `forge init --no-git`,
add `foundry.toml` (`src = "src"`, `out = "out"`, `evm_version`, `optimizer = true`, `optimizer_runs = 200`,
`[rpc_endpoints] arc = "${ARC_MAINNET_RPC_URL}", arc_testnet = "${ARC_TESTNET_RPC_URL}"`), add
`contracts/.env.example`, extend root `.gitignore` with `contracts/out`, `contracts/cache`,
`contracts/broadcast/**/dry-run`, `.env*`. Commit.

**Step 2.1 — Escrow contract.** Write `KashLinkEscrow.sol` per §1 with full NatSpec. `forge build`
clean. Commit.

**Step 2.2 — Tests.** Write the test file per §1. `forge test -vvv` green, including a reentrancy
attacker contract and a fuzz test on fee maths. Commit.

**Step 2.3 — Deploy script.** `contracts/script/Deploy.s.sol` reading `TREASURY`, `FEE_BPS`,
`FEE_MIN` from env. Add `contracts/README.md` with the exact deploy + verify commands for testnet
and mainnet:

```bash
# testnet (agent runs this; key from `cast wallet import arc-testnet --interactive`)
forge script script/Deploy.s.sol --rpc-url arc_testnet --account arc-testnet --broadcast
forge verify-contract <ADDR> src/KashLinkEscrow.sol:KashLinkEscrow \
  --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/
```

Commit.

**Step 2.4 — Testnet deployment.** Fund a throwaway testnet key from `faucet.circle.com`, deploy,
verify on `explorer.testnet.arc.io`, exercise `create → claim` and `create → refund` with
`cast send` (remember `--gas-price 20gwei` or `--priority-gas-price`). Record the address, tx hashes
and explorer links in `contracts/deployments.md`. Commit.

Push.

---

## 3. Phase B — Client rewrite

**Step 3.1 — Chain + wallet layer.** `src/lib/arc.ts`: chain object (`arc` / `arcTestnet` from
viem, chosen by `VITE_ARC_NETWORK`), public client, the fee helper, explorer URL helpers, contract
address from `VITE_ESCROW_ADDRESS`, and the ABI (generate from `contracts/out` with a small script
`scripts/abi.ts` → `src/lib/escrow-abi.ts`; commit the generated file). Rewrite `src/lib/wallet.ts`
for EIP-6963 + chain switching. Remove `@nimiq/*` from `package.json`, delete the files listed in
§1. `npm run build` must pass (stub screens if needed). Commit.

**Step 3.2 — Link model.** `src/lib/links.ts`: `newLink()`, `encodeUrl(key)`, `decodeUrl()`,
`readLink(linkId)`, `createLink(amount, expiry)` (sender wallet), `claimLink(key, to)`,
`refundLink(linkId)`, `myLinksFromChain(sender)` via `getLogs`. `src/lib/storage.ts` stays but
stores `{ key, createdAt, amount }` only. Unit-test the encode/decode and the fee/total maths with
Vitest (add it as a dev dependency). Commit.

**Step 3.3 — Sender flow.** `IntroScreen` (connect wallet, add Arc network, show USDC balance) →
`AmountScreen` (dollar input, presets, expiry selector defaulting to 7 days) → `ReviewScreen` (amount,
fee, stipend, total, "fee is charged whether the link is claimed or returned") → `ReadySheet` (link,
copy, share via Web Share API, QR). Commit.

**Step 3.4 — Claim flow.** `ClaimScreen`: reads fragment, shows amount + sender + status, payout
address field with "use my wallet" button, claims, shows the explorer link. Handles every state
listed in §1. Commit.

**Step 3.5 — My links.** `LinksSheet`: list from `localStorage` merged with `getLogs`, per-link
status, "x of y claimed · $z still out there", Return button when expired, re-share when the key
is present. Commit.

**Step 3.6 — Housekeeping.** `index.html` meta/OG tags, `vercel.json` (remove `/u`, keep caching
headers), `.env.example` rewritten, `src/style.css` untouched unless needed, analytics event rename,
`kashlink-flier.*` regenerated or removed, `public/` icons kept. `npm run build` clean, no unused
exports (`npx knip` or a quick grep). Commit.

**Step 3.7 — Testnet end-to-end.** With `VITE_ARC_NETWORK=testnet` and the Step 2.4 address: create
a link from a MetaMask testnet account, open it in a private window, claim to a second address,
create another, wait/advance expiry (deploy a second testnet instance with a short `expiry` for
this), refund. Fix what breaks. Commit.

Push.

---

## 4. Phase C — Mainnet (user-run steps marked 👤)

**Step 4.0 👤 — Fund a deployer.** See "Getting USDC on Arc mainnet" below. ~$20 USDC is plenty:
deployment is ~0.05 USDC, each test link a few cents plus the amount.

**Step 4.1 👤 — Deploy + verify on mainnet.** Agent prepares the exact commands in
`contracts/README.md`; user runs them from the Terminal tab with a keystore account
(`cast wallet import arc-mainnet --interactive`). Agent records address/tx/explorer link in
`contracts/deployments.md` and sets `VITE_ESCROW_ADDRESS` for production. Commit.

**Step 4.2 — Production build + Vercel.** `VITE_ARC_NETWORK=mainnet`, `VITE_PUBLIC_URL`,
`VITE_ESCROW_ADDRESS`, analytics vars set in Vercel. Deploy. Confirm the live URL loads, connects,
and reads the contract. Commit any config change.

**Step 4.3 👤 — Mainnet smoke test.** User creates a $1 link, claims it to a second address, creates
another and (with a 1-hour expiry) refunds it. Agent adds the three explorer links to the README as
proof of a working mainnet deployment.

Push.

---

## 5. Phase D — Submission

**Step 5.1 — README rewrite.** Structure: one-line pitch; "What it uses Arc for" (the gas-is-the-
money paragraph, verbatim usable in the DoraHacks form); how a link works; the contract (address,
verified link, what the owner can and cannot do); fees; layout; development (testnet, faucet);
configuration; deployment; security notes (key in fragment, no server ever sees it, analytics never
reads `location`, contract holds funds not the app, stipend drain edge case). Commit.

**Step 5.2 — Submission kit.** `docs/SUBMISSION.md` with: 150-word description, the live URL, repo
URL, contract address + explorer link, three proof transactions, screenshots, builder profile links,
and a 60–90 s demo recording (`docs/demo.mp4` or a Loom link — optional but strongly recommended).
Confirm `gh repo view --json visibility` says **PUBLIC**. Commit, push.

**Step 5.3 👤 — Submit** on DoraHacks. Then keep building: microgrants are reviewed on a rolling
basis and decisions are per batch.

---

## Getting USDC on Arc mainnet (for the user)

1. **Wallet.** MetaMask or Rabby. Add the network — either the one-click button on
   [docs.arc.io/integrate/connect-to-arc](https://docs.arc.io/integrate/connect-to-arc) or manually:
   RPC `https://rpc.mainnet.arc.io`, chain ID `5042`, symbol `USDC`, explorer `https://explorer.arc.io`.
   Create a **separate account** in the wallet for deployment so the deployer key never mixes with
   personal funds.
2. **Fund it** (any one):
   - **Exchange withdrawal** — Kraken and KuCoin listed Arc as a USDC withdrawal network on launch
     day. Withdraw USDC, network **Arc**, to the deployer address. Cheapest and simplest.
   - **CCTP bridge** from USDC on Base / Ethereum / Arbitrum / Polygon etc. Use Circle's own bridge
     (linked from arc.io) or an aggregator such as RocketX. Arc's CCTP domain is `26`.
   - **Testnet first** — `faucet.circle.com` gives free testnet USDC on chain `5042002`; the agent
     uses this for all development.
3. **Amount.** $20 covers deployment, verification retries and a dozen test links.
4. **Deployer key into Foundry** (never into a file in the repo):
   ```bash
   cast wallet import arc-mainnet --interactive
   ```
   It prompts for the private key and a password and stores an encrypted keystore in
   `~/.foundry/keystores/`. Deploy commands then use `--account arc-mainnet`.
