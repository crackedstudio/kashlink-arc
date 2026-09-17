<script setup lang="ts">
import type { Hex } from 'viem'
import { computed, onMounted, ref } from 'vue'
import AmountScreen from './components/AmountScreen.vue'
import ClaimScreen from './components/ClaimScreen.vue'
import IntroScreen from './components/IntroScreen.vue'
import LinksSheet from './components/LinksSheet.vue'
import ReadySheet from './components/ReadySheet.vue'
import ReviewScreen from './components/ReviewScreen.vue'
import { track } from './lib/analytics'
import { ESCROW_CONFIGURED } from './lib/arc'
import {
  chainState, createLink, EXPIRY_OPTIONS, feeParams, type FeeParams, isExpired, keyFromHash, newLink,
  type NewLink, quoteWith, refreshStatuses,
} from './lib/links'
import { loadLinks, removeLink, saveLink, type StoredLink } from './lib/storage'
import { type Connected, connect, connected, type DiscoveredWallet, errorMessage, getBalance, isUserRejection } from './lib/wallet'

type Screen = 'intro' | 'amount' | 'review' | 'claim'

const claimKey = ref<Hex | null>(keyFromHash(location.hash))
const screen = ref<Screen>(claimKey.value ? 'claim' : 'intro')

const wallet = ref<Connected | null>(connected())
const walletError = ref<string | null>(null)
const connecting = ref(false)
const balance = ref<bigint | null>(null)
const fees = ref<FeeParams | null>(null)

const amount = ref(0n)
const expirySeconds = ref<number>(EXPIRY_OPTIONS[1].seconds)
/** Generated when the review screen opens; funded when the user taps Send. */
const pendingLink = ref<NewLink | null>(null)
const sending = ref(false)
const sendError = ref<string | null>(null)

const links = ref<StoredLink[]>(loadLinks())
const readyLink = ref<StoredLink | null>(null)
const showLinks = ref(false)
const expiredCount = computed(() => links.value.filter(l => chainState[l.id] && isExpired(chainState[l.id])).length)
const quote = computed(() => (fees.value ? quoteWith(fees.value, amount.value) : null))

onMounted(() => {
  // Opening another KashLink while one is already open only changes the #hash, without a reload.
  window.addEventListener('hashchange', () => {
    const key = keyFromHash(location.hash)
    if (!key) return
    claimKey.value = key
    readyLink.value = null
    showLinks.value = false
    screen.value = 'claim'
  })
  if (!ESCROW_CONFIGURED) return
  // Check the sender's own links in the background, so an expired one can be flagged on the intro
  // screen. Skipped when opening someone else's link, where these are not ours to care about.
  if (screen.value !== 'claim' && links.value.length) refreshStatuses(links.value).catch(() => {})
  feeParams().then(p => (fees.value = p)).catch(() => {})
})

async function loadBalance() {
  if (!wallet.value) return
  const address = wallet.value.address
  try {
    const value = await getBalance(address)
    if (wallet.value?.address === address) balance.value = value
  }
  catch {
    balance.value = null
  }
}

async function connectWallet(choice: DiscoveredWallet) {
  connecting.value = true
  walletError.value = null
  try {
    wallet.value = await connect(choice)
    balance.value = null
    await loadBalance()
  }
  catch (error) {
    walletError.value = errorMessage(error)
  }
  finally {
    connecting.value = false
  }
}

function startCreate() {
  screen.value = 'amount'
  loadBalance()
}

function onAmount(wei: bigint, expiry: number) {
  amount.value = wei
  expirySeconds.value = expiry
  sendError.value = null
  // Generate the key now, so the review screen can show where the money is going before it moves.
  pendingLink.value = newLink()
  screen.value = 'review'
}

async function send() {
  const link = pendingLink.value
  const w = wallet.value
  if (!link || !w) return
  sending.value = true
  sendError.value = null
  const stored: StoredLink = {
    key: link.key,
    id: link.id,
    amount: amount.value.toString(),
    expiry: Math.floor(Date.now() / 1000) + expirySeconds.value,
    createdAt: Date.now(),
  }
  try {
    // Persist the key before any USDC moves, so the link can always be re-shared.
    saveLink(stored)
    const fundingTx = await createLink(w.client, link, amount.value, expirySeconds.value)
    const funded = { ...stored, fundingTx }
    saveLink(funded)
    track('link_created', amount.value, link.id)
    links.value = loadLinks()
    readyLink.value = funded
    pendingLink.value = null
    screen.value = 'intro'
    loadBalance()
  }
  catch (error) {
    // Nothing was sent when the user declined, so the unused key can go.
    if (isUserRejection(error)) removeLink(link.id)
    sendError.value = errorMessage(error)
  }
  finally {
    sending.value = false
  }
}

function openLink(link: StoredLink) {
  showLinks.value = false
  readyLink.value = link
}

function closeReady() {
  readyLink.value = null
  links.value = loadLinks()
}

function finishClaim() {
  history.replaceState(null, '', location.pathname + location.search)
  claimKey.value = null
  screen.value = 'intro'
}
</script>

<template>
  <ClaimScreen v-if="screen === 'claim' && claimKey" :key="claimKey" :link-key="claimKey" @done="finishClaim" />
  <IntroScreen
    v-else-if="screen === 'intro'"
    :wallet :connecting :wallet-error :balance
    :link-count="links.length" :expired-count="expiredCount"
    @connect="connectWallet" @next="startCreate" @show-links="showLinks = true"
  />
  <AmountScreen
    v-else-if="screen === 'amount'" :balance :fees :expiry-seconds="expirySeconds"
    @back="screen = 'intro'" @retry="loadBalance" @continue="onAmount"
  />
  <ReviewScreen
    v-else-if="quote && pendingLink" :quote :expiry-seconds="expirySeconds" :link-id="pendingLink.id"
    :wallet-name="wallet?.wallet.name ?? 'your wallet'" :sending :error="sendError"
    @back="screen = 'amount'" @send="send"
  />

  <LinksSheet v-if="showLinks" :links :wallet @connect="connectWallet" @open="openLink" @changed="links = loadLinks()" @close="showLinks = false" />
  <ReadySheet v-if="readyLink" :key="readyLink.id" :link="readyLink" :wallet @connect="connectWallet" @close="closeReady" />
</template>
