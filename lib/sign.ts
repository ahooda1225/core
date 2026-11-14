import { createHmac } from "node:crypto";

/** Signs a scene so /api/picture only paints scenes this site wrote (keeps strangers from spending your Fal credit). */
export function signScene(trackId: string, scene: string): string {
  return createHmac("sha256", process.env.FAL_KEY ?? "no-key").update(`${trackId}\n${scene}`).digest("hex").slice(0, 32);
}

/** The one art style every picture is painted in. Change this to restyle the whole site. */
export const ART_STYLE =
  "Cinematic 35mm film photograph with an aesthetic, dreamy mood: soft natural or practical light, visible film grain, slightly faded true-to-life colors, gentle halation, shallow depth of field, candid and lived-in. Framing varies: wide establishing shots, landscapes, quiet empty rooms, over-the-shoulder views, close-up details. Realistic but soft and moody, like a still from an indie film or a disposable-camera memory; not glossy, not hyperreal, not CGI, not anime or illustration. No text or lettering.";
