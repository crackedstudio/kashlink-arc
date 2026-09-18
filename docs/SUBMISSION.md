# Arc Microgrants submission — KashLink

Everything the DoraHacks form asks for, in one place. Items marked `TODO` are filled in after the
mainnet deploy.

## Links

| | |
|---|---|
| Live app | https://kashlinkarc.vercel.app |
| Repo | https://github.com/crackedstudio/kashlink-arc (public, MIT) |
| Contract (Arc mainnet) | [`0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62`](https://explorer.arc.io/address/0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62), deploy tx [`0x229fa32c…cb29`](https://explorer.arc.io/tx/0x229fa32c19ad2291dc8aa52a5959bace6881c1c0147cc12fd5ff4254ba69cb29) |
| Contract (Arc testnet) | [same address](https://explorer.testnet.arc.io/address/0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62), verified |
| Live stats | https://kashlinkarc.vercel.app/stats |
| Builder profile | `TODO` GitHub / X / Farcaster |

## Description (≈150 words, for the form)

KashLink sends USDC or EURC as a link. Whoever opens the link keeps the money — no address to ask
for, no wallet to set up first, no gas. One link can be cash for one person or a *drop* that the first
N people to open it share.

It only works this simply because of Arc. A link is a throwaway key; on any other chain that key's
address holds the money but no gas, so a relayer and meta-transactions are needed to move it. On
Arc, USDC *is* the gas: the escrow contract places one cent on the link address when the sender
funds it, and the recipient's claim pays for itself. Instant finality makes the claim screen say
"received" a block later, and makes a 50-person drop a fair race instead of a queue.

Everything is on chain: an immutable escrow that keeps its own totals and per-sender index (no
backend, no indexer), verified source, a flat 1% fee enforced by the contract. Recipients with no
wallet can create a passkey wallet on the spot.

## What it uses Arc for (one paragraph, if asked separately)

USDC as the native gas token is the whole trick: a freshly generated link address can pay for its own
claim from the cent the escrow drops on it, so there is no relayer, no second token and no
onboarding step for the recipient. Instant finality resolves concurrent drop claims from one link
address and lets the UI treat one confirmation as final. EURC being a genesis stablecoin makes a
euro link the same code path as a dollar one. And because Arc's public RPC caps log ranges and the
explorer is rate-limited, the contract was designed to be its own index — cheap enough here that a
stats page is a handful of `view` calls.

## Proof it works (mainnet)

| Step | Tx |
|---|---|
| Deploy | [`0x229fa32c…cb29`](https://explorer.arc.io/tx/0x229fa32c19ad2291dc8aa52a5959bace6881c1c0147cc12fd5ff4254ba69cb29) |
| Create a $1 link | `TODO` |
| Claim it to a second address | `TODO` |
| Create a 3-person drop, claim two slots | `TODO` |
| Refund the remainder after expiry | `TODO` |
| Create and claim a €1 EURC link | `TODO` |

Testnet equivalents for every step are in [`contracts/deployments.md`](../contracts/deployments.md).

## Demo

~2 min Remotion video with voice-over and music in [`video/`](../video/README.md): the problem, why Arc (USDC-as-gas flow),
sender walkthrough (amount → review → ready sheet with QR), recipient walkthrough (chat → claim →
passkey wallet → received), features, contract credibility, links. `cd video && npm install && npm run render`
→ `video/out/kashlink-demo.mp4`. Upload to YouTube/Loom and paste the link in the DoraHacks form.

## Screenshots

`TODO` intro, amount (drop + EURC), review, ready sheet with QR, claim, stats — phone width.

## Checklist against the programme rules

- [x] Deployed and working on Arc mainnet `TODO after Phase C`
- [x] Public repo
- [x] Description says what it does and what it uses Arc for
- [ ] Builder profile linked
- [x] Not a mockup, not testnet-only, no prior Circle/Arc funding
- [x] One submission for this project
- [x] Wallet that can receive USDC on Arc: the deployer/treasury address
