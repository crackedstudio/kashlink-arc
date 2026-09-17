<script setup lang="ts">
import { ref } from 'vue'
import { addressUrl } from '../lib/arc'
import { copyText } from '../lib/clipboard'
import { shortAddress } from '../lib/format'
import { EURC, formatAmount, USDC } from '../lib/tokens'
import Icon from './Icon.vue'

/**
 * The account a person is using, as a card: who it is, what it holds, and the one or two things
 * they can do with it. Shared by the intro screen (the sender's account) and the wallet sheet.
 */
const props = defineProps<{
  name: string
  address: string
  /** A passkey wallet is shown with a fingerprint; a browser wallet with its own icon, if it has one. */
  passkey: boolean
  icon?: string
  /** Native USDC and EURC; null while loading or unreadable. */
  usdc: bigint | null
  eurc: bigint | null
  /** Hides the balance row (the wallet sheet has its own tiles). */
  compact?: boolean
}>()

const copied = ref(false)

async function copy() {
  await copyText(props.address)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="account card" :class="{ compact }">
    <div class="who">
      <span class="avatar" :class="{ passkey }">
        <img v-if="!passkey && icon" :src="icon" alt="" width="24" height="24">
        <Icon v-else :name="passkey ? 'fingerprint' : 'wallet'" :size="22" />
      </span>
      <div class="id">
        <strong class="name">{{ name }}</strong>
        <span class="meta">
          <button class="addr mono" :aria-label="copied ? 'Copied' : 'Copy address'" @click="copy">
            {{ copied ? 'Copied' : shortAddress(address) }} <Icon :name="copied ? 'check' : 'copy'" :size="13" />
          </button>
          <span class="chip">{{ passkey ? 'Passkey' : 'Arc' }}</span>
        </span>
      </div>
      <a class="explorer" :href="addressUrl(address)" target="_blank" rel="noopener" aria-label="View on explorer">
        <Icon name="external" :size="16" />
      </a>
    </div>
    <div v-if="!compact" class="holdings">
      <div class="holding">
        <span class="label">USDC</span>
        <strong v-if="usdc !== null">{{ formatAmount(usdc, USDC) }}</strong>
        <span v-else class="pending muted">—</span>
      </div>
      <div class="holding">
        <span class="label">EURC</span>
        <strong v-if="eurc !== null">{{ formatAmount(eurc, EURC) }}</strong>
        <span v-else class="pending muted">—</span>
      </div>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.account {
  padding: 14px 16px;
}

.who {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--highlight);
  color: var(--text);
  overflow: hidden;
}

.avatar img {
  border-radius: 6px;
}

.avatar.passkey {
  background: var(--nq-light-blue);
  background-image: var(--accent-bg);
  color: #fff;
  box-shadow: 0 4px 10px rgba(5, 130, 202, 0.25);
}

.id {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.name {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
}

.meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.addr {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, monospace;
}

.chip {
  padding: 1px 7px;
  border-radius: 500px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.explorer {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--muted-2);
}

.explorer:active {
  background: var(--highlight);
}

.holdings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.holding {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--highlight);
}

.holding strong {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.pending {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.15;
}
</style>
