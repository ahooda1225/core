"use client";

import { useEffect, useRef, useState } from "react";

const FADE_S = 0.9;

/**
 * Plays a clip on an endless loop with no visible cut: two copies take turns,
 * and each restart dissolves into the next over FADE_S seconds.
 */
export default function LoopVideo({ src, className, onReady }: { src: string; className?: string; onReady?: () => void }) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [front, setFront] = useState<0 | 1>(0);
  const frontRef = useRef<0 | 1>(0);
  const handing = useRef(false);

  useEffect(() => {
    frontRef.current = 0;
    setFront(0);
    handing.current = false;
    let raf = 0;
    const tick = () => {
      const vids = [a.current, b.current];
      const cur = vids[frontRef.current];
      const next = vids[1 - frontRef.current];
      if (cur && next && cur.duration > FADE_S * 2 && !handing.current && cur.duration - cur.currentTime <= FADE_S) {
        handing.current = true;
        next.currentTime = 0;
        void next.play().catch(() => {});
        const nf = (1 - frontRef.current) as 0 | 1;
        frontRef.current = nf;
        setFront(nf);
        setTimeout(() => { cur.pause(); handing.current = false; }, FADE_S * 1000 + 100);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [src]);

  const style = (i: 0 | 1) => ({ opacity: front === i ? 1 : 0, transition: `opacity ${FADE_S}s linear` });
  return (
    <div className={className}>
      <video ref={a} src={src} autoPlay muted playsInline preload="auto" style={style(0)} onPlaying={onReady} />
      <video ref={b} src={src} muted playsInline preload="auto" style={style(1)} />
    </div>
  );
}
