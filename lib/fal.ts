import { ApiError, fal } from "@fal-ai/client";
import { unstable_cache } from "next/cache";
import { createHash } from "node:crypto";
import { ART_STYLE } from "./sign";

export const IMAGE_MODEL = "fal-ai/flux-pro/v1.1-ultra";
// Hailuo 02 accepts an end frame: ending on the first frame makes the clip loop seamlessly.
export const VIDEO_MODEL = "fal-ai/minimax/hailuo-02/standard/image-to-video";

const hash = (s: string) => createHash("sha1").update(s).digest("hex");
const MONTH = 60 * 60 * 24 * 30;

function configure() {
  fal.config({ credentials: process.env.FAL_KEY });
}

async function paintNow(scene: string): Promise<string> {
  configure();
  const result = await fal.subscribe(IMAGE_MODEL, {
    input: { prompt: `${scene}\n\nStyle: ${ART_STYLE}`, aspect_ratio: "16:9", output_format: "jpeg", safety_tolerance: "2" },
  });
  const url = result.data.images?.[0]?.url;
  if (!url) throw new Error("no image returned");
  return url;
}

/** The first frame of the song's video. One painting per song (cached). */
export const paint = (trackId: string, scene: string) =>
  unstable_cache(() => paintNow(scene), ["frame-v1", trackId, hash(scene)], { revalidate: MONTH })();

async function startVideoNow(imageUrl: string, motion: string): Promise<string> {
  configure();
  const job = await fal.queue.submit(VIDEO_MODEL, {
    input: {
      image_url: imageUrl,
      end_image_url: imageUrl,
      prompt: `${motion} Keep the hand-painted anime look of the image. Slow, dreamy, continuous motion that drifts away and comes back to the opening frame, so the clip loops seamlessly. No text.`,
      duration: "6",
      resolution: "768P",
    },
  });
  return job.request_id;
}

/** Starts the video job once per song and remembers its id, so replays don't pay again. */
export const startVideo = (trackId: string, imageUrl: string, motion: string) =>
  unstable_cache(() => startVideoNow(imageUrl, motion), ["video-job-v2", trackId, hash(imageUrl + motion)], { revalidate: MONTH })();

export async function videoStatus(requestId: string): Promise<{ done: false } | { done: true; url: string }> {
  configure();
  const s = await fal.queue.status(VIDEO_MODEL, { requestId });
  if (s.status !== "COMPLETED") return { done: false };
  const r = await fal.queue.result(VIDEO_MODEL, { requestId });
  const url = r.data.video?.url;
  if (!url) throw new Error("no video returned");
  return { done: true, url };
}

export function describeFalError(err: unknown, what: string): string {
  const status = err instanceof ApiError ? err.status : 0;
  if (status === 401 || status === 403) return "Fal rejected the key. Check FAL_KEY in Vercel.";
  if (status === 402 || status === 429) return "The Fal account is out of credit or busy.";
  if (status === 422) return "Fal's safety filter refused this scene.";
  if (status === 404) return `The ${what} expired on Fal. Play the song again to make a new one.`;
  return `The ${what} couldn't be made for this song.`;
}
