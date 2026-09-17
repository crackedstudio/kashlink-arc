# Deployments

## Arc Testnet (chain 5042002)

### v4 — `createMany` / `refundMany`: a link each for several people (current)

Adds one-transaction funding of one single-slot link per person, because a drop cannot stop one
holder of its link from claiming every slot to fresh addresses. The app sets
`VITE_ESCROW_LEGACY=0xe16307FE8bADad783895A5c0047bEa76F152984F` so v3 links keep claiming and refunding.

| | |
|---|---|
| KashLinkEscrow | [`0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62`](https://explorer.testnet.arc.io/address/0x4d6c05Fe69ECCB3fDd882D4e915d77ff29159C62) — source verified |
| Deploy tx | [`0x912a6559…85f9`](https://explorer.testnet.arc.io/tx/0x912a6559799803c4c80a879f8eca7b572a6422edf7adbf63a448de8449c585f9), block 62595721 |
| Owner / treasury | `0x2e2729F897D4E5799ADe12B3D911b40BA0307Aa4` |
| Fees | 1 % (100 bps), no floor |
| Deployed | 2026-09-17 |

Proof transactions:

| Step | Tx |
|---|---|
| `createMany` three separate $0.10 USDC links, 45 s expiry (value 0.333 = 3 × (0.10 + 0.001 fee + 0.01 stipend); 425,767 gas) | [`0xe9e0deed…ef91`](https://explorer.testnet.arc.io/tx/0xe9e0deedd8c8537ce0f1b495c895b98ea388fe8f73d71f4a2a3feb930bddef91) |
| `claim` link 1 → recipient gets $0.10 (102,801 gas) | [`0x32186363…5aea`](https://explorer.testnet.arc.io/tx/0x3218636350156cd564c4c2a9af9279095bc457b0e6b8b1bea738a3e96bf45aea) |
| `claim` link 1 again to a fresh address | reverts `NotPending` — one link pays once |
| `refundMany` links 2 and 3 after expiry, $0.20 back in one tx (89,024 gas) | [`0x8ee2db32…cd04`](https://explorer.testnet.arc.io/tx/0x8ee2db32741672d7781042be30335ec87963203cdb9f43e3861af014cac8cd04) |

After these, `counters()` reads `(3 links, 0 drops, 1 claim, 2 refunds)`, `totals(USDC)` reads
`(0.30 sent, 0.10 claimed, 0.20 refunded)`, and the escrow holds nothing.

### v3 — drops, EURC, built-in index (superseded by v4)

| | |
|---|---|
| KashLinkEscrow | [`0xe16307FE8bADad783895A5c0047bEa76F152984F`](https://explorer.testnet.arc.io/address/0xe16307FE8bADad783895A5c0047bEa76F152984F) — source verified |
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
| `approve` the escrow for €2.02 of EURC | [`0x003e021e…65b2`](https://explorer.testnet.arc.io/tx/0x003e021ee6a601e91dc24470c17d728580879da8a7eee70152803899aea665b2) |
| `create` a €2.00 EURC link (value = one USDC stipend only) | [`0xd2f15d08…a4f2`](https://explorer.testnet.arc.io/tx/0xd2f15d08f0e5a093b9bd1e0a3dc9e6cda0385b041b86dbfde21248137a7fa4f2) |
| `claim` it — recipient gets €2.00, gas from the USDC stipend | [`0x35ed6ce1…6843`](https://explorer.testnet.arc.io/tx/0x35ed6ce10dca9dd6a057a56792c27c6cd0b5e94a3adb1982d4e5225c0ecc6843) |

After these, `counters()` reads `(2 links, 1 drop, 3 claims, 1 refund)`, `totals(USDC)` reads
`(0.30 sent, 0.20 claimed, 0.10 refunded)` and `totals(EURC)` `(2.00, 2.00, 0)` — the stats page
is those calls.

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
