import { createHmac } from "node:crypto";

/** Signs a scene so /api/picture only paints scenes this site wrote (keeps strangers from spending your Fal credit). */
export function signScene(trackId: string, scene: string): string {
  return createHmac("sha256", process.env.FAL_KEY ?? "no-key").update(`${trackId}\n${scene}`).digest("hex").slice(0, 32);
}

/** The one art style every picture is painted in. Change this to restyle the whole site. */
export const ART_STYLE =
  "Hand-painted 2D anime film still with a surreal, dreamlike twist: painterly backgrounds, soft cel shading, luminous cinematic lighting, rich atmospheric skies, gentle impossible details (floating objects, otherworldly colors, a world slightly off from ours). Illustrated, not photographic, not photorealistic, not 3D. No text or lettering.";
