<script setup lang="ts">
import { computed, ref } from 'vue'
import { addressUrl } from '../lib/arc'
import { formatUsdc, shortAddress } from '../lib/format'
import { EXPIRY_OPTIONS, MAX_MESSAGE, type Quote } from '../lib/links'
import { formatAmount, isNative } from '../lib/tokens'
import Icon from './Icon.vue'

const props = defineProps<{
  quote: Quote
  expirySeconds: number
  linkId: string
  walletName: string
  sending: boolean
  approving: boolean
  error: string | null
}>()
const emit = defineEmits<{ back: [], send: [] }>()
const message = defineModel<string>('message', { default: '' })

const showHelp = ref(false)
const token = computed(() => props.quote.token)
const native = computed(() => isNative(token.value))
const isDrop = computed(() => props.quote.mode === 'drop')
const separate = computed(() => props.quote.mode === 'separate')
const several = computed(() => props.quote.people > 1)
const expiryLabel = computed(() => EXPIRY_OPTIONS.find(o => o.seconds === props.expirySeconds)?.label ?? `${Math.round(props.expirySeconds / 86_400)} days`)
const gasText = computed(() => formatUsdc(props.quote.stipend * BigInt(props.quote.people)))
/** What leaves the wallet, in words: one figure for USDC, two for EURC (token plus USDC gas). */
const totalText = computed(() => (native.value
  ? formatAmount(props.quote.value, token.value)
  : `${formatAmount(props.quote.tokenTotal, token.value)} + ${gasText.value}`))
const buttonText = computed(() => (native.value ? `Send ${totalText.value}` : `Send ${formatAmount(props.quote.tokenTotal, token.value)}`))
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
      <span class="badge"><Icon :name="isDrop ? 'drop' : 'link'" :size="30" /></span>
      <p class="to muted">
        {{ isDrop ? `An open drop for ${quote.people} people` : separate ? `Sending to ${quote.people} people` : 'Sending to' }}
      </p>
      <strong class="name">{{ separate ? `${quote.links} KashLinks` : 'KashLink' }}</strong>
      <div class="primary">
        {{ formatAmount(quote.amountEach, token) }}<span v-if="several" class="each">each</span>
      </div>
      <p v-if="separate" class="muted secondary">
        A link each: nobody can take someone else's share
      </p>
      <a v-else class="muted secondary" :href="addressUrl(linkId)" target="_blank" rel="noopener">
        {{ shortAddress(linkId) }} <Icon name="external" :size="12" />
      </a>
    </div>

    <p v-if="isDrop" class="drop-warning">
      <Icon name="alert" :size="16" />
      <span>First come, first served. Anyone holding this link can claim every slot, so share it only where that's fine. To pay specific people, go back and choose <strong>A link each</strong>.</span>
    </p>

    <label class="note">
      <span class="label">Add a note <span class="muted">(optional)</span></span>
      <input v-model="message" type="text" :maxlength="MAX_MESSAGE" placeholder="Happy birthday!" :disabled="sending" autocomplete="off">
    </label>

    <div class="card details">
      <div class="row">
        <span class="muted">{{ several ? `${quote.people} people receive` : 'Your friend receives' }}</span>
        <strong>{{ formatAmount(quote.total, token) }}</strong>
      </div>
      <div class="row">
        <span class="muted">Service fee</span>
        <strong>{{ quote.fee ? formatAmount(quote.fee, token) : 'Free' }}</strong>
      </div>
      <div class="row">
        <span class="muted">Claim gas, prepaid{{ several ? ` · ${quote.people} ×` : '' }}</span>
        <strong>{{ gasText }}</strong>
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
        <strong>{{ totalText }}</strong>
      </div>
      <p v-if="showHelp" class="help muted">
        The {{ token.symbol }} sits in the KashLink escrow contract on Arc until it is claimed. The
        prepaid gas is USDC placed on the link itself, so whoever opens it can claim without owning
        anything first. The fee is charged now, whether the link is claimed or returned.
        <template v-if="!native">Sending EURC takes two confirmations: one to approve, one to deposit.</template>
      </p>
    </div>

    <p v-if="error" class="error">
      {{ error }}
    </p>
    <button class="btn btn-primary" :disabled="sending" @click="emit('send')">
      <template v-if="approving">
        <span class="spinner" /> Approve {{ token.symbol }} in {{ walletName }}…
      </template>
      <template v-else-if="sending">
        <span class="spinner" /> Confirm in {{ walletName }}…
      </template>
      <template v-else>
        {{ buttonText }}
      </template>
    </button>
  </main>
</template>

<style scoped>
.drop-warning {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: rgb(252 135 2 / 10%);
  color: #8a4b00;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.drop-warning :deep(svg) {
  flex: none;
  margin-top: 1px;
}

.summary {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 0;
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
  margin-top: 14px;
  font-size: 44px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.each {
  margin-left: 8px;
  color: var(--muted-2);
  font-size: 20px;
  font-weight: 700;
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

.note {
  display: block;
  margin-bottom: 12px;
}

.note .label {
  display: block;
  margin-bottom: 6px;
}

.note input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--text);
  font: inherit;
  font-size: 15px;
  outline: none;
}

.note input:focus {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.note input::placeholder {
  color: var(--muted-2);
}

.details {
  margin-bottom: 14px;
  padding: 4px 16px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  font-size: 14px;
}

.row + .row {
  border-top: 1px solid var(--highlight);
}

.row strong {
  font-weight: 700;
  text-align: right;
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
