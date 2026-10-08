# KashLink inside CrackPay

[CrackPay](https://www.crackpay.xyz) is a USD stablecoin wallet on Arc that opens **Mini Apps**
in a frame and lends them the signed-in account. KashLink runs as one: a CrackPay user opens
KashLink from the Apps page, funds a link out of their CrackPay balance, and anyone they send that
link to claims it the ordinary way — in a browser, with no wallet at all.

It fits because the two apps already agree on the hard part. CrackPay sponsors the gas for what its
user sends; KashLink's links pay their own claim gas out of the stipend the escrow drops on them. So
inside CrackPay nobody — sender or recipient — ever holds a gas token, and the sender never signs
anything but the deposit.

- Developer documentation: <https://www.crackpay.xyz/developers>
- The SDK this uses: [`@crackpay/miniapp-sdk`](https://www.npmjs.com/package/@crackpay/miniapp-sdk)
- Listing file: [`crackpay-listing.json`](../crackpay-listing.json)

---

## What changes, and where

Everything lives behind [`src/lib/crackpay.ts`](../src/lib/crackpay.ts). CrackPay is a third kind of
sender next to a browser wallet and the passkey wallet, so it is a third `Connected` (`kind:
'crackpay'`) and the screens that fund, refund and claim are unchanged.

| | Browser wallet | Passkey wallet | CrackPay |
|---|---|---|---|
| How it arrives | user picks it (EIP-6963) | user taps, Face ID | already connected on load |
| Signing | the wallet's prompt | passkey | CrackPay's own confirmation sheet, in its page |
| Several calls | one prompt each | batched into one user operation | one prompt each |
| Gas | paid by the sender | sponsored, or a prefund | sponsored by CrackPay |
| `gasReserve` | 300k × fee floor | the bundler's prefund | **0** |

Two details are worth knowing before changing this code.

**The transaction is sent raw, not through viem.** `wallet.ts` builds a viem wallet client, which
prepares every transaction: `eth_estimateGas`, `eth_getTransactionCount`, a fee estimate. CrackPay
ignores `gas`, `gasPrice`, `maxFeePerGas`, `maxPriorityFeePerGas` and `nonce` outright, so all of
that is a round trip for nothing. `crackpay.ts` sends `{ from, to, data, value }` straight at the
provider — and the promise resolves only once the transaction is final, so there is no receipt to
wait for either. A revert rejects; it never returns a hash.

**The reads do not go through CrackPay.** Quotes, balances, link status and the stats page use
KashLink's own public client against the Arc RPC, exactly as in a normal tab. Only writes cross the
frame.

## What the frame takes away

A Mini App is a cross-origin frame, which rules out three things the app offers elsewhere. Each is
hidden when `crackpay.framed` is true, rather than offered and then failing:

- **Passkey wallets.** No WebAuthn in a cross-origin frame, so the Circle Modular Wallets path is
  not offered — on the sign-in screen or on the claim screen. The SDK chunk is never even fetched.
- **The camera.** CrackPay's frame is granted `clipboard-write` and nothing else, so the QR scanner
  (which only lives in the passkey wallet's send sheet) is out of reach anyway.
- **Web Share.** `navigator.share` exists in the frame but is not permitted, so it rejects rather
  than opening a sheet. `ReadySheet.share()` treats anything but `AbortError` as "the sheet never
  opened" and copies the link instead, which the frame *is* allowed to do.

Storage is partitioned too: the links KashLink keeps in `localStorage` inside CrackPay are a
different set from the ones in an ordinary tab on the same device. A sender's links are also on
chain (`linksOf`), so they can still be watched and refunded from either place — but only the device
that made a link holds the key that re-shares it.

## Networks: one listing per network

Each CrackPay runs on one Arc network and refuses every other chain; its provider answers
`wallet_switchEthereumChain` for anything else with `4902`. CrackPay at
[www.crackpay.xyz](https://www.crackpay.xyz) runs on **Arc mainnet (5042)**. A link made on one
network is meaningless on the other, so the URL a sender shares has to point back at the app that
can read it.

So CrackPay lists KashLink once per network, each pointing at the deployment for that network:

| CrackPay | KashLink listing | Escrow |
|---|---|---|
| Arc mainnet (www.crackpay.xyz) | `https://arc.kashlink.live/` | `0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62` |
| Arc Testnet | `https://testnet.kashlink.live/` | `0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62` |

The production build (`arc.kashlink.live`) is already a mainnet build and needs nothing extra. A
testnet deployment for a testnet CrackPay sets:

```
VITE_ARC_NETWORK=testnet
VITE_ESCROW_ADDRESS=0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62
VITE_ESCROW_DEPLOY_BLOCK=62595721
VITE_PUBLIC_URL=https://testnet.kashlink.live
```

Leave `VITE_ESCROW_LEGACY` unset: an escrow that is not in the listing cannot be called, so a build
that offers to refund links on an old one would get `4100`. Leave `VITE_CIRCLE_CLIENT_KEY` unset
too — the passkey option is hidden in the frame regardless, and it is the only thing that key is for.

If a build is opened inside a CrackPay on the other network, the app says so on the sign-in screen
instead of failing at the first transaction:

> This KashLink is on Arc Testnet, and this CrackPay is on another network — so it cannot send from
> in here. Open KashLink in a browser tab instead.

## Testing it

CrackPay's Developer mode loads any HTTPS URL as an unreviewed test app.

CrackPay can only load a page that allows framing. `vercel.json` deliberately sends no
`X-Frame-Options` and sets no `frame-ancestors`, so nothing has to be added — but anything that
starts sending either header (a security middleware, a copied Next.js header config) takes KashLink
off the Apps page without any other symptom than a blank frame.

1. Serve the app somewhere CrackPay can frame it. A deployment URL works; for `npm run dev`, tunnel
   it — `ngrok http 5191` or `cloudflared tunnel --url http://localhost:5191`. The tunnel hosts are
   already in `vite.config.ts`'s `server.allowedHosts`.
2. In CrackPay: **Settings** → tap **Version** seven times → **Developer settings** → **Developer
   mode** on → paste the URL under **Load test page** → **Load**.
3. Fund the CrackPay account. On www.crackpay.xyz that is real USDC on Arc mainnet, so test with
   small amounts; a testnet CrackPay takes test USDC from [faucet.circle.com](https://faucet.circle.com).

What to look for: the account card is filled in on load with no connect button, the USDC figure
matches CrackPay's own, **Send** raises CrackPay's confirmation for the exact total, and cancelling
it reads as *Request cancelled.* rather than an error.

A test app may call any contract; a listed one may call only what its listing names. Test against
the escrow in `crackpay-listing.json`, or a flow that works now will stop working once the app is
listed.

`npm run dev` already trusts a CrackPay on `http://localhost:3000`, so developing the two side by
side needs no configuration. To work against one somewhere else — another port, or a machine on the
network — name it:

```
VITE_CRACKPAY_ORIGINS=http://192.168.1.20:3000
```

Whatever is on that list is trusted as the wallet, so nothing belongs on it that is not yours. The
real CrackPay stays trusted either way.

## Getting listed

CrackPay's admins list apps; a developer submits [`crackpay-listing.json`](../crackpay-listing.json)
at <https://www.crackpay.xyz/developers/submit> with an email address they can reply to.

The listing records the app's URL, the contracts it may call, and the tokens it may ask the user to
approve. KashLink's is short, because the sender only ever calls one contract:

| | |
|---|---|
| Contracts | `KashLinkEscrow` — `create`, `createMany`, `refund`, `refundMany` |
| Token approvals | `EURC`, towards the escrow. USDC is Arc's native token, so a USDC link needs no approval. |
| Not listed | `claim`, which is sent by the link's own key from the link's own address, never by the CrackPay user |

**A new escrow means a new review.** The contract has no upgrade path, so deploying v5 means
submitting an updated listing and waiting for it before the app can call it; until then every
`create` comes back `4100`. The same goes for changing the app's URL.

## Where it would break

- **A connect button, or a signature.** Neither exists here, and neither may. The account is the
  identity; nothing in KashLink signs a message.
- **Calling a token's `transfer` directly.** KashLink never does — EURC moves with `approve` then
  `create`, and the escrow pulls it with `transferFrom` from inside the call. A direct `transfer`
  from the app would be refused.
- **Mixing the two USDC scales.** Native USDC is 18 decimals (`msg.value`, `eth_getBalance`); the
  ERC-20 view at `0x3600…0000` is 6. This app only ever touches the native one, which is why
  `USDC.decimals` is 18 in `tokens.ts` — do not "fix" that to 6.
