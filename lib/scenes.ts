// Code-drawn looping scenes, one per vibe. Each is a tiny "loading screen" film
// drawn on a low-res canvas, so it reads like a cheap digital camera.
// A real video at /public/vibes/<id>.mp4 takes priority over these.

import type { VibeId } from "./vibes";

export interface Scene {
  resize(w: number, h: number): void;
  draw(ctx: CanvasRenderingContext2D, t: number): void;
}

type Ctx = CanvasRenderingContext2D;

// mulberry32, with the seed hashed first so neighbouring seeds give unrelated sequences.
function rng(seed: number) {
  let a = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function vGrad(ctx: Ctx, h: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

interface Flake { x: number; y: number; z: number; ph: number }

function makeFlakes(n: number, seed: number): Flake[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ x: r(), y: r(), z: 0.3 + r() * 0.7, ph: r() * 6.28 }));
}

function drawSnow(ctx: Ctx, flakes: Flake[], w: number, h: number, t: number, speed = 1, alpha = 0.9) {
  ctx.fillStyle = "#fff";
  for (const f of flakes) {
    const y = ((f.y + t * 0.05 * f.z * speed) % 1) * h * 1.1 - h * 0.05;
    const x = ((f.x + Math.sin(t * 0.7 + f.ph) * 0.01 + t * 0.004 * f.z) % 1) * w;
    ctx.globalAlpha = alpha * (0.4 + f.z * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.6, f.z * f.z * h * 0.007), 0, 6.283);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- snowfall
function snowfall(): Scene {
  let w = 0, h = 0;
  const flakes = makeFlakes(420, 7);
  const houses = Array.from({ length: 9 }, (_, i) => {
    const r = rng(100 + i);
    return { x: i / 9 - 0.05 + r() * 0.03, w: 0.09 + r() * 0.05, hgt: 0.1 + r() * 0.08, lit: r() > 0.35, win: r() };
  });
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      const bob = Math.sin(t * 0.6) * h * 0.004;
      ctx.save();
      ctx.translate(0, bob);
      ctx.fillStyle = vGrad(ctx, h, [[0, "#0b1424"], [0.55, "#2a3550"], [1, "#4a5470"]]);
      ctx.fillRect(0, -10, w, h + 20);
      const horizon = h * 0.62;
      for (const ho of houses) {
        const x = ho.x * w, bw = ho.w * w, bh = ho.hgt * h;
        ctx.fillStyle = "#151b2b";
        ctx.fillRect(x, horizon - bh, bw, bh);
        ctx.beginPath();
        ctx.moveTo(x - bw * 0.08, horizon - bh);
        ctx.lineTo(x + bw / 2, horizon - bh - bh * 0.55);
        ctx.lineTo(x + bw * 1.08, horizon - bh);
        ctx.fill();
        ctx.fillStyle = "#dfe6f2";
        ctx.fillRect(x - bw * 0.06, horizon - bh - 2, bw * 1.12, 3);
        if (ho.lit) {
          const flick = 0.85 + Math.sin(t * 2 + ho.win * 9) * 0.05;
          ctx.fillStyle = `rgba(255,190,110,${flick})`;
          ctx.fillRect(x + bw * (0.15 + ho.win * 0.4), horizon - bh * 0.7, bw * 0.22, bh * 0.28);
          glow(ctx, x + bw * (0.26 + ho.win * 0.4), horizon - bh * 0.56, bw * 0.6, "rgba(255,170,90,0.35)");
        }
      }
      ctx.fillStyle = vGrad(ctx, h, [[0, "#9aa6c0"], [1, "#e4e9f3"]]);
      ctx.fillRect(0, horizon, w, h - horizon + 20);
      // streetlamp
      const lx = w * 0.72;
      ctx.fillStyle = "#0e121c";
      ctx.fillRect(lx - 3, h * 0.18, 6, horizon - h * 0.18 + h * 0.08);
      ctx.fillRect(lx - 3, h * 0.18, w * 0.05, 5);
      const lampX = lx + w * 0.045, lampY = h * 0.2;
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, lampX, lampY, h * 0.55, "rgba(255,200,130,0.45)");
      glow(ctx, lampX, lampY, h * 0.06, "rgba(255,240,210,1)");
      ctx.globalCompositeOperation = "source-over";
      glow(ctx, lampX, h * 0.8, h * 0.35, "rgba(255,210,150,0.25)");
      drawSnow(ctx, flakes, w, h, t, 1);
      ctx.restore();
    },
  };
}

// ---------------------------------------------------------------- lights drive
function lightsDrive(): Scene {
  let w = 0, h = 0;
  const colors = ["#ff4b4b", "#3dff7a", "#ffd36b", "#5aa8ff", "#fff1d6", "#ff6bd8"];
  interface House { side: number; z0: number; width: number; height: number; seed: number }
  const houses: House[] = Array.from({ length: 14 }, (_, i) => {
    const r = rng(300 + i);
    return { side: i % 2 ? 1 : -1, z0: (i / 14) * 60, width: 7 + r() * 5, height: 4 + r() * 2.5, seed: 300 + i };
  });
  const flakes = makeFlakes(120, 11);
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      const horizon = h * 0.45, f = h * 0.9;
      ctx.fillStyle = vGrad(ctx, h, [[0, "#05070f"], [0.45, "#141a33"], [0.46, "#1a1d28"], [1, "#0a0b10"]]);
      ctx.fillRect(0, 0, w, h);
      // road
      ctx.fillStyle = "#16171d";
      ctx.beginPath();
      ctx.moveTo(w * 0.47, horizon); ctx.lineTo(w * 0.53, horizon); ctx.lineTo(w * 1.3, h); ctx.lineTo(-w * 0.3, h);
      ctx.fill();
      const speed = 2.2;
      const sorted = houses
        .map((ho) => ({ ho, z: ((ho.z0 - t * speed) % 60 + 60) % 60 + 3 }))
        .sort((a, b) => b.z - a.z);
      ctx.globalCompositeOperation = "lighter";
      for (const { ho, z } of sorted) {
        const r = rng(ho.seed);
        const X = ho.side * 9, Ygnd = 2.2;
        const pts: [number, number][] = [];
        // roofline: eave → peak → eave, plus a lower gutter line
        const n = 18;
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const dx = (u - 0.5) * ho.width;
          const peak = ho.height + (1 - Math.abs(u - 0.5) * 2) * 2.5;
          pts.push([X + ho.side * dx * 0.15, Ygnd - peak], [X + ho.side * dx * 0.15, Ygnd - ho.height * 0.45]);
        }
        const zz = z + 0;
        for (let i = 0; i < pts.length; i++) {
          const [px, py] = pts[i];
          const zi = zz + (i / pts.length) * ho.width * 0.9;
          const sx = w / 2 + (px / zi) * f;
          const sy = horizon + (py / zi) * f;
          const size = Math.max(0.8, (h * 0.9) / zi / 22);
          const c = colors[Math.floor(r() * colors.length)];
          const tw = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7 + ho.seed);
          glow(ctx, sx, sy, size * 6, c, 0.35 * tw);
          ctx.fillStyle = c;
          ctx.globalAlpha = tw;
          ctx.beginPath(); ctx.arc(sx, sy, size, 0, 6.283); ctx.fill();
          ctx.globalAlpha = 1;
        }
        // warm window
        const wx = w / 2 + (X / (zz + 2)) * f, wy = horizon + ((Ygnd - ho.height * 0.25) / (zz + 2)) * f;
        glow(ctx, wx, wy, (h * 2) / zz, "rgba(255,180,90,0.5)");
      }
      ctx.globalCompositeOperation = "source-over";
      drawSnow(ctx, flakes, w, h, t, 0.6, 0.5);
      // car interior frame
      ctx.fillStyle = "#020203";
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(w * 0.12, 0); ctx.lineTo(w * 0.02, h * 0.78); ctx.lineTo(0, h * 0.8); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w, 0); ctx.lineTo(w * 0.88, 0); ctx.lineTo(w * 0.98, h * 0.78); ctx.lineTo(w, h * 0.8); ctx.fill();
      ctx.fillRect(0, 0, w, h * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.8); ctx.quadraticCurveTo(w / 2, h * 0.7, w, h * 0.8); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
      glow(ctx, w * 0.3, h * 0.86, h * 0.05, "rgba(90,200,255,0.5)");
    },
  };
}

// ---------------------------------------------------------------- fireplace
function fireplace(): Scene {
  let w = 0, h = 0;
  interface P { x: number; y: number; vx: number; vy: number; life: number; max: number }
  let parts: P[] = [];
  const r = rng(42);
  const flakes = makeFlakes(90, 5);
  let last = 0;
  return {
    resize(W, H) { w = W; h = H; parts = []; },
    draw(ctx, t) {
      const dt = Math.min(0.05, Math.max(0, t - last)); last = t;
      const flick = 0.8 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04 + Math.sin(t * 3.1) * 0.08;
      ctx.fillStyle = "#0c0705";
      ctx.fillRect(0, 0, w, h);
      // window with snow
      const wx = w * 0.06, wy = h * 0.14, ww = w * 0.22, wh = h * 0.42;
      ctx.fillStyle = vGrad(ctx, h, [[0, "#0d1730"], [1, "#24304e"]]);
      ctx.fillRect(wx, wy, ww, wh);
      ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
      ctx.translate(wx, wy); drawSnow(ctx, flakes, ww, wh, t, 0.8, 0.8); ctx.restore();
      ctx.strokeStyle = "#1c120c"; ctx.lineWidth = h * 0.015;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
      // fireplace
      const fx = w * 0.42, fy = h * 0.3, fw = w * 0.46, fh = h * 0.6;
      ctx.fillStyle = "#3a2218";
      ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = "#4a2c1f";
      ctx.fillRect(fx - w * 0.03, fy - h * 0.05, fw + w * 0.06, h * 0.06);
      // bricks
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
      for (let y = fy; y < fy + fh; y += h * 0.04) {
        ctx.beginPath(); ctx.moveTo(fx, y); ctx.lineTo(fx + fw, y); ctx.stroke();
      }
      const ox = fx + fw * 0.14, oy = fy + fh * 0.22, ow = fw * 0.72, oh = fh * 0.78;
      ctx.fillStyle = "#050302";
      ctx.beginPath();
      ctx.moveTo(ox, oy + oh); ctx.lineTo(ox, oy + ow * 0.25); ctx.quadraticCurveTo(ox + ow / 2, oy - ow * 0.15, ox + ow, oy + ow * 0.25); ctx.lineTo(ox + ow, oy + oh);
      ctx.fill();
      // flames
      const baseY = oy + oh * 0.86;
      for (let i = 0; i < 6; i++) {
        parts.push({ x: ox + ow * (0.2 + r() * 0.6), y: baseY, vx: (r() - 0.5) * w * 0.02, vy: -h * (0.15 + r() * 0.2), life: 0, max: 0.6 + r() * 0.7 });
      }
      ctx.globalCompositeOperation = "lighter";
      parts = parts.filter((p) => (p.life += dt) < p.max);
      for (const p of parts) {
        p.x += p.vx * dt + Math.sin(t * 6 + p.max * 10) * w * 0.0008;
        p.y += p.vy * dt;
        const k = p.life / p.max;
        const size = h * 0.05 * (1 - k);
        const col = k < 0.3 ? "rgba(255,230,150,0.9)" : k < 0.6 ? "rgba(255,140,40,0.7)" : "rgba(200,50,20,0.5)";
        glow(ctx, p.x, p.y, size * 2, col, 0.6);
      }
      ctx.globalCompositeOperation = "source-over";
      // logs
      ctx.fillStyle = "#1e110a";
      ctx.save(); ctx.translate(ox + ow / 2, baseY + h * 0.01); ctx.rotate(0.12);
      ctx.fillRect(-ow * 0.32, -h * 0.02, ow * 0.64, h * 0.04); ctx.rotate(-0.24);
      ctx.fillRect(-ow * 0.3, -h * 0.01, ow * 0.6, h * 0.04); ctx.restore();
      glow(ctx, ox + ow / 2, baseY, ow * 0.4, "rgba(255,120,30,0.5)", flick);
      // room light
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, fx + fw / 2, fy + fh * 0.7, w * 0.9, "rgba(255,110,30,0.22)", flick);
      ctx.globalCompositeOperation = "source-over";
      // floor + blanket edge in foreground
      ctx.fillStyle = "#120a06";
      ctx.beginPath(); ctx.moveTo(0, h * 0.92); ctx.quadraticCurveTo(w * 0.4, h * 0.84, w * 0.7, h * 0.95); ctx.lineTo(w * 0.7, h); ctx.lineTo(0, h); ctx.fill();
    },
  };
}

// ---------------------------------------------------------------- neon city
function neonCity(): Scene {
  let w = 0, h = 0;
  const neon = ["#ff2bd6", "#22e6ff", "#8b5cff", "#ff4a6e", "#3dffb4"];
  const layers = [0, 1, 2].map((L) => {
    const r = rng(500 + L);
    let x = 0;
    const b: { x: number; w: number; h: number; sign: number; win: number }[] = [];
    while (x < 2) { const bw = 0.05 + r() * 0.08; b.push({ x, w: bw, h: 0.25 + r() * (0.35 + L * 0.15), sign: r(), win: r() }); x += bw + r() * 0.01; }
    return b;
  });
  const cars = Array.from({ length: 10 }, (_, i) => { const r = rng(700 + i); return { y: 0.12 + r() * 0.35, sp: 0.03 + r() * 0.08, off: r(), dir: r() > 0.5 ? 1 : -1, c: r() > 0.5 ? "#ff5a5a" : "#ffffff" }; });
  const rain = Array.from({ length: 160 }, (_, i) => { const r = rng(900 + i); return { x: r(), y: r(), s: 0.6 + r() }; });
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      const ground = h * 0.7;
      ctx.fillStyle = vGrad(ctx, h, [[0, "#07020f"], [0.5, "#1a0a33"], [0.7, "#2b1048"], [1, "#05020a"]]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w * 0.5, ground, w * 0.7, "rgba(255,40,200,0.18)");
      layers.forEach((layer, L) => {
        const par = (t * 0.004 * (L + 1)) % 1;
        const shade = ["#120822", "#0c0518", "#06030c"][L];
        for (const b of layer) {
          const x = (((b.x - par) % 2) + 2) % 2 - 0.5;
          if (x > 1.1 || x + b.w < -0.1) continue;
          const bx = x * w, bw = b.w * w, bh = b.h * h;
          ctx.fillStyle = shade;
          ctx.fillRect(bx, ground - bh, bw, bh);
          // windows
          ctx.fillStyle = L === 2 ? "rgba(120,220,255,0.35)" : "rgba(180,140,255,0.2)";
          for (let wy = ground - bh + 6; wy < ground - 4; wy += h * 0.025) {
            for (let wx = bx + 3; wx < bx + bw - 3; wx += w * 0.012) {
              if (Math.sin(wx * 13.1 + wy * 7.7 + b.win * 50) > 0.35) ctx.fillRect(wx, wy, w * 0.005, h * 0.008);
            }
          }
          if (b.sign > 0.55 && L > 0) {
            const c = neon[Math.floor(b.sign * 100) % neon.length];
            const on = Math.sin(t * 7 + b.sign * 40) > -0.85 ? 1 : 0.2;
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = c; ctx.globalAlpha = on;
            ctx.fillRect(bx + bw * 0.4, ground - bh * 0.8, bw * 0.12, bh * 0.35);
            ctx.globalAlpha = 1;
            glow(ctx, bx + bw * 0.46, ground - bh * 0.62, bw * 0.9, c, 0.35 * on);
            ctx.globalCompositeOperation = "source-over";
          }
        }
      });
      // flying traffic
      ctx.globalCompositeOperation = "lighter";
      for (const c of cars) {
        const x = (((c.off + t * c.sp * c.dir) % 1) + 1) % 1 * w;
        glow(ctx, x, c.y * h, h * 0.02, c.c, 0.9);
        ctx.fillStyle = c.c; ctx.fillRect(x - w * 0.02 * c.dir, c.y * h - 0.5, w * 0.02 * c.dir, 1);
      }
      ctx.globalCompositeOperation = "source-over";
      // wet street reflection
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.translate(0, ground * 2);
      ctx.scale(1, -1);
      const R = h - ground;
      ctx.drawImage(ctx.canvas, 0, ground - R, w, R, 0, ground - R, w, R);
      ctx.restore();
      ctx.fillStyle = "rgba(5,2,10,0.55)";
      ctx.fillRect(0, ground, w, h - ground);
      // rain
      ctx.strokeStyle = "rgba(200,220,255,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of rain) {
        const y = ((d.y + t * 0.9 * d.s) % 1) * h, x = ((d.x + t * 0.05) % 1) * w;
        ctx.moveTo(x, y); ctx.lineTo(x - 2, y + h * 0.03 * d.s);
      }
      ctx.stroke();
    },
  };
}

// ---------------------------------------------------------------- fog drive
function fogDrive(): Scene {
  let w = 0, h = 0;
  const trees = Array.from({ length: 16 }, (_, i) => { const r = rng(1100 + i); return { side: i % 2 ? 1 : -1, z0: (i / 16) * 40, off: 5 + r() * 6, hgt: 6 + r() * 6 }; });
  const dew = Array.from({ length: 140 }, (_, i) => { const r = rng(1300 + i); return { x: r(), y: r() * 0.7, s: 0.5 + r() * 1.6 }; });
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      const horizon = h * 0.5, f = h * 0.8;
      ctx.fillStyle = vGrad(ctx, h, [[0, "#8d939c"], [0.5, "#c4c8ce"], [0.51, "#9a9ea4"], [1, "#55595f"]]);
      ctx.fillRect(0, 0, w, h);
      // road
      ctx.fillStyle = "#6a6e74";
      ctx.beginPath(); ctx.moveTo(w * 0.48, horizon); ctx.lineTo(w * 0.52, horizon); ctx.lineTo(w * 1.1, h); ctx.lineTo(-w * 0.1, h); ctx.fill();
      // dashes
      ctx.fillStyle = "rgba(235,235,225,0.8)";
      for (let i = 0; i < 12; i++) {
        const z = ((i * 4 - t * 6) % 48 + 48) % 48 + 1.5;
        const y1 = horizon + (1.4 / z) * f, y2 = horizon + (1.4 / (z + 1.5)) * f;
        const half = (0.08 / z) * f;
        ctx.globalAlpha = Math.min(1, 6 / z);
        ctx.fillRect(w / 2 - half, y2, half * 2, y1 - y2);
      }
      ctx.globalAlpha = 1;
      // trees fading into fog
      const ts = trees.map((tr) => ({ tr, z: ((tr.z0 - t * 6) % 40 + 40) % 40 + 2 })).sort((a, b) => b.z - a.z);
      for (const { tr, z } of ts) {
        const sx = w / 2 + ((tr.side * tr.off) / z) * f;
        const base = horizon + (1.4 / z) * f, top = horizon - ((tr.hgt - 1.4) / z) * f;
        const fog = Math.min(1, z / 30);
        ctx.fillStyle = `rgba(${40 + fog * 150},${44 + fog * 150},${48 + fog * 150},${1 - fog * 0.7})`;
        const tw = (2.2 / z) * f;
        ctx.beginPath(); ctx.moveTo(sx, top); ctx.lineTo(sx + tw, base); ctx.lineTo(sx - tw, base); ctx.fill();
      }
      // fog bands
      for (let i = 0; i < 4; i++) {
        const y = horizon + Math.sin(t * 0.2 + i) * h * 0.04 - h * 0.08 + i * h * 0.05;
        ctx.fillStyle = vGrad(ctx, h, [[Math.max(0, (y - h * 0.15) / h), "rgba(210,214,220,0)"], [y / h, "rgba(210,214,220,0.45)"], [Math.min(1, (y + h * 0.15) / h), "rgba(210,214,220,0)"]]);
        ctx.fillRect(0, 0, w, h);
      }
      // dew on windshield
      for (const d of dew) {
        const x = d.x * w, y = d.y * h, s = d.s * h * 0.006;
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(x - s * 0.3, y - s * 0.5, s * 0.35, s * 0.35);
      }
      // tint + interior
      ctx.fillStyle = "rgba(20,22,26,0.22)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#0b0c0e";
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.1, 0); ctx.lineTo(w * 0.01, h * 0.75); ctx.lineTo(0, h * 0.75); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w * 0.9, 0); ctx.lineTo(w * 0.99, h * 0.75); ctx.lineTo(w, h * 0.75); ctx.fill();
      ctx.fillRect(0, 0, w, h * 0.05);
      ctx.beginPath(); ctx.moveTo(0, h * 0.78); ctx.quadraticCurveTo(w / 2, h * 0.7, w, h * 0.78); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
      // steering wheel (left-hand drive)
      ctx.strokeStyle = "#16171a"; ctx.lineWidth = h * 0.035;
      ctx.beginPath(); ctx.arc(w * 0.3, h * 1.05, h * 0.26, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      // rearview mirror with the driver's eyes + face tat
      const mx = w * 0.5, my = h * 0.12, mw = w * 0.22, mh = h * 0.1;
      ctx.fillStyle = "#0b0c0e"; ctx.fillRect(mx - 2, 0, 4, my - mh / 2);
      ctx.fillStyle = "#111215";
      roundRect(ctx, mx - mw / 2 - 3, my - mh / 2 - 3, mw + 6, mh + 6, mh * 0.35); ctx.fill();
      ctx.save();
      roundRect(ctx, mx - mw / 2, my - mh / 2, mw, mh, mh * 0.3); ctx.clip();
      ctx.fillStyle = "#3b3c40"; ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
      const look = Math.sin(t * 0.35) * mw * 0.03;
      ctx.fillStyle = "#6e5646"; ctx.fillRect(mx - mw * 0.32 + look, my - mh / 2, mw * 0.64, mh);
      ctx.fillStyle = "#1a1412"; ctx.fillRect(mx - mw * 0.34 + look, my - mh / 2, mw * 0.68, mh * 0.18);
      const blink = (t % 4.2) < 0.12 ? 0.15 : 1;
      for (const ex of [-0.13, 0.13]) {
        ctx.fillStyle = "#e9e2dc";
        ctx.beginPath(); ctx.ellipse(mx + mw * ex + look, my - mh * 0.02, mw * 0.05, mh * 0.08 * blink, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#1b120e";
        ctx.beginPath(); ctx.arc(mx + mw * ex + look * 1.4, my - mh * 0.02, mh * 0.06 * blink, 0, 6.283); ctx.fill();
        ctx.fillStyle = "#2a1f1a"; ctx.fillRect(mx + mw * ex - mw * 0.06 + look, my - mh * 0.2, mw * 0.12, mh * 0.05);
      }
      // teardrop + script tat under the left eye
      ctx.fillStyle = "#151617";
      const tx = mx - mw * 0.15 + look, ty = my + mh * 0.18;
      ctx.beginPath(); ctx.moveTo(tx, ty - mh * 0.07); ctx.quadraticCurveTo(tx + mh * 0.05, ty, tx, ty + mh * 0.04); ctx.quadraticCurveTo(tx - mh * 0.05, ty, tx, ty - mh * 0.07); ctx.fill();
      ctx.strokeStyle = "#151617"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx + mw * 0.06 + look, my + mh * 0.25); ctx.bezierCurveTo(mx + mw * 0.1 + look, my + mh * 0.15, mx + mw * 0.14 + look, my + mh * 0.32, mx + mw * 0.2 + look, my + mh * 0.2); ctx.stroke();
      ctx.restore();
    },
  };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------------------------------------------------------- golden coast
function goldenCoast(): Scene {
  let w = 0, h = 0;
  const glints = Array.from({ length: 90 }, (_, i) => { const r = rng(1500 + i); return { x: r(), y: r(), ph: r() * 6 }; });
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      const sea = h * 0.58;
      ctx.fillStyle = vGrad(ctx, h, [[0, "#2b2a5e"], [0.3, "#c2577a"], [0.5, "#ffad5c"], [0.58, "#ffd38a"], [0.59, "#c0604f"], [1, "#2a1d3a"]]);
      ctx.fillRect(0, 0, w, h);
      const sx = w * 0.6, sy = sea - h * 0.06 + Math.sin(t * 0.1) * h * 0.005;
      glow(ctx, sx, sy, h * 0.5, "rgba(255,200,120,0.5)");
      ctx.fillStyle = "#fff1c8"; ctx.beginPath(); ctx.arc(sx, sy, h * 0.07, Math.PI, 0); ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      for (const g of glints) {
        const y = sea + g.y * (h - sea);
        const spread = (y - sea) / (h - sea);
        const x = sx + (g.x - 0.5) * w * (0.1 + spread * 0.8);
        const a = Math.max(0, Math.sin(t * 2 + g.ph)) * (1 - spread * 0.6);
        ctx.fillStyle = `rgba(255,220,150,${a * 0.8})`;
        ctx.fillRect(x, y, w * 0.02 * (0.3 + spread), 1.5);
      }
      ctx.globalCompositeOperation = "source-over";
      // palms
      const palm = (px: number, ph: number, lean: number) => {
        ctx.strokeStyle = "#140b14"; ctx.lineWidth = h * 0.018; ctx.lineCap = "round";
        const topX = px + lean, topY = h - ph;
        ctx.beginPath(); ctx.moveTo(px, h); ctx.quadraticCurveTo(px + lean * 0.2, h - ph * 0.5, topX, topY); ctx.stroke();
        ctx.lineWidth = h * 0.008;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI + (i / 6) * Math.PI + Math.sin(t * 0.8 + i) * 0.05;
          const len = h * 0.16;
          ctx.beginPath(); ctx.moveTo(topX, topY);
          ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.6, topY + Math.sin(a) * len * 0.3 - h * 0.03, topX + Math.cos(a) * len, topY + Math.abs(Math.sin(a)) * len * 0.1 + h * 0.04);
          ctx.stroke();
        }
      };
      palm(w * 0.12, h * 0.75, w * 0.06);
      palm(w * 0.88, h * 0.6, -w * 0.05);
      ctx.fillStyle = "#140b14"; ctx.fillRect(0, h * 0.93, w, h * 0.07);
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, w * 0.42, h * 0.42, h * 0.05, "rgba(255,180,120,0.4)");
      glow(ctx, w * 0.3, h * 0.3, h * 0.03, "rgba(160,120,255,0.3)");
      ctx.globalCompositeOperation = "source-over";
    },
  };
}

// ---------------------------------------------------------------- rain window
function rainWindow(): Scene {
  let w = 0, h = 0;
  const bokeh = Array.from({ length: 40 }, (_, i) => { const r = rng(1700 + i); return { x: r(), y: 0.3 + r() * 0.5, r: 0.02 + r() * 0.05, c: ["255,170,80", "255,80,90", "120,180,255", "255,230,180"][Math.floor(r() * 4)], ph: r() * 6 }; });
  const drops = Array.from({ length: 60 }, (_, i) => { const r = rng(1900 + i); return { x: r(), y: r(), sp: 0.02 + r() * 0.08, s: 0.5 + r() }; });
  const beads = Array.from({ length: 200 }, (_, i) => { const r = rng(2100 + i); return { x: r(), y: r(), s: 0.3 + r() * 0.7 }; });
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      ctx.fillStyle = vGrad(ctx, h, [[0, "#070a14"], [1, "#151a2a"]]);
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const b of bokeh) {
        const a = 0.25 + 0.15 * Math.sin(t * 0.8 + b.ph);
        glow(ctx, b.x * w, b.y * h, b.r * h * 2, `rgba(${b.c},${a})`);
      }
      ctx.globalCompositeOperation = "source-over";
      for (const b of beads) {
        ctx.fillStyle = `rgba(190,210,255,${0.12 * b.s})`;
        ctx.beginPath(); ctx.arc(b.x * w, b.y * h, b.s * h * 0.005, 0, 6.283); ctx.fill();
      }
      for (const d of drops) {
        const y = ((d.y + t * d.sp) % 1.1) * h;
        const x = d.x * w + Math.sin(y * 0.05 + d.x * 30) * 2;
        const s = d.s * h * 0.008;
        ctx.strokeStyle = "rgba(200,215,255,0.12)"; ctx.lineWidth = s * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y - h * 0.15 * d.s); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = "rgba(220,230,255,0.4)";
        ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill();
      }
      // window frame + sill + lamp glow
      ctx.fillStyle = "#06070b";
      ctx.fillRect(0, 0, w, h * 0.04); ctx.fillRect(0, h * 0.86, w, h * 0.14);
      ctx.fillRect(w * 0.49, 0, w * 0.02, h * 0.86);
      ctx.fillRect(0, 0, w * 0.03, h); ctx.fillRect(w * 0.97, 0, w * 0.03, h);
      glow(ctx, w * 0.92, h * 0.95, h * 0.5, "rgba(255,170,90,0.25)");
      ctx.fillStyle = "#1a120c"; ctx.fillRect(w * 0.1, h * 0.8, w * 0.07, h * 0.06);
    },
  };
}

// ---------------------------------------------------------------- club
function club(): Scene {
  let w = 0, h = 0;
  const heads = Array.from({ length: 26 }, (_, i) => { const r = rng(2300 + i); return { x: i / 26 + r() * 0.03, s: 0.8 + r() * 0.5, ph: r() * 6, row: r() > 0.5 ? 1 : 0 }; });
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * (126 / 60) / 2)), 8);
      ctx.fillStyle = "#040208"; ctx.fillRect(0, 0, w, h);
      glow(ctx, w / 2, h * 0.2, w * 0.8, `rgba(120,40,255,${0.2 + beat * 0.2})`);
      ctx.globalCompositeOperation = "lighter";
      const colors = ["rgba(80,255,170,", "rgba(255,40,140,", "rgba(90,160,255,"];
      for (let i = 0; i < 9; i++) {
        const a = Math.sin(t * 0.6 + i * 0.9) * 0.9 + Math.PI / 2;
        const ox = w * (0.15 + (i % 3) * 0.35), oy = -h * 0.02;
        ctx.strokeStyle = colors[i % 3] + (0.35 + beat * 0.4) + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a) * h * 1.6, oy + Math.sin(a) * h * 1.6); ctx.stroke();
      }
      // haze
      ctx.fillStyle = `rgba(160,120,255,${0.05 + beat * 0.08})`; ctx.fillRect(0, 0, w, h);
      if (beat > 0.9 && Math.floor(t * 4) % 4 === 0) { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(0, 0, w, h); }
      ctx.globalCompositeOperation = "source-over";
      // crowd
      for (const hd of heads.sort((a, b) => a.row - b.row)) {
        const bob = Math.abs(Math.sin(t * Math.PI * (126 / 60) + hd.ph)) * h * 0.025;
        const x = hd.x * w, base = h * (hd.row ? 1.02 : 0.95), r = h * 0.06 * hd.s * (hd.row ? 1.3 : 1);
        ctx.fillStyle = hd.row ? "#000" : "#0a0612";
        ctx.beginPath(); ctx.arc(x, base - r * 2.6 - bob, r, 0, 6.283); ctx.fill();
        ctx.fillRect(x - r * 1.6, base - r * 1.7 - bob, r * 3.2, r * 3);
        if (hd.ph > 4.8) { ctx.fillRect(x + r * 0.8, base - r * 5 - bob * 2, r * 0.45, r * 3); }
      }
    },
  };
}

// ---------------------------------------------------------------- treehouse
function treehouse(): Scene {
  let w = 0, h = 0;
  const leaves = Array.from({ length: 22 }, (_, i) => { const r = rng(2500 + i); return { x: r(), y: 0.35 + r() * 0.45, r: 0.06 + r() * 0.1, d: r(), ph: r() * 6 }; });
  const flies = Array.from({ length: 18 }, (_, i) => { const r = rng(2700 + i); return { x: r(), y: 0.4 + r() * 0.4, ph: r() * 6, sp: 0.3 + r() * 0.6 }; });
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      // view through the doorway
      const dx = w * 0.2, dy = h * 0.12, dw = w * 0.6, dh = h * 0.7;
      ctx.fillStyle = vGrad(ctx, h, [[0, "#2c2350"], [0.35, "#8a4f7d"], [0.6, "#f19a5c"], [0.8, "#ffcf8a"]]);
      ctx.fillRect(0, 0, w, h);
      glow(ctx, w * 0.62, h * 0.62, h * 0.4, "rgba(255,190,120,0.6)");
      for (const l of leaves) {
        const sway = Math.sin(t * 0.6 + l.ph) * w * 0.006;
        const shade = Math.round(20 + l.d * 30);
        ctx.fillStyle = `rgb(${shade + 10},${shade},${shade + 20})`;
        ctx.beginPath(); ctx.arc(l.x * w + sway, l.y * h + h * 0.15, l.r * h, 0, 6.283); ctx.fill();
      }
      ctx.globalCompositeOperation = "lighter";
      for (const f of flies) {
        const a = Math.max(0, Math.sin(t * f.sp * 2 + f.ph));
        const x = (f.x + Math.sin(t * 0.2 * f.sp + f.ph) * 0.03) * w, y = (f.y + Math.cos(t * 0.3 * f.sp + f.ph) * 0.03) * h;
        glow(ctx, x, y, h * 0.02, "rgba(230,255,140,0.9)", a);
      }
      ctx.globalCompositeOperation = "source-over";
      // plank walls around the doorway
      ctx.fillStyle = "#2a170d";
      ctx.fillRect(0, 0, dx, h); ctx.fillRect(dx + dw, 0, w - dx - dw, h); ctx.fillRect(0, 0, w, dy);
      ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += w * 0.045) {
        if (x > dx && x < dx + dw) continue;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,160,90,0.12)"; ctx.fillRect(dx - w * 0.03, dy, w * 0.03, dh); ctx.fillRect(dx + dw, dy, w * 0.03, dh);
      // fairy lights along the top of the doorway
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i <= 14; i++) {
        const u = i / 14, x = dx + u * dw, y = dy + Math.sin(u * Math.PI) * h * 0.05 + h * 0.01;
        const tw = 0.7 + 0.3 * Math.sin(t * 2 + i);
        glow(ctx, x, y, h * 0.025, "rgba(255,210,140,1)", tw);
      }
      ctx.globalCompositeOperation = "source-over";
      // floor
      ctx.fillStyle = "#3a2214";
      ctx.beginPath(); ctx.moveTo(0, h * 0.82); ctx.lineTo(w, h * 0.82); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
      ctx.fillStyle = "#4b2c19"; ctx.fillRect(dx, dy + dh, dw, h * 0.02);
      // your feet hanging off the edge, kicking
      const foot = (bx: number, ph: number) => {
        const kick = Math.sin(t * 2.2 + ph) * 0.35;
        ctx.save(); ctx.translate(bx, h * 0.83); ctx.rotate(kick);
        ctx.fillStyle = "#2b3550"; ctx.fillRect(-w * 0.025, 0, w * 0.05, h * 0.09);
        ctx.fillStyle = "#f2efe8"; roundRect(ctx, -w * 0.03, h * 0.08, w * 0.065, h * 0.05, h * 0.02); ctx.fill();
        ctx.fillStyle = "#c33"; ctx.fillRect(-w * 0.03, h * 0.115, w * 0.065, h * 0.012);
        ctx.restore();
      };
      foot(w * 0.44, 0); foot(w * 0.56, 1.7);
      // legs coming from the bottom of frame
      ctx.fillStyle = "#24304a";
      ctx.beginPath(); ctx.moveTo(w * 0.36, h); ctx.lineTo(w * 0.42, h * 0.84); ctx.lineTo(w * 0.47, h * 0.84); ctx.lineTo(w * 0.47, h); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.53, h); ctx.lineTo(w * 0.53, h * 0.84); ctx.lineTo(w * 0.58, h * 0.84); ctx.lineTo(w * 0.64, h); ctx.fill();
    },
  };
}

// ---------------------------------------------------------------- vintage film
function vintageFilm(): Scene {
  let w = 0, h = 0;
  const dust = rng(2900);
  return {
    resize(W, H) { w = W; h = H; },
    draw(ctx, t) {
      const frame = Math.floor(t * 18); // 18fps home-movie cadence
      const fr = rng(frame + 1);
      const weaveX = (fr() - 0.5) * w * 0.006, weaveY = (fr() - 0.5) * h * 0.01;
      ctx.fillStyle = "#120806"; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(weaveX, weaveY);
      // red & white gingham backdrop
      const sq = h * 0.07;
      for (let y = 0; y < h + sq; y += sq) for (let x = 0; x < w + sq; x += sq) {
        const a = Math.floor(x / sq) % 2, b = Math.floor(y / sq) % 2;
        ctx.fillStyle = a && b ? "#a8281f" : a || b ? "#d8857a" : "#f1e3d0";
        ctx.fillRect(x, y, sq, sq);
      }
      // her, from the shoulders up, slowly turning toward the camera
      const turn = (Math.sin(t * 0.5) + 1) / 2; // 0 profile → 1 facing
      const cx = w * 0.5 + Math.sin(t * 0.3) * w * 0.02, cy = h * 0.5;
      const hr = h * 0.17;
      // hair (ginger), behind head
      ctx.fillStyle = "#c4561f";
      ctx.beginPath(); ctx.ellipse(cx - hr * 0.2 * (1 - turn), cy + hr * 0.4, hr * 1.25, hr * 1.6, 0, 0, 6.283); ctx.fill();
      // shoulders in a red-and-white striped top
      ctx.save();
      ctx.beginPath(); ctx.ellipse(cx, h * 1.02, w * 0.28, h * 0.32, 0, Math.PI, 0); ctx.clip();
      for (let y = h * 0.68; y < h; y += h * 0.035) { ctx.fillStyle = Math.floor(y / (h * 0.035)) % 2 ? "#b52a22" : "#f4ece0"; ctx.fillRect(cx - w * 0.3, y, w * 0.6, h * 0.035); }
      ctx.restore();
      ctx.fillStyle = "#efc3a4"; ctx.fillRect(cx - hr * 0.3, cy + hr * 0.7, hr * 0.6, hr * 0.7);
      // face
      const fw = hr * (0.6 + turn * 0.25);
      ctx.fillStyle = "#f3c9aa";
      ctx.beginPath(); ctx.ellipse(cx + (1 - turn) * hr * 0.35, cy, fw, hr, 0, 0, 6.283); ctx.fill();
      // bangs + side hair in front
      ctx.fillStyle = "#cf6024";
      ctx.beginPath(); ctx.ellipse(cx + (1 - turn) * hr * 0.2, cy - hr * 0.75, hr * 1.05, hr * 0.45, 0, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - hr * 0.95, cy + hr * 0.3, hr * 0.3, hr * 1.1, 0.1, 0, 6.283); ctx.fill();
      // simple features, fading in as she turns
      ctx.globalAlpha = 0.3 + turn * 0.7;
      ctx.fillStyle = "#4a2a1e";
      const ex = cx + (1 - turn) * hr * 0.5;
      ctx.beginPath(); ctx.arc(ex - fw * 0.35 * turn, cy - hr * 0.05, hr * 0.06, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + fw * 0.35, cy - hr * 0.05, hr * 0.06, 0, 6.283); ctx.fill();
      ctx.strokeStyle = "#a8473a"; ctx.lineWidth = Math.max(1, hr * 0.04);
      ctx.beginPath(); ctx.arc(ex + fw * 0.05, cy + hr * 0.35, hr * 0.18 * (0.5 + turn * 0.5), 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = "rgba(230,120,110,0.35)";
      ctx.beginPath(); ctx.arc(ex - fw * 0.45 * turn, cy + hr * 0.2, hr * 0.12, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + fw * 0.5, cy + hr * 0.2, hr * 0.12, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      // faded warm film stock + flicker
      const flick = 0.06 + fr() * 0.08;
      ctx.fillStyle = `rgba(255,190,120,${0.18 + flick})`; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(40,10,0,${0.12 + fr() * 0.06})`; ctx.fillRect(0, 0, w, h);
      // light leak
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, w * (0.9 + Math.sin(t * 0.4) * 0.05), h * 0.2, h * 0.8, "rgba(255,90,40,0.35)");
      ctx.globalCompositeOperation = "source-over";
      // scratches and dust
      ctx.strokeStyle = "rgba(255,245,230,0.35)"; ctx.lineWidth = 1;
      const n = Math.floor(fr() * 3);
      for (let i = 0; i < n; i++) { const x = fr() * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (fr() - 0.5) * 4, h); ctx.stroke(); }
      ctx.fillStyle = "rgba(20,10,5,0.6)";
      for (let i = 0; i < 6; i++) { if (dust() > 0.6) { ctx.beginPath(); ctx.arc(fr() * w, fr() * h, 0.5 + fr() * 1.5, 0, 6.283); ctx.fill(); } }
      // sprocket edge
      ctx.fillStyle = "#0a0503"; ctx.fillRect(0, 0, w * 0.045, h);
      ctx.fillStyle = "rgba(255,230,200,0.5)";
      const off = (t * 18 % 1) * h * 0.16;
      for (let y = -h * 0.16 + off; y < h; y += h * 0.16) { roundRect(ctx, w * 0.01, y, w * 0.022, h * 0.08, 2); ctx.fill(); }
    },
  };
}

const FACTORIES: Record<VibeId, () => Scene> = {
  snowfall,
  "lights-drive": lightsDrive,
  fireplace,
  "neon-city": neonCity,
  "fog-drive": fogDrive,
  "golden-coast": goldenCoast,
  "rain-window": rainWindow,
  club,
  treehouse,
  "vintage-film": vintageFilm,
};

export function createScene(id: VibeId): Scene {
  return FACTORIES[id]();
}
