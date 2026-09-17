<script setup lang="ts">
import { type Hex, isAddress } from 'viem'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { track } from '../lib/analytics'
import { CHAIN, ESCROW_CONFIGURED, txUrl } from '../lib/arc'
import { formatUsdc, shortAddress } from '../lib/format'
import { claimLink, linkGasBalance, linkIdOf, type OnChainLink, readLink } from '../lib/links'
import { connect, discoverWallets, errorMessage } from '../lib/wallet'
import Icon from './Icon.vue'
import Logo from './Logo.vue'

const props = defineProps<{ linkKey: Hex }>()
const emit = defineEmits<{ done: [] }>()

/**
 * loading    reading the link from the contract
 * unfunded   no deposit for this key (yet) — the sender's transaction may still be landing
 * ready      pending on chain, waiting for a payout address
 * nogas      pending, but the stipend on the link address is gone
 * claiming   transaction in flight
 * success    paid out
 * claimed    somebody already took it
 * refunded   the sender took it back
 */
type State = 'loading' | 'unfunded' | 'ready' | 'nogas' | 'claiming' | 'success' | 'claimed' | 'refunded'
const state = ref<State>('loading')
const link = ref<OnChainLink | null>(null)
const linkId = linkIdOf(props.linkKey)
const to = ref('')
const claimTx = ref<string | null>(null)
const error = ref<string | null>(null)
const connecting = ref(false)
let pollTimer: number | undefined

const amount = computed(() => (link.value ? formatUsdc(link.value.amount) : ''))
const toValid = computed(() => isAddress(to.value.trim()))
const heading = computed(() => ({
  loading: 'Opening KashLink…',
  unfunded: 'This KashLink is almost ready',
  ready: 'You received cash!',
  nogas: 'You received cash!',
  claiming: 'You received cash!',
  success: 'Cash received!',
  claimed: 'This KashLink was already claimed',
  refunded: 'This KashLink was returned',
})[state.value])
const badgeIcon = computed(() => ({
  loading: 'link',
  unfunded: 'link',
  ready: 'logo',
  nogas: 'logo',
  claiming: 'logo',
  success: 'check',
  claimed: 'check',
  refunded: 'back',
} as const)[state.value])
const badgeClass = computed(() => ({
  gold: state.value === 'ready' || state.value === 'nogas' || state.value === 'claiming',
  green: state.value === 'success',
  gray: state.value === 'claimed' || state.value === 'refunded',
}))

// A claim in flight or done must not be overwritten by a status refresh.
const isBusy = () => state.value === 'claiming' || state.value === 'success'

async function refresh() {
  if (isBusy()) return
  try {
    const current = await readLink(linkId)
    if (isBusy()) return
    link.value = current
    if (current.status === 'unknown') {
      state.value = 'unfunded'
      return
    }
    if (current.status !== 'pending') {
      state.value = current.status
      return
    }
    // The stipend pays for the claim. If it is gone, the claim would fail with "insufficient funds".
    const gas = await linkGasBalance(linkId)
    if (isBusy()) return
    state.value = gas > 0n ? 'ready' : 'nogas'
  }
  catch (e) {
    error.value = errorMessage(e)
  }
}

onMounted(async () => {
  if (!ESCROW_CONFIGURED) {
    error.value = 'This build has no escrow contract configured.'
    return
  }
  await refresh()
  // Keep the status current: the deposit may still be landing, or someone else may claim it first.
  pollTimer = window.setInterval(() => {
    if (state.value === 'unfunded' || state.value === 'ready') refresh()
  }, 4000)
})

onUnmounted(() => clearInterval(pollTimer))

/** Fills the payout field from a browser wallet. A convenience; pasting an address works just as well. */
async function useWallet() {
  const wallets = discoverWallets()
  if (!wallets.length) {
    error.value = 'No wallet found in this browser. Paste the address you want the USDC sent to instead.'
    return
  }
  connecting.value = true
  error.value = null
  try {
    const { address } = await connect(wallets[0])
    to.value = address
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    connecting.value = false
  }
}

async function claim() {
  if (!toValid.value) return
  error.value = null
  state.value = 'claiming'
  try {
    claimTx.value = await claimLink(props.linkKey, to.value.trim() as Hex)
    state.value = 'success'
    if (link.value) track('link_claimed', link.value.amount, linkId)
  }
  catch (e) {
    error.value = errorMessage(e)
    state.value = 'ready'
    refresh()
  }
}
</script>

<template>
  <main class="screen claim">
    <div class="hero">
      <span class="badge" :class="badgeClass">
        <span v-if="state === 'loading'" class="spinner" />
        <Logo v-else-if="badgeIcon === 'logo'" :size="52" />
        <Icon v-else :name="badgeIcon" :size="34" />
      </span>
      <p class="heading">
        {{ heading }}
      </p>
      <div v-if="link && state !== 'unfunded'" class="amount" :class="{ muted: state === 'claimed' || state === 'refunded' }">
        {{ amount }}<span class="unit">USDC</span>
      </div>
      <p v-if="state === 'loading'" class="status muted">
        Reading the link on {{ CHAIN.name }}…
      </p>
      <p v-else-if="state === 'unfunded'" class="status muted">
        The deposit hasn't arrived yet. This page updates automatically.
      </p>
      <p v-else-if="state === 'nogas'" class="status muted">
        The prepaid gas for this link has been used up. Ask the sender to wait for it to expire,
        take it back, and send a new one.
      </p>
      <p v-else-if="state === 'success'" class="status muted">
        {{ amount }} is now in <strong>{{ shortAddress(to.trim()) }}</strong> on {{ CHAIN.name }}.
      </p>
      <p v-else-if="state === 'claimed'" class="status muted">
        The USDC was already taken out of this link.
      </p>
      <p v-else-if="state === 'refunded'" class="status muted">
        The sender took the USDC back after the link expired.
      </p>
    </div>

    <div class="spacer" />

    <template v-if="state === 'ready' || state === 'claiming'">
      <p class="label">
        Send it to
      </p>
      <div class="to-row">
        <input
          v-model="to" class="to" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="0x… address on Arc" :disabled="state === 'claiming'"
        >
        <button class="use-wallet" :disabled="connecting || state === 'claiming'" aria-label="Use my wallet address" @click="useWallet">
          <span v-if="connecting" class="spinner" />
          <Icon v-else name="wallet" :size="20" />
        </button>
      </div>
      <p class="hint muted">
        Any wallet that works on Arc. Nothing to install, nothing to sign, no gas — the link pays for itself.
      </p>
      <p v-if="error" class="error">
        {{ error }}
      </p>
      <button class="btn btn-primary" :disabled="!toValid || state === 'claiming'" @click="claim">
        <template v-if="state === 'claiming'">
          <span class="spinner" /> Claiming…
        </template>
        <template v-else>
          Claim {{ amount }}
        </template>
      </button>
    </template>

    <template v-else-if="state !== 'loading' && state !== 'unfunded'">
      <p v-if="error" class="error">
        {{ error }}
      </p>
      <a v-if="claimTx" class="link-btn tx" :href="txUrl(claimTx)" target="_blank" rel="noopener">
        View transaction <Icon name="external" :size="14" />
      </a>
      <button class="btn btn-primary" @click="emit('done')">
        {{ state === 'success' ? 'Done' : 'Send your own KashLink' }}
      </button>
    </template>
    <p v-else-if="error" class="error">
      {{ error }}
    </p>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 48px;
  text-align: center;
}

.badge {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: var(--nq-light-blue);
  background-image: var(--accent-bg);
  color: #fff;
  box-shadow: var(--shadow-btn);
}

.badge.gold {
  background: var(--nq-gold);
  background-image: var(--gold-bg);
  box-shadow: 0 6px 16px rgba(233, 178, 19, 0.35);
}

.badge.green {
  background: var(--nq-green);
  background-image: var(--green-bg);
  box-shadow: 0 6px 16px rgba(33, 188, 165, 0.35);
}

.badge.gray {
  background: var(--highlight-strong);
  background-image: none;
  color: var(--muted);
  box-shadow: none;
}

.badge .spinner {
  width: 26px;
  height: 26px;
}

.heading {
  margin: 20px 0 4px;
  font-size: 20px;
  font-weight: 800;
}

.amount {
  margin-top: 8px;
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.unit {
  margin-left: 8px;
  color: var(--muted-2);
  font-size: 24px;
  font-weight: 700;
}

.status {
  max-width: 300px;
  margin-top: 20px;
  font-size: 14px;
}

.status strong {
  color: var(--text);
}

.label {
  margin-bottom: 8px;
}

.to-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 14px;
  border-radius: 500px;
  background: var(--highlight);
}

.to {
  flex: 1;
  min-width: 0;
  height: 48px;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-family: ui-monospace, monospace;
  font-size: 14px;
  outline: none;
}

.to::placeholder {
  color: var(--muted-2);
  font-family: 'Mulish', sans-serif;
}

.use-wallet {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 48px;
  border: 0;
  background: none;
  color: var(--accent);
}

.use-wallet .spinner {
  width: 18px;
  height: 18px;
}

.hint {
  margin: 10px 2px 14px;
  font-size: 13px;
}

.tx {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-bottom: 12px;
  text-decoration: none;
}

.error {
  margin: 0 0 12px;
}
</style>
