<script setup lang="ts">
import { type Hex, isAddress } from 'viem'
import { computed, onMounted, ref } from 'vue'
import { addressUrl, txUrl } from '../lib/arc'
import { shortAddress } from '../lib/format'
import type { PasskeyWallet } from '../lib/passkey'
import { formatAmount, getTokenBalance, parseAmount, type Token, TOKENS, USDC } from '../lib/tokens'
import { errorMessage } from '../lib/wallet'
import Icon from './Icon.vue'

/**
 * The passkey wallet a recipient made on the claim screen: what it holds, and a way to send it on.
 * Minimal on purpose — this is an exit, not a wallet product.
 */
const emit = defineEmits<{ close: [], forgotten: [] }>()

const wallet = ref<PasskeyWallet | null>(null)
const balances = ref<Map<Token, bigint>>(new Map())
const opening = ref(true)
const error = ref<string | null>(null)

const token = ref<Token>(USDC)
const to = ref('')
const amount = ref('')
const sending = ref(false)
const sentTx = ref<string | null>(null)
const copied = ref(false)

const units = computed(() => {
  try {
    return amount.value ? parseAmount(amount.value, token.value) : 0n
  }
  catch {
    return 0n
  }
})
const canSend = computed(() => !!wallet.value && isAddress(to.value.trim()) && units.value > 0n && units.value <= (balances.value.get(token.value) ?? 0n))

async function loadBalances() {
  if (!wallet.value) return
  const entries = await Promise.all(TOKENS.map(async t => [t, await getTokenBalance(t, wallet.value!.address)] as const))
  balances.value = new Map(entries)
}

onMounted(async () => {
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
  try {
    const { sendFromPasskey } = await import('../lib/passkey')
    sentTx.value = await sendFromPasskey(wallet.value, token.value, to.value.trim() as Hex, units.value)
    amount.value = ''
    await loadBalances()
  }
  catch (e) {
    error.value = errorMessage(e)
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
      <h2>Your KashLink wallet</h2>
      <p class="summary muted">
        A wallet on Arc that your passkey controls. Only this device and your passkey can move what's in it.
      </p>

      <p v-if="opening" class="loading muted">
        <span class="spinner" /> Opening with your passkey…
      </p>
      <p v-if="error" class="error">
        {{ error }}
      </p>

      <template v-if="wallet">
        <button class="address" @click="copy">
          <span class="mono">{{ shortAddress(wallet.address) }}</span>
          <Icon :name="copied ? 'check' : 'copy'" :size="16" />
        </button>
        <div class="balances">
          <div v-for="t in TOKENS" :key="t.symbol" class="tile">
            <strong>{{ formatAmount(balances.get(t) ?? 0n, t) }}</strong>
            <span class="muted">{{ t.symbol }}</span>
          </div>
        </div>

        <p class="label">
          Send
        </p>
        <div class="tokens" role="group" aria-label="Token">
          <button v-for="t in TOKENS" :key="t.symbol" :class="{ on: t === token }" @click="token = t">
            {{ t.symbol }}
          </button>
        </div>
        <input v-model="to" class="field mono" type="text" placeholder="0x… address on Arc" autocomplete="off" spellcheck="false">
        <input v-model="amount" class="field" type="text" inputmode="decimal" :placeholder="`Amount in ${token.symbol}`" autocomplete="off">
        <p class="hint muted">
          Gas comes out of the wallet's USDC. The first send also sets the wallet up on chain, which costs a few cents more.
        </p>
        <a v-if="sentTx" class="link-btn tx" :href="txUrl(sentTx)" target="_blank" rel="noopener">
          Sent — view transaction <Icon name="external" :size="14" />
        </a>
        <button class="btn btn-primary" :disabled="!canSend || sending" @click="send">
          <template v-if="sending">
            <span class="spinner" /> Confirm with your passkey…
          </template>
          <template v-else>
            Send {{ units ? formatAmount(units, token) : '' }}
          </template>
        </button>
        <p class="foot muted">
          <a :href="addressUrl(wallet.address)" target="_blank" rel="noopener">View on explorer</a> ·
          <button class="link-btn inline" @click="forget">
            Forget on this device
          </button>
        </p>
      </template>
    </section>
  </div>
</template>

<style scoped>
h2 {
  margin: 0 0 2px;
  font-size: 20px;
  font-weight: 800;
}

.summary {
  margin: 0 0 14px;
  font-size: 13px;
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
}

.address {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 6px 12px;
  border: 0;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.mono {
  font-family: ui-monospace, monospace;
}

.balances {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.tile {
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--highlight);
}

.tile strong {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.tile .muted {
  font-size: 12px;
  font-weight: 700;
}

.label {
  margin-bottom: 8px;
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
  flex: 1;
  min-height: 34px;
  border: 0;
  border-radius: 500px;
  background: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.tokens button.on {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
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

.field:focus {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.hint {
  margin: 2px 2px 12px;
  font-size: 12px;
}

.tx {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-bottom: 10px;
  text-decoration: none;
}

.foot {
  margin-top: 12px;
  font-size: 12px;
  text-align: center;
}

.foot a {
  font-weight: 700;
}

.link-btn.inline {
  min-height: 0;
  padding: 0;
  font-size: 12px;
}

.error {
  margin: 0 0 12px;
}
</style>
