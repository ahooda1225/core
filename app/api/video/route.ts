import { signScene } from "@/lib/sign";
import { describeFalError, paint, startVideo, videoStatus } from "@/lib/fal";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Paint the song's first frame and start its video. Returns the frame right away plus a job id to check on. */
export async function POST(req: Request) {
  if (!process.env.FAL_KEY) return Response.json({ problem: "The site has no FAL_KEY yet." }, { status: 503 });
  let body: { trackId?: string; scene?: string; motion?: string; sig?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ problem: "Bad request." }, { status: 400 });
  }
  const { trackId = "", scene = "", motion = "", sig = "" } = body;
  if (!trackId || !scene || sig !== signScene(trackId, `${scene}\n${motion}`)) {
    return Response.json({ problem: "That scene wasn't written by this site." }, { status: 403 });
  }
  let image: string;
  try {
    image = await paint(trackId, scene);
  } catch (err) {
    console.error("paint failed:", err);
    return Response.json({ problem: describeFalError(err, "picture") }, { status: 502 });
  }
  try {
    const job = await startVideo(trackId, image, motion);
    return Response.json({ image, job });
  } catch (err) {
    console.error("video submit failed:", err);
    return Response.json({ image, problem: describeFalError(err, "video") }, { status: 502 });
  }
}

/** Check on a video job: { done: false } while it renders, then { done: true, url }. */
export async function GET(req: Request) {
  const job = new URL(req.url).searchParams.get("job") ?? "";
  if (!/^[\w-]{8,80}$/.test(job)) return Response.json({ problem: "Bad job id." }, { status: 400 });
  try {
    return Response.json(await videoStatus(job));
  } catch (err) {
    console.error("video status failed:", err);
    return Response.json({ problem: describeFalError(err, "video") }, { status: 502 });
  }
}
