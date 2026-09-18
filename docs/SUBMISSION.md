# Arc Microgrants submission — KashLink

Everything the DoraHacks form asks for, in one place. Items marked `TODO` are filled in after the
mainnet deploy.

## Links

| | |
|---|---|
| Live app | https://arc.kashlink.live |
| Repo | https://github.com/crackedstudio/kashlink-arc (public, MIT) |
| Contract (Arc mainnet) | [`0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62`](https://explorer.arc.io/address/0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62), deploy tx [`0x229fa32c…cb29`](https://explorer.arc.io/tx/0x229fa32c19ad2291dc8aa52a5959bace6881c1c0147cc12fd5ff4254ba69cb29) |
| Contract (Arc testnet) | [same address](https://explorer.testnet.arc.io/address/0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62), verified |
| Live stats | https://arc.kashlink.live/stats |
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
| Create a $0.10 USDC link | [`0x8ebc7f6d…486e`](https://explorer.arc.io/tx/0x8ebc7f6d7642cfcc69e09f43b84bac032f79f4d57c8285567983f94e252d486e) |
| Claim it | [`0x989d36bf…eebc`](https://explorer.arc.io/tx/0x989d36bfdf015ab9910683d4de955f95799d21299d56d7eb8c0f5e74cf56eebc) |
| Create a €0.10 EURC link | [`0x41d15c46…bae0`](https://explorer.arc.io/tx/0x41d15c46f83a8421d9d0e151f437af1437a297cef9ef76a27d8d3a07184bbae0) |
| Claim it to a second address | [`0xc008a40b…2669`](https://explorer.arc.io/tx/0xc008a40b4b8d799b0d44d6dbf9536d76d551e47b9dcbf2f57c3da56d38242669) |
| Create and claim a $0.20 USDC link | [`0xb34da65c…8d4a`](https://explorer.arc.io/tx/0xb34da65c8982a55a57650e47e3d32c302cabffbdc53963b8e818e442f8e18d4a) / [`0xc1fd458c…8a61`](https://explorer.arc.io/tx/0xc1fd458c7581ae04bc80a1b8bfa80bb41a212ae546cd19b08c62494a0bc98a61) |

Drops, a-link-each batches and refunds are proven on testnet with the identical bytecode — see
[`contracts/deployments.md`](../contracts/deployments.md).

## Demo

~2 min Remotion video with voice-over and music in [`video/`](../video/README.md): the problem, why Arc (USDC-as-gas flow),
sender walkthrough (amount → review → ready sheet with QR), recipient walkthrough (chat → claim →
passkey wallet → received), features, contract credibility, links. `cd video && npm install && npm run render`
→ `video/out/kashlink-demo.mp4`. Upload to YouTube/Loom and paste the link in the DoraHacks form.

## Screenshots

`TODO` intro, amount (drop + EURC), review, ready sheet with QR, claim, stats — phone width.

## Checklist against the programme rules

- [x] Deployed and working on Arc mainnet
- [x] Public repo
- [x] Description says what it does and what it uses Arc for
- [ ] Builder profile linked
- [x] Not a mockup, not testnet-only, no prior Circle/Arc funding
- [x] One submission for this project
- [x] Wallet that can receive USDC on Arc: the deployer/treasury address
