// "Follow my Spotify": log in with Spotify (PKCE, no secret needed) and read what's playing.
// Tokens stay in this browser's localStorage.

export const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "user-read-currently-playing user-read-playback-state";
const TOKENS = "spotify-tokens";
const VERIFIER = "spotify-verifier";

export interface NowPlaying {
  id: string;
  name: string;
  artists: string;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
  at: number; // when this snapshot was taken (ms)
}

interface Tokens { access: string; refresh: string; expires: number }

const redirectUri = () => `${location.origin}/`;

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readTokens(): Tokens | null {
  try { return JSON.parse(localStorage.getItem(TOKENS) ?? "null"); } catch { return null; }
}
function saveTokens(t: Tokens | null) {
  try { t ? localStorage.setItem(TOKENS, JSON.stringify(t)) : localStorage.removeItem(TOKENS); } catch {}
}

export const isConnected = () => !!readTokens();
export const disconnect = () => saveTokens(null);

/** Sends the browser to Spotify's login page. */
export async function connect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  try { sessionStorage.setItem(VERIFIER, verifier); } catch {}
  const q = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  location.href = `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: SPOTIFY_CLIENT_ID, ...body }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || "Spotify login failed.");
  return { access: data.access_token, refresh: data.refresh_token ?? body.refresh_token ?? "", expires: Date.now() + (data.expires_in - 60) * 1000 };
}

/** Finishes the login when Spotify sends the browser back with ?code=… . Returns an error message, or "" if nothing to do / success. */
export async function finishLoginIfReturning(): Promise<string> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const err = params.get("error");
  if (!code && !err) return "";
  history.replaceState(null, "", location.pathname);
  if (err) return err === "access_denied" ? "Spotify login was cancelled." : `Spotify login failed: ${err}`;
  let verifier = "";
  try { verifier = sessionStorage.getItem(VERIFIER) ?? ""; } catch {}
  if (!verifier) return "Spotify login expired. Try again.";
  try {
    saveTokens(await tokenRequest({ grant_type: "authorization_code", code: code!, redirect_uri: redirectUri(), code_verifier: verifier }));
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : "Spotify login failed.";
  }
}

async function accessToken(): Promise<string | null> {
  const t = readTokens();
  if (!t) return null;
  if (Date.now() < t.expires) return t.access;
  try {
    const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh });
    saveTokens(fresh);
    return fresh.access;
  } catch {
    saveTokens(null);
    return null;
  }
}

/** What's playing in the user's Spotify right now, or null if nothing. Throws "logged-out" if the login is gone. */
export async function nowPlaying(): Promise<NowPlaying | null> {
  const token = await accessToken();
  if (!token) throw new Error("logged-out");
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return null;
  if (res.status === 401) { saveTokens(null); throw new Error("logged-out"); }
  if (!res.ok) return null;
  const d = await res.json();
  const item = d?.item;
  if (!item || d.currently_playing_type !== "track" || !item.id) return null;
  return {
    id: item.id,
    name: item.name,
    artists: (item.artists ?? []).map((a: { name: string }) => a.name).join(", "),
    durationMs: item.duration_ms ?? 0,
    progressMs: d.progress_ms ?? 0,
    isPlaying: !!d.is_playing,
    at: Date.now(),
  };
}

export interface QueuedTrack { id: string; name: string; artists: string }

/** The next song in the user's Spotify queue, so its art can be made before it starts. */
export async function nextInQueue(): Promise<QueuedTrack | null> {
  const token = await accessToken();
  if (!token) return null;
  const res = await fetch("https://api.spotify.com/v1/me/player/queue", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const d = await res.json();
  const t = (d?.queue ?? []).find((x: { type?: string; id?: string }) => x?.type === "track" && x.id);
  return t ? { id: t.id, name: t.name, artists: (t.artists ?? []).map((a: { name: string }) => a.name).join(", ") } : null;
}
