# KashLink

Send USDC as a link. No address, no account, no gas.

KashLink turns an amount of USDC into a shareable link. Whoever opens it keeps the money. It runs on
[Arc](https://arc.io), Circle's USDC-native chain, and it exists in this form *because* of Arc: on a
chain where USDC is the gas token, a throwaway link can pay for its own claim.

- **Live:** _mainnet deployment pending — see [`contracts/deployments.md`](contracts/deployments.md)_
- **Contract:** `KashLinkEscrow` — [testnet, verified](https://explorer.testnet.arc.io/address/0x1a250562953F1124F745ed347Eec8832bbf07241)
- **Built for:** [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail)

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

Arc's instant finality does the rest: the claim screen shows "received" on the next block, with no
confirmation countdown.

---

## How a link works

1. The sender's browser generates a key pair. The private key goes in the URL fragment
   (`…/#<key>`); fragments never reach a server. The address is the link's id.
2. The sender's wallet calls `KashLinkEscrow.create(id, amount, expiry)` with
   `amount + fee + 0.01 USDC`. The contract escrows `amount`, sends the fee to the treasury, and
   sends the cent to the link address.
3. The recipient opens the link, types or connects an address to receive at, and the app sends
   `claim(to)` **from the link address**, gas paid by that cent. The contract pays `amount` to `to`.
4. If nobody claims before `expiry` (the sender picks 1, 7 or 30 days), the sender presses Return and
   `refund(id)` sends it back — from any device, since only the sender's wallet is needed.

**Whoever holds the link controls the money.** Share it like cash.

## The contract

[`contracts/src/KashLinkEscrow.sol`](contracts/src/KashLinkEscrow.sol), ~200 lines, no
dependencies, 34 Foundry tests including reentrancy and fee fuzzing.

| | |
|---|---|
| `create(id, amount, expiry)` payable | escrow `amount`; fee → treasury; stipend → `id` |
| `claim(to)` | `msg.sender` must be the link id; pays `amount` to `to`; any time while pending |
| `refund(id)` | sender only, after `expiry` |
| `setFees(bps, min, treasury)` | owner; `bps ≤ 500` |

What the owner **cannot** do: touch escrowed funds, pause, or upgrade. There is no proxy. A claim
and a refund on the same link cannot both succeed.

Everything is native USDC in 18-decimal wei — `msg.value`, `eth_getBalance`. The app never calls the
6-decimal ERC-20 view at `0x3600…0000`, so the two can't be confused. Every transaction sets
`maxFeePerGas ≥ 20 gwei`, because Arc's mempool silently drops anything lower.

## Fees

| | |
|---|---|
| Service fee | **1%** flat, paid by the sender on top — no minimum, so a $1 link costs a cent |
| Prepaid claim gas | **$0.01**, sent to the link address; a claim uses ~$0.0014 of it |
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
    wallet.ts              EIP-6963 wallet discovery, add/switch to Arc
    links.ts               link model: keys, URLs, create / claim / refund, on-chain status
    storage.ts             localStorage — link keys live here so links can be re-shared
    format.ts              USDC formatting and parsing
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
cd contracts && forge test # 34 tests
```

Get testnet USDC from [faucet.circle.com](https://faucet.circle.com) (network: Arc Testnet). Any
EVM wallet works as the sender; the app adds the Arc network to it on connect. Claiming needs no
wallet at all — connect one, or paste any address.

`npm run build` type-checks and bundles to `dist/`. Production builds default to mainnet.

## Configuration

All `VITE_` variables are baked in at build time. See [`.env.example`](.env.example).

| Variable | Purpose |
|---|---|
| `VITE_ARC_NETWORK` | `mainnet` / `testnet`. Default: testnet in dev, mainnet in production. |
| `VITE_ESCROW_ADDRESS` | The escrow on that network. Unset ⇒ links can't be created. |
| `VITE_ESCROW_DEPLOY_BLOCK` | Where to start scanning for the wallet's past links. |
| `VITE_PUBLIC_URL` | Public URL that shared links point at. |
| `VITE_ARC_RPC_URL` | Override the public RPC. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Analytics. Unset ⇒ nothing is recorded. |

## Deployment

**Contract** — see [`contracts/README.md`](contracts/README.md). Deployer key in a Foundry keystore,
never in a file. Verify on Blockscout with `--verifier blockscout`.

**Frontend** — any static host; `vercel.json` is included. Set `VITE_ARC_NETWORK=mainnet` and
`VITE_ESCROW_ADDRESS` to the mainnet contract.

**Analytics** — paste `supabase/schema.sql` into the Supabase SQL editor. The anon key can only
append events; it cannot read the table, enumerate links or erase history.

## Security notes

- **The contract holds the money, not the app and not us.** The only paths out are `claim` (link
  key) and `refund` (sender, after expiry). The app can disappear and both still work by calling the
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
- **Not audited.** Tests, yes; independent audit, no. Don't put more in a link than you'd hand over
  in cash.

## Licence

MIT
