# Vibe Cam

Paste a Spotify song link. The song plays, and the screen becomes a looping digicam (or old film) shot of the place the song belongs.

## Run it

```bash
npm install
cp .env.example .env.local   # then put your Anthropic API key in it
npm run dev
```

Open http://localhost:3000. Preview any scene without a song: `/?scene=fog-drive`.

## How it works

- **Playback:** Spotify's embed player, controlled with the Spotify iFrame API. No Spotify developer app needed.
  - "30-sec preview" (on by default) stops the song at 0:30.
  - With it off, the full song plays, but only if the listener is logged into Spotify in that browser. Otherwise Spotify gives everyone a preview.
- **Song name:** read from Spotify's public oEmbed endpoint.
- **Vibe:** your pinned songs (`lib/songs.ts`) always get your vibes. Any other song goes to Claude, which picks 1–3 scenes from `lib/vibes.ts` and writes the caption (`app/api/vibe/route.ts`).
- **Scenes:** each vibe plays `public/vibes/<id>.mp4` if it exists. Otherwise it plays the code-drawn loop in `lib/scenes.ts`. The grain, REC, date stamp and time overlay sit on top of either.

## Add your own

- **A song:** add an entry to `PINNED_SONGS` in `lib/songs.ts`. A `trackId` is the part after `/track/` in the link.
- **A video loop:** drop a muted, loopable MP4 at `public/vibes/<vibe-id>.mp4`, e.g. `public/vibes/vintage-film.mp4`. Keep it under ~10 MB.
- **A new vibe:** add it to `VIBE_IDS` and `VIBES` in `lib/vibes.ts`, then either add a video or a drawn scene in `lib/scenes.ts`.

## Deploy (Vercel)

1. Import this repo at vercel.com/new.
2. Add the environment variable `ANTHROPIC_API_KEY`.
3. Deploy.
