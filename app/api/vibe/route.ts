import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { parseTrackId } from "@/lib/spotify";
import { findPinned, PINNED_SONGS } from "@/lib/songs";
import { VIBES, VIBE_IDS, type VibeId } from "@/lib/vibes";

export const runtime = "nodejs";

export interface Scene {
  vibeId: VibeId;
  place: string;
  time: string;
  caption: string;
}

export interface VibeResponse {
  trackId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  source: "pinned" | "claude" | "default";
  scenes: Scene[];
  notice?: string;
}

const SceneSchema = z.object({
  vibeId: z.enum(VIBE_IDS),
  place: z.string().describe("Lowercase viewfinder caption for the location, max 32 chars, e.g. 'empty street, first snow'"),
  time: z.string().describe("Time of day like '11:48 PM'"),
  caption: z.string().describe("One first-person sentence placing the listener in the scene, max 120 chars"),
});

const VibeSchema = z.object({
  artist: z.string().describe("Best guess of the artist, or empty string if unknown"),
  scenes: z.array(SceneSchema).describe("1 to 3 scenes, best fit first, each a different vibeId"),
});

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

function defaultScenes(ids: VibeId[]): Scene[] {
  return ids.map((id) => ({ vibeId: id, place: VIBES[id].place, time: VIBES[id].time, caption: "" }));
}

const SYSTEM = `You pick the perfect place and moment to hear a song, for a website that shows a looping first-person "digicam" scene while the song plays.

Choose from these scenes only:
${VIBE_IDS.map((id) => `- ${id}: ${VIBES[id].description}`).join("\n")}

The site owner's own picks, which show their taste:
${PINNED_SONGS.map((s) => `- ${s.title ? `"${s.title}" by ${s.artist}` : "(a song)"} → ${s.vibes.join(", ")}. Their words: ${s.note}`).join("\n")}

Match the song's actual mood, tempo, lyrics and era, not just its genre. Return 1 to 3 scenes, best first. Write the place and caption specifically for this song (don't reuse the scene descriptions). Keep it vivid and grounded, and never quote lyrics.`;

async function askClaude(title: string, artist: string): Promise<{ artist: string; scenes: Scene[] }> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(VibeSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `Song: "${title}"${artist ? ` by ${artist}` : ""}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("no usable vibe");
  }
  const seen = new Set<VibeId>();
  const scenes = response.parsed_output.scenes.filter((s) => !seen.has(s.vibeId) && seen.add(s.vibeId)).slice(0, 3);
  if (scenes.length === 0) throw new Error("no scenes");
  return { artist: response.parsed_output.artist, scenes };
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

  const meta = await oembed(trackId);
  const title = meta?.title ?? "";
  const givenArtist = (body.artist ?? "").trim();
  const base = { trackId, title: title || "Unknown song", thumbnail: meta?.thumbnail ?? null };

  const pinned = findPinned(trackId, title, givenArtist);
  if (pinned) {
    const out: VibeResponse = { ...base, title: pinned.title || base.title, artist: pinned.artist || givenArtist, source: "pinned", scenes: defaultScenes(pinned.vibes) };
    return Response.json(out);
  }

  if (!title) {
    const out: VibeResponse = {
      ...base,
      artist: givenArtist,
      source: "default",
      scenes: defaultScenes(["rain-window"]),
      notice: "Couldn't read this song's name from Spotify, so it got a default scene.",
    };
    return Response.json(out);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    const out: VibeResponse = {
      ...base,
      artist: givenArtist,
      source: "default",
      scenes: defaultScenes(["rain-window", "snowfall"]),
      notice: "No Anthropic API key is set up yet, so this song got a default scene. Add ANTHROPIC_API_KEY to turn on AI vibes.",
    };
    return Response.json(out);
  }

  try {
    const { artist, scenes } = await askClaude(title, givenArtist);
    const out: VibeResponse = { ...base, artist: givenArtist || artist, source: "claude", scenes };
    return Response.json(out);
  } catch (err) {
    let notice = "Claude couldn't pick a vibe for this one, so it got a default scene.";
    if (err instanceof Anthropic.AuthenticationError) {
      notice = "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
    } else if (err instanceof Anthropic.RateLimitError) {
      notice = "Too many requests right now. Try again in a minute.";
    } else if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
    } else {
      console.error(err);
    }
    const out: VibeResponse = { ...base, artist: givenArtist, source: "default", scenes: defaultScenes(["rain-window", "snowfall"]), notice };
    return Response.json(out);
  }
}
