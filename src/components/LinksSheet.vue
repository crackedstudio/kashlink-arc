<script setup lang="ts">
import type { StoredLink } from '../lib/storage'
import type { Connected, DiscoveredWallet } from '../lib/wallet'

defineProps<{ links: StoredLink[], wallet: Connected | null }>()
const emit = defineEmits<{ open: [link: StoredLink], close: [], changed: [], connect: [wallet: DiscoveredWallet] }>()
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <section class="sheet" role="dialog" aria-label="Your KashLinks">
      <div class="handle" />
      <h2>Your KashLinks</h2>
      <p class="muted">Rebuilding for Arc (Step 3.5).</p>
    </section>
  </div>
</template>
