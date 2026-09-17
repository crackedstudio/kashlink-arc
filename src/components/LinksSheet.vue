<script setup lang="ts">
import type { Hex } from 'viem'
import { computed, onMounted, ref, watch } from 'vue'
import { track } from '../lib/analytics'
import { formatCountdown, formatDate } from '../lib/format'
import { chainState, isExpired, linksFundedBy, type LinkStatus, refreshStatuses, refundLink, unclaimedAmount } from '../lib/links'
import type { StoredLink } from '../lib/storage'
import { saveLink } from '../lib/storage'
import { formatAmount, NATIVE, type Token, tokenByAddress } from '../lib/tokens'
import { type Connected, discoverWallets, type DiscoveredWallet, errorMessage } from '../lib/wallet'
import Icon from './Icon.vue'

const props = defineProps<{ links: StoredLink[], wallet: Connected | null }>()
const emit = defineEmits<{ open: [link: StoredLink], close: [], changed: [], connect: [wallet: DiscoveredWallet] }>()

const labels: Record<LinkStatus, string> = { unknown: '—', pending: 'Unclaimed', claimed: 'Claimed', refunded: 'Returned' }

/**
 * One row per link. Links made on this device carry their key and can be re-shared; links found
 * through the connected wallet's on-chain history can only be watched and returned.
 */
interface Row {
  id: Hex
  token: Token
  amountEach: bigint
  slots: number
  createdAt: number | null
  stored: StoredLink | null
}

/** Per-token totals, since dollars and euros cannot be added. */
function sumByToken(rows: Row[], of: (row: Row) => bigint): string {
  const totals = new Map<Token, bigint>()
  for (const row of rows) totals.set(row.token, (totals.get(row.token) ?? 0n) + of(row))
  return [...totals].filter(([, v]) => v > 0n).map(([t, v]) => formatAmount(v, t)).join(' + ')
}

/** What a refund of this row would return right now. */
function unclaimedOf(row: Row): bigint {
  const state = chainState[row.id]
  return state ? unclaimedAmount(state) : row.amountEach * BigInt(row.slots)
}

const loading = ref(true)
const refunding = ref<string | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const fromChain = ref<Row[]>([])

const rows = computed<Row[]>(() => {
  const local = props.links.map<Row>(l => ({
    id: l.id,
    token: tokenByAddress(l.token ?? NATIVE),
    amountEach: BigInt(l.amount),
    slots: l.slots ?? 1,
    createdAt: l.createdAt,
    stored: l,
  }))
  const known = new Set(local.map(r => r.id.toLowerCase()))
  return [...local, ...fromChain.value.filter(r => !known.has(r.id.toLowerCase()))]
})

function statusOf(row: Row): LinkStatus {
  return row.stored?.settled ?? chainState[row.id]?.status ?? 'unknown'
}

const claimed = computed(() => rows.value.filter(r => statusOf(r) === 'claimed').length)
const outstanding = computed(() => rows.value.filter(r => statusOf(r) === 'pending'))
const outstandingTotal = computed(() => sumByToken(outstanding.value, unclaimedOf))
const expired = computed(() => rows.value.filter(r => chainState[r.id] && isExpired(chainState[r.id])))
const expiredTotal = computed(() => sumByToken(expired.value, unclaimedOf))

async function loadFromChain() {
  if (!props.wallet) return
  try {
    const found = await linksFundedBy(props.wallet.address)
    fromChain.value = found.map(l => ({ id: l.id, token: l.token, amountEach: l.amountEach, slots: l.slots, createdAt: null, stored: null }))
  }
  catch {
    // history is a bonus; the local list still works
  }
}

onMounted(async () => {
  await Promise.all([refreshStatuses(props.links), loadFromChain()])
  loading.value = false
})

watch(() => props.wallet?.address, loadFromChain)

async function refund(targets: Row[], key: string) {
  if (!props.wallet) {
    const wallets = discoverWallets()
    if (wallets.length === 1) emit('connect', wallets[0])
    else error.value = 'Connect the wallet that created these links to take the USDC back.'
    return
  }
  refunding.value = key
  error.value = null
  notice.value = null
  const returned: Row[] = []
  let failed = 0
  // One at a time: each is a wallet prompt, and a failure must not stop the rest.
  for (const row of targets) {
    try {
      const amount = unclaimedOf(row)
      await refundLink(props.wallet.client, row.id)
      if (row.stored) saveLink({ ...row.stored, settled: 'refunded' })
      chainState[row.id] = { ...chainState[row.id], status: 'refunded' }
      track('link_refunded', amount, row.id)
      returned.push(row)
    }
    catch (e) {
      failed++
      if (targets.length === 1) error.value = errorMessage(e)
    }
  }
  if (returned.length) notice.value = `Returned ${sumByToken(returned, unclaimedOf)} to your wallet.`
  if (failed && targets.length > 1) error.value = `${failed} link${failed > 1 ? 's' : ''} could not be returned. Try again in a moment.`
  refunding.value = null
  emit('changed')
}
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Your KashLinks">
      <div class="handle" />
      <h2>Your KashLinks</h2>
      <p class="summary muted">
        <template v-if="loading">
          Checking {{ rows.length }} link{{ rows.length === 1 ? '' : 's' }}…
        </template>
        <template v-else>
          {{ claimed }} of {{ rows.length }} claimed
          <template v-if="outstandingTotal"> · <strong>{{ outstandingTotal }}</strong> still out there</template>
        </template>
      </p>

      <div v-if="expired.length" class="expired">
        <div>
          <strong>{{ expired.length }} link{{ expired.length > 1 ? 's' : '' }} expired unclaimed</strong>
          <span class="muted">Nobody opened them. You can take the money back.</span>
        </div>
        <button class="btn btn-primary small" :disabled="!!refunding" @click="refund(expired, 'all')">
          <template v-if="refunding === 'all'">
            <span class="spinner" /> Returning…
          </template>
          <template v-else>
            Return {{ expiredTotal }}
          </template>
        </button>
      </div>

      <p v-if="notice" class="notice">
        {{ notice }}
      </p>
      <p v-if="error" class="error">
        {{ error }}
      </p>
      <p v-if="!wallet && !loading" class="hint muted">
        Connect your wallet to also see links made on other devices.
      </p>

      <ul>
        <li v-for="row in rows" :key="row.id">
          <button class="row" :disabled="!row.stored" @click="row.stored && emit('open', row.stored)">
            <span class="info">
              <strong>{{ formatAmount(row.amountEach, row.token) }}<template v-if="row.slots > 1"> × {{ row.slots }}</template></strong>
              <span class="muted">
                <template v-if="row.createdAt">{{ formatDate(row.createdAt) }}</template>
                <template v-else>From another device · can't re-share</template>
                <template v-if="row.slots > 1 && chainState[row.id]"> · {{ chainState[row.id].claimed }} of {{ row.slots }} claimed</template>
                <template v-if="statusOf(row) === 'pending' && chainState[row.id]"> · {{ isExpired(chainState[row.id]) ? 'returnable now' : `returnable ${formatCountdown(chainState[row.id].expiry)}` }}</template>
              </span>
            </span>
            <span class="status" :class="statusOf(row)">
              {{ labels[statusOf(row)] }}
            </span>
          </button>
          <button
            v-if="chainState[row.id] && isExpired(chainState[row.id])" class="return-btn" :disabled="!!refunding"
            @click="refund([row], row.id)"
          >
            <span v-if="refunding === row.id" class="spinner" />
            <template v-else>
              <Icon name="back" :size="16" /> Return
            </template>
          </button>
        </li>
      </ul>
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

.summary strong {
  color: var(--text);
}

.expired {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--highlight);
}

.expired div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.expired strong {
  font-size: 14px;
}

.expired .muted {
  font-size: 12px;
}

.btn.small {
  width: auto;
  min-height: 40px;
  padding: 0 14px;
  font-size: 14px;
  white-space: nowrap;
}

.notice {
  margin: 0 0 12px;
  color: var(--nq-green);
  font-size: 14px;
  font-weight: 600;
}

.error {
  margin: 0 0 12px;
}

.hint {
  margin: 0 0 12px;
  font-size: 13px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--highlight);
}

li:last-child {
  border-bottom: 0;
}

.row {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 60px;
  padding: 8px 0;
  border: 0;
  background: none;
  color: var(--text);
  text-align: left;
}

.row:disabled {
  cursor: default;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info strong {
  font-size: 16px;
  font-weight: 700;
}

.muted {
  font-size: 13px;
}

.status {
  flex: none;
  padding: 4px 10px;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.status.pending {
  background: rgba(33, 188, 165, 0.12);
  color: var(--nq-green);
}

.return-btn {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  min-height: 44px;
  padding: 0 10px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.return-btn:disabled {
  opacity: 0.4;
}
</style>
