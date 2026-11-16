import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ART_STYLE, signScene } from "@/lib/sign";
import { unstable_cache } from "next/cache";
import { parseTrackId } from "@/lib/spotify";
import { findPinned, PINNED_SONGS } from "@/lib/songs";
import type { VibeId } from "@/lib/vibes";
import { PALETTES, type Palette } from "@/lib/palettes";

export const runtime = "nodejs";
// Give Claude time to design the artwork (Vercel may cut functions off earlier by default).
export const maxDuration = 60;

export interface VibeResponse {
  trackId: string;
  title: string;
  artist: string;
  source: "pinned" | "claude" | "default";
  /** The moving artwork to show while this song plays. */
  art: Palette;
  notice?: string;
  /** Why the AI artwork wasn't used, when it wasn't. Shown quietly in the UI. */
  problem?: string;
  /** Lyric moments in song order: a detailed scene for the image generator each, signed so /api/picture only paints scenes we wrote. */
  moments?: { scene: string; sig: string }[];
}



const ArtSchema = z.object({
  moments: z
    .array(
      z.object({
        part: z.enum(["intro", "verse", "chorus", "bridge", "outro"]),
        scene: z.string().describe("A richly detailed prompt for an illustration model, 60-110 words, painting what the lyrics evoke at this point in the song. See the scene rules."),
      }),
    )
    .describe("Exactly 1 moment: the one picture for this song"),
  artist: z.string().describe("The song's artist, or empty string if unknown"),
  name: z.string().describe("2-3 word lowercase name for the artwork, like a playlist title, e.g. 'slow burn neon'"),
  deep: z.string().describe("Darkest color of the palette, hex. Dark for night songs, soft and light (e.g. a pale sky blue) for daytime, airy songs."),
  mid: z.string().describe("Main body color of the smoke/color field, hex"),
  light: z.string().describe("Highlight color in the color field, hex"),
  glow: z.string().describe("Color of the out-of-focus lights, hex"),
  motion: z.enum(["drift", "snow", "embers"]).describe("How the lights move: drift (floating), snow (falling), embers (rising like sparks)"),
  colorful_lights: z.boolean().describe("true for many-colored lights (party, city, holiday); false for one tone"),
  film: z.boolean().describe("true for a warm vintage film look (older songs, nostalgic, home-movie feeling)"),
  speed: z.enum(["still", "slow", "flowing", "fast"]).describe("How fast the artwork moves at rest"),
  light_amount: z.enum(["few", "some", "many"]).describe("How much glowing light there is"),
  energy: z.number().describe("0 to 1, how energetic the song is"),
});

const SPEED = { still: 0.15, slow: 0.4, flowing: 0.65, fast: 0.95 } as const;
const AMOUNT = { few: 0.25, some: 0.5, many: 0.85 } as const;
const MOTION = { drift: 0, snow: 1, embers: 2 } as const;
const isHex = (h: string) => /^#[0-9a-fA-F]{6}$/.test(h);

async function oembed(trackId: string): Promise<{ title: string; thumbnail: string | null } | null> {
  try {
    const res = await fetch(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; thumbnail_url?: string };
    return data.title ? { title: data.title, thumbnail: data.thumbnail_url ?? null } : null;
  } catch {
    return null;
  }
}

/** oEmbed has no artist, but the public embed page does. Best effort. */
async function embedArtist(trackId: string): Promise<string> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${trackId}`, { next: { revalidate: 86400 } });
    if (!res.ok) return "";
    const html = await res.text();
    const m = html.match(/"artists":\[\{[^\]]*?"name":"((?:[^"\\]|\\.)*)"/);
    return m ? JSON.parse(`"${m[1]}"`) : "";
  } catch {
    return "";
  }
}

// Same song, same artwork: cache the design (one Claude call per song, not per play).
const designArt = (trackId: string, title: string, artist: string, note?: string, hint?: string) =>
  unstable_cache(() => designArtNow(title, artist, note, hint), ["art-v10", trackId, title, artist, note ?? "", hint ?? ""], { revalidate: 60 * 60 * 24 * 30 })();

function preset(id: VibeId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[1];
}

const SYSTEM = `You design a slow, abstract moving artwork that plays full screen while a song is on. It replaces the album cover, so it should feel like the song: its themes, what the lyrics are about, its era, sound, and the place and feeling it's known for.

The artwork is a film-grained field of drifting smoke-like color with soft out-of-focus lights. You choose its colors, light motion, speed and texture. Make it beautiful and tasteful: rich but not garish, with enough contrast between deep and light. Never quote lyrics.

You also write the song's one picture (a single moment). It is the backdrop for the song on a big TV at a party, full screen for the whole song, so it needs a strong, simple composition that reads from across the room and vivid, rich, believable color with real atmosphere — real-looking but alive, never flat, brown, murky or gloomy unless the song truly is. It should carry the song's energy into the room. Build it from the song's most specific lyric imagery: the objects, actions, places, weather and feelings named or implied in its lines. Paraphrase; never quote or write out lyrics. First ask what world the song lives in, then find one real, specific place and moment in it.

What makes it great is restraint and specificity, like a photo a real photographer took, not an AI picture. One idea, a few well-chosen elements, an ordinary place made beautiful by light and timing (a laundromat at 4pm, a motel pool, a stairwell, a highway shoulder, a kitchen after a party), honest imperfections, and an unexpected but natural framing. Banned clichés that make pictures look like AI slop: fairy lights or string lights, glowing orbs or bokeh balls, floating particles, bubbles, lens flares, sunset silhouettes with palm trees, a person with arms spread wide, candles everywhere, everything glowing at once, symmetrical centered postcard compositions, and stacking many pretty effects in one picture.

Get the song right first. If you don't know this exact song well, don't guess from the title alone: go by the artist's genre, era and usual sound. Hype, rap, drill, dance, pop and party songs get energetic, social, moving, colorful scenes (a crowded corner shop at night, a car full of friends, a rooftop, a rave in a car park, a summer street), never a lonely sad bedroom. Match the song's real time of day, weather and energy. Don't default to night, neon, purple, sunsets or rain: upbeat, carefree songs get plain daylight and open air; only truly late-night or moody songs get dark scenes. Vary settings and palettes from song to song. When the owner describes how they picture a song, follow their description closely: it overrides your own idea. Describe concretely: the place, the few objects that matter, what has just happened, the light source and its color, the weather, and the framing. The art style is fixed: ${ART_STYLE} Choose the framing that suits this song — a wide view of a place, an empty room full of clues, a figure seen from behind or far away, or a close-up detail. Use first-person POV only when the song or the owner calls for it, and show hands only when they hold something that matters. Rules: landscape composition with a quieter lower third; no text, letters, logos, album covers or screens with writing; no real or famous people, and no visible faces anywhere, including in mirrors, reflections, windows or screens — show people only anonymously (from behind, far away, out of focus, in motion blur) or leave them out and let the place tell the story.

Examples of the owner's taste (song → how they picture it):
${PINNED_SONGS.map((s) => `- ${s.title ? `"${s.title}" by ${s.artist}` : "a song"}: ${s.note}`).join("\n")}`;

async function designArtNow(title: string, artist: string, note?: string, hint?: string): Promise<{ artist: string; art: Palette; scenes: string[] }> {
  const client = new Anthropic();
  const ask = `Song: "${title}"${artist ? ` by ${artist}` : ""}${note ? `\nThe owner pictures this song as: ${note}` : ""}${hint ? `\nThe owner didn't like the last picture for this song. Their feedback, which you must follow: ${hint}` : ""}`;
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(ArtSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: ask }],
  });
  const o = response.parsed_output;
  if (response.stop_reason === "refusal" || !o || o.moments.length === 0) throw new Error("no usable artwork");
  const colors = [o.deep, o.mid, o.light, o.glow];
  if (!colors.every(isHex)) throw new Error("bad colors");
  return {
    artist: o.artist,
    scenes: o.moments.map((m) => m.scene.trim().slice(0, 1500)).filter(Boolean).slice(0, 1),
    art: {
      id: "custom",
      name: o.name.toLowerCase().slice(0, 40),
      e: Math.min(1, Math.max(0, o.energy)),
      mode: MOTION[o.motion],
      c: colors as Palette["c"],
      multi: o.colorful_lights,
      film: o.film,
      flow: SPEED[o.speed],
      glow: AMOUNT[o.light_amount],
    },
  };
}

export async function POST(req: Request) {
  let body: { url?: string; artist?: string; hint?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Send JSON with a Spotify track link." }, { status: 400 });
  }

  const trackId = parseTrackId(body.url ?? "");
  if (!trackId) {
    return Response.json(
      { error: "That isn't a Spotify song link. In Spotify, tap Share → Copy Song Link, then paste it here." },
      { status: 400 },
    );
  }

  const [meta, foundArtist] = await Promise.all([oembed(trackId), embedArtist(trackId)]);
  const title = meta?.title ?? "";
  const givenArtist = (body.artist ?? "").trim() || foundArtist;

  const pinned = findPinned(trackId, title, givenArtist);
  const songTitle = pinned?.title || title;
  const songArtist = pinned?.artist || givenArtist;
  const base = { trackId, title: songTitle || "Unknown song" };
  const fallbackArt = pinned ? preset(pinned.vibes[0]) : preset("rain-window");

  if (!songTitle || !process.env.ANTHROPIC_API_KEY) {
    const out: VibeResponse = {
      ...base,
      artist: songArtist,
      source: pinned ? "pinned" : "default",
      art: fallbackArt,
      problem: !songTitle
        ? "Couldn't read this song's name from Spotify."
        : !process.env.ANTHROPIC_API_KEY
          ? "The site has no ANTHROPIC_API_KEY. Add it in Vercel → Settings → Environment Variables, then redeploy."
          : undefined,
    };
    return Response.json(out);
  }

  try {
    const hint = (body.hint ?? "").trim().slice(0, 300) || undefined;
    const { artist, art, scenes } = await designArt(trackId, songTitle, songArtist, pinned?.note, hint);
    const out: VibeResponse = {
      ...base,
      artist: songArtist || artist,
      source: pinned ? "pinned" : "claude",
      art,
      ...(process.env.FAL_KEY ? { moments: scenes.map((scene) => ({ scene, sig: signScene(trackId, scene) })) } : {}),
    };
    return Response.json(out);
  } catch (err) {
    let problem = "The AI couldn't design artwork for this song.";
    if (err instanceof Anthropic.AuthenticationError) problem = "Your Anthropic key was rejected. Check ANTHROPIC_API_KEY in Vercel, then redeploy.";
    else if (err instanceof Anthropic.PermissionDeniedError) problem = "Your Anthropic key can't use this model. Check the key's workspace and permissions.";
    else if (err instanceof Anthropic.RateLimitError) problem = "Too many requests, or the Anthropic account is out of credit.";
    else if (err instanceof Anthropic.BadRequestError) problem = `Anthropic rejected the request: ${err.message.slice(0, 160)}`;
    else if (err instanceof Anthropic.APIConnectionTimeoutError) problem = "The AI took too long to answer.";
    else if (err instanceof Anthropic.APIError) problem = `Anthropic error ${err.status ?? ""}: ${err.message.slice(0, 160)}`;
    console.error("designArt failed:", err);
    const out: VibeResponse = { ...base, artist: songArtist, source: pinned ? "pinned" : "default", art: fallbackArt, problem };
    return Response.json(out);
  }
}
