<script setup lang="ts">
// KashLink mark: gold hexagon with a K. Same artwork as public/logo.svg (favicon, app icon).
defineProps<{ size?: number }>()
</script>

<template>
  <svg :width="size ?? 32" :height="size ?? 32" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="logo-gold" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#EC991C" />
        <stop offset="1" stop-color="#E9B213" />
      </linearGradient>
    </defs>
    <path d="M50 3l41 23.5v47L50 97 9 73.5v-47z" fill="url(#logo-gold)" />
    <path d="M50 19l27 15.5v31L50 81 23 65.5v-31z" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" />
    <path d="M41 35v30M60 35L44 51.5M47 48.5L61 65" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
