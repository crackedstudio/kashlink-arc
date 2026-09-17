<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AmountScreen from './components/AmountScreen.vue'
import ClaimScreen from './components/ClaimScreen.vue'
import IntroScreen from './components/IntroScreen.vue'
import LinksSheet from './components/LinksSheet.vue'
import ReadySheet from './components/ReadySheet.vue'
import ReviewScreen from './components/ReviewScreen.vue'
import StatsScreen from './components/StatsScreen.vue'
import WalletSheet from './components/WalletSheet.vue'
import { track } from './lib/analytics'
import { ESCROW_CONFIGURED } from './lib/arc'
import {
  chainState, createLink, EXPIRY_OPTIONS, feeParams, type FeeParams, isExpired, newLink,
  type NewLink, parseHash, type ParsedHash, quoteWith, refreshStatuses,
} from './lib/links'
import { loadLinks, removeLink, saveLink, type StoredLink } from './lib/storage'
import { getTokenBalance, type Token, USDC } from './lib/tokens'
import { type Connected, connect, connected, type DiscoveredWallet, errorMessage, isUserRejection } from './lib/wallet'

type Screen = 'intro' | 'amount' | 'review' | 'claim' | 'stats'

const claimLink = ref<ParsedHash | null>(parseHash(location.hash))
const screen = ref<Screen>(claimLink.value ? 'claim' : location.pathname.replace(/\/+$/, '') === '/stats' ? 'stats' : 'intro')

const wallet = ref<Connected | null>(connected())
const walletError = ref<string | null>(null)
const connecting = ref(false)
/** Balance of the chosen token, plus native USDC (which always pays the stipends). */
const balance = ref<bigint | null>(null)
const usdcBalance = ref<bigint | null>(null)
const fees = ref<FeeParams | null>(null)

const token = ref<Token>(USDC)
const amount = ref(0n)
const slots = ref(1)
const message = ref('')
const expirySeconds = ref<number>(EXPIRY_OPTIONS[1].seconds)
/** Generated when the review screen opens; funded when the user taps Send. */
const pendingLink = ref<NewLink | null>(null)
const sending = ref(false)
/** True while the wallet is showing the EURC approval, which precedes the deposit. */
const approving = ref(false)
const sendError = ref<string | null>(null)

const links = ref<StoredLink[]>(loadLinks())
const readyLink = ref<StoredLink | null>(null)
const showLinks = ref(false)
const showWallet = ref(false)
/** A passkey wallet was made on this device (the credential is in localStorage). */
const hasPasskey = ref(hasSavedPasskey())

function hasSavedPasskey(): boolean {
  try {
    return !!localStorage.getItem('kashlink-arc-passkey')
  }
  catch {
    return false
  }
}

const openingPasskey = ref(false)

/** Sends from the passkey wallet: reopens the one saved on this device, or registers a new passkey. */
async function usePasskey() {
  openingPasskey.value = true
  walletError.value = null
  try {
    const passkey = await import('./lib/passkey')
    const opened = hasPasskey.value ? await passkey.openPasskeyWallet() : await passkey.createPasskeyWallet()
    hasPasskey.value = true
    wallet.value = passkey.asSender(opened)
    balance.value = null
    await loadBalance()
  }
  catch (error) {
    const text = `${(error as Error).name} ${(error as { details?: string }).details ?? (error as Error).message}`
    walletError.value = /NotAllowed|abort|cancel/i.test(text)
      ? 'Passkey request was cancelled.'
      : /entity config|SecurityError|domain/i.test(text)
        ? 'Passkey wallets are not set up for this site yet.'
        : errorMessage(error)
  }
  finally {
    openingPasskey.value = false
  }
}

function disconnect() {
  wallet.value = connected()
  balance.value = null
  usdcBalance.value = null
  loadBalance()
}

function openWallet() {
  finishClaim()
  hasPasskey.value = true
  showWallet.value = true
}
const expiredCount = computed(() => links.value.filter(l => chainState[l.id] && isExpired(chainState[l.id])).length)
const quote = computed(() => (fees.value ? quoteWith(fees.value, token.value, amount.value, slots.value) : null))

onMounted(() => {
  // Opening another KashLink while one is already open only changes the #hash, without a reload.
  window.addEventListener('hashchange', () => {
    const parsed = parseHash(location.hash)
    if (!parsed) return
    claimLink.value = parsed
    readyLink.value = null
    showLinks.value = false
    screen.value = 'claim'
  })
  window.addEventListener('popstate', () => {
    if (screen.value === 'stats' || screen.value === 'intro') screen.value = location.pathname.replace(/\/+$/, '') === '/stats' ? 'stats' : 'intro'
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
  const forToken = token.value
  try {
    const [usdc, chosen] = await Promise.all([
      getTokenBalance(USDC, address),
      forToken === USDC ? null : getTokenBalance(forToken, address),
    ])
    if (wallet.value?.address !== address || token.value !== forToken) return
    usdcBalance.value = usdc
    balance.value = chosen ?? usdc
  }
  catch {
    balance.value = null
  }
}

function selectToken(next: Token) {
  if (next === token.value) return
  token.value = next
  amount.value = 0n
  balance.value = null
  loadBalance()
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

function onAmount(units: bigint, count: number, expiry: number) {
  amount.value = units
  slots.value = count
  expirySeconds.value = expiry
  sendError.value = null
  // Generate the key now, so the review screen can show where the money is going before it moves.
  pendingLink.value = newLink()
  screen.value = 'review'
}

async function send() {
  const link = pendingLink.value
  const w = wallet.value
  const q = quote.value
  if (!link || !w || !q) return
  sending.value = true
  approving.value = false
  sendError.value = null
  const stored: StoredLink = {
    key: link.key,
    id: link.id,
    amount: amount.value.toString(),
    token: token.value.address,
    slots: slots.value,
    message: message.value.trim() || undefined,
    expiry: Math.floor(Date.now() / 1000) + expirySeconds.value,
    createdAt: Date.now(),
  }
  try {
    // Persist the key before any money moves, so the link can always be re-shared.
    saveLink(stored)
    const fundingTx = await createLink(w, link, q, expirySeconds.value, () => (approving.value = true))
    const funded = { ...stored, fundingTx }
    saveLink(funded)
    track('link_created', q.total, link.id)
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
    approving.value = false
  }
}

function forgotPasskey() {
  showWallet.value = false
  hasPasskey.value = false
  if (wallet.value?.passkey) disconnect()
}

function openLink(link: StoredLink) {
  showLinks.value = false
  readyLink.value = link
}

function closeReady() {
  readyLink.value = null
  links.value = loadLinks()
}

function showStats() {
  history.pushState(null, '', '/stats')
  screen.value = 'stats'
}

function leaveStats() {
  history.pushState(null, '', '/')
  screen.value = 'intro'
}

function finishClaim() {
  history.replaceState(null, '', location.pathname + location.search)
  claimLink.value = null
  screen.value = 'intro'
}
</script>

<template>
  <ClaimScreen v-if="screen === 'claim' && claimLink" :key="claimLink.key" :link-key="claimLink.key" :message="claimLink.message" @done="finishClaim" @open-wallet="openWallet" />
  <StatsScreen v-else-if="screen === 'stats'" @back="leaveStats" />
  <IntroScreen
    v-else-if="screen === 'intro'"
    :wallet :connecting :wallet-error :balance="usdcBalance"
    :link-count="links.length" :expired-count="expiredCount" :has-passkey="hasPasskey" :opening-passkey="openingPasskey"
    @connect="connectWallet" @use-passkey="usePasskey" @disconnect="disconnect" @next="startCreate" @show-links="showLinks = true" @stats="showStats" @show-wallet="showWallet = true"
  />
  <AmountScreen
    v-else-if="screen === 'amount'" :token :balance :usdc-balance :fees :slots :expiry-seconds="expirySeconds"
    @back="screen = 'intro'" @retry="loadBalance" @update:token="selectToken" @continue="onAmount"
  />
  <ReviewScreen
    v-else-if="quote && pendingLink" v-model:message="message" :quote :expiry-seconds="expirySeconds" :link-id="pendingLink.id"
    :wallet-name="wallet?.name ?? 'your wallet'" :sending :approving :error="sendError"
    @back="screen = 'amount'" @send="send"
  />

  <LinksSheet v-if="showLinks" :links :wallet @connect="connectWallet" @open="openLink" @changed="links = loadLinks()" @close="showLinks = false" />
  <ReadySheet v-if="readyLink" :key="readyLink.id" :link="readyLink" :wallet @connect="connectWallet" @close="closeReady" />
  <WalletSheet v-if="showWallet" @close="showWallet = false" @forgotten="forgotPasskey" />
</template>
