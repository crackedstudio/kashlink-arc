<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatUsdc, parseUsdc } from '../lib/format'
import { EXPIRY_OPTIONS, type FeeParams, quoteWith } from '../lib/links'
import Icon from './Icon.vue'

const props = defineProps<{
  /** Native USDC wei, null while loading or unknown. */
  balance: bigint | null
  /** Contract fee settings, null until read. */
  fees: FeeParams | null
  expirySeconds: number
}>()
const emit = defineEmits<{
  back: []
  retry: []
  continue: [wei: bigint, expirySeconds: number]
}>()

const input = ref('0')
const expiry = ref(props.expirySeconds)
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del']
const DECIMALS = 2

const wei = computed(() => {
  const n = Number(input.value)
  if (!n) return 0n
  return parseUsdc(input.value)
})

/** A link costs the amount plus fee plus the claim stipend, so affordability has to include them. */
const total = computed(() => (props.fees ? quoteWith(props.fees, wei.value).total : wei.value))
const tooMuch = computed(() => props.balance !== null && total.value > props.balance)
const canContinue = computed(() => wei.value > 0n && !tooMuch.value && props.balance !== null && props.fees !== null)

const feeLine = computed(() => {
  if (!props.fees || !wei.value) return ''
  const q = quoteWith(props.fees, wei.value)
  return `+ ${formatUsdc(q.fee + q.stipend)} fee · total ${formatUsdc(q.total)}`
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
</script>

<template>
  <main class="screen">
    <button class="back" aria-label="Back" @click="emit('back')">
      <Icon name="back" />
    </button>
    <h1 class="title">
      Amount
    </h1>
    <p v-if="balance === null" class="balance muted">
      Could not read your balance.
      <button class="link-btn" @click="emit('retry')">
        Retry
      </button>
    </p>
    <p v-else class="balance muted">
      Available: <strong>{{ formatUsdc(balance) }}</strong>
    </p>
    <div class="display">
      <div class="amount">
        <span class="unit">$</span>{{ input }}<span class="caret" />
      </div>
      <p class="currency">
        USDC on Arc
      </p>
      <p class="secondary muted">
        {{ tooMuch ? '' : feeLine }}
      </p>
      <p v-if="tooMuch" class="error">
        Not enough USDC in your wallet
      </p>
    </div>

    <p class="label">
      Take it back if unclaimed after
    </p>
    <div class="expiry" role="group" aria-label="Expiry">
      <button v-for="option in EXPIRY_OPTIONS" :key="option.seconds" :class="{ on: expiry === option.seconds }" @click="expiry = option.seconds">
        {{ option.label }}
      </button>
    </div>

    <div class="keypad">
      <button v-for="key in keys" :key="key" :aria-label="key === 'del' ? 'Delete' : key" @click="press(key)">
        <Icon v-if="key === 'del'" name="backspace" />
        <template v-else>
          {{ key }}
        </template>
      </button>
    </div>

    <button class="btn btn-primary" :disabled="!canContinue" @click="emit('continue', wei, expiry)">
      Continue
    </button>
  </main>
</template>

<style scoped>
.balance {
  margin: 4px 0 0;
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
  min-height: 140px;
}

.amount {
  display: flex;
  align-items: center;
  max-width: 100%;
  font-size: 56px;
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
  height: 52px;
  margin-left: 3px;
  border-radius: 1px;
  background: var(--accent);
  animation: blink 1s steps(1) infinite;
}

.currency {
  height: 34px;
  margin-top: 14px;
  padding: 0 14px;
  border-radius: 500px;
  background: var(--highlight);
  font-size: 14px;
  font-weight: 700;
  line-height: 34px;
}

.secondary {
  min-height: 20px;
  margin: 10px 0 0;
  font-size: 14px;
  font-weight: 600;
}

.label {
  margin-bottom: 8px;
}

.expiry {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  padding: 4px;
  border-radius: 500px;
  background: var(--highlight);
}

.expiry button {
  flex: 1;
  min-height: 38px;
  border: 0;
  border-radius: 500px;
  background: none;
  color: var(--muted);
  font-size: 14px;
  font-weight: 700;
}

.expiry button.on {
  background: var(--card);
  color: var(--text);
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  margin-bottom: 12px;
}

.keypad button {
  display: grid;
  place-items: center;
  height: 52px;
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--text);
  font-size: 24px;
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
