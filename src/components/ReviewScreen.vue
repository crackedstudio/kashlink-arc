<script setup lang="ts">
import { computed, ref } from 'vue'
import { addressUrl } from '../lib/arc'
import { formatUsdc, shortAddress } from '../lib/format'
import { EXPIRY_OPTIONS, type Quote } from '../lib/links'
import Icon from './Icon.vue'

const props = defineProps<{
  quote: Quote
  expirySeconds: number
  linkId: string
  walletName: string
  sending: boolean
  error: string | null
}>()
const emit = defineEmits<{ back: [], send: [] }>()

const showHelp = ref(false)
const expiryLabel = computed(() => EXPIRY_OPTIONS.find(o => o.seconds === props.expirySeconds)?.label ?? `${Math.round(props.expirySeconds / 86_400)} days`)
</script>

<template>
  <main class="screen">
    <button class="back" aria-label="Back" :disabled="sending" @click="emit('back')">
      <Icon name="back" />
    </button>
    <h1 class="title">
      Review
    </h1>

    <div class="summary">
      <span class="badge"><Icon name="link" :size="30" /></span>
      <p class="to muted">
        Sending to
      </p>
      <strong class="name">KashLink</strong>
      <div class="primary">
        {{ formatUsdc(quote.amount) }}
      </div>
      <a class="muted secondary" :href="addressUrl(linkId)" target="_blank" rel="noopener">
        {{ shortAddress(linkId) }} <Icon name="external" :size="12" />
      </a>
    </div>

    <div class="card details">
      <div class="row">
        <span class="muted">Your friend receives</span>
        <strong>{{ formatUsdc(quote.amount) }}</strong>
      </div>
      <div class="row">
        <span class="muted">Service fee</span>
        <strong>{{ quote.fee ? formatUsdc(quote.fee) : 'Free' }}</strong>
      </div>
      <div class="row">
        <span class="muted">Claim gas, prepaid</span>
        <strong>{{ formatUsdc(quote.stipend) }}</strong>
      </div>
      <div class="row">
        <span class="muted">Returnable if unclaimed</span>
        <strong>after {{ expiryLabel }}</strong>
      </div>
      <div class="row total">
        <span>Total
          <button class="help-btn" aria-label="What is the total?" @click="showHelp = !showHelp">
            <Icon name="help" :size="18" />
          </button>
        </span>
        <strong>{{ formatUsdc(quote.total) }}</strong>
      </div>
      <p v-if="showHelp" class="help muted">
        The USDC sits in the KashLink escrow contract on Arc until your friend claims it. The prepaid
        gas lets them claim without owning anything first. The fee is charged now, whether the link
        is claimed or returned.
      </p>
    </div>

    <p v-if="error" class="error">
      {{ error }}
    </p>
    <button class="btn btn-primary" :disabled="sending" @click="emit('send')">
      <template v-if="sending">
        <span class="spinner" /> Confirm in {{ walletName }}…
      </template>
      <template v-else>
        Send {{ formatUsdc(quote.total) }}
      </template>
    </button>
  </main>
</template>

<style scoped>
.summary {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 0;
  text-align: center;
}

.badge {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--nq-light-blue);
  background-image: var(--accent-bg);
  color: #fff;
  box-shadow: var(--shadow-btn);
}

.to {
  margin-top: 14px;
  font-size: 13px;
}

.name {
  font-size: 17px;
  font-weight: 700;
}

.primary {
  margin-top: 18px;
  font-size: 44px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.secondary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  text-decoration: none;
}

.details {
  margin-bottom: 14px;
  padding: 4px 16px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  font-size: 15px;
}

.row + .row {
  border-top: 1px solid var(--highlight);
}

.row strong {
  font-weight: 700;
}

.total {
  font-weight: 700;
}

.total > span {
  display: flex;
  align-items: center;
  gap: 2px;
}

.help-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  background: none;
  color: var(--muted-2);
}

.help {
  padding: 0 0 12px;
  font-size: 13px;
}

.error {
  margin: 0 0 12px;
}
</style>
