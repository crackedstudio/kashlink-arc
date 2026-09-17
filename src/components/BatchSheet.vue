<script setup lang="ts">
import type { Hex } from 'viem'
import { computed, onMounted, ref } from 'vue'
import { track } from '../lib/analytics'
import { txUrl } from '../lib/arc'
import { copyText } from '../lib/clipboard'
import { formatCountdown, formatDate } from '../lib/format'
import { chainState, isExpired, type LinkStatus, linkUrl, refreshStatuses, refundLinks } from '../lib/links'
import { saveLinks, type StoredLink } from '../lib/storage'
import { formatAmount, NATIVE, tokenByAddress } from '../lib/tokens'
import { type Connected, discoverWallets, type DiscoveredWallet, errorMessage } from '../lib/wallet'
import Icon from './Icon.vue'

/**
 * Separate links funded together, one per person. Each row is its own link to hand to one person;
 * claiming one never touches the others, which is the point of sending this way rather than a drop.
 */
const props = defineProps<{ links: StoredLink[], wallet: Connected | null }>()
const emit = defineEmits<{ close: [], connect: [wallet: DiscoveredWallet] }>()

const first = computed(() => props.links[0]!)
const token = computed(() => tokenByAddress(first.value.token ?? NATIVE))
const size = computed(() => props.links.length)
const eachText = computed(() => formatAmount(BigInt(first.value.amount), token.value))

function statusOf(link: StoredLink): LinkStatus {
  return link.settled ?? chainState[link.id]?.status ?? 'unknown'
}
const claimedCount = computed(() => props.links.filter(l => statusOf(l) === 'claimed').length)
const refundedCount = computed(() => props.links.filter(l => statusOf(l) === 'refunded').length)
const open = computed(() => props.links.filter(l => statusOf(l) === 'pending' || statusOf(l) === 'unknown'))
const expiredOpen = computed(() => open.value.filter(l => chainState[l.id] && isExpired(chainState[l.id]!)))
const expiry = computed(() => chainState[first.value.id]?.expiry ?? first.value.expiry)
const done = computed(() => !open.value.length)

const labels: Record<LinkStatus, string> = { unknown: 'Checking…', pending: 'Unclaimed', claimed: 'Claimed', refunded: 'Returned' }

const copiedId = ref<string | null>(null)
const copiedAll = ref(false)
const qrFor = ref<string | null>(null)
const qrSvg = ref<Record<string, string>>({})
const confirmRefund = ref(false)
const refunding = ref(false)
const refundTx = ref<string | null>(null)
const error = ref<string | null>(null)

onMounted(() => {
  refreshStatuses(props.links).catch(() => {})
})

const urlOf = (link: StoredLink) => linkUrl(link.key, link.message)
const shareText = computed(() => `I sent you ${eachText.value} in ${token.value.symbol} with a KashLink. This link is just for you:`)
const whatsappUrl = (link: StoredLink) => `https://wa.me/?text=${encodeURIComponent(`${shareText.value} ${urlOf(link)}`)}`

async function copy(link: StoredLink) {
  await copyText(urlOf(link))
  copiedId.value = link.id
  setTimeout(() => (copiedId.value === link.id) && (copiedId.value = null), 2000)
}

async function copyAll() {
  const lines = open.value.map(l => `${l.batch ? `${l.batch.index + 1}. ` : ''}${urlOf(l)}`)
  await copyText(`${eachText.value} each, one link per person:\n${lines.join('\n')}`)
  copiedAll.value = true
  setTimeout(() => (copiedAll.value = false), 2000)
}

async function toggleQr(link: StoredLink) {
  qrFor.value = qrFor.value === link.id ? null : link.id
  if (!qrFor.value || qrSvg.value[link.id]) return
  // The QR library is loaded only when someone asks for a code.
  const { default: QRCode } = await import('qrcode')
  qrSvg.value = { ...qrSvg.value, [link.id]: await QRCode.toString(urlOf(link), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) }
}

const refundable = computed(() => formatAmount(BigInt(first.value.amount) * BigInt(expiredOpen.value.length), token.value))

async function refund() {
  if (!props.wallet) {
    const wallets = discoverWallets()
    if (wallets.length === 1) emit('connect', wallets[0]!)
    else error.value = 'Connect the wallet that created these links to take the money back.'
    return
  }
  if (!confirmRefund.value) {
    confirmRefund.value = true
    return
  }
  refunding.value = true
  error.value = null
  const targets = [...expiredOpen.value]
  try {
    // Re-read first: refundMany is all or nothing, and someone may have claimed a moment ago.
    await refreshStatuses(targets)
    const still = targets.filter(l => chainState[l.id]?.status === 'pending')
    if (!still.length) return
    refundTx.value = await refundLinks(props.wallet, still.map(l => l.id as Hex))
    saveLinks(still.map(l => ({ ...l, settled: 'refunded' as const })))
    for (const l of still) chainState[l.id] = { ...chainState[l.id]!, status: 'refunded' }
    track('link_refunded', BigInt(first.value.amount) * BigInt(still.length), still[0]!.id)
  }
  catch (e) {
    error.value = errorMessage(e)
  }
  finally {
    refunding.value = false
    confirmRefund.value = false
  }
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Your KashLinks">
      <div class="handle" />

      <span class="badge" :class="{ done }">
        <Icon :name="done ? 'check' : 'link'" :size="26" />
      </span>
      <p class="heading">
        {{ done ? (refundedCount ? 'All links settled' : 'Everyone has claimed') : `${size} KashLinks ready!` }}
      </p>
      <div class="amount">
        {{ eachText }}<span class="each">each · {{ size }} people</span>
      </div>
      <p v-if="first.message" class="note">
        “{{ first.message }}”
      </p>
      <p class="date muted">
        {{ formatDate(first.createdAt) }} · {{ claimedCount }} of {{ size }} claimed
        <template v-if="refundedCount"> · {{ refundedCount }} returned</template>
        <template v-if="open.length"> · {{ expiredOpen.length ? 'returnable now' : `returnable ${formatCountdown(expiry)}` }}</template>
      </p>

      <template v-if="open.length">
        <p class="warning muted">
          <Icon name="alert" :size="18" /> Give each link to one person. Whoever holds a link can claim that share, and only that share.
        </p>
        <button class="btn btn-primary" @click="copyAll">
          <Icon :name="copiedAll ? 'check' : 'copy'" :size="20" /> {{ copiedAll ? 'Copied' : `Copy all ${open.length} links` }}
        </button>
      </template>

      <ol class="rows">
        <li v-for="link in links" :key="link.id">
          <div class="row">
            <span class="info">
              <strong>Link {{ (link.batch?.index ?? 0) + 1 }}</strong>
              <span class="status" :class="statusOf(link)">{{ labels[statusOf(link)] }}</span>
            </span>
            <template v-if="statusOf(link) === 'pending' || statusOf(link) === 'unknown'">
              <button class="icon-btn" :class="{ on: qrFor === link.id }" :aria-label="`QR code for link ${(link.batch?.index ?? 0) + 1}`" @click="toggleQr(link)">
                <Icon name="qr" :size="20" />
              </button>
              <a class="icon-btn whatsapp" :href="whatsappUrl(link)" target="_blank" rel="noopener" :aria-label="`Send link ${(link.batch?.index ?? 0) + 1} on WhatsApp`">
                <Icon name="whatsapp" :size="20" />
              </a>
              <button class="icon-btn" :class="{ copied: copiedId === link.id }" :aria-label="`Copy link ${(link.batch?.index ?? 0) + 1}`" @click="copy(link)">
                <Icon :name="copiedId === link.id ? 'check' : 'copy'" :size="20" />
              </button>
            </template>
          </div>
          <div v-if="qrFor === link.id && qrSvg[link.id]" class="qr" v-html="qrSvg[link.id]" />
        </li>
      </ol>

      <p v-if="error" class="error">
        {{ error }}
      </p>
      <a v-if="refundTx" class="link-btn tx" :href="txUrl(refundTx)" target="_blank" rel="noopener">
        Returned — view transaction <Icon name="external" :size="14" />
      </a>
      <button v-if="expiredOpen.length" class="btn btn-outline" :disabled="refunding" @click="refund">
        <template v-if="refunding">
          <span class="spinner" /> Returning…
        </template>
        <template v-else>
          {{ confirmRefund ? `Tap again to return ${refundable}` : `Return ${refundable} from ${expiredOpen.length} unclaimed link${expiredOpen.length > 1 ? 's' : ''}` }}
        </template>
      </button>
      <button v-if="done" class="btn btn-primary" @click="emit('close')">
        Done
      </button>
    </section>
  </div>
</template>

<style scoped>
.badge {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin: 4px auto 0;
  border-radius: 50%;
  background: var(--nq-light-blue);
  background-image: var(--accent-bg);
  color: #fff;
  box-shadow: var(--shadow-btn);
}

.badge.done {
  background: var(--nq-green);
  background-image: var(--green-bg);
  box-shadow: 0 6px 16px rgba(33, 188, 165, 0.35);
}

.heading {
  margin-top: 14px;
  font-size: 17px;
  font-weight: 800;
  text-align: center;
}

.amount {
  margin-top: 6px;
  font-size: 40px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-align: center;
}

.each {
  margin-left: 8px;
  color: var(--muted-2);
  font-size: 16px;
  font-weight: 700;
}

.note {
  margin-top: 8px;
  font-size: 15px;
  font-style: italic;
  text-align: center;
}

.date {
  margin: 4px 0 16px;
  font-size: 13px;
  text-align: center;
}

.warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 12px;
  font-size: 13px;
  font-weight: 600;
}

.warning :deep(svg) {
  flex: none;
}

.rows {
  margin: 14px 0 12px;
  padding: 0;
  list-style: none;
}

.rows li + li {
  margin-top: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 14px;
  border-radius: 500px;
  background: var(--highlight);
}

.info {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 48px;
  font-size: 14px;
}

.status {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.status.claimed {
  color: var(--nq-green);
}

.icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 48px;
  border: 0;
  background: none;
  color: var(--text);
  transition: color 0.2s var(--ease);
}

.icon-btn.whatsapp {
  color: #25d366;
}

.icon-btn.copied,
.icon-btn.on {
  color: var(--nq-green);
}

.qr {
  width: 180px;
  margin: 10px auto 4px;
  padding: 12px;
  border-radius: var(--radius);
  background: #fff;
  box-shadow: var(--shadow-card);
}

.qr :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
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
