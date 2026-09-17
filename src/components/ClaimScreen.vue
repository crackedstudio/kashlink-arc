<script setup lang="ts">
import type { Hex } from 'viem'

defineProps<{ linkKey: Hex }>()
const emit = defineEmits<{ done: [] }>()
</script>

<template>
  <main class="screen">
    <h1 class="title">Claim</h1>
    <p class="muted">Rebuilding for Arc (Step 3.4).</p>
    <div class="spacer" />
    <button class="btn btn-primary" @click="emit('done')">Back</button>
  </main>
</template>
