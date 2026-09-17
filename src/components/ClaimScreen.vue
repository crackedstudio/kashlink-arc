<script setup lang="ts">
import { type Hex, isAddress } from 'viem'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { track } from '../lib/analytics'
import { CHAIN, ESCROW_CONFIGURED, txUrl } from '../lib/arc'
import { shortAddress } from '../lib/format'
import { claimLink, hasClaimed, linkGasBalance, linkIdOf, type OnChainLink, readLink } from '../lib/links'
import { formatAmount } from '../lib/tokens'
import { connect, discoverWallets, errorMessage } from '../lib/wallet'
import Icon from './Icon.vue'
import Logo from './Logo.vue'

const props = defineProps<{ linkKey: Hex, message?: string }>()
const emit = defineEmits<{ done: [] }>()

/**
 * loading    reading the link from the contract
 * unfunded   no deposit for this key (yet) — the sender's transaction may still be landing
 * ready      pending on chain, waiting for a payout address
 * nogas      pending, but the stipend on the link address is gone
 * claiming   transaction in flight
 * success    paid out
 * claimed    somebody already took it (every slot, for a drop)
 * refunded   the sender took it back
 * taken      this address already has its slot of the drop
 */
type State = 'loading' | 'unfunded' | 'ready' | 'nogas' | 'claiming' | 'success' | 'claimed' | 'refunded' | 'taken'
const state = ref<State>('loading')
const link = ref<OnChainLink | null>(null)
const linkId = linkIdOf(props.linkKey)
const to = ref('')
const claimTx = ref<string | null>(null)
const error = ref<string | null>(null)
const connecting = ref(false)
/** Shown when the recipient would rather paste an address than connect a wallet. */
const manual = ref(false)
let pollTimer: number | undefined

const token = computed(() => link.value?.token)
const amount = computed(() => (link.value ? formatAmount(link.value.amountEach, link.value.token) : ''))
const isDrop = computed(() => (link.value?.slots ?? 1) > 1)
const left = computed(() => (link.value ? link.value.slots - link.value.claimed : 0))
const toValid = computed(() => isAddress(to.value.trim()))
const heading = computed(() => ({
  loading: 'Opening KashLink…',
  unfunded: 'This KashLink is almost ready',
  ready: isDrop.value ? 'You got a drop!' : 'You received cash!',
  nogas: isDrop.value ? 'You got a drop!' : 'You received cash!',
  claiming: isDrop.value ? 'You got a drop!' : 'You received cash!',
  success: 'Cash received!',
  claimed: isDrop.value ? 'This drop is all gone' : 'This KashLink was already claimed',
  refunded: 'This KashLink was returned',
  taken: 'You already claimed this one',
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
  taken: 'check',
} as const)[state.value])
const badgeClass = computed(() => ({
  gold: state.value === 'ready' || state.value === 'nogas' || state.value === 'claiming',
  green: state.value === 'success',
  gray: state.value === 'claimed' || state.value === 'refunded' || state.value === 'taken',
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

/**
 * The one-tap path: connect a browser wallet, take its address, claim to it. The wallet only supplies
 * the address — it signs nothing, since the claim is signed by the link's own key.
 */
async function claimWithWallet() {
  const wallets = discoverWallets()
  if (!wallets.length) {
    manual.value = true
    error.value = 'No wallet found in this browser. Paste the address you want it sent to instead.'
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
    return
  }
  finally {
    connecting.value = false
  }
  await claim()
}

async function claim() {
  if (!toValid.value) return
  const recipient = to.value.trim() as Hex
  error.value = null
  state.value = 'claiming'
  try {
    // A drop gives one slot per address; say so before spending the stipend on a revert.
    if (isDrop.value && await hasClaimed(linkId, recipient)) {
      state.value = 'taken'
      return
    }
    claimTx.value = await claimLink(props.linkKey, recipient)
    state.value = 'success'
    if (link.value) track('link_claimed', link.value.amountEach, linkId)
  }
  catch (e) {
    const text = errorMessage(e)
    if (/AlreadyClaimed/.test(text)) {
      state.value = 'taken'
      return
    }
    error.value = text
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
      <div v-if="link && state !== 'unfunded'" class="amount" :class="{ muted: state === 'claimed' || state === 'refunded' || state === 'taken' }">
        {{ amount }}<span class="unit">{{ token?.symbol }}</span>
      </div>
      <p v-if="message && link && state !== 'unfunded'" class="message">
        “{{ message }}”
      </p>
      <p v-if="isDrop && (state === 'ready' || state === 'nogas' || state === 'claiming')" class="drop muted">
        <Icon name="drop" :size="16" /> {{ left }} of {{ link!.slots }} left · first come, first served
      </p>
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
        {{ amount }} in {{ token?.symbol }} is now in <strong>{{ shortAddress(to.trim()) }}</strong> on {{ CHAIN.name }}.
      </p>
      <p v-else-if="state === 'claimed'" class="status muted">
        {{ isDrop ? `All ${link!.slots} slots have been claimed.` : `The ${token?.symbol} was already taken out of this link.` }}
      </p>
      <p v-else-if="state === 'taken'" class="status muted">
        Each address can take one slot of a drop, and <strong>{{ shortAddress(to.trim()) }}</strong> already has its {{ amount }}.
      </p>
      <p v-else-if="state === 'refunded'" class="status muted">
        The sender took the {{ token?.symbol }} back after the link expired.
      </p>
    </div>

    <div class="spacer" />

    <template v-if="state === 'ready' || state === 'claiming'">
      <template v-if="manual">
        <p class="label">
          Send it to
        </p>
        <input
          v-model="to" class="to" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="0x… address on Arc" :disabled="state === 'claiming'"
        >
        <p class="hint muted">
          Any address on Arc. Nothing to sign, no gas — the link pays for itself.
        </p>
      </template>
      <p v-else class="hint muted center">
        Nothing to sign and no gas to pay — the link covers it. Your wallet only tells us where to send the {{ token?.symbol }}.
      </p>
      <p v-if="error" class="error">
        {{ error }}
      </p>
      <button v-if="manual" class="btn btn-primary" :disabled="!toValid || state === 'claiming'" @click="claim">
        <template v-if="state === 'claiming'">
          <span class="spinner" /> Claiming…
        </template>
        <template v-else>
          Claim {{ amount }}
        </template>
      </button>
      <button v-else class="btn btn-primary" :disabled="connecting || state === 'claiming'" @click="claimWithWallet">
        <template v-if="state === 'claiming'">
          <span class="spinner" /> Claiming…
        </template>
        <template v-else-if="connecting">
          <span class="spinner" /> Connecting…
        </template>
        <template v-else>
          <Icon name="wallet" :size="20" /> Connect wallet & claim {{ amount }}
        </template>
      </button>
      <button class="link-btn switch" :disabled="state === 'claiming'" @click="manual = !manual; error = null">
        {{ manual ? 'Use a wallet instead' : 'No wallet? Paste an address instead' }}
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
        {{ state === 'success' || state === 'taken' ? 'Done' : 'Send your own KashLink' }}
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

.message {
  max-width: 300px;
  margin-top: 14px;
  padding: 10px 16px;
  border-radius: var(--radius);
  background: var(--highlight);
  font-size: 15px;
  font-style: italic;
}

.drop {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  font-size: 13px;
  font-weight: 700;
}

.label {
  margin-bottom: 8px;
}

.to {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 0;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--text);
  font: inherit;
  font-family: ui-monospace, monospace;
  font-size: 14px;
  outline: none;
}

.to:focus {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.to::placeholder {
  color: var(--muted-2);
  font-family: 'Mulish', sans-serif;
}

.hint {
  margin: 10px 2px 14px;
  font-size: 13px;
}

.hint.center {
  text-align: center;
}

.switch {
  display: block;
  width: 100%;
  margin-top: 12px;
  text-align: center;
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
