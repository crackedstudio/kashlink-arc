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

Real USDC, irreversible. One script does the whole thing from your own terminal:

```bash
./deploy-mainnet.sh
```

It creates the `arc-mainnet` keystore if needed (you paste the key into Foundry's encrypted prompt),
deploys with the deployer as treasury and a flat 1% fee, verifies on explorer.arc.io, appends the
result to `deployments.md`, and writes `.env.production` for the app. The key never touches a file
or a `--private-key` flag. Fund the deployer with a little USDC on Arc first (deployment is ~0.03).

## Poking it by hand

```bash
export RPC=https://rpc.testnet.arc.io ESCROW=<ADDRESS> NATIVE=0x0000000000000000000000000000000000000000
LINK_KEY=$(cast wallet new --json | jq -r .[0].private_key); LINK=$(cast wallet address $LINK_KEY)
EACH=1000000000000000000 SLOTS=3                              # 1 USDC each, 18 decimals, 3 people
VALUE=$(cast call $ESCROW "quote(address,uint96,uint24)(uint256,uint256,uint256)" $NATIVE $EACH $SLOTS --rpc-url $RPC | sed -n 3p | awk '{print $1}')
cast send $ESCROW "create(address,address,uint96,uint24,uint40)" $LINK $NATIVE $EACH $SLOTS $(( $(date +%s) + 3600 )) \
  --value $VALUE --account arc-testnet --rpc-url $RPC --gas-price 20gwei
cast send $ESCROW "claim(address)" <RECIPIENT> --private-key $LINK_KEY --rpc-url $RPC --gas-price 20gwei
```

For a EURC link pass the EURC address instead of `$NATIVE`, `approve` the escrow for the token total
(the first `quote` output) first, and send only the stipends as `--value` (the third output).
