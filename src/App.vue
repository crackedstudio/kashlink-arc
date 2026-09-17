<script setup lang="ts">
// Screens are rebuilt for Arc one at a time; see docs/ARC_MIGRATION_PLAN.md.
import { CHAIN } from './lib/arc'
</script>

<template>
  <main class="screen">
    <h1 class="title">KashLink</h1>
    <p class="muted">Rebuilding for {{ CHAIN.name }}.</p>
  </main>
</template>
