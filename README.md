# KashLink

Send USDC as a link. No address, no account, no gas.

KashLink turns an amount of USDC or EURC into a shareable link. Whoever opens it keeps the money.
One link can be cash for one person; several people each get their own link, funded together; or an
open **drop** is one link the first few to open it share. It runs on
[Arc](https://arc.io), Circle's USDC-native chain, and it exists in this form *because* of Arc: on a
chain where USDC is the gas token, a throwaway link can pay for its own claim.

- **Live:** https://arc.kashlink.live — Arc mainnet
- **Contract:** `KashLinkEscrow` [`0x4d6c…9C62`](https://explorer.arc.io/address/0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62) on mainnet, and the [same address on testnet](https://explorer.testnet.arc.io/address/0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62) (verified)
- **Built for:** [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail)

| | |
|---|---|
| **Cash links** | one link, one person, any amount of USDC or EURC |
| **A link each** | up to 100 people, one link per person, funded in one transaction; nobody can take another's share |
| **Open drops** | one link, up to 100 slots, first come first served — whoever holds it can claim every slot |
| **Notes and QR** | a message rides in the link (never on a server); a QR for in-person handoff |
| **Returns** | anything unclaimed comes back to the sender after 1, 7 or 30 days — from any device |
| **No wallet? No problem** | a recipient can create a passkey wallet on the spot (Circle Modular Wallets) and claim into it |
| **Live stats** | `/stats` reads totals the contract keeps itself; no backend, no indexer |

---

## What it uses Arc for

Every "cash link" product has the same problem: the link is a fresh address, and a fresh address
has no gas, so the recipient can't move the money out. The usual answers are a relayer (someone
else pays the gas — a hot wallet to run, meta-transactions to sign, an API to keep up) or asking the
recipient to first go and buy the gas token, which defeats the point.

On Arc the native token *is* USDC. So when a sender funds a link, the contract drops one cent of
USDC on the link's address, and that cent is the gas for the claim. The recipient signs one plain
transaction with the key in the link and the chain accepts it. No relayer, no second token, no
"first install a wallet". The previous version of this app (for Polygon) needed a Supabase edge
function, an EIP-712 meta-transaction scheme and a funded hot wallet to do what one `call{value}`
does here. That is the whole reason it is on Arc.

Drops push the same idea further: a 50-person drop puts fifty cents of gas on one link address and
fifty people claim from it, each paying ~$0.0014, with instant finality resolving the race between
them. EURC links use Arc's second genesis stablecoin, with the claim gas still paid in USDC from the
stipend — so a recipient of euros never needs to hold anything either.

---

## How a link works

1. The sender's browser generates a key pair. The private key goes in the URL fragment
   (`…/#<key>&m=<note>`); fragments never reach a server. The address is the link's id.
2. The sender's wallet calls `KashLinkEscrow.create(id, token, amountEach, slots, expiry)`. For USDC
   the value is `amountEach × slots + fee + 0.01 × slots`; for EURC the tokens are pulled with
   `transferFrom` and the value is only the stipends. The contract escrows the total, sends the fee
   to the treasury, and sends one cent per slot to the link address.
3. The recipient opens the link, connects a wallet or pastes an address, and the app sends
   `claim(to)` **from the link address**, gas paid by that cent. The contract pays `amountEach` to
   `to`. Each address can take one slot of a drop — but addresses are free, so a drop is only a
   first-come-first-served giveaway: one holder of the link can claim every slot to fresh addresses.
   To pay several **specific** people, the app funds one single-slot link per person with
   `createMany(ids, token, amountEach, expiry)` instead; each link pays out once.
4. If slots are left after `expiry` (the sender picks 1, 7 or 30 days), the sender presses Return and
   `refund(id)` sends the remainder back — from any device, since only the sender's wallet is needed.
   `refundMany(ids)` returns several expired links in one transaction.

**Whoever holds the link controls the money.** Share it like cash.

## The contract

[`contracts/src/KashLinkEscrow.sol`](contracts/src/KashLinkEscrow.sol), ~260 lines, no
dependencies, 39 Foundry tests including reentrancy, ERC-20 failure modes and fee fuzzing.

| | |
|---|---|
| `quote(token, amountEach, slots)` | what the sender pays: token total, fee, native value |
| `create(id, token, amountEach, slots, expiry)` payable | escrow the total; fee → treasury; one stipend per slot → `id` |
| `claim(to)` | `msg.sender` must be the link id; one slot per `to`; pays `amountEach`; any time while pending |
| `refund(id)` | sender only, after `expiry`; returns `amountEach × unclaimed slots` |
| `linksOf(sender)`, `counters()`, `totals(token)`, `DEPLOYED_AT` | the contract's own index: per-sender link lists, lifetime counts and per-token totals |
| `setFees(bps, min, treasury)` | owner; `bps ≤ 500` |

What the owner **cannot** do: touch escrowed funds, pause, or upgrade. There is no proxy. A claim
and a refund on the same link cannot both succeed.

The contract is its own index because nothing else on Arc can be: the public RPC caps `eth_getLogs`
at a few thousand blocks and the explorer API is rate-limited (and Cloudflare-challenged on
mainnet). A few extra `SSTORE`s per operation cost a fraction of a cent here, and the stats page and
cross-device history become plain `view` calls.

USDC links are native 18-decimal wei — `msg.value`, `eth_getBalance`; the app never calls the
6-decimal ERC-20 view at `0x3600…0000`, so the two can't be confused. EURC is a normal 6-decimal
ERC-20 and the escrow checks its return values. Every transaction sets `maxFeePerGas ≥ 20 gwei`,
because Arc's mempool silently drops anything lower. Concurrent drop claims share one sender
address, so the client fetches the pending nonce and retries on a collision.

## Fees

| | |
|---|---|
| Service fee | **1%** of the link total, flat, paid by the sender on top — no minimum, so a $1 link costs a cent |
| Prepaid claim gas | **$0.01 per slot**, sent to the link address; a claim uses ~$0.0014 of it |
| Charged | at creation, whether the link is later claimed or returned |

Charging at creation is what makes create-then-refund pointless as an attack. The fee is enforced by
the contract, not the app, so it can't be skipped by importing the key into another wallet — which
was the "honest limitation" of the pre-Arc version.

---

## Project layout

```
contracts/
  src/KashLinkEscrow.sol   the escrow
  test/                    Foundry tests
  script/Deploy.s.sol      deployment; owner = broadcaster
  deployments.md           addresses and proof transactions per network
src/
  lib/
    arc.ts                 chain config, public client, fee floor, explorer URLs
    tokens.ts              USDC (native) and EURC (ERC-20): formatting, balances
    wallet.ts              EIP-6963 wallet discovery, add/switch to Arc
    links.ts               link model: keys, URLs, notes, quotes, create / claim / refund, status
    passkey.ts             Circle Modular Wallets: passkey wallet for recipients (loaded on demand)
    stats.ts               the /stats page, from the contract's counters and totals
    storage.ts             localStorage — link keys live here so links can be re-shared
    format.ts              dates, addresses, countdowns
    analytics.ts           usage events (never reads the URL; see the note in the file)
    escrow-abi.ts          generated from contracts/out by `npm run abi`
  components/              one file per screen
supabase/                  analytics table (append-only RLS) and dashboard queries
docs/ARC_MIGRATION_PLAN.md the plan this was built from
```

## Development

Requires Node 20.19+ and [Foundry](https://getfoundry.sh).

```bash
npm install
cp .env.example .env       # points at the verified testnet contract by default
npm run dev                # http://localhost:5191, Arc Testnet
npm test                   # vitest
cd contracts && forge test # 39 tests
```

Get testnet USDC and EURC from [faucet.circle.com](https://faucet.circle.com) (network: Arc Testnet).
Any EVM wallet works as the sender; the app adds the Arc network to it on connect. Claiming needs no
wallet at all — connect one, or paste any address.

`npm run build` type-checks and bundles to `dist/`. Production builds default to mainnet.

## Configuration

All `VITE_` variables are baked in at build time. See [`.env.example`](.env.example).

| Variable | Purpose |
|---|---|
| `VITE_ARC_NETWORK` | `mainnet` / `testnet`. Default: testnet in dev, mainnet in production. |
| `VITE_ESCROW_ADDRESS` | The escrow on that network. Unset ⇒ links can't be created. |
| `VITE_ESCROW_LEGACY` | Comma-separated earlier escrows on the same network, so their links still claim and refund. |
| `VITE_ESCROW_DEPLOY_BLOCK` | Where to start scanning for the wallet's past links. |
| `VITE_PUBLIC_URL` | Public URL that shared links point at. |
| `VITE_ARC_RPC_URL` | Override the public RPC. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Analytics. Unset ⇒ nothing is recorded. |
| `VITE_CIRCLE_CLIENT_KEY` | Circle Console client key. Unset ⇒ the passkey-wallet option is hidden. |
| `VITE_CIRCLE_SPONSOR_GAS` | `true` / `false`: Circle Gas Station pays passkey-wallet gas. Default: on for testnet, off for mainnet (needs a paymaster policy). |

## Deployment

**Contract** — see [`contracts/README.md`](contracts/README.md). Deployer key in a Foundry keystore,
never in a file. Verify on Blockscout with `--verifier blockscout`.

**Frontend** — any static host; `vercel.json` is included. Set `VITE_ARC_NETWORK=mainnet` and
`VITE_ESCROW_ADDRESS` to the mainnet contract.

**Analytics** — paste `supabase/schema.sql` into the Supabase SQL editor. The anon key can only
append events; it cannot read the table, enumerate links or erase history.

## Security notes

- **The contract holds the money, not the app and not us.** The only paths out are `claim` (link
  key) and `refund` / `refundMany` (sender, after expiry). The app can disappear and both still work by calling the
  contract directly.
- **Link keys never leave the device.** URL fragment plus `localStorage`. The page sends
  `Referrer-Policy: no-referrer` so a fragment can't leak through a referrer either.
- **Analytics never reads `location`.** Every value sent is passed explicitly — see
  `src/lib/analytics.ts`.
- **Losing the key doesn't lose the money.** It loses the ability to re-share; the sender can still
  refund after expiry from their wallet.
- **Stipend drain.** Someone holding a link could spend its cent on something else and leave the link
  unclaimable until the sender refunds it. The claim screen detects this and says so. Cost of the
  attack: the attacker's own cent, and the sender's fee.
- **Drops are first come, first served.** The contract allows one slot per *address*, and addresses
  are free, so whoever holds a drop link can claim every slot. The app labels drops that way and
  defaults to a link each when paying several people, where one link can only ever pay once.
- **Not audited.** Tests, yes; independent audit, no. Don't put more in a link than you'd hand over
  in cash.

## Licence

MIT
