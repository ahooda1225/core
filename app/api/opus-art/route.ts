import Anthropic from "@anthropic-ai/sdk";
import { unstable_cache } from "next/cache";
import { signScene } from "@/lib/sign";
import { findPinned } from "@/lib/songs";

export const runtime = "nodejs";
// Drawing a whole animated piece takes Opus a minute or two.
export const maxDuration = 300;

const SYSTEM = `You are an abstract generative artist. You make one animated SVG artwork that plays full screen on a big TV at a party, as the backdrop for a song.

Make it abstract: no objects, no scenes, no figures, no symbols, no icons, nothing literal from the title or lyrics (no microphones, hearts, stars, roses, cars, faces, notes). Translate the song into pure visual language instead: color, light, shape, rhythm, texture and movement. Think gallery-grade generative art or a beautiful album cover: soft glowing gradient fields and color blooms, large flowing organic forms or bold geometric planes, light beams and halos, fine line work, layered translucent shapes, grain-like texture made from small dots.

Translate the song: its mood sets the palette and temperature; its tempo sets how fast things move; its emotional arc sets the composition (calm and wide, tense and angular, euphoric and radiant, melancholic and drifting). Match the song's real time of day and energy. Make it striking from across a room: one clear area of focus, generous negative space, luminous color that glows on a TV in a dim room, and subtle details that reward a closer look. Motion is slow, hypnotic and continuous, with one livelier layer (a breathing glow, drifting particles, a slow light sweep, rotating rings). Use a refined, harmonious palette of 3 to 5 colors. Avoid anything cartoony, clip-art or childish. When the owner describes how they picture the song, take its colors, light and feeling, not its objects.

Technical rules (strict):
- Output only the SVG markup: start with <svg and end with </svg>. No code fences, no commentary.
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
- Fully self-contained: no <script>, no event attributes, no <foreignObject>, no <image>, no external URLs, no web fonts, no <text>.
- Blend modes (mix-blend-mode: screen, plus-lighter) and radial gradients are encouraged for glow.
- Animate with CSS @keyframes in one <style> block (and SMIL if needed). Animate transform and opacity; never animate filters. Use transform-box: fill-box and transform-origin for rotations and scales.
- Every animation is infinite and loops seamlessly: durations that divide 24s, alternate or matching start and end states.
- Keep it efficient: under about 45KB and about 400 elements; at most two blur filters, applied to static shapes.`;

function cleanSvg(text: string): string | null {
  const m = text.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return null;
  const svg = m[0];
  // Shown through an <img>, which never runs scripts, but refuse anything that tries.
  if (/<script|<foreignObject|javascript:|\son[a-z]+\s*=|<image[\s>]|https?:\/\/(?!www\.w3\.org)/i.test(svg)) return null;
  if (svg.length > 400_000) return null;
  return svg;
}

async function drawNow(title: string, artist: string, note?: string): Promise<string> {
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 32000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `Song: "${title}"${artist ? ` by ${artist}` : ""}${note ? `\nThe owner pictures it as: ${note}` : ""}` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("refused");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const svg = cleanSvg(text);
  if (!svg) throw new Error(msg.stop_reason === "max_tokens" ? "too long" : "no usable svg");
  return svg;
}

const draw = (trackId: string, title: string, artist: string, note?: string) =>
  unstable_cache(() => drawNow(title, artist, note), ["opus-art-v2", trackId, title, artist, note ?? ""], { revalidate: 60 * 60 * 24 * 30 })();

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ problem: "The site has no ANTHROPIC_API_KEY." }, { status: 503 });
  let body: { trackId?: string; title?: string; artist?: string; sig?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ problem: "Bad request." }, { status: 400 });
  }
  const { trackId = "", title = "", sig = "" } = body;
  const artist = (body.artist ?? "").slice(0, 120);
  if (!trackId || !title || sig !== signScene(trackId, `opus\n${title}`)) {
    return Response.json({ problem: "That song wasn't looked up by this site." }, { status: 403 });
  }
  const note = findPinned(trackId, title, artist)?.note;
  try {
    return Response.json({ svg: await draw(trackId, title, artist, note) });
  } catch (err) {
    console.error("opus art failed:", err);
    let problem = "Opus couldn't draw art for this song. Try again or switch back to photo.";
    if (err instanceof Anthropic.AuthenticationError) problem = "Your Anthropic key was rejected.";
    else if (err instanceof Anthropic.RateLimitError) problem = "Too many requests, or the Anthropic account is out of credit.";
    else if (err instanceof Anthropic.APIConnectionTimeoutError) problem = "Opus took too long to draw.";
    return Response.json({ problem }, { status: 502 });
  }
}
