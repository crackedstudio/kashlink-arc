<script setup lang="ts">
import { ref } from 'vue'
import { copyText } from '../lib/clipboard'
import { shortAddress } from '../lib/format'
import Icon from './Icon.vue'

/** A shortened address that copies the full one when tapped. */
const props = defineProps<{ address: string }>()

const copied = ref(false)

async function copy() {
  await copyText(props.address)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <button class="copy-address" type="button" :title="address" :aria-label="copied ? 'Address copied' : `Copy address ${address}`" @click="copy">
    <span class="mono">{{ copied ? 'Copied' : shortAddress(address) }}</span>
    <Icon :name="copied ? 'check' : 'copy'" :size="14" />
  </button>
</template>

<style scoped>
.copy-address {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 0;
  border-radius: 500px;
  background: var(--highlight);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  vertical-align: middle;
  cursor: pointer;
}

.copy-address:active {
  background: var(--highlight-strong);
}

.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.92em;
}
</style>
