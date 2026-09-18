// Generates one MP3 per narration beat with ElevenLabs and writes public/voiceover/manifest.json
// with each clip's duration. Needs ELEVENLABS_API_KEY in video/.env (gitignored).
//
//   node scripts/generate-voiceover.mjs            # only clips whose text changed / are missing
//   node scripts/generate-voiceover.mjs --force    # regenerate everything (costs characters)
//   node scripts/generate-voiceover.mjs problem-2  # regenerate one clip
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of existsSync(join(root, '.env')) ? readFileSync(join(root, '.env'), 'utf8').split('\n') : []) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) throw new Error('ELEVENLABS_API_KEY is not set (put it in video/.env)')

// George: warm British storyteller. Swap for any id from GET /v1/voices.
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb'
const MODEL = 'eleven_multilingual_v2'

const script = JSON.parse(readFileSync(join(root, 'src/voiceover/script.json'), 'utf8'))
const outDir = join(root, 'public/voiceover')
mkdirSync(outDir, { recursive: true })
const manifestPath = join(outDir, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.filter((a) => !a.startsWith('--'))

const duration = (file) =>
  parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim())

let spent = 0
for (const [scene, beats] of Object.entries(script)) {
  for (let i = 0; i < beats.length; i++) {
    const id = `${scene}-${i}`
    const text = beats[i].text
    const hash = createHash('sha1').update(`${VOICE}|${MODEL}|${text}`).digest('hex').slice(0, 10)
    const file = join(outDir, `${id}.mp3`)
    const fresh = manifest[id]?.hash === hash && existsSync(file)
    const wanted = only.length ? only.includes(id) : true
    if (!wanted || (fresh && !force)) continue

    process.stdout.write(`${id}: ${text.length} chars … `)
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
      }),
    })
    if (!res.ok) throw new Error(`${id}: ${res.status} ${await res.text()}`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    spent += text.length
    manifest[id] = { hash, duration: duration(file), text }
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`${manifest[id].duration.toFixed(2)} s`)
  }
}
console.log(`done · ${spent} characters used`)
