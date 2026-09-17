<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from './Icon.vue'

/**
 * Points the camera at a QR code and hands back what it says. Decoding is done in the page with
 * jsQR (loaded on demand: no browser ships a QR reader Firefox and Safari both have), on a
 * downscaled copy of the frame a few times a second — plenty for a code held up to a phone.
 * Where the camera cannot be used, or the code is a screenshot, a picture can be chosen instead.
 */
const props = defineProps<{ title?: string }>()
const emit = defineEmits<{ scanned: [text: string], close: [] }>()

const video = ref<HTMLVideoElement | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const starting = ref(true)
const error = ref<string | null>(null)
const reading = ref(false)

let stream: MediaStream | null = null
let timer: number | undefined
let decode: typeof import('jsqr').default | null = null
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d', { willReadFrequently: true })!
/** Longest side of the frame handed to the decoder. Smaller is faster; this is enough for a QR filling a third of the view. */
const MAX_SIDE = 640

function decodeFrom(source: CanvasImageSource, width: number, height: number): string | null {
  if (!decode || !width || !height) return null
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return decode(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || null
}

function tick() {
  const v = video.value
  if (v && v.readyState >= 2) {
    const text = decodeFrom(v, v.videoWidth, v.videoHeight)
    if (text) {
      stop()
      emit('scanned', text)
      return
    }
  }
  timer = window.setTimeout(tick, 120)
}

function cameraError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? ''
  if (/NotAllowed|Permission/i.test(name)) return 'Camera access was declined. Allow it in the browser, or choose a picture of the code instead.'
  if (/NotFound|Overconstrained/i.test(name)) return 'No camera was found on this device. Choose a picture of the code instead.'
  if (/NotReadable|Abort/i.test(name)) return 'The camera is in use by another app. Close it and try again, or choose a picture.'
  if (!navigator.mediaDevices?.getUserMedia) return 'This browser cannot open the camera here. Choose a picture of the code instead.'
  return 'The camera could not be started. Choose a picture of the code instead.'
}

async function start() {
  try {
    decode = (await import('jsqr')).default
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    const v = video.value
    if (!v) return
    v.srcObject = stream
    await v.play()
    starting.value = false
    tick()
  }
  catch (e) {
    error.value = cameraError(e)
    starting.value = false
  }
}

function stop() {
  clearTimeout(timer)
  stream?.getTracks().forEach(t => t.stop())
  stream = null
}

/** A saved screenshot or photo of the code. */
async function fromFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  reading.value = true
  error.value = null
  try {
    decode ??= (await import('jsqr')).default
    const bitmap = await createImageBitmap(file)
    // A photo is larger than a frame; the decoder still wants it small, but not so small the code blurs away.
    const text = decodeFrom(bitmap, bitmap.width, bitmap.height) ?? decodeFull(bitmap)
    bitmap.close()
    if (!text) {
      error.value = 'No QR code was found in that picture.'
      return
    }
    stop()
    emit('scanned', text)
  }
  catch {
    error.value = 'That picture could not be read.'
  }
  finally {
    reading.value = false
    if (picker.value) picker.value.value = ''
  }
}

/** Second try at native size, for a code that is a small part of a big photo. */
function decodeFull(bitmap: ImageBitmap): string | null {
  if (!decode) return null
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  ctx.drawImage(bitmap, 0, 0)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return decode(image.data, image.width, image.height)?.data || null
}

function close() {
  stop()
  emit('close')
}

onMounted(start)
onBeforeUnmount(stop)
</script>

<template>
  <div class="scanner" role="dialog" :aria-label="props.title ?? 'Scan a QR code'">
    <div class="top">
      <strong>{{ props.title ?? 'Scan a QR code' }}</strong>
      <button class="close" aria-label="Close" @click="close">
        <Icon name="back" :size="18" />
      </button>
    </div>

    <div class="view">
      <video ref="video" playsinline muted autoplay />
      <div v-if="!error" class="frame" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <p v-if="starting" class="state">
        <span class="spinner" /> Starting the camera…
      </p>
      <p v-else-if="error" class="state">
        {{ error }}
      </p>
    </div>

    <p class="hint">
      Point at the QR code of the wallet that should receive it.
    </p>
    <label class="btn btn-outline pick" :class="{ busy: reading }">
      <Icon name="qr" :size="18" /> {{ reading ? 'Reading…' : 'Choose a picture instead' }}
      <input ref="picker" type="file" accept="image/*" :disabled="reading" @change="fromFile">
    </label>
  </div>
</template>

<style scoped>
.scanner {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  max-width: 480px;
  margin: 0 auto;
  padding: calc(var(--safe-top) + 12px) var(--gutter) calc(var(--safe-bottom) + 16px);
  background: var(--nq-blue);
  color: #fff;
  animation: fade-in 0.2s var(--ease);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 17px;
}

.close {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  transform: rotate(-90deg);
}

.view {
  position: relative;
  flex: 1;
  display: grid;
  place-items: center;
  min-height: 240px;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: #000;
}

video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.frame {
  position: relative;
  width: min(62vw, 260px);
  aspect-ratio: 1;
}

.frame span {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 3px solid #fff;
  border-radius: 4px;
}

.frame span:nth-child(1) { top: 0; left: 0; border-right: 0; border-bottom: 0; }
.frame span:nth-child(2) { top: 0; right: 0; border-left: 0; border-bottom: 0; }
.frame span:nth-child(3) { bottom: 0; left: 0; border-right: 0; border-top: 0; }
.frame span:nth-child(4) { bottom: 0; right: 0; border-left: 0; border-top: 0; }

.state {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 280px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.55);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.hint {
  margin: 14px 0 10px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  text-align: center;
}

.pick {
  position: relative;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
}

.pick.busy {
  opacity: 0.6;
}

.pick input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}
</style>
