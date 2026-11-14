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
const designArt = (trackId: string, title: string, artist: string, note?: string) =>
  unstable_cache(() => designArtNow(title, artist, note), ["art-v7", trackId, title, artist, note ?? ""], { revalidate: 60 * 60 * 24 * 30 })();

function preset(id: VibeId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[1];
}

const SYSTEM = `You design a slow, abstract moving artwork that plays full screen while a song is on. It replaces the album cover, so it should feel like the song: its themes, what the lyrics are about, its era, sound, and the place and feeling it's known for.

The artwork is a film-grained field of drifting smoke-like color with soft out-of-focus lights. You choose its colors, light motion, speed and texture. Make it beautiful and tasteful: rich but not garish, with enough contrast between deep and light. Never quote lyrics.

You also write the song's one picture (a single moment). Build it from the song's most vivid lyric imagery: the objects, actions, places, weather and feelings named or implied in its lines, combined into one scene. Paraphrase the imagery; never quote or write out lyrics. First ask yourself what world the song lives in — a real room at 2am, a pink planet, a flooded ballroom, a summer that never ended — then paint it there.

Match the song's real time of day, weather and energy. Do not default to night, neon, purple or rain: upbeat, light or carefree songs get daylight, open air, wind, sun and bright, airy colors; only songs that are truly late-night or moody get dark scenes. Vary settings and palettes from song to song. When the owner describes how they picture a song, follow their description closely: it overrides your own idea. Be specific and imaginative: the setting, the objects, what has just happened there, the light source and its color, the sky and weather, the framing, and the emotional temperature. The art style is fixed: ${ART_STYLE} Write the scene for that style as a real-feeling moment and add one small dreamy touch. Choose the framing that suits this song — a wide view of a place, a landscape, an empty room full of clues, a figure seen from behind, or a close-up detail. Use first-person POV only when the song or the owner calls for it, and show hands only when they hold something that matters to the story; most pictures should have no hands at all that fits the lyrics. Rules: landscape composition with a quieter lower third; no text, letters, logos, album covers or screens with writing; no real or famous people — show people only anonymously (hands, silhouettes, from behind, out of focus) or leave them out and let the objects tell the story.

Examples of the owner's taste (song → how they picture it):
${PINNED_SONGS.map((s) => `- ${s.title ? `"${s.title}" by ${s.artist}` : "a song"}: ${s.note}`).join("\n")}`;

async function designArtNow(title: string, artist: string, note?: string): Promise<{ artist: string; art: Palette; scenes: string[] }> {
  const client = new Anthropic();
  const ask = `Song: "${title}"${artist ? ` by ${artist}` : ""}${note ? `\nThe owner pictures this song as: ${note}` : ""}`;
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
  let body: { url?: string; artist?: string };
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
    const { artist, art, scenes } = await designArt(trackId, songTitle, songArtist, pinned?.note);
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
