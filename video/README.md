# KashLink demo video

A ~2 min product/demo video for the [Arc Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail)
submission, built with [Remotion](https://remotion.dev). Everything is React: the phone screens are
re-creations of the app's own components in the app's own palette and font (Mulish), so the video
stays in sync with the product by editing code, not re-recording.

```bash
cd video
npm install
npm run dev       # Remotion Studio: scrub every scene, edit timings live
npm run render    # → out/kashlink-demo.mp4 (1080p30, mastered to -16 LUFS; needs ffmpeg)
```

## Structure

| Scene (`src/scenes/`) | Seconds | What it says |
|---|---|---|
| `Hook` | 6 | Send USDC as a link. No address, no account, no gas. Live on Arc mainnet. |
| `Problem` | 12 | A link is a fresh address with money and no gas; the usual fix is a relayer, a hot wallet, meta-transactions and an API. |
| `ArcInsight` | 13 | On Arc USDC is the gas: the escrow drops 1¢ on the link, and that cent pays for the claim. Animated sender → escrow → link → recipient flow. |
| `Demo` | 20 | The sender's phone: Amount → Review → Ready sheet with QR, funding a 5-person open drop. |
| `Claim` | 15 | The recipient's phone: link arrives in chat → claim screen → passkey wallet → received. |
| `Features` | 9 | Cash links, a link each, drops, notes and QR, returns, passkey wallets, EURC, live stats. |
| `Contract` | 11 | ~260 lines, 39 Foundry tests, immutable, 1% fee on chain, contract is its own index, mainnet address. |
| `Outro` | 7 | URL, repo, "share it like cash". |

Scene lengths live in `src/Video.tsx`; each scene is also registered on its own under the
**Scenes** folder in Studio so it can be tweaked in isolation. Timings inside scenes are written
in seconds (`useClock().t`), so nudging a beat is a one-number change.

`src/theme.ts` holds the palette (copied from `../src/style.css`), the site URL, the repo and the
mainnet escrow address shown in the video.

## Voice-over and music

**Narration** is one ElevenLabs clip per beat, generated from `src/voiceover/script.json` into
`public/voiceover/*.mp3` (committed, so the video renders without a key). `manifest.json` next to
them records each clip's duration; `src/voiceover/timeline.tsx` turns that into the timeline every
scene reads its beat times from, so if a line runs long the visuals and the scene length follow it.

```bash
cp .env.example .env         # ELEVENLABS_API_KEY=…  (gitignored)
node scripts/generate-voiceover.mjs            # only clips whose text changed
node scripts/generate-voiceover.mjs problem-2  # one clip
node scripts/generate-voiceover.mjs --force    # everything (spends characters)
```

To change a line: edit the text in `script.json`, re-run the script, render. To move a beat: change
its `at`. The on-screen `<Narration>` text in each scene is written separately (shorter, punchier)
but keyed to the same beats.

**Music** is synthesised, not sampled — `scripts/generate-music.mjs` writes `public/music/bed.mp3`
(D major, 92 BPM, pad + sub + pluck arpeggio + light drums), so there is nothing to license.
`src/Video.tsx` plays it at 20% and ducks it to 7.5% while anyone is speaking. Tweak the mix
constants at the top of that script and re-run it.

The video still works muted: every beat has on-screen text.
