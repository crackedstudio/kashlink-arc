# Deployments

## Arc Testnet (chain 5042002)

### v3 — drops, EURC, built-in index (current)

| | |
|---|---|
| KashLinkEscrow | [`0xe16307FE8bADad783895A5c0047bEa76F152984F`](https://explorer.testnet.arc.io/address/0xe16307FE8bADad783895A5c0047bEa76F152984F) — verification pending (explorer rate limit) |
| Deploy tx | [`0xd25f1dcb…b67c`](https://explorer.testnet.arc.io/tx/0xd25f1dcb32399c25ecc11645e8f0847d2087f0a1acd49bf9de2106c6c922b67c), block 62562869 |
| Owner / treasury | `0x70B22b00B1a579bc005dDB0c8770E11EdC20C178` (throwaway testnet key) |
| Fees | 1 % (100 bps), no floor |
| Deployed | 2026-09-17 |

Proof transactions:

| Step | Tx |
|---|---|
| `create` a 3-slot USDC drop, $0.10 each, 30 s expiry | [`0x70fbc9df…ab47`](https://explorer.testnet.arc.io/tx/0x70fbc9dfc7039d14ccdd77b76b96dba697f3c9c44f7348e217813e3f2181ab47) |
| `claim` slot 1 | [`0xf4bd0c52…a371`](https://explorer.testnet.arc.io/tx/0xf4bd0c5275950d45e58fbb564d338fd9dade576689d4b0ba77219d259040a371) |
| `claim` slot 2 | [`0x5f70caff…dd1c`](https://explorer.testnet.arc.io/tx/0x5f70caffeb6a79e43ccf9b91581081ebe8357a5ba492acdc788d41d00744dd1c) |
| `refund` of the unclaimed third slot after expiry ($0.10 back) | [`0xeb848b66…786f`](https://explorer.testnet.arc.io/tx/0xeb848b6631b86004ce355a57c4a0d91dcfa8b366c37e1b5cea46c537a9bb786f) |
| EURC link create / claim | _pending testnet EURC_ |

After these, `counters()` reads `(1 link, 1 drop, 2 claims, 1 refund)` and `totals(USDC)` reads
`(0.30 sent, 0.20 claimed, 0.10 refunded)` — the stats page is those two calls.

### v2 — drops and EURC (superseded by v3)

| | |
|---|---|
| KashLinkEscrow | [`0xb66527AeBF350eA229829b12b8BBFdE88944d65b`](https://explorer.testnet.arc.io/address/0xb66527AeBF350eA229829b12b8BBFdE88944d65b) — source verified |
| Deploy tx | [`0xc37c7df5…f95c`](https://explorer.testnet.arc.io/tx/0xc37c7df59254501d07f5f2dcf0402f7da6a0df9d0afaa8c0d8f9e6ebca4af95c), block 62559727 |
| Owner / treasury | `0x70B22b00B1a579bc005dDB0c8770E11EdC20C178` (throwaway testnet key) |
| Fees | 1 % (100 bps), no floor |
| Deployed | 2026-09-17 |

Proof transactions:

| Step | Tx |
|---|---|
| `create` a 3-slot USDC drop, $0.10 each (value 0.333 = 0.30 + 0.003 fee + 3 × 0.01 stipend) | [`0x688c2fb7…01a6`](https://explorer.testnet.arc.io/tx/0x688c2fb73d9c603b716a531873a5ac8aca85fdda0da44923774fbac78b1d01a6) |
| `claim` slot 1 | [`0xdec56c5e…c5a5`](https://explorer.testnet.arc.io/tx/0xdec56c5e826ea4a6caec4bd1abf4888e9898ef930c26842f1f282c323177c5a5) |
| `claim` slot 2 | [`0xb03ac839…2bc5`](https://explorer.testnet.arc.io/tx/0xb03ac83992eb3fd9064d35c81d0bd1bb93d6af1bccb811138f0e2483f9982bc5) |
| `claim` slot 3 → status Claimed | [`0x8c8ee406…c406`](https://explorer.testnet.arc.io/tx/0x8c8ee406f2bc94fd34a3035bd13b439895f69db5203cc4cf8fa6caf55f0ec406) |
| EURC link create / claim | _pending testnet EURC_ |

### v1 — single-slot USDC (superseded)


| | |
|---|---|
| KashLinkEscrow | [`0x1a250562953F1124F745ed347Eec8832bbf07241`](https://explorer.testnet.arc.io/address/0x1a250562953F1124F745ed347Eec8832bbf07241) — source verified |
| Deploy tx | [`0xbf6c27e7…f8c8`](https://explorer.testnet.arc.io/tx/0xbf6c27e7ce42f1cd151c848e562a11b7b17f01f027d64f467c5b3b2264e5f8c8), block 62552447 |
| Owner / treasury | `0x70B22b00B1a579bc005dDB0c8770E11EdC20C178` (throwaway testnet key) |
| Fees | 1 % (100 bps), no floor — set by [`setFees` tx `0x7a4f9223…a066`](https://explorer.testnet.arc.io/tx/0x7a4f92231fda2bf530ef2bbfafcc7408f9fbbfa5e8c66db8eb9e1e0f5f25a066); deployed with a 0.10 floor |
| Deployed | 2026-09-17 |

Proof transactions:

| Step | Tx |
|---|---|
| `create` 1 USDC link (total 1.11 = 1 + 0.10 fee under the old floor + 0.01 stipend) | [`0xef080e23…3b36`](https://explorer.testnet.arc.io/tx/0xef080e23c5b1e715c4fe7d20e092ad7de8dd07f30ce208ae9745a69163ab3b36) |
| `claim` signed by the link key, paid from the stipend (67,911 gas ≈ 0.0014 USDC) | [`0x738f86f4…c42b`](https://explorer.testnet.arc.io/tx/0x738f86f4839eee0f5f7e59ff46cbb279708ba77150e367f5878c779714c2c42b) |
| `create` 0.5 USDC link with a 25 s expiry | [`0xe07aad96…e5d4`](https://explorer.testnet.arc.io/tx/0xe07aad96f469a2a055bf6fdb5097dfafb6014d592e80bff2c447053c70d8e5d4) |
| `refund` by the sender after expiry (40,713 gas) | [`0x687f6ff5…cff4`](https://explorer.testnet.arc.io/tx/0x687f6ff57a3e7e2029bc805a14206919827265b10c7edb84aa83b1ee04e9cff4) |

An earlier deployment at `0x3E57fd752350cb044f82e46ebc573597d9842dCF` has the wrong owner (Foundry's
default script sender, see the note in `script/Deploy.s.sol`) and is abandoned.

## Arc Mainnet (chain 5042)

_Not yet deployed._
