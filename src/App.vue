<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
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
import { ESCROW_ADDRESS, ESCROW_CONFIGURED, gasReserve } from './lib/arc'
import { formatUsdc } from './lib/format'
import {
  chainState, createLinks, EXPIRY_OPTIONS, feeParams, type FeeParams, isExpired, type LinkMode, newLink,
  type NewLink, parseHash, type ParsedHash, quoteWith, refreshStatuses, shortfall,
} from './lib/links'
import { hasSavedPasskey } from './lib/passkey-cache'
import { batchOf, loadLinks, removeLinks, saveLinks, type StoredLink } from './lib/storage'
import { EURC, formatAmount, getTokenBalance, type Token, USDC } from './lib/tokens'
import { type Connected, connect, connected, disconnect as forgetBrowserWallet, type DiscoveredWallet, errorMessage, isUserRejection } from './lib/wallet'

type Screen = 'intro' | 'amount' | 'review' | 'claim' | 'stats'

const claimLink = ref<ParsedHash | null>(parseHash(location.hash))
const screen = ref<Screen>(claimLink.value ? 'claim' : location.pathname.replace(/\/+$/, '') === '/stats' ? 'stats' : 'intro')

const wallet = ref<Connected | null>(connected())
const walletError = ref<string | null>(null)
const connecting = ref(false)
/** Both balances are always read: USDC pays the stipends and gas whatever the link carries. */
const usdcBalance = ref<bigint | null>(null)
const eurcBalance = ref<bigint | null>(null)
/** Native USDC kept back for the sender's own transaction fee; depends on the kind of wallet. */
const reserve = ref(0n)
const fees = ref<FeeParams | null>(null)

// shallowRef: a plain ref would proxy the token, and the proxy is not `===` to the TOKENS entry.
const token = shallowRef<Token>(USDC)
const balance = computed(() => (token.value === USDC ? usdcBalance.value : eurcBalance.value))
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

/**
 * Uses the passkey wallet as the sender. `open` reopens the one saved on this device, or — when
 * there is none, for someone whose passkey lives on another device or whose site data was cleared —
 * shows the platform's passkey picker. `create` registers a new passkey. Reopening a saved wallet
 * needs no prompt (the credential is public data; only sending asks for the passkey), so it can
 * also happen quietly at launch.
 */
async function usePasskey(mode: 'open' | 'create' = hasPasskey.value ? 'open' : 'create', quiet = false) {
  openingPasskey.value = true
  walletError.value = null
  try {
    const passkey = await import('./lib/passkey')
    const opened = mode === 'open' ? await passkey.openPasskeyWallet() : await passkey.createPasskeyWallet()
    hasPasskey.value = true
    wallet.value = passkey.asSender(opened)
    clearBalances()
    await loadBalance()
  }
  catch (error) {
    if (!quiet) walletError.value = errorMessage(error)
  }
  finally {
    openingPasskey.value = false
  }
}

function clearBalances() {
  usdcBalance.value = null
  eurcBalance.value = null
}

/** Drops the current account. A browser wallet is forgotten; the passkey wallet stays on the device. */
function disconnect() {
  if (wallet.value && !wallet.value.passkey) forgetBrowserWallet()
  wallet.value = null
  walletError.value = null
  clearBalances()
}

function openWallet() {
  finishClaim()
  hasPasskey.value = true
  showWallet.value = true
}
const expiredCount = computed(() => links.value.filter(l => chainState[l.id] && isExpired(chainState[l.id])).length)
const quote = computed(() => (fees.value ? quoteWith(fees.value, token.value, amount.value, people.value, mode.value) : null))

watch(() => wallet.value?.passkey, async (passkey) => {
  if (passkey === undefined) return
  reserve.value = await gasReserve(passkey ? 'passkey' : 'wallet').catch(() => 0n)
}, { immediate: true })

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
    showWallet.value = false
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
  // The passkey wallet is the front door: if this device has one, it is signed in from the start.
  if (screen.value !== 'claim' && hasPasskey.value && !wallet.value) usePasskey('open', true)
})

async function loadBalance() {
  if (!wallet.value) return
  const address = wallet.value.address
  try {
    const [usdc, eurc] = await Promise.all([getTokenBalance(USDC, address), getTokenBalance(EURC, address)])
    if (wallet.value?.address !== address) return
    usdcBalance.value = usdc
    eurcBalance.value = eurc
  }
  catch {
    clearBalances()
  }
}

function selectToken(next: Token) {
  if (next === token.value) return
  token.value = next
  amount.value = 0n
}

async function connectWallet(choice: DiscoveredWallet) {
  connecting.value = true
  walletError.value = null
  try {
    wallet.value = await connect(choice)
    clearBalances()
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

/** The plain-words reason the wallet cannot pay for `q`, checked before anything is signed. */
function cannotAfford(q: NonNullable<typeof quote.value>): string | null {
  if (balance.value === null || usdcBalance.value === null) return null
  // Funding separate links costs roughly one create's gas per link.
  const gas = reserve.value * BigInt(q.links)
  const short = shortfall(q, balance.value, usdcBalance.value, gas)
  if (!short) return null
  const have = formatAmount(short.have, short.token)
  const need = formatAmount(short.need, short.token)
  return short.reason === 'gas'
    ? `Not enough USDC for the claim gas and network fee: you have ${have} and this link needs ${need} of USDC on top of the ${q.token.symbol}.`
    : `Not enough ${short.token.symbol}: you have ${have} and this link costs ${need} including the fee${short.token === USDC ? ` and about ${formatUsdc(gas)} of network gas` : ''}.`
}

async function send() {
  const pending = pendingLinks.value
  const w = wallet.value
  const q = quote.value
  if (!pending?.length || !w || !q) return
  sending.value = true
  approving.value = false
  sendError.value = null
  // Balances may have moved since the amount screen; say so here rather than let the chain reject it.
  await loadBalance()
  const short = cannotAfford(q)
  if (short) {
    sendError.value = short
    sending.value = false
    return
  }
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
    sendError.value = errorMessage(error, token.value.symbol)
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
  if (hasPasskey.value && !wallet.value) usePasskey('open', true)
}
</script>

<template>
  <ClaimScreen v-if="screen === 'claim' && claimLink" :key="claimLink.key" :link-key="claimLink.key" :message="claimLink.message" @done="finishClaim" @open-wallet="openWallet" />
  <StatsScreen v-else-if="screen === 'stats'" @back="leaveStats" />
  <IntroScreen
    v-else-if="screen === 'intro'"
    :wallet :connecting :wallet-error :usdc-balance :eurc-balance
    :link-count="links.length" :expired-count="expiredCount" :has-passkey="hasPasskey" :opening-passkey="openingPasskey"
    @connect="connectWallet" @use-passkey="usePasskey()" @sign-in-passkey="usePasskey('open')" @disconnect="disconnect" @next="startCreate" @show-links="showLinks = true" @stats="showStats" @show-wallet="showWallet = true" @refresh="loadBalance"
  />
  <AmountScreen
    v-else-if="screen === 'amount'" :token :balance :usdc-balance :fees :people :mode :expiry-seconds="expirySeconds" :gas-reserve="reserve"
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
  <WalletSheet v-if="showWallet" @close="showWallet = false; loadBalance()" @forgotten="forgotPasskey" />
</template>
