"use client";

import { useEffect, useRef, useState } from "react";
import { createScene } from "@/lib/scenes";
import type { VibeId } from "@/lib/vibes";

interface Props {
  vibeId: VibeId;
  place: string;
  time: string;
  caption: string;
  running: boolean;
  status: "rec" | "play" | "pause";
  look: "digicam" | "film";
}

function dateStamp(d = new Date()) {
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, " ");
  const dd = String(d.getDate()).padStart(2, " ");
  return `'${yy} ${mm} ${dd}`;
}

export default function Viewfinder({ vibeId, place, time, caption, running, status, look }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const runningRef = useRef(running);
  const [hasVideo, setHasVideo] = useState(false);
  const [stamp, setStamp] = useState("");

  useEffect(() => setStamp(dateStamp()), []);
  useEffect(() => {
    runningRef.current = running;
    const v = videoRef.current;
    if (v && hasVideo) {
      if (running) v.play().catch(() => {});
      else v.pause();
    }
  }, [running, hasVideo]);

  // Try the real video for this vibe first.
  useEffect(() => setHasVideo(false), [vibeId]);

  // Code-drawn scene loop.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scene = createScene(vibeId);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      // Render at low resolution on purpose: it reads like a cheap camera sensor.
      const scale = Math.min(1, 560 / Math.max(r.width, 1));
      canvas.width = Math.max(160, Math.round(r.width * scale));
      canvas.height = Math.max(90, Math.round(r.height * scale));
      scene.resize(canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    let raf = 0, t = 3, last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (runningRef.current && !reduce) t += dt;
      scene.draw(ctx, t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [vibeId]);

  // Sensor grain.
  useEffect(() => {
    const c = grainRef.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    c.width = 160; c.height = 90;
    const img = g.createImageData(160, 90);
    let raf = 0, n = 0;
    const loop = () => {
      if (n++ % 3 === 0) {
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 40;
        }
        g.putImageData(img, 0, 0);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`vf vf-${look}`} ref={wrapRef}>
      <canvas ref={canvasRef} className="vf-scene" hidden={hasVideo} aria-hidden="true" />
      <video
        key={vibeId}
        ref={videoRef}
        className="vf-scene"
        src={`/vibes/${vibeId}.mp4`}
        muted
        loop
        playsInline
        autoPlay
        hidden={!hasVideo}
        onLoadedData={() => setHasVideo(true)}
        onError={() => setHasVideo(false)}
      />
      <canvas ref={grainRef} className="vf-grain" aria-hidden="true" />
      <div className="vf-vignette" aria-hidden="true" />

      {look === "digicam" && <>
      <div className="hud hud-tl">
        {status === "rec" && <><span className="rec-dot" /> REC</>}
        {status === "play" && <>▶ PLAY</>}
        {status === "pause" && <>❚❚ PAUSE</>}
      </div>
      <div className="hud hud-tr">
        <span>AUTO</span>
        <span className="battery" aria-label="battery"><i /><i /><i /></span>
      </div>
      </>}
      <div className="hud hud-bl">{place}</div>
      <div className="hud hud-br stamp">
        <span>{stamp}</span>
        <span>{time}</span>
      </div>
      {caption && <p className="vf-caption">{caption}</p>}
      <div className="vf-brackets" aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}
