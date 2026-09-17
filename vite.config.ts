import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  server: {
    // Reachable from a phone on the same Wi-Fi, for testing the claim flow on a real device.
    host: true,
    // 5173 and 5190 belong to other projects on this machine; fail instead of silently picking a random port.
    port: 5191,
    strictPort: true,
  },
})
