"use client";

import { useEffect, useRef, useState } from "react";
import { useSpotify } from "@/components/useSpotify";
import { ArtEngine, type EngineStatus } from "@/lib/art-engine";
import type { VibeResponse } from "./api/vibe/route";

const IDLE_MS = 3500;

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const Icon = {
  play: <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>,
  pause: <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>,
  mic: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  full: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  exit: <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  link: <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArtEngine | null>(null);
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [glError, setGlError] = useState("");

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [song, setSong] = useState<VibeResponse | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);
  const [idle, setIdle] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const spotify = useSpotify(false);
  const { isPaused, position, duration } = spotify.state;
  const playing = !isPaused;

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const e = new ArtEngine(canvasRef.current);
      e.onStatus = setStatus;
      engineRef.current = e;
      return () => e.destroy();
    } catch (err) {
      setGlError(err instanceof Error ? err.message : "This browser can't draw the artwork.");
    }
  }, []);

  useEffect(() => {
    if (engineRef.current) engineRef.current.playingHint = playing;
    if (playing) setShowEmbed(false);
  }, [playing]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), IDLE_MS);
    };
    const evs = ["pointermove", "pointerdown", "keydown", "touchstart"] as const;
    evs.forEach((e) => addEventListener(e, wake, { passive: true }));
    wake();
    return () => { clearTimeout(t); evs.forEach((e) => removeEventListener(e, wake)); };
  }, []);

  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "f") toggleFull();
    };
    addEventListener("keydown", key);
    return () => { document.removeEventListener("fullscreenchange", on); removeEventListener("keydown", key); };
  }, []);

  function toggleFull() {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  }

  async function toggleMic() {
    const e = engineRef.current;
    if (!e) return;
    setError("");
    if (status?.source === "mic") { e.stopAudio(); return; }
    try { await e.useMic(); } catch { setError("Allow the microphone in your browser's address bar."); }
  }

  function playPause() {
    if (!song) return;
    spotify.toggle();
    // If the browser won't let us start Spotify from here, show its own player to tap.
    if (!spotify.everPlayed) setTimeout(() => setShowEmbed((v) => v || !spotify.everPlayed), 1800);
  }

  async function lookUp(link: string) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/vibe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
      const r = data as VibeResponse;
      setSong(r);
      setUrl("");
      spotify.load(r.trackId);
      engineRef.current?.setArt(r.art, 24 * 3600_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const listening = status?.source === "mic";
  const hide = idle && isFull;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <main className={`app${isFull ? " full" : ""}${hide ? " idle" : ""}`}>
      <section className="stage" aria-label="Artwork">
        <canvas ref={canvasRef} className="art" aria-hidden="true" />
        {glError && <p className="gl-error">{glError}</p>}
        <header className="stage-top">
          <span className="art-name">{song ? status?.name ?? "" : ""}</span>
          <div className="tools">
            <button type="button" className={`tool${listening ? " on" : ""}`} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Listen to the room"} title="Listen to the room" onClick={() => void toggleMic()}>{Icon.mic}</button>
            <button type="button" className="tool" aria-label={isFull ? "Exit full screen" : "Full screen"} title="Full screen (F)" onClick={toggleFull}>{isFull ? Icon.exit : Icon.full}</button>
          </div>
        </header>
      </section>

      <footer className="bar" aria-label="Now playing">
        <div className="now">
          <span className="swatch" aria-hidden="true" style={song ? { background: `radial-gradient(circle at 30% 30%, ${song.art.c[3]}, ${song.art.c[2]} 35%, ${song.art.c[1]} 65%, ${song.art.c[0]})` } : undefined} />
          <div className="meta">
            <span className="title">{song?.title ?? "Nothing playing"}</span>
            <span className="artist">{song ? song.artist : "Paste a Spotify link"}</span>
          </div>
        </div>

        <div className="transport">
          <button type="button" className="play" onClick={playPause} disabled={!song} aria-label={playing ? "Pause" : "Play"}>
            {playing ? Icon.pause : Icon.play}
          </button>
          <div className="progress">
            <span className="time">{fmt(position)}</span>
            <div
              className="track"
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration / 1000)}
              aria-valuenow={Math.round(position / 1000)}
              tabIndex={song ? 0 : -1}
              onClick={(e) => {
                if (!duration) return;
                const r = e.currentTarget.getBoundingClientRect();
                spotify.seek(((e.clientX - r.left) / r.width) * (duration / 1000));
              }}
            >
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="time">{duration ? `-${fmt(duration - position)}` : "0:00"}</span>
          </div>
        </div>

        <form className="paste" onSubmit={(e) => { e.preventDefault(); if (url.trim()) void lookUp(url.trim()); }}>
          <label htmlFor="song-url" className="sr-only">Spotify song link</label>
          <span className="paste-icon">{Icon.link}</span>
          <input id="song-url" type="url" inputMode="url" placeholder="Spotify link" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
          {loading && <span className="spin" aria-label="Loading" />}
        </form>
        {(error || song?.problem) && <p className="msg" role="alert">{error || song?.problem}</p>}
      </footer>

      <div className={`embed${showEmbed ? " show" : ""}`} ref={spotify.hostRef} aria-hidden={!showEmbed} />
    </main>
  );
}
