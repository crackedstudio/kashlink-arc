<script setup lang="ts">
import { computed, ref } from 'vue'
import { CHAIN, ESCROW_CONFIGURED, IS_MAINNET } from '../lib/arc'
import { formatUsdc } from '../lib/format'
import { type Connected, discoverWallets, type DiscoveredWallet } from '../lib/wallet'
import CopyAddress from './CopyAddress.vue'
import Icon from './Icon.vue'
import Logo from './Logo.vue'

defineProps<{
  wallet: Connected | null
  connecting: boolean
  walletError: string | null
  balance: bigint | null
  linkCount: number
  expiredCount: number
  hasPasskey: boolean
  openingPasskey: boolean
}>()
const emit = defineEmits<{ connect: [wallet: DiscoveredWallet], usePasskey: [], disconnect: [], next: [], showLinks: [], stats: [], showWallet: [] }>()

/** Passkey wallets need a Circle client key; without one the option simply isn't offered. */
const PASSKEYS = !!import.meta.env.VITE_CIRCLE_CLIENT_KEY

const steps = [
  { title: 'Put USDC or EURC in a KashLink', text: 'For one person, or a drop the first few to open it share' },
  { title: 'Share the link', text: 'Chat, QR code, or a note on the link — anyone holding it can claim' },
  { title: 'They receive the money', text: 'When they open it — no wallet setup, no gas, instant' },
]

const wallets = ref<DiscoveredWallet[]>([])
const choosing = ref(false)
const noWallet = computed(() => choosing.value && !wallets.value.length)

function connectClicked() {
  wallets.value = discoverWallets()
  if (wallets.value.length === 1) {
    emit('connect', wallets.value[0])
    return
  }
  choosing.value = true
}

function choose(wallet: DiscoveredWallet) {
  choosing.value = false
  emit('connect', wallet)
}
</script>

<template>
  <main class="screen">
    <div class="brand">
      <Logo :size="28" />
      <span>KashLink</span>
      <span v-if="!IS_MAINNET" class="net">{{ CHAIN.name }}</span>
    </div>
    <h1 class="title intro-title">
      Send stablecoins as a link
    </h1>
    <p class="subtitle muted">
      No address, no account, no gas. Whoever opens the link keeps the money.
    </p>

    <svg class="hero" viewBox="0 0 335 168" role="img" aria-label="A phone sending USDC through a link">
      <defs>
        <radialGradient id="hero-bg" cx="100%" cy="100%" r="120%">
          <stop offset="0" stop-color="#265DD7" />
          <stop offset="1" stop-color="#0582CA" />
        </radialGradient>
        <radialGradient id="hero-green" cx="100%" cy="100%" r="100%">
          <stop offset="0" stop-color="#41A38E" />
          <stop offset="1" stop-color="#21BCA5" />
        </radialGradient>
      </defs>
      <rect width="335" height="168" rx="20" fill="url(#hero-bg)" />
      <circle cx="298" cy="30" r="18" fill="#fff" opacity=".08" />
      <circle cx="40" cy="130" r="14" fill="#fff" opacity=".08" />
      <circle cx="70" cy="10" r="22" fill="#fff" opacity=".06" />
      <!-- sender phone -->
      <rect x="44" y="34" width="70" height="120" rx="12" fill="#fff" opacity=".18" />
      <rect x="49" y="39" width="60" height="110" rx="9" fill="#fff" />
      <rect x="69" y="45" width="20" height="4" rx="2" fill="#1F2348" opacity=".2" />
      <rect x="58" y="64" width="42" height="7" rx="3.5" fill="#1F2348" opacity=".12" />
      <rect x="58" y="78" width="28" height="7" rx="3.5" fill="#1F2348" opacity=".12" />
      <rect x="58" y="126" width="42" height="14" rx="7" fill="url(#hero-bg)" />
      <!-- link dashes -->
      <path d="M118 94 H 215" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 10" opacity=".85" />
      <!-- USDC coin travelling -->
      <g transform="translate(167 94)">
        <circle r="30" fill="#fff" opacity=".15" />
        <circle r="22" fill="#2775CA" />
        <circle r="22" fill="none" stroke="#fff" stroke-width="2" opacity=".5" />
        <text y="8" text-anchor="middle" fill="#fff" font-size="22" font-weight="800" font-family="Mulish, sans-serif">$</text>
      </g>
      <!-- receiver phone -->
      <rect x="221" y="34" width="70" height="120" rx="12" fill="#fff" opacity=".18" />
      <rect x="226" y="39" width="60" height="110" rx="9" fill="#fff" />
      <rect x="246" y="45" width="20" height="4" rx="2" fill="#1F2348" opacity=".2" />
      <circle cx="256" cy="86" r="17" fill="url(#hero-green)" />
      <path d="M248 86l5.5 5.5L265 80" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="240" y="112" width="32" height="6" rx="3" fill="#1F2348" opacity=".12" />
      <rect x="245" y="124" width="22" height="6" rx="3" fill="#1F2348" opacity=".08" />
    </svg>

    <p class="how label">
      How it works
    </p>

    <ol class="steps card">
      <li v-for="(step, i) in steps" :key="i">
        <span class="num">{{ i + 1 }}</span>
        <div>
          <strong>{{ step.title }}</strong>
          <span class="muted">{{ step.text }}</span>
        </div>
      </li>
    </ol>

    <div class="spacer" />

    <button v-if="expiredCount" class="expired-nudge" @click="emit('showLinks')">
      <Icon name="alert" :size="18" />
      <span>{{ expiredCount }} unclaimed link{{ expiredCount > 1 ? 's' : '' }} — take the USDC back</span>
    </button>
    <button v-else-if="linkCount" class="link-btn links" @click="emit('showLinks')">
      <Icon name="link" :size="18" /> Your KashLinks ({{ linkCount }})
    </button>
    <button v-if="hasPasskey" class="link-btn links" @click="emit('showWallet')">
      <Icon name="wallet" :size="18" /> Your KashLink wallet
    </button>

    <p v-if="!ESCROW_CONFIGURED" class="error">
      This build has no escrow contract configured, so links cannot be created.
    </p>
    <template v-else-if="wallet">
      <p class="account muted">
        <Icon name="wallet" :size="16" />
        {{ wallet.name }} <CopyAddress :address="wallet.address" />
        <strong v-if="balance !== null">{{ formatUsdc(balance) }}</strong>
      </p>
      <button class="btn btn-primary" @click="emit('next')">
        Create KashLink
      </button>
      <button v-if="wallet.passkey" class="link-btn switch" @click="emit('disconnect')">
        Use a browser wallet instead
      </button>
    </template>
    <template v-else>
      <p v-if="walletError" class="error">
        {{ walletError }}
      </p>
      <p v-if="noWallet" class="error">
        No wallet found. Install MetaMask, Rabby, or another EVM wallet, then reload.
      </p>
      <div v-if="choosing && wallets.length" class="wallets card">
        <button v-for="w in wallets" :key="w.uuid" class="wallet-row" @click="choose(w)">
          <img v-if="w.icon" :src="w.icon" alt="" width="24" height="24">
          <Icon v-else name="wallet" :size="24" />
          {{ w.name }}
        </button>
      </div>
      <button v-else class="btn btn-primary" :disabled="connecting" @click="connectClicked">
        <template v-if="connecting">
          <span class="spinner" /> Connecting…
        </template>
        <template v-else>
          <Icon name="wallet" :size="20" /> Connect wallet
        </template>
      </button>
      <button v-if="PASSKEYS" class="btn btn-outline" :disabled="connecting || openingPasskey" @click="emit('usePasskey')">
        <template v-if="openingPasskey">
          <span class="spinner" /> {{ hasPasskey ? 'Opening your wallet…' : 'Setting up your passkey…' }}
        </template>
        <template v-else>
          {{ hasPasskey ? 'Use your KashLink wallet' : 'No wallet? Create one with a passkey' }}
        </template>
      </button>
    </template>
    <p class="legal muted">
      <a href="/stats" @click.prevent="emit('stats')"><Icon name="chart" :size="12" /> Live stats</a> ·
      <a href="https://github.com/crackedstudio/kashlink-arc" target="_blank" rel="noopener">Source</a> ·
      <a href="/terms" target="_blank" rel="noopener">Terms</a>
    </p>
  </main>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.net {
  padding: 2px 8px;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.intro-title {
  margin-top: 20px;
}

.subtitle {
  margin-top: 6px;
  font-size: 15px;
}

.hero {
  display: block;
  width: 100%;
  height: auto;
  margin-top: 20px;
  filter: drop-shadow(0 8px 20px rgba(5, 130, 202, 0.25));
}

.how {
  margin: 22px 0 10px;
}

.steps {
  margin: 0;
  padding: 4px 16px;
  list-style: none;
}

.steps li {
  position: relative;
  display: flex;
  gap: 14px;
  padding: 12px 0;
}

.steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 46px;
  left: 15px;
  width: 2px;
  height: calc(100% - 36px);
  border-radius: 1px;
  background: var(--accent-soft);
}

.num {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 14px;
  font-weight: 800;
}

.steps div {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

.steps strong {
  font-size: 15px;
  font-weight: 700;
}

.steps .muted {
  font-size: 13px;
}

.links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 4px;
}

.account {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}

.account strong {
  margin-left: 4px;
  color: var(--text);
}

.wallets {
  margin-bottom: 8px;
  padding: 4px 8px;
}

.wallet-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 8px;
  border: 0;
  background: none;
  font-size: 15px;
  font-weight: 700;
  text-align: left;
}

.wallet-row + .wallet-row {
  border-top: 1px solid var(--highlight);
}

.wallet-row img {
  border-radius: 6px;
}

.switch {
  display: block;
  width: 100%;
  font-size: 13px;
}

.legal {
  margin-top: 12px;
  font-size: 12px;
  text-align: center;
}

.legal a {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  text-decoration: none;
}

.error {
  margin-bottom: 10px;
}

.expired-nudge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  margin-bottom: 8px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--radius);
  background: var(--highlight);
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}
</style>
