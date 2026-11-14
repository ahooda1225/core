"use client";

import { useEffect, useState } from "react";
import Viewfinder from "@/components/Viewfinder";
import { useSpotify } from "@/components/useSpotify";
import { PINNED_SONGS } from "@/lib/songs";
import { VIBES, VIBE_IDS, type VibeId } from "@/lib/vibes";
import type { VibeResponse } from "./api/vibe/route";

const idleScene = (id: VibeId) => ({ vibeId: id, place: VIBES[id].place, time: VIBES[id].time, caption: "" });

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [artist, setArtist] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<VibeResponse | null>(null);
  const [idx, setIdx] = useState(0);
  const [preview, setPreview] = useState(true);
  const spotify = useSpotify(preview);
  // Preview any scene with ?scene=<id>, e.g. /?scene=fog-drive
  const [idle, setIdle] = useState(idleScene("snowfall"));
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("scene");
    if (q && (VIBE_IDS as readonly string[]).includes(q)) setIdle(idleScene(q as VibeId));
  }, []);

  useEffect(() => {
    try {
      const v = localStorage.getItem("preview");
      if (v === "off") setPreview(false);
    } catch {}
  }, []);
  const setPreviewSaved = (on: boolean) => {
    setPreview(on);
    try { localStorage.setItem("preview", on ? "on" : "off"); } catch {}
  };

  async function lookUp(link: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/vibe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link, artist }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
      setResult(data as VibeResponse);
      setIdx(0);
      spotify.load((data as VibeResponse).trackId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const scene = result?.scenes[idx] ?? idle;
  const vibe = VIBES[scene.vibeId];
  const playing = !spotify.state.isPaused;
  const running = playing || !spotify.everPlayed;
  const status = !result ? "rec" : playing ? "play" : spotify.everPlayed ? "pause" : "rec";
  const caption = loading
    ? "finding where this song belongs…"
    : result
      ? scene.caption
      : "Paste a Spotify song link and I'll show you where it belongs.";

  const chips = PINNED_SONGS.filter((s) => s.spotifyUrl);

  return (
    <main className="app">
      <section className="screen" aria-label="Scene">
        <Viewfinder
          vibeId={scene.vibeId}
          place={scene.place}
          time={scene.time}
          caption={caption}
          running={running}
          status={status}
          look={vibe.look ?? "digicam"}
        />
      </section>

      <section className="body" aria-label="Controls">
        <div className="body-inner">
          <form
            className="find"
            onSubmit={(e) => { e.preventDefault(); if (url.trim()) lookUp(url.trim()); }}
          >
            <label htmlFor="song-url" className="label">Spotify song link</label>
            <div className="find-row">
              <input
                id="song-url"
                type="url"
                inputMode="url"
                placeholder="https://open.spotify.com/track/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="shutter" disabled={loading || !url.trim()}>
                {loading ? "…" : "Find vibe"}
              </button>
            </div>
            <input
              id="song-artist"
              className="artist"
              placeholder="Artist (optional, helps the AI)"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              autoComplete="off"
            />
            {error && <p className="error" role="alert">{error}</p>}
          </form>

          {chips.length > 0 && (
            <div className="chips">
              <span className="label">Your picks</span>
              <div className="chip-row">
                {chips.map((s) => (
                  <button
                    key={s.spotifyUrl}
                    type="button"
                    className="chip"
                    onClick={() => { setUrl(s.spotifyUrl!); lookUp(s.spotifyUrl!); }}
                  >
                    {s.title || s.vibes.map((v) => VIBES[v].name).join(" / ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="now">
              <div className="now-head">
                {result.thumbnail && <img src={result.thumbnail} alt="" width={44} height={44} />}
                <div className="now-text">
                  <strong>{result.title}</strong>
                  <span>
                    {result.artist ? `${result.artist} · ` : ""}
                    {result.source === "pinned" ? "your pick" : result.source === "claude" ? "picked by AI" : "default scene"}
                  </span>
                </div>
              </div>
              {result.scenes.length > 1 && (
                <div className="scenes" role="tablist" aria-label="Scenes">
                  {result.scenes.map((s, i) => (
                    <button
                      key={s.vibeId}
                      type="button"
                      role="tab"
                      aria-selected={i === idx}
                      className="scene-btn"
                      onClick={() => setIdx(i)}
                    >
                      {VIBES[s.vibeId].name}
                    </button>
                  ))}
                </div>
              )}
              {result.notice && <p className="notice">{result.notice}</p>}
            </div>
          )}

          <div className="player">
            <div className="player-bar">
              <label className="switch" htmlFor="preview-toggle">
                <input
                  id="preview-toggle"
                  type="checkbox"
                  checked={preview}
                  onChange={(e) => setPreviewSaved(e.target.checked)}
                />
                <span className="track" aria-hidden="true"><span className="knob" /></span>
                30-sec preview
              </label>
              <span className="time">
                {spotify.state.duration > 0
                  ? `${fmt(spotify.state.position)} / ${fmt(preview ? Math.min(spotify.previewMs, spotify.state.duration) : spotify.state.duration)}`
                  : ""}
              </span>
            </div>
            <div className="embed" ref={spotify.hostRef} hidden={!result} />
            {result && (
              <a className="hint" href={`https://open.spotify.com/track/${result.trackId}`} target="_blank" rel="noreferrer">
                Player not showing? Open in Spotify ↗
              </a>
            )}
            {!preview && (
              <p className="hint">Full songs play only if you&apos;re logged into Spotify in this browser. Otherwise Spotify plays a preview.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
