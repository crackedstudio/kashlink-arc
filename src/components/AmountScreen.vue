<script setup lang="ts">
import { formatUnits } from 'viem'
import { computed, nextTick, onMounted, ref } from 'vue'
import { formatUsdc } from '../lib/format'
import { EXPIRY_OPTIONS, type FeeParams, type LinkMode, MAX_SLOTS, maxAmountEach, quoteWith, shortfall } from '../lib/links'
import { formatAmount, isNative, parseAmount, type Token, TOKENS, USDC } from '../lib/tokens'
import Icon from './Icon.vue'

const props = defineProps<{
  token: Token
  /** Balance of `token`, null while loading or unknown. */
  balance: bigint | null
  /** Native USDC, which pays the stipends whatever the token. */
  usdcBalance: bigint | null
  /** Contract fee settings, null until read. */
  fees: FeeParams | null
  people: number
  mode: LinkMode
  expirySeconds: number
  /** Native USDC kept back for the sender's own transaction fee. */
  gasReserve: bigint
}>()
const emit = defineEmits<{
  'back': []
  'retry': []
  'update:token': [token: Token]
  'continue': [amountEach: bigint, people: number, mode: LinkMode, expirySeconds: number]
}>()

/** What was typed, already cleaned: digits, at most one point, at most two decimals. Empty shows as 0. */
const input = ref('')
const field = ref<HTMLInputElement | null>(null)
const slots = ref(props.people)
const mode = ref<LinkMode>(props.mode)
const expiry = ref(props.expirySeconds)
const DECIMALS = 2
const MAX_DIGITS = 9

const several = computed(() => slots.value > 1)
const isDrop = computed(() => several.value && mode.value === 'drop')
/** Separate links cost the sender more gas to fund, roughly in proportion to how many there are. */
const reserve = computed(() => props.gasReserve * BigInt(several.value && mode.value === 'separate' ? slots.value : 1))

const amountEach = computed(() => {
  const n = Number(input.value)
  if (!n) return 0n
  // "1." and ".5" are fine while typing but not amounts.
  return parseAmount(input.value.replace(/\.$/, '').replace(/^\./, '0.'), props.token)
})

const quote = computed(() => (props.fees && amountEach.value ? quoteWith(props.fees, props.token, amountEach.value, slots.value, mode.value) : null))

/**
 * A link costs the total plus fee (in the token) plus the stipends (always USDC), and the sender's
 * own transaction fee on top. Anything short is spelled out with the two figures that matter.
 */
const short = computed(() => {
  if (!quote.value || props.balance === null) return null
  return shortfall(quote.value, props.balance, props.usdcBalance ?? props.balance, reserve.value)
})
const tooMuch = computed(() => short.value !== null)
const tooMuchText = computed(() => {
  const s = short.value
  if (!s) return ''
  const have = formatAmount(s.have, s.token)
  const need = formatAmount(s.need, s.token)
  if (s.reason === 'gas') return `Needs ${need} of USDC for claim gas and the network fee — you have ${have}`
  return `Not enough ${s.token.symbol}: this costs ${need} with fees${s.token === USDC ? ' and gas' : ''}, you have ${have}`
})

/** The largest amount per slot the wallet can actually fund, gas included; 0 when it cannot. */
const max = computed(() => {
  if (!props.fees || props.balance === null) return 0n
  return maxAmountEach(props.fees, props.token, slots.value, props.balance, props.usdcBalance ?? props.balance, reserve.value, mode.value)
})
const atMax = computed(() => max.value > 0n && amountEach.value === max.value)

function useMax() {
  if (!max.value) return
  // Whole cents, written the way the keypad would have.
  input.value = Number(formatUnits(max.value, props.token.decimals)).toFixed(DECIMALS).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}
const canContinue = computed(() => amountEach.value > 0n && !tooMuch.value && props.balance !== null && props.fees !== null)

const feeLine = computed(() => {
  const q = quote.value
  if (!q) return ''
  const extras = isNative(props.token)
    ? formatAmount(q.fee + q.stipend * BigInt(q.people), props.token)
    : `${formatAmount(q.fee, props.token)} + ${formatUsdc(q.value)} gas`
  return several.value
    ? `${formatAmount(q.total, props.token)} for ${q.people} people + ${extras}`
    : `+ ${extras} fee · total ${formatAmount(isNative(props.token) ? q.value : q.tokenTotal, props.token)}`
})

/**
 * Keeps whatever the keyboard produced within what an amount can be: a comma counts as a point
 * (European keyboards), a second point and anything past two decimals or nine digits is dropped.
 */
function sanitize(event: Event) {
  const el = event.target as HTMLInputElement
  let value = el.value.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const point = value.indexOf('.')
  if (point !== -1) value = value.slice(0, point + 1) + value.slice(point + 1).replace(/\./g, '').slice(0, DECIMALS)
  const [whole = '', frac] = value.split('.')
  const digits = whole.replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS)
  value = frac !== undefined ? `${digits}.${frac}` : digits
  input.value = value
  // v-model already set the raw text; write the cleaned text back so the field never disagrees.
  if (el.value !== value) el.value = value
}

function submit() {
  if (canContinue.value) emit('continue', amountEach.value, slots.value, mode.value, expiry.value)
}

onMounted(() => {
  // Straight into typing — the screen was reached by a tap, which lets phones show the keyboard.
  nextTick(() => field.value?.focus())
})

function setSlots(n: number) {
  slots.value = Math.min(MAX_SLOTS, Math.max(1, n))
}

function selectToken(t: Token) {
  if (t === props.token) return
  input.value = ''
  emit('update:token', t)
  nextTick(() => field.value?.focus())
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
    <div v-else class="balance muted">
      <span>Available: <strong>{{ formatAmount(balance, token) }}</strong></span>
      <button class="max" :class="{ on: atMax }" :disabled="!max" :title="max ? 'The most this wallet can send, after fees and gas' : 'Not enough to fund a link'" @click="useMax">
        Max
      </button>
    </div>
    <p v-if="balance !== null && !max && fees" class="hint error">
      This wallet can't fund a link yet: it needs {{ token.symbol }} for the amount<template v-if="!isNative(token)"> and</template><template v-else>,</template> USDC for {{ formatUsdc(fees.stipend * BigInt(slots)) }} of claim gas and about {{ formatUsdc(reserve) }} of network fee.
    </p>
    <div class="display">
      <label class="amount">
        <span class="unit">{{ token.currency === 'EUR' ? '€' : '$' }}</span>
        <input
          ref="field" v-model="input" class="amount-input" type="text" inputmode="decimal" placeholder="0" autocomplete="off"
          enterkeyhint="next" aria-label="Amount" :style="{ width: `${Math.max(1, input.length)}ch` }" @input="sanitize" @keydown.enter="submit"
        >
      </label>
      <p class="currency">
        {{ token.symbol }} on Arc<template v-if="several"> · each</template>
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
        <span class="label">Send to</span>
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
      <template v-if="several">
        <div class="mode" role="radiogroup" aria-label="How to send">
          <button role="radio" :aria-checked="mode === 'separate'" :class="{ on: mode === 'separate' }" @click="mode = 'separate'">
            <Icon name="link" :size="16" /> A link each
          </button>
          <button role="radio" :aria-checked="mode === 'drop'" :class="{ on: mode === 'drop' }" @click="mode = 'drop'">
            <Icon name="drop" :size="16" /> Open drop
          </button>
        </div>
        <p class="mode-hint" :class="{ warn: isDrop }">
          <template v-if="isDrop">
            <Icon name="alert" :size="14" /> One link, first come, first served. Whoever holds it can claim every slot, so share it only where that's fine.
          </template>
          <template v-else>
            {{ slots }} separate links, one per person. Nobody can take someone else's share.
          </template>
        </p>
      </template>
      <div class="option">
        <span class="label">Returnable after</span>
        <div class="expiry" role="group" aria-label="Expiry">
          <button v-for="option in EXPIRY_OPTIONS" :key="option.seconds" :class="{ on: expiry === option.seconds }" @click="expiry = option.seconds">
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <button class="btn btn-primary" :disabled="!canContinue" @click="submit">
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  margin: 8px 0 0;
  font-size: 14px;
}

.max {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 500px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: background 0.15s var(--ease), color 0.15s var(--ease);
}

.max.on {
  background: var(--accent);
  color: #fff;
}

.max:disabled {
  background: var(--highlight);
  color: var(--muted-2);
  cursor: default;
}

.hint {
  margin: 6px 0 0;
  font-size: 12px;
  text-align: left;
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
  cursor: text;
}

.unit {
  color: var(--muted-2);
}

.amount-input {
  min-width: 1ch;
  max-width: calc(100vw - var(--gutter) * 2 - 1.2em);
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  caret-color: var(--accent);
  outline: none;
}

.amount-input::placeholder {
  color: var(--text);
  opacity: 1;
}

.amount-input:focus::placeholder {
  color: var(--muted-2);
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

.mode {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 500px;
  background: var(--highlight);
}

.mode button {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border: 0;
  border-radius: 500px;
  background: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.mode button.on {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.mode-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: -2px 4px 2px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

.mode-hint.warn {
  color: #a55a00;
}

.mode-hint :deep(svg) {
  flex: none;
  margin-top: 1px;
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

</style>
