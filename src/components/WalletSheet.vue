<script setup lang="ts">
import { formatUnits, type Hex, isAddress } from 'viem'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { gasReserve, txUrl } from '../lib/arc'
import { formatUsdc } from '../lib/format'
import type { PasskeyWallet } from '../lib/passkey'
import { formatAmount, getTokenBalance, isNative, parseAmount, type Token, TOKENS, USDC } from '../lib/tokens'
import { errorMessage } from '../lib/wallet'
import AccountCard from './AccountCard.vue'
import Icon from './Icon.vue'

/**
 * The passkey wallet a person made on the claim screen or the home screen: what it holds, a way to
 * receive more, and a way to send it on. Minimal on purpose — this is an exit, not a wallet product.
 */
const emit = defineEmits<{ close: [], forgotten: [] }>()

const wallet = shallowRef<PasskeyWallet | null>(null) // the SDK account inside must not be proxied
const balances = ref<Map<Token, bigint>>(new Map())
const opening = ref(true)
const error = ref<string | null>(null)

const view = ref<'send' | 'receive'>('send')
// shallowRef: a plain ref would proxy the token, and the proxy is not `===` to the TOKENS entry.
const token = shallowRef<Token>(USDC)
const to = ref('')
const amount = ref('')
const sending = ref(false)
const sentTx = ref<string | null>(null)
const qrSvg = ref('')
const copied = ref(false)
/** Native USDC kept back for the user operation's gas; the first one also deploys the account. */
const reserve = ref(0n)

const usdc = computed(() => balances.value.get(USDC) ?? null)
const held = computed(() => balances.value.get(token.value) ?? 0n)

const units = computed(() => {
  try {
    return amount.value ? parseAmount(amount.value, token.value) : 0n
  }
  catch {
    return -1n
  }
})

/** The most that can leave in `token`: everything but the gas for USDC, everything for EURC. Whole cents, rounded down. */
const max = computed(() => {
  const balance = held.value
  const raw = isNative(token.value) ? (balance > reserve.value ? balance - reserve.value : 0n) : balance
  const cent = 10n ** BigInt(token.value.decimals - 2)
  return raw - (raw % cent)
})

/** Why the send cannot go yet, in words — or null when it can. Checked before the passkey is asked. */
const blocker = computed(() => {
  if (!wallet.value) return null
  if (!amount.value) return null
  if (units.value < 0n) return `Enter the amount as a plain number, like 5 or 2.50.`
  if (units.value === 0n) return null
  const have = formatAmount(held.value, token.value)
  if (isNative(token.value)) {
    if (units.value > max.value) {
      return held.value === 0n
        ? 'This wallet has no USDC to send.'
        : `Not enough USDC: you have ${have}, and about ${formatUsdc(reserve.value)} of it is kept for the network fee. Max is ${formatAmount(max.value, token.value)}.`
    }
    return null
  }
  if (units.value > held.value) return `Not enough ${token.value.symbol}: you have ${have}.`
  if ((usdc.value ?? 0n) < reserve.value) return `Sending ${token.value.symbol} needs about ${formatUsdc(reserve.value)} of USDC for gas, and this wallet has ${formatUsdc(usdc.value ?? 0n)}. Receive a little USDC first.`
  return null
})
const canSend = computed(() => !!wallet.value && isAddress(to.value.trim()) && units.value > 0n && !blocker.value)
const addressBad = computed(() => to.value.trim().length > 0 && !isAddress(to.value.trim()))

async function loadBalances() {
  if (!wallet.value) return
  const entries = await Promise.all(TOKENS.map(async t => [t, await getTokenBalance(t, wallet.value!.address)] as const))
  balances.value = new Map(entries)
}

onMounted(async () => {
  gasReserve('passkey').then(r => (reserve.value = r)).catch(() => {})
  try {
    const { openPasskeyWallet } = await import('../lib/passkey')
    wallet.value = await openPasskeyWallet()
    await loadBalances()
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    opening.value = false
  }
})

watch([view, wallet], async ([v, w]) => {
  if (v !== 'receive' || !w || qrSvg.value) return
  // The QR library is loaded only when someone asks to receive.
  const { default: QRCode } = await import('qrcode')
  qrSvg.value = await QRCode.toString(w.address, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
})

function useMax() {
  if (!max.value) return
  amount.value = Number(formatUnits(max.value, token.value.decimals)).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

function selectToken(t: Token) {
  token.value = t
  amount.value = ''
  error.value = null
}

async function copy() {
  if (!wallet.value) return
  try {
    await navigator.clipboard.writeText(wallet.value.address)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch {
    // clipboard unavailable on plain-http dev URLs
  }
}

async function send() {
  if (!wallet.value || !canSend.value) return
  sending.value = true
  error.value = null
  sentTx.value = null
  try {
    const { sendFromPasskey } = await import('../lib/passkey')
    sentTx.value = await sendFromPasskey(wallet.value, token.value, to.value.trim() as Hex, units.value)
    amount.value = ''
    await loadBalances()
  }
  catch (e) {
    error.value = errorMessage(e, token.value.symbol)
  }
  finally {
    sending.value = false
  }
}

async function forget() {
  const { forgetPasskey } = await import('../lib/passkey')
  forgetPasskey()
  emit('forgotten')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Your KashLink wallet">
      <div class="handle" />
      <div class="head">
        <h2>Your KashLink wallet</h2>
        <button class="close" aria-label="Close" @click="emit('close')">
          <Icon name="back" :size="18" />
        </button>
      </div>

      <p v-if="opening" class="loading muted">
        <span class="spinner" /> Opening your wallet…
      </p>
      <p v-else-if="!wallet && error" class="error">
        {{ error }}
      </p>

      <template v-if="wallet">
        <AccountCard name="KashLink wallet" :address="wallet.address" :passkey="true" :usdc="usdc" :eurc="balances.get(TOKENS[1]) ?? null" compact />
        <p class="summary muted">
          A wallet on Arc that your passkey controls. Only this device and your passkey can move what's in it.
        </p>

        <div class="balances">
          <button v-for="t in TOKENS" :key="t.symbol" class="tile" :class="{ on: t === token && view === 'send' }" @click="selectToken(t); view = 'send'">
            <span class="sym">{{ t.symbol }}</span>
            <strong>{{ formatAmount(balances.get(t) ?? 0n, t) }}</strong>
          </button>
        </div>

        <div class="views" role="tablist">
          <button role="tab" :aria-selected="view === 'send'" :class="{ on: view === 'send' }" @click="view = 'send'">
            <Icon name="send" :size="16" /> Send
          </button>
          <button role="tab" :aria-selected="view === 'receive'" :class="{ on: view === 'receive' }" @click="view = 'receive'">
            <Icon name="receive" :size="16" /> Receive
          </button>
        </div>

        <template v-if="view === 'receive'">
          <div class="receive">
            <div v-if="qrSvg" class="qr" v-html="qrSvg" />
            <div v-else class="qr placeholder">
              <span class="spinner" />
            </div>
            <p class="hint muted">
              Send USDC or EURC on <strong>Arc</strong> to this address. Other networks will not arrive.
            </p>
            <button class="full mono" @click="copy">
              {{ wallet.address }}
              <Icon :name="copied ? 'check' : 'copy'" :size="14" />
            </button>
          </div>
        </template>

        <template v-else>
          <div class="tokens" role="group" aria-label="Token">
            <button v-for="t in TOKENS" :key="t.symbol" :class="{ on: t === token }" @click="selectToken(t)">
              {{ t.symbol }}
            </button>
          </div>
          <input
            v-model="to" class="field mono" :class="{ bad: addressBad }" type="text" placeholder="0x… address on Arc"
            autocomplete="off" autocapitalize="off" spellcheck="false" :disabled="sending"
          >
          <p v-if="addressBad" class="hint error left">
            That isn't a valid address. It should start with 0x and be 42 characters long.
          </p>
          <div class="amount-row">
            <input
              v-model="amount" class="field" type="text" inputmode="decimal" :placeholder="`Amount in ${token.symbol}`"
              autocomplete="off" :disabled="sending"
            >
            <button class="max" :class="{ on: units > 0n && units === max }" :disabled="!max || sending" @click="useMax">
              Max
            </button>
          </div>
          <p v-if="blocker" class="hint error left">
            {{ blocker }}
          </p>
          <p v-else class="hint muted">
            <template v-if="isNative(token)">
              Gas comes out of the USDC, about {{ formatUsdc(reserve) }} at most. Max leaves that behind.
            </template>
            <template v-else>
              Gas for this is paid in USDC, about {{ formatUsdc(reserve) }} at most.
            </template>
            The first send also sets the wallet up on chain.
          </p>
          <a v-if="sentTx" class="link-btn tx" :href="txUrl(sentTx)" target="_blank" rel="noopener">
            <Icon name="check" :size="16" /> Sent — view transaction <Icon name="external" :size="14" />
          </a>
          <p v-if="error" class="error">
            {{ error }}
          </p>
          <button class="btn btn-primary" :disabled="!canSend || sending" @click="send">
            <template v-if="sending">
              <span class="spinner" /> Confirm with your passkey…
            </template>
            <template v-else>
              <Icon name="fingerprint" :size="20" /> Send {{ units > 0n ? formatAmount(units, token) : token.symbol }}
            </template>
          </button>
        </template>

      </template>

      <p v-if="!opening" class="foot muted">
        <button class="link-btn inline" @click="forget">
          Forget this wallet on this device
        </button>
      </p>
    </section>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
}

.close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: var(--highlight);
  color: var(--text);
  transform: rotate(-90deg);
}

.summary {
  margin: 10px 2px 14px;
  font-size: 13px;
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.mono {
  font-family: ui-monospace, monospace;
}

.balances {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}

.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 12px 14px;
  border: 2px solid transparent;
  border-radius: var(--radius);
  background: var(--highlight);
  text-align: left;
  transition: border-color 0.15s var(--ease);
}

.tile.on {
  border-color: var(--accent);
}

.tile strong {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.sym {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.views {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  padding: 3px;
  border-radius: 500px;
  background: var(--highlight);
}

.views button,
.tokens button {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border: 0;
  border-radius: 500px;
  background: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.views button.on,
.tokens button.on {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.tokens {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  padding: 3px;
  border-radius: 500px;
  background: var(--highlight);
}

.tokens button {
  min-height: 32px;
}

.field {
  width: 100%;
  height: 44px;
  margin-bottom: 8px;
  padding: 0 14px;
  border: 0;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.field.mono {
  font-family: ui-monospace, monospace;
}

.field:focus {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.field.bad {
  box-shadow: 0 0 0 2px rgba(217, 68, 50, 0.35);
}

.amount-row {
  position: relative;
}

.amount-row .field {
  padding-right: 72px;
}

.max {
  position: absolute;
  top: 8px;
  right: 8px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 500px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.max.on {
  background: var(--accent);
  color: #fff;
}

.max:disabled {
  background: var(--highlight-strong);
  color: var(--muted-2);
  cursor: default;
}

.hint {
  margin: 2px 2px 12px;
  font-size: 12px;
}

.hint.left {
  text-align: left;
}

.receive {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 8px;
  text-align: center;
}

.qr {
  width: 168px;
  height: 168px;
  padding: 10px;
  border-radius: var(--radius);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.qr :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.qr.placeholder {
  display: grid;
  place-items: center;
  color: var(--muted-2);
}

.receive .hint {
  margin-top: 12px;
}

.receive strong {
  color: var(--text);
}

.full {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: var(--radius);
  background: var(--highlight);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  word-break: break-all;
  text-align: left;
}

.tx {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-bottom: 10px;
  color: var(--nq-green);
  text-decoration: none;
}

.foot {
  margin-top: 14px;
  font-size: 12px;
  text-align: center;
}

.link-btn.inline {
  min-height: 0;
  padding: 0;
  color: var(--muted);
  font-size: 12px;
}

.error {
  margin: 0 0 12px;
}
</style>
