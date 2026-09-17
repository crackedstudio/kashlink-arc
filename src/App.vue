<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AmountScreen from './components/AmountScreen.vue'
import BatchSheet from './components/BatchSheet.vue'
import ClaimScreen from './components/ClaimScreen.vue'
import IntroScreen from './components/IntroScreen.vue'
import LinksSheet from './components/LinksSheet.vue'
import ReadySheet from './components/ReadySheet.vue'
import ReviewScreen from './components/ReviewScreen.vue'
import StatsScreen from './components/StatsScreen.vue'
import WalletSheet from './components/WalletSheet.vue'
import { track } from './lib/analytics'
import { ESCROW_ADDRESS, ESCROW_CONFIGURED } from './lib/arc'
import {
  chainState, createLinks, EXPIRY_OPTIONS, feeParams, type FeeParams, isExpired, type LinkMode, newLink,
  type NewLink, parseHash, type ParsedHash, quoteWith, refreshStatuses,
} from './lib/links'
import { hasSavedPasskey } from './lib/passkey-cache'
import { batchOf, loadLinks, removeLinks, saveLinks, type StoredLink } from './lib/storage'
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
const people = ref(1)
const mode = ref<LinkMode>('separate')
const message = ref('')
const expirySeconds = ref<number>(EXPIRY_OPTIONS[1].seconds)
/** Generated when the review screen opens (one per link); funded when the user taps Send. */
const pendingLinks = ref<NewLink[] | null>(null)
const sending = ref(false)
/** True while the wallet is showing the EURC approval, which precedes the deposit. */
const approving = ref(false)
const sendError = ref<string | null>(null)

const links = ref<StoredLink[]>(loadLinks())
/** The link just made or opened — or every link of a batch, for separate links. */
const ready = ref<StoredLink[] | null>(null)
const showLinks = ref(false)
const showWallet = ref(false)
/** A passkey wallet was made on this device (the credential is in localStorage). */
const hasPasskey = ref(hasSavedPasskey())

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
const quote = computed(() => (fees.value ? quoteWith(fees.value, token.value, amount.value, people.value, mode.value) : null))

onMounted(() => {
  // Someone with a passkey wallet will likely open it; fetch the SDK (a third of the app) while idle,
  // so the wallet is ready to send by the time they tap.
  if (hasPasskey.value) {
    const preload = () => import('./lib/passkey').catch(() => {})
    if ('requestIdleCallback' in window) requestIdleCallback(preload)
    else setTimeout(preload, 1500)
  }
  // Opening another KashLink while one is already open only changes the #hash, without a reload.
  window.addEventListener('hashchange', () => {
    const parsed = parseHash(location.hash)
    if (!parsed) return
    claimLink.value = parsed
    ready.value = null
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

function onAmount(units: bigint, count: number, how: LinkMode, expiry: number) {
  amount.value = units
  people.value = count
  mode.value = how
  expirySeconds.value = expiry
  sendError.value = null
  // Generate the keys now, so the review screen can show where the money is going before it moves.
  const linkCount = count > 1 && how === 'separate' ? count : 1
  pendingLinks.value = Array.from({ length: linkCount }, () => newLink())
  screen.value = 'review'
}

async function send() {
  const pending = pendingLinks.value
  const w = wallet.value
  const q = quote.value
  if (!pending?.length || !w || !q) return
  sending.value = true
  approving.value = false
  sendError.value = null
  const createdAt = Date.now()
  const batchId = pending.length > 1 ? pending[0]!.id : undefined
  const stored = pending.map<StoredLink>((link, index) => ({
    key: link.key,
    id: link.id,
    amount: amount.value.toString(),
    token: token.value.address,
    slots: q.slots,
    message: message.value.trim() || undefined,
    expiry: Math.floor(createdAt / 1000) + expirySeconds.value,
    createdAt,
    escrow: ESCROW_ADDRESS,
    batch: batchId ? { id: batchId, index, size: pending.length } : undefined,
  }))
  const ids = pending.map(l => l.id)
  try {
    // Persist the keys before any money moves, so the links can always be re-shared.
    saveLinks(stored)
    const fundingTx = await createLinks(w, pending, q, expirySeconds.value, () => (approving.value = true))
    const funded = stored.map(l => ({ ...l, fundingTx }))
    saveLinks(funded)
    track('link_created', q.total, ids[0]!)
    links.value = loadLinks()
    ready.value = funded
    pendingLinks.value = null
    screen.value = 'intro'
    loadBalance()
  }
  catch (error) {
    // Nothing was sent when the user declined, so the unused keys can go.
    if (isUserRejection(error)) removeLinks(ids)
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
  ready.value = batchOf(link)
}

function closeReady() {
  ready.value = null
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
    v-else-if="screen === 'amount'" :token :balance :usdc-balance :fees :people :mode :expiry-seconds="expirySeconds"
    @back="screen = 'intro'" @retry="loadBalance" @update:token="selectToken" @continue="onAmount"
  />
  <ReviewScreen
    v-else-if="quote && pendingLinks" v-model:message="message" :quote :expiry-seconds="expirySeconds" :link-id="pendingLinks[0]!.id"
    :wallet-name="wallet?.name ?? 'your wallet'" :sending :approving :error="sendError"
    @back="screen = 'amount'" @send="send"
  />

  <LinksSheet v-if="showLinks" :links :wallet @connect="connectWallet" @open="openLink" @changed="links = loadLinks()" @close="showLinks = false" />
  <BatchSheet v-if="ready && ready.length > 1" :key="ready[0]!.id" :links="ready" :wallet @connect="connectWallet" @close="closeReady" />
  <ReadySheet v-else-if="ready" :key="ready[0]!.id" :link="ready[0]!" :wallet @connect="connectWallet" @close="closeReady" />
  <WalletSheet v-if="showWallet" @close="showWallet = false" @forgotten="forgotPasskey" />
</template>
