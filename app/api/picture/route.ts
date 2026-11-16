import { ApiError, fal } from "@fal-ai/client";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { ART_STYLE, signScene } from "@/lib/sign";

export const runtime = "nodejs";
export const maxDuration = 60;

// Flux Pro 1.1 Ultra in raw mode: less processed, more natural-looking photos (no "AI gloss").
const MODEL = "fal-ai/flux-pro/v1.1-ultra";

async function paintNow(scene: string): Promise<string> {
  fal.config({ credentials: process.env.FAL_KEY });
  const result = await fal.subscribe(MODEL, {
    input: { prompt: `${scene}\n\nStyle: ${ART_STYLE}`, aspect_ratio: "16:9", raw: true, output_format: "jpeg", safety_tolerance: "2" },
  });
  const url = result.data.images?.[0]?.url;
  if (!url) throw new Error("no image returned");
  return url;
}

// One painting per song: later plays reuse it instead of paying again.
const paint = (trackId: string, scene: string) =>
  unstable_cache(() => paintNow(scene), ["picture-v3", trackId, createHash("sha1").update(scene).digest("hex")], {
    revalidate: 60 * 60 * 24 * 30,
  })();

export async function POST(req: Request) {
  if (!process.env.FAL_KEY) return Response.json({ problem: "The site has no FAL_KEY yet." }, { status: 503 });
  let body: { trackId?: string; scene?: string; sig?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ problem: "Bad request." }, { status: 400 });
  }
  const { trackId = "", scene = "", sig = "" } = body;
  if (!trackId || !scene || sig !== signScene(trackId, scene)) {
    return Response.json({ problem: "That scene wasn't written by this site." }, { status: 403 });
  }
  try {
    const url = await paint(trackId, scene);
    return Response.json({ url });
  } catch (err) {
    console.error("paint failed:", err);
    const status = err instanceof ApiError ? err.status : 0;
    const problem =
      status === 401 || status === 403
        ? "Fal rejected the key. Check FAL_KEY in Vercel."
        : status === 402 || status === 429
          ? "The Fal account is out of credit or busy."
          : status === 422
            ? "Fal's safety filter refused this scene."
            : "The picture couldn't be painted for this song.";
    return Response.json({ problem }, { status: 502 });
  }
}
