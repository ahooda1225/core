import { createHmac } from "node:crypto";

/** Signs a scene so /api/picture only paints scenes this site wrote (keeps strangers from spending your Fal credit). */
export function signScene(trackId: string, scene: string): string {
  return createHmac("sha256", process.env.FAL_KEY ?? "no-key").update(`${trackId}\n${scene}`).digest("hex").slice(0, 32);
}

/** The one art style every picture is painted in. Change this to restyle the whole site. */
export const ART_STYLE =
  "Cinematic film still, shot on 35mm motion picture film: dramatic motivated lighting with rich color, atmospheric haze, shallow depth of field, soft film grain and halation, moody and dreamy, beautifully composed like a frame from an art-house film or a music video. Realistic, not illustration, not CGI, not plastic or over-sharpened. No text or lettering.";
