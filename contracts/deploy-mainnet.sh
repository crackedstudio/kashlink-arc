#!/usr/bin/env bash
#
# Deploys KashLinkEscrow to Arc mainnet, verifies it, and records the result.
#
#   cd contracts && ./deploy-mainnet.sh
#
# The deployer is the `arc-mainnet` Foundry keystore. If it does not exist yet, this script asks
# `cast wallet import` to create it: you paste the private key into Foundry's prompt and choose a
# password, and the key is stored encrypted under ~/.foundry/keystores/. Nothing here ever prints
# or copies the key. The deployer address is also the fee treasury.
#
# Fees: flat 1% (FEE_BPS=100, FEE_MIN=0). Override with env vars if you want something else.

set -euo pipefail
cd "$(dirname "$0")"

ACCOUNT=arc-mainnet
RPC=${ARC_MAINNET_RPC_URL:-https://rpc.mainnet.arc.io}
CHAIN_ID=5042
EXPLORER=https://explorer.arc.io
export FEE_BPS=${FEE_BPS:-100}
export FEE_MIN=${FEE_MIN:-0}

bold() { printf '\033[1m%s\033[0m\n' "$*"; }

command -v forge >/dev/null || { echo "Foundry is not installed: https://getfoundry.sh"; exit 1; }
[ "$(cast chain-id --rpc-url "$RPC")" = "$CHAIN_ID" ] || { echo "RPC $RPC is not Arc mainnet"; exit 1; }

# 1. Keystore
if ! cast wallet list 2>/dev/null | grep -q "^$ACCOUNT "; then
  bold "No '$ACCOUNT' keystore yet. Paste the deployer's private key when asked; it is stored encrypted."
  cast wallet import "$ACCOUNT" --interactive
fi

# The password is asked once and kept in a private temp file for the few commands that need it.
PASSFILE=$(mktemp)
chmod 600 "$PASSFILE"
trap 'rm -f "$PASSFILE"' EXIT
read -r -s -p "Keystore password for '$ACCOUNT': " PASSWORD; echo
printf '%s' "$PASSWORD" > "$PASSFILE"
unset PASSWORD

DEPLOYER=$(cast wallet address --account "$ACCOUNT" --password-file "$PASSFILE")
export TREASURY=$DEPLOYER
BALANCE=$(cast balance "$DEPLOYER" --rpc-url "$RPC" --ether)
bold "Deployer / treasury: $DEPLOYER  ($BALANCE USDC on Arc)"
awk -v b="$BALANCE" 'BEGIN { exit !(b + 0 < 0.1) }' && { echo "Fund it with at least 0.1 USDC first."; exit 1; }

# 2. Deploy
bold "Deploying KashLinkEscrow (feeBps=$FEE_BPS, feeMin=$FEE_MIN)…"
forge script script/Deploy.s.sol --rpc-url "$RPC" --account "$ACCOUNT" --password-file "$PASSFILE" \
  --broadcast --with-gas-price 20gwei

RUN=broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json
ADDRESS=$(jq -r '.receipts[0].contractAddress' "$RUN")
TX=$(jq -r '.receipts[0].transactionHash' "$RUN")
BLOCK=$(( $(jq -r '.receipts[0].blockNumber' "$RUN") ))
bold "Deployed at $ADDRESS in block $BLOCK"

# 3. Verify (Blockscout can take a minute to index; retry a few times)
ARGS=$(cast abi-encode "constructor(address,address,uint16,uint96)" "$DEPLOYER" "$TREASURY" "$FEE_BPS" "$FEE_MIN")
VERIFIED=no
for attempt in 1 2 3; do
  if forge verify-contract "$ADDRESS" src/KashLinkEscrow.sol:KashLinkEscrow --chain "$CHAIN_ID" \
       --verifier blockscout --verifier-url "$EXPLORER/api/" --constructor-args "$ARGS" --watch; then
    VERIFIED=yes
    break
  fi
  echo "verification attempt $attempt failed; retrying in 20 s…"; sleep 20
done
if [ "$VERIFIED" = no ]; then
  # explorer.arc.io sits behind a Cloudflare challenge that blocks non-browser clients. Verify from the
  # explorer's own form instead: Contract → Verify & publish → "Solidity (Standard JSON input)".
  forge verify-contract "$ADDRESS" src/KashLinkEscrow.sol:KashLinkEscrow --chain "$CHAIN_ID" \
    --show-standard-json-input > verify-input.json
  bold "Automatic verification was blocked. Verify manually at $EXPLORER/address/$ADDRESS?tab=contract"
  echo "  upload contracts/verify-input.json (standard JSON input), compiler 0.8.30, EVM osaka,"
  echo "  constructor args: $ARGS"
fi

# 4. Record
cat >> deployments.md <<EOF

## Arc Mainnet (chain 5042)

| | |
|---|---|
| KashLinkEscrow | [\`$ADDRESS\`]($EXPLORER/address/$ADDRESS) — $( [ "$VERIFIED" = yes ] && echo "source verified" || echo "verification pending (manual)" ) |
| Deploy tx | [\`${TX:0:10}…${TX: -4}\`]($EXPLORER/tx/$TX), block $BLOCK |
| Owner / treasury | \`$DEPLOYER\` |
| Fees | $FEE_BPS bps, floor $FEE_MIN |
| Deployed | $(date -u +%Y-%m-%d) |
EOF

cat > ../.env.production <<EOF
VITE_ARC_NETWORK=mainnet
VITE_ESCROW_ADDRESS=$ADDRESS
VITE_ESCROW_DEPLOY_BLOCK=$BLOCK
EOF

bold "Done."
echo "  contract:  $EXPLORER/address/$ADDRESS"
echo "  recorded:  contracts/deployments.md, .env.production (git-ignored; copy these into Vercel)"
echo
echo "  VITE_ARC_NETWORK=mainnet"
echo "  VITE_ESCROW_ADDRESS=$ADDRESS"
echo "  VITE_ESCROW_DEPLOY_BLOCK=$BLOCK"
