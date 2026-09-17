# KashLink escrow contract

`src/KashLinkEscrow.sol` holds the USDC behind every KashLink on Arc. See the NatSpec at the top of
the file for how it works and what the owner can and cannot do.

```bash
forge build
forge test
```

## Deploy

Both networks use the same commands; only the RPC alias and the keystore account differ. Copy
`.env.example` to `.env` first (git-ignored) and set `TREASURY`. Fees default to a flat 1% (`FEE_MIN=0`).

Arc's mempool drops transactions whose `maxFeePerGas` is under 20 gwei, so the `--with-gas-price`
flag below is not optional.

### Testnet (chain 5042002)

Get testnet USDC from <https://faucet.circle.com>.

```bash
cast wallet import arc-testnet --interactive      # once; prompts for the key and a password
source .env
forge script script/Deploy.s.sol --rpc-url arc_testnet --account arc-testnet \
  --broadcast --with-gas-price 20gwei
forge verify-contract <ADDRESS> src/KashLinkEscrow.sol:KashLinkEscrow \
  --chain 5042002 --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address,uint16,uint96)" <OWNER> $TREASURY $FEE_BPS $FEE_MIN)
```

### Mainnet (chain 5042)

Real USDC, irreversible. Run from your own terminal with a keystore account; never put the key in a
file or a `--private-key` flag.

```bash
cast wallet import arc-mainnet --interactive
source .env
forge script script/Deploy.s.sol --rpc-url arc --account arc-mainnet \
  --broadcast --with-gas-price 20gwei
forge verify-contract <ADDRESS> src/KashLinkEscrow.sol:KashLinkEscrow \
  --chain 5042 --verifier blockscout --verifier-url https://explorer.arc.io/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address,uint16,uint96)" <OWNER> $TREASURY $FEE_BPS $FEE_MIN)
```

Record the address and transaction in `deployments.md`, then set `VITE_ESCROW_ADDRESS` for the app.

## Poking it by hand

```bash
export RPC=https://rpc.testnet.arc.io ESCROW=<ADDRESS>
LINK_KEY=$(cast wallet new --json | jq -r .[0].private_key); LINK=$(cast wallet address $LINK_KEY)
AMOUNT=1000000000000000000                                   # 1 USDC, 18 decimals
TOTAL=$(cast call $ESCROW "totalFor(uint256)(uint256)" $AMOUNT --rpc-url $RPC)
cast send $ESCROW "create(address,uint96,uint64)" $LINK $AMOUNT $(( $(date +%s) + 3600 )) \
  --value $TOTAL --account arc-testnet --rpc-url $RPC --gas-price 20gwei
cast send $ESCROW "claim(address)" <RECIPIENT> --private-key $LINK_KEY --rpc-url $RPC --gas-price 20gwei
```
