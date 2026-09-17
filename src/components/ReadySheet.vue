<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { track } from '../lib/analytics'
import { txUrl } from '../lib/arc'
import { formatCountdown, formatDate, formatUsdc } from '../lib/format'
import { chainState, isExpired, linkUrl, refreshStatuses, refundLink } from '../lib/links'
import { saveLink, type StoredLink } from '../lib/storage'
import { type Connected, discoverWallets, type DiscoveredWallet, errorMessage } from '../lib/wallet'
import Icon from './Icon.vue'

const props = defineProps<{ link: StoredLink, wallet: Connected | null }>()
const emit = defineEmits<{ close: [], connect: [wallet: DiscoveredWallet] }>()

const url = computed(() => linkUrl(props.link.key))
const amountText = computed(() => formatUsdc(BigInt(props.link.amount)))
const shareText = computed(() => `I sent you ${amountText.value} in USDC with a KashLink. Open it to claim:`)
const whatsappUrl = computed(() => `https://wa.me/?text=${encodeURIComponent(`${shareText.value} ${url.value}`)}`)

const state = computed(() => chainState[props.link.id])
const status = computed(() => props.link.settled ?? state.value?.status ?? 'unknown')
const expired = computed(() => !!state.value && isExpired(state.value))
const expiry = computed(() => state.value?.expiry ?? props.link.expiry)

const copied = ref(false)
const confirmRefund = ref(false)
const refunding = ref(false)
const refundTx = ref<string | null>(null)
const error = ref<string | null>(null)

onMounted(() => {
  refreshStatuses([props.link]).catch(() => {})
})

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value)
  }
  catch {
    // Clipboard API is unavailable on plain-HTTP LAN dev URLs
    const el = document.createElement('textarea')
    el.value = url.value
    document.body.append(el)
    el.select()
    document.execCommand('copy')
    el.remove()
  }
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function share() {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'KashLink', text: shareText.value, url: url.value })
    }
    catch {
      // user closed the share sheet
    }
    return
  }
  await copy()
}

async function refund() {
  if (!props.wallet) {
    const wallets = discoverWallets()
    if (wallets.length === 1) emit('connect', wallets[0])
    else error.value = 'Connect the wallet that created this link to take the USDC back.'
    return
  }
  if (!confirmRefund.value) {
    confirmRefund.value = true
    return
  }
  refunding.value = true
  error.value = null
  try {
    refundTx.value = await refundLink(props.wallet.client, props.link.id)
    saveLink({ ...props.link, settled: 'refunded' })
    chainState[props.link.id] = { ...state.value!, status: 'refunded' }
    track('link_refunded', BigInt(props.link.amount), props.link.id)
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
    <section class="sheet" role="dialog" aria-label="Your KashLink">
      <div class="handle" />

      <span class="badge" :class="{ done: status === 'claimed' || status === 'refunded' }">
        <Icon :name="status === 'claimed' || status === 'refunded' ? 'check' : 'link'" :size="26" />
      </span>
      <p class="heading">
        {{ status === 'refunded' ? 'KashLink returned' : status === 'claimed' ? 'KashLink claimed' : 'Your KashLink is ready!' }}
      </p>
      <div class="amount">
        {{ amountText }}
      </div>
      <p class="date muted">
        {{ formatDate(link.createdAt) }}
        <template v-if="status === 'pending'"> · {{ expired ? 'returnable now' : `returnable ${formatCountdown(expiry)}` }}</template>
      </p>

      <template v-if="status === 'pending' || status === 'unknown'">
        <p class="label">
          Share your KashLink
        </p>
        <div class="url-row">
          <span class="url">{{ url }}</span>
          <a class="icon-btn whatsapp" :href="whatsappUrl" target="_blank" rel="noopener" aria-label="Share on WhatsApp">
            <Icon name="whatsapp" :size="22" />
          </a>
          <button class="icon-btn" :class="{ copied }" aria-label="Copy link" @click="copy">
            <Icon :name="copied ? 'check' : 'copy'" :size="22" />
          </button>
        </div>

        <p class="warning muted">
          <Icon name="alert" :size="18" /> Anyone with this link can claim the cash.
        </p>

        <p v-if="error" class="error">
          {{ error }}
        </p>
        <button class="btn btn-primary" @click="share">
          <Icon name="share" :size="20" /> Share link
        </button>
        <button v-if="expired" class="btn btn-outline" :disabled="refunding" @click="refund">
          <template v-if="refunding">
            <span class="spinner" /> Returning…
          </template>
          <template v-else>
            {{ confirmRefund ? `Tap again to return ${amountText}` : 'Return to my wallet' }}
          </template>
        </button>
      </template>

      <template v-else>
        <p class="warning muted center">
          {{ status === 'refunded' ? 'The USDC is back in your wallet.' : 'The USDC was claimed.' }} This link no longer works.
        </p>
        <a v-if="refundTx" class="link-btn tx" :href="txUrl(refundTx)" target="_blank" rel="noopener">
          View transaction <Icon name="external" :size="14" />
        </a>
        <button class="btn btn-primary" @click="emit('close')">
          Done
        </button>
      </template>
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

.date {
  margin: 4px 0 20px;
  font-size: 13px;
  text-align: center;
}

.label {
  margin-bottom: 8px;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 14px;
  border-radius: 500px;
  background: var(--highlight);
}

.url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 48px;
  border: 0;
  background: none;
  color: var(--text);
  transition: color 0.2s var(--ease);
}

.icon-btn.whatsapp {
  color: #25d366;
}

.icon-btn.copied {
  color: var(--nq-green);
}

.warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 2px 18px;
  font-size: 13px;
  font-weight: 600;
}

.warning.center {
  justify-content: center;
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
