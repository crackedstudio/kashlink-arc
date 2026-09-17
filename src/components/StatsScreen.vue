<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { addressUrl, CHAIN, ESCROW_ADDRESS, txUrl } from '../lib/arc'
import { formatDate, shortAddress } from '../lib/format'
import { loadStats, type Stats } from '../lib/stats'
import { formatAmount } from '../lib/tokens'
import { errorMessage } from '../lib/wallet'
import Icon from './Icon.vue'
import Logo from './Logo.vue'

const emit = defineEmits<{ back: [] }>()

const stats = ref<Stats | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    stats.value = await loadStats()
  }
  catch (e) {
    error.value = errorMessage(e)
  }
})

const kindLabel = { created: 'Link created', claimed: 'Claimed', refunded: 'Returned' } as const
</script>

<template>
  <main class="screen">
    <button class="back" aria-label="Back" @click="emit('back')">
      <Icon name="back" />
    </button>
    <div class="brand">
      <Logo :size="24" />
      <span>KashLink on {{ CHAIN.name }}</span>
    </div>
    <h1 class="title">
      Live stats
    </h1>
    <p class="subtitle muted">
      Read straight from the escrow contract, which keeps its own totals. No backend, no indexer — the same numbers anyone can
      read on the <a :href="addressUrl(ESCROW_ADDRESS)" target="_blank" rel="noopener">explorer</a>.
    </p>

    <p v-if="error" class="error">
      {{ error }}
    </p>
    <p v-else-if="!stats" class="loading muted">
      <span class="spinner" /> Reading the chain…
    </p>

    <template v-else>
      <div class="tiles">
        <div class="tile">
          <strong>{{ stats.links }}</strong>
          <span class="muted">links created</span>
        </div>
        <div class="tile">
          <strong>{{ stats.claims }}</strong>
          <span class="muted">claims</span>
        </div>
        <div class="tile">
          <strong>{{ stats.drops }}</strong>
          <span class="muted">drops</span>
        </div>
        <div class="tile">
          <strong>{{ stats.refunds }}</strong>
          <span class="muted">returned to senders</span>
        </div>
      </div>

      <div v-for="t in stats.byToken" :key="t.token.symbol" class="card token">
        <div class="row head">
          <strong>{{ t.token.symbol }}</strong>
        </div>
        <div class="row">
          <span class="muted">Sent as links</span>
          <strong>{{ formatAmount(t.sent, t.token) }}</strong>
        </div>
        <div class="row">
          <span class="muted">Claimed</span>
          <strong>{{ formatAmount(t.claimed, t.token) }}</strong>
        </div>
        <div class="row">
          <span class="muted">Returned to senders</span>
          <strong>{{ formatAmount(t.refunded, t.token) }}</strong>
        </div>
        <div class="row">
          <span class="muted">Still in escrow</span>
          <strong>{{ formatAmount(t.sent - t.claimed - t.refunded, t.token) }}</strong>
        </div>
      </div>

      <p class="range muted">
        Since {{ formatDate(stats.since * 1000) }}
      </p>

      <p class="label">
        Last hour
      </p>
      <ul class="events card">
        <li v-for="e in stats.recent" :key="e.tx + e.kind + e.linkId">
          <span class="dot" :class="e.kind" />
          <span class="info">
            <strong>{{ kindLabel[e.kind] }}<template v-if="e.slots && e.slots > 1"> · drop for {{ e.slots }}</template></strong>
            <span class="muted">{{ e.timestamp ? formatDate(e.timestamp * 1000) : shortAddress(e.linkId) }} · {{ shortAddress(e.linkId) }}</span>
          </span>
          <a class="amount" :href="txUrl(e.tx)" target="_blank" rel="noopener">{{ formatAmount(e.amount, e.token) }} <Icon name="external" :size="12" /></a>
        </li>
        <li v-if="!stats.recent.length" class="muted empty">
          Nothing in the last hour.
        </li>
      </ul>
    </template>
  </main>
</template>

<style scoped>
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 14px;
  font-weight: 800;
}

.subtitle {
  margin-top: 6px;
  font-size: 14px;
}

.subtitle a {
  font-weight: 700;
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
}

.notice {
  margin-top: 12px;
  font-size: 13px;
}

.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 16px 0 12px;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: var(--shadow-card);
}

.tile strong {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.tile .muted {
  font-size: 12px;
  font-weight: 600;
}

.token {
  margin-bottom: 10px;
  padding: 4px 16px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  font-size: 14px;
}

.row + .row {
  border-top: 1px solid var(--highlight);
}

.row.head strong {
  font-size: 15px;
  font-weight: 800;
}

.range {
  margin: 4px 0 16px;
  font-size: 12px;
}

.events {
  margin: 0 0 16px;
  padding: 4px 16px;
  list-style: none;
}

.events li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
}

.events li + li {
  border-top: 1px solid var(--highlight);
}

.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.dot.claimed {
  background: var(--nq-green);
}

.dot.refunded {
  background: var(--muted-2);
}

.info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  font-size: 14px;
}

.info .muted {
  font-size: 12px;
}

.amount {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}

.empty {
  justify-content: center;
  font-size: 14px;
}
</style>
