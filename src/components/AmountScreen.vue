<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatUsdc } from '../lib/format'
import { EXPIRY_OPTIONS, type FeeParams, MAX_SLOTS, quoteWith } from '../lib/links'
import { formatAmount, isNative, parseAmount, type Token, TOKENS } from '../lib/tokens'
import Icon from './Icon.vue'

const props = defineProps<{
  token: Token
  /** Balance of `token`, null while loading or unknown. */
  balance: bigint | null
  /** Native USDC, which pays the stipends whatever the token. */
  usdcBalance: bigint | null
  /** Contract fee settings, null until read. */
  fees: FeeParams | null
  slots: number
  expirySeconds: number
}>()
const emit = defineEmits<{
  'back': []
  'retry': []
  'update:token': [token: Token]
  'continue': [amountEach: bigint, slots: number, expirySeconds: number]
}>()

const input = ref('0')
const slots = ref(props.slots)
const expiry = ref(props.expirySeconds)
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
const DECIMALS = 2

const isDrop = computed(() => slots.value > 1)

const amountEach = computed(() => {
  const n = Number(input.value)
  if (!n) return 0n
  // "1." is a valid state of the keypad but not a number.
  return parseAmount(input.value.replace(/\.$/, ''), props.token)
})

const quote = computed(() => (props.fees && amountEach.value ? quoteWith(props.fees, props.token, amountEach.value, slots.value) : null))

/** A link costs the total plus fee (in the token) plus the stipends (always USDC). */
const tooMuch = computed(() => {
  if (!quote.value) return false
  const q = quote.value
  if (isNative(props.token)) return props.balance !== null && q.value > props.balance
  return (props.balance !== null && q.tokenTotal > props.balance) || (props.usdcBalance !== null && q.value > props.usdcBalance)
})
const tooMuchText = computed(() => {
  if (!quote.value) return ''
  if (isNative(props.token) || (props.balance !== null && quote.value.tokenTotal > props.balance)) return `Not enough ${props.token.symbol} in your wallet`
  return `Not enough USDC for the ${formatUsdc(quote.value.value)} of claim gas`
})
const canContinue = computed(() => amountEach.value > 0n && !tooMuch.value && props.balance !== null && props.fees !== null)

const feeLine = computed(() => {
  const q = quote.value
  if (!q) return ''
  const extras = isNative(props.token)
    ? formatAmount(q.fee + q.stipend * BigInt(q.slots), props.token)
    : `${formatAmount(q.fee, props.token)} + ${formatUsdc(q.value)} gas`
  return isDrop.value
    ? `${formatAmount(q.total, props.token)} for ${q.slots} people + ${extras}`
    : `+ ${extras} fee · total ${formatAmount(isNative(props.token) ? q.value : q.tokenTotal, props.token)}`
})

function press(key: string) {
  let value = input.value
  if (key === 'del') {
    value = value.length > 1 ? value.slice(0, -1) : '0'
  }
  else if (key === '.') {
    if (!value.includes('.')) value += '.'
  }
  else {
    const decimals = value.split('.')[1]
    if (decimals !== undefined && decimals.length >= DECIMALS) return
    if (value.replace('.', '').length >= 9) return
    value = value === '0' ? key : value + key
  }
  input.value = value
}

function setSlots(n: number) {
  slots.value = Math.min(MAX_SLOTS, Math.max(1, n))
}

function selectToken(t: Token) {
  if (t === props.token) return
  input.value = '0'
  emit('update:token', t)
}
</script>

<template>
  <main class="screen">
    <button class="back" aria-label="Back" @click="emit('back')">
      <Icon name="back" />
    </button>
    <h1 class="title">
      Amount
    </h1>
    <div class="tokens" role="group" aria-label="Choose what to send">
      <button v-for="t in TOKENS" :key="t.symbol" :class="{ on: t === token }" @click="selectToken(t)">
        {{ t.symbol }}
      </button>
    </div>
    <p v-if="balance === null" class="balance muted">
      Could not read your balance.
      <button class="link-btn" @click="emit('retry')">
        Retry
      </button>
    </p>
    <p v-else class="balance muted">
      Available: <strong>{{ formatAmount(balance, token) }}</strong>
    </p>
    <div class="display">
      <div class="amount">
        <span class="unit">{{ token.currency === 'EUR' ? '€' : '$' }}</span>{{ input }}<span class="caret" />
      </div>
      <p class="currency">
        {{ token.symbol }} on Arc<template v-if="isDrop"> · each</template>
      </p>
      <p class="secondary muted">
        {{ tooMuch ? '' : feeLine }}
      </p>
      <p v-if="tooMuch" class="error">
        {{ tooMuchText }}
      </p>
    </div>

    <div class="options">
      <div class="option">
        <span class="label">Split among</span>
        <div class="stepper" role="group" aria-label="How many people">
          <button aria-label="Fewer people" :disabled="slots <= 1" @click="setSlots(slots - 1)">
            −
          </button>
          <span>{{ slots }} {{ slots === 1 ? 'person' : 'people' }}</span>
          <button aria-label="More people" :disabled="slots >= MAX_SLOTS" @click="setSlots(slots + 1)">
            +
          </button>
        </div>
      </div>
      <div class="option">
        <span class="label">Returnable after</span>
        <div class="expiry" role="group" aria-label="Expiry">
          <button v-for="option in EXPIRY_OPTIONS" :key="option.seconds" :class="{ on: expiry === option.seconds }" @click="expiry = option.seconds">
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="keypad">
      <button v-for="key in keys" :key="key" :aria-label="key === 'del' ? 'Delete' : key" @click="press(key)">
        <Icon v-if="key === 'del'" name="backspace" />
        <template v-else>
          {{ key }}
        </template>
      </button>
    </div>

    <button class="btn btn-primary" :disabled="!canContinue" @click="emit('continue', amountEach, slots, expiry)">
      Continue
    </button>
  </main>
</template>

<style scoped>
.tokens {
  display: flex;
  gap: 4px;
  margin-top: 10px;
  padding: 4px;
  border-radius: 500px;
  background: var(--highlight);
}

.tokens button,
.expiry button {
  flex: 1;
  min-height: 36px;
  border: 0;
  border-radius: 500px;
  background: none;
  color: var(--muted);
  font-size: 14px;
  font-weight: 700;
}

.tokens button.on,
.expiry button.on {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.balance {
  margin: 8px 0 0;
  font-size: 14px;
}

.balance strong {
  color: var(--text);
  font-weight: 700;
}

.display {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}

.amount {
  display: flex;
  align-items: center;
  max-width: 100%;
  font-size: 52px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  word-break: break-all;
}

.unit {
  color: var(--muted-2);
}

.caret {
  width: 2px;
  height: 48px;
  margin-left: 3px;
  border-radius: 1px;
  background: var(--accent);
  animation: blink 1s steps(1) infinite;
}

.currency {
  height: 30px;
  margin-top: 10px;
  padding: 0 12px;
  border-radius: 500px;
  background: var(--highlight);
  font-size: 13px;
  font-weight: 700;
  line-height: 30px;
}

.secondary {
  min-height: 20px;
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.option .label {
  flex: none;
  margin: 0;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 500px;
  background: var(--highlight);
}

.stepper span {
  min-width: 84px;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}

.stepper button {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: var(--card);
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.stepper button:disabled {
  opacity: 0.35;
  box-shadow: none;
}

.expiry {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 500px;
  background: var(--highlight);
}

.expiry button {
  flex: none;
  min-height: 36px;
  padding: 0 12px;
  font-size: 13px;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  margin-bottom: 10px;
}

.keypad button {
  display: grid;
  place-items: center;
  height: 48px;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--text);
  font-size: 22px;
  font-weight: 700;
  transition: background 0.15s var(--ease);
}

.keypad button:active {
  background: var(--highlight);
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}
</style>
