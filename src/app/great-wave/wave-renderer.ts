export const WIDTH = 1500;
export const HEIGHT = 1000;

interface Pt {
  x: number;
  y: number;
}

/** A sampled curve point with its unit tangent and inward normal (body lies to the right of travel). */
interface Frame extends Pt {
  tx: number;
  ty: number;
  nx: number;
  ny: number;
}

interface WaveState {
  t: number;
  seed: number;
  /** Seed for the wave's silhouette; changes every cycle. */
  shape: number;
  depth: number;
  /** 0 = flat swell, 1 = fully risen wave. */
  rise: number;
  /** 0..1 progress of the fractal foam explosion. */
  grow: number;
  /** 0..1 fade/fall of the spray at the end of a cycle. */
  dissolve: number;
  /** Foam opacity. */
  foam: number;
  /** Cycle phase, 0..1. */
  phase: number;
  /** Whole-wave opacity: the wave fades in and out at the ends of its cycle. */
  alpha: number;
}

const INK = '#0f2547';
const FOAM = '#f8f2de';

// Control points of the great wave in design space (fully risen).
const BACK: Pt[] = [
  { x: -160, y: 1010 }, { x: -20, y: 820 }, { x: 110, y: 610 }, { x: 250, y: 420 },
  { x: 400, y: 270 }, { x: 560, y: 190 }, { x: 700, y: 168 }, { x: 810, y: 200 },
  { x: 890, y: 270 }, { x: 930, y: 350 }, { x: 925, y: 420 },
];
const UNDER: Pt[] = [
  { x: 925, y: 420 }, { x: 895, y: 385 }, { x: 830, y: 335 }, { x: 740, y: 315 },
  { x: 650, y: 335 }, { x: 595, y: 400 }, { x: 570, y: 490 }, { x: 572, y: 590 },
  { x: 610, y: 690 }, { x: 680, y: 780 }, { x: 780, y: 860 }, { x: 880, y: 930 },
  { x: 980, y: 1010 },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const x = clamp((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (seed: number, k: number) => (Math.imul(seed, 31) + k * 977 + 13) | 0;

/** Cheap animated fractal noise: four octaves of sines. */
function fbm(x: number, t: number) {
  let s = 0;
  let amp = 1;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    s += amp * Math.sin(x * freq + i * 1.7 + t * (0.6 + i * 0.3));
    amp *= 0.5;
    freq *= 2.1;
  }
  return s / 1.875;
}

function spline(pts: Pt[], per: number): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, c2: number, d: number) =>
        0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
      out.push({ x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  out.push(pts[n - 1]);
  return out;
}

function frames(pts: Pt[]): Frame[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(i - 1, 0)];
    const b = pts[Math.min(i + 1, pts.length - 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return { x: p.x, y: p.y, tx, ty, nx: -ty, ny: tx };
  });
}

function mix(c1: number[], c2: number[], t: number) {
  return `rgb(${lerp(c1[0], c2[0], t) | 0},${lerp(c1[1], c2[1], t) | 0},${lerp(c1[2], c2[2], t) | 0})`;
}

export interface WaveOptions {
  /** Recursion depth of the foam tendrils. */
  depth: number;
  /** Number of loose spray droplets per wave. */
  spray: number;
  /** Number of background waves, or -1 to pick randomly each cycle. */
  bgWaves: number;
  /** 0 = identical waves every cycle, 1 = default variation, up to 1.5 = wild. */
  chaos: number;
  swells: boolean;
  boats: boolean;
  overrides: Record<string, WaveOverride>;
}

export const DEFAULT_OPTIONS: WaveOptions = { depth: 3, spray: 22, bgWaves: -1, chaos: 1, swells: true, boats: true, overrides: {} };

/** Per-wave user overrides set from the arrow overlay. */
export interface WaveOverride {
  /** 1 = rolls to the right, -1 = rolls to the left (the wave is mirrored). */
  dir: 1 | -1;
  /** Travel speed multiplier. */
  speed: number;
}

/** Where a wave is on screen this frame, for the interactive overlay. Positions are device pixels. */
export interface WaveMarker {
  id: string;
  label: string;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  alpha: number;
}

export class WaveRenderer {
  private paper?: CanvasPattern;
  private opts = DEFAULT_OPTIONS;
  /** Rebuilt on every render. */
  markers: WaveMarker[] = [];

  private ov(id: string): WaveOverride {
    return this.opts.overrides[id] ?? { dir: 1, speed: 1 };
  }

  /** Maps a cycle phase (0..1) to the state of one wave. */
  static state(phase: number, t: number, seed: number, depth: number, shape = seed): WaveState {
    const p = phase;
    const grow = p < 0.34 ? 0.12 + 0.18 * smooth(0, 0.34, p) : 0.3 + 0.7 * easeOutCubic(clamp((p - 0.34) / 0.3));
    return {
      t, seed, shape, depth, grow,
      rise: smooth(0, 0.4, p) * (1 - smooth(0.86, 1, p)),
      dissolve: smooth(0.84, 1, p),
      foam: smooth(0, 0.06, p) * (1 - smooth(0.9, 1, p)),
      phase: p,
      alpha: smooth(0, 0.1, p) * (1 - smooth(0.9, 1, p)),
    };
  }

  render(ctx: CanvasRenderingContext2D, phase: number, t: number, opts: WaveOptions, cycle = 0) {
    this.opts = opts;
    this.markers = [];
    const depth = opts.depth;
    const main = WaveRenderer.state(phase, t, 11 + cycle * 101, depth, cycle * 7919 + 3);
    const lr = mulberry32(cycle * 4421 + 9);
    const mainDx = lerp(-140, 90, lr());
    const mainScale = lerp(0.88, 1.08, lr());
    // 1-3 background waves, all rolling the same way as the big one.
    const others = Array.from({ length: opts.bgWaves >= 0 ? opts.bgWaves : 1 + Math.floor(lr() * 3) }, (_, i) => {
      const dir = 1; // always roll the same way as the big wave
      lr();
      const scale = lerp(0.3, 0.6, lr());
      const crest = lerp(dir === 1 ? 800 : 1000, 1400, lr());
      return {
        dir, scale, id: `bg${i}`,
        tx: dir === 1 ? crest - 700 * scale : crest + 700 * scale,
        base: lerp(755, 800, lr()),
        st: WaveRenderer.state((phase + lerp(0.1, 0.5, lr())) % 1, t, 77 + cycle * 53 + i * 19, Math.max(2, depth - 1), cycle * 6271 + 17 + i * 131),
      };
    }).sort((x, y) => x.scale - y.scale);

    this.sky(ctx, t);
    this.mountains(ctx, cycle);
    this.sea(ctx, t);

    for (const o of others) {
      const ov = this.ov(o.id);
      ctx.save();
      if (ov.dir < 0) this.mirror(ctx);
      ctx.translate(o.tx + o.dir * o.scale * 260 * ov.speed * (o.st.phase - 0.5), o.base - 1010 * o.scale);
      ctx.scale(o.dir * o.scale, o.scale);
      this.wave(ctx, o.st, o.id, `Background wave ${+o.id.slice(2) + 1}`);
      ctx.restore();
    }

    if (opts.swells) this.swells(ctx, t, main);

    if (opts.boats) this.boat(ctx, 850, 790 + 4 * Math.sin(t * 1.3), 0.5, t, 0.2);
    if (opts.boats) this.boat(ctx, 1200, 860 + 6 * Math.sin(t * 1.1 + 1), 0.8, t, 1.4);

    const mo = this.ov('main');
    ctx.save();
    if (mo.dir < 0) this.mirror(ctx);
    ctx.translate(260 + mainDx + 240 * mo.speed * (phase - 0.5), 1010);
    ctx.scale(mainScale, mainScale);
    ctx.translate(-260, -1010);
    this.wave(ctx, main, 'main', 'The great wave');
    ctx.restore();
    this.foreground(ctx, t);
    this.finish(ctx);
  }

  /** Flips the scene horizontally about its centre. */
  private mirror(ctx: CanvasRenderingContext2D) {
    ctx.translate(WIDTH, 0);
    ctx.scale(-1, 1);
  }

  // ---------------------------------------------------------------- sky

  private sky(ctx: CanvasRenderingContext2D, t: number) {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT * 0.78);
    g.addColorStop(0, '#e9b94a');
    g.addColorStop(0.4, '#f1cf6e');
    g.addColorStop(1, '#f6e3a4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Layered cloud bands drifting slowly; each is a ragged strip.
    const rng = mulberry32(5);
    for (let i = 0; i < 9; i++) {
      const y = 50 + i * 52 + rng() * 20;
      const w = 360 + rng() * 520;
      const x = rng() * WIDTH - 100 + 30 * Math.sin(t * 0.07 + i);
      const h = 14 + rng() * 22;
      ctx.fillStyle = i % 2 ? 'rgba(214,150,90,0.38)' : 'rgba(250,236,190,0.55)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k <= 24; k++) {
        const u = k / 24;
        ctx.lineTo(x + u * w, y - h * Math.sin(u * Math.PI) ** 0.7 * (0.8 + 0.2 * fbm(k + i * 9, t * 0.2)));
      }
      for (let k = 24; k >= 0; k--) {
        const u = k / 24;
        ctx.lineTo(x + u * w, y + h * 0.35 * Math.sin(u * Math.PI) ** 0.5);
      }
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------- fuji

  /** Fuji plus a couple of paler, randomly placed peaks behind it. */
  private mountains(ctx: CanvasRenderingContext2D, cycle: number) {
    const r = mulberry32(cycle * 3331 + 5);
    const fujiX = lerp(720, 960, r());
    const others = 1 + Math.floor(r() * 2);
    for (let i = 0; i < others; i++) {
      // Keep the extra peaks clear of Fuji's centre so the silhouettes read separately.
      let x = lerp(250, 1400, r());
      if (Math.abs(x - fujiX) < 200) x += x < fujiX ? -260 : 260;
      const hw = lerp(130, 260, r());
      const height = lerp(90, 170, r());
      this.mountain(ctx, x, 770 - height, 770, hw, '#e3e1dc', '#c1c0bd', r() < 0.5, 0.7, hash(cycle, i));
    }
    this.mountain(ctx, fujiX, 565, 770, 240, '#d9d7d2', '#a9a8a5', true, 1, 0);
  }

  private mountain(ctx: CanvasRenderingContext2D, cx: number, top: number, base: number, hw: number, c1: string, c2: string, snow: boolean, jag: number, seed: number) {
    const r = mulberry32(seed);
    const ph = r() * 10;
    const path = new Path2D();
    path.moveTo(cx - hw, base);
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const v = Math.abs(2 * u - 1);
      const rough = jag < 1 ? 6 * Math.sin(u * 23 + ph) * (1 - v) : 0;
      path.lineTo(cx - hw + 2 * hw * u, base - (base - top) * (1 - v) ** 1.7 + rough);
    }
    path.lineTo(cx + hw, base);
    path.closePath();
    const g = ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fill(path);

    // Faint gullies running down the slopes, as in the print.
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = 'rgba(95,95,98,0.3)';
    ctx.lineWidth = 1.5;
    for (let k = -3; k <= 3; k++) {
      const x = cx + k * hw * 0.2 + (r() - 0.5) * 12;
      ctx.beginPath();
      ctx.moveTo(cx + k * hw * 0.05, top + (base - top) * 0.3);
      ctx.quadraticCurveTo(x - k * 6, top + (base - top) * 0.6, x, base - 25);
      ctx.stroke();
    }
    ctx.restore();

    if (snow) {
      const depth = (base - top) * 0.3;
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = '#f6f2e4';
      ctx.beginPath();
      ctx.moveTo(cx - hw, top - 10);
      for (let x = cx - hw; x <= cx + hw; x += 6) {
        const zig = Math.abs((((x + ph * 9) * 0.09) % 2) - 1);
        ctx.lineTo(x, top + depth * 0.7 + depth * 0.25 * zig + 8 * Math.sin(x * 0.13 + ph));
      }
      ctx.lineTo(cx + hw, top - 10);
      ctx.fill();
      ctx.restore();
    }

    // Haze at the foot of the mountain.
    const h = ctx.createLinearGradient(0, base - 70, 0, base);
    h.addColorStop(0, 'rgba(246,227,164,0)');
    h.addColorStop(1, 'rgba(246,227,164,0.9)');
    ctx.fillStyle = h;
    ctx.fillRect(cx - hw - 5, base - 70, hw * 2 + 10, 70);
  }

  // ---------------------------------------------------------------- sea

  private sea(ctx: CanvasRenderingContext2D, t: number) {
    const g = ctx.createLinearGradient(0, 730, 0, HEIGHT);
    g.addColorStop(0, '#2a5f93');
    g.addColorStop(1, '#0b2547');
    ctx.fillStyle = g;
    ctx.fillRect(0, 735, WIDTH, HEIGHT - 735);

    for (let r = 0; r < 18; r++) {
      const v = r / 17;
      const y = 740 + v ** 1.5 * 260;
      const amp = 3 + v * 14;
      const f = 0.02 - v * 0.009;
      ctx.strokeStyle = mix([150, 195, 225], [225, 238, 240], v);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1 + v * 2.2;
      ctx.beginPath();
      for (let x = -20; x <= WIDTH + 20; x += 10) {
        const yy = y + amp * Math.sin(x * f - t * 0.8 * (1 + v) + r) + amp * 0.5 * fbm(x * 0.03 + r * 5, t * 0.5);
        x === -20 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Rolling swells with foam crests and small fractal tendrils. */
  private swells(ctx: CanvasRenderingContext2D, t: number, st: WaveState) {
    const rows = [
      { y: 770, n: 6, w: 210, h: 34 },
      { y: 850, n: 5, w: 300, h: 60 },
    ];
    rows.forEach((row, ri) => {
      const rng = mulberry32(100 + ri);
      const ov = this.ov(`swells${ri}`);
      for (let i = 0; i < row.n; i++) {
        const span = WIDTH + 700;
        const x0 = ((i + rng() * 0.6) / row.n) * span;
        const cx = ((((x0 + ov.dir * ov.speed * t * (14 + ri * 10)) % span) + span) % span) - 350;
        const bob = 5 * Math.sin(t * 0.9 + i * 1.7 + ri * 2);
        ctx.save();
        // Mirror each swell about its own centre so it curls the way it travels.
        ctx.translate(cx, 0);
        ctx.scale(ov.dir, 1);
        ctx.translate(-cx, 0);
        this.swell(ctx, cx, row.y + bob, row.w * (0.8 + rng() * 0.5), row.h * (0.8 + rng() * 0.5), t, 300 + ri * 40 + i, st);
        ctx.restore();
      }
      const m = ctx.getTransform();
      const pt = m.transformPoint({ x: WIDTH * (0.3 + ri * 0.35), y: row.y - 60 });
      this.markers.push({ id: `swells${ri}`, label: ri ? 'Near swells' : 'Far swells', x: pt.x, y: pt.y, dir: ov.dir, speed: ov.speed, alpha: 1 });
    });
  }

  private swell(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number, t: number, seed: number, st: WaveState) {
    const pts: Pt[] = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      // Asymmetric hump: gentle back slope, steeper front.
      const shape = u < 0.7 ? Math.sin((u / 0.7) * Math.PI * 0.5) ** 1.6 : Math.cos(((u - 0.7) / 0.3) * Math.PI * 0.5) ** 0.9;
      pts.push({ x: cx - w * 0.5 + u * w, y: y - h * shape });
    }
    const fr = frames(pts);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    // Skirts spread wider than the crest and fade into the sea, so no hard sides show.
    ctx.lineTo(cx + w * 0.5 + h * 1.2, y + h * 1.3);
    ctx.lineTo(cx - w * 0.5 - h * 1.2, y + h * 1.3);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y - h, 0, y + h * 1.3);
    g.addColorStop(0, '#3a74a8');
    g.addColorStop(0.55, '#1c4a7a');
    g.addColorStop(1, 'rgba(16,51,94,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    // Contour lines following the swell's back.
    ctx.strokeStyle = 'rgba(190,220,238,0.4)';
    ctx.lineWidth = 1.2;
    for (let k = 1; k < 6; k++) {
      ctx.beginPath();
      for (let j = 0; j < fr.length - 2; j++) {
        const f = fr[j];
        const d = k * 6 + 1.5 * fbm(j * 0.4 + k, t);
        j ? ctx.lineTo(f.x + f.nx * d, f.y + f.ny * d) : ctx.moveTo(f.x + f.nx * d, f.y + f.ny * d);
      }
      ctx.stroke();
    }

    // Foam cap and tendrils racing forward off the crest.
    ctx.globalAlpha = 0.35 + 0.65 * Math.max(st.foam, 0.4);
    ctx.fillStyle = FOAM;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    const from = Math.floor(fr.length * 0.45);
    ctx.beginPath();
    for (let j = from; j < fr.length; j++) ctx.lineTo(fr[j].x - fr[j].nx * 2, fr[j].y - fr[j].ny * 2);
    for (let j = fr.length - 1; j >= from; j--) {
      const u = (j - from) / (fr.length - 1 - from);
      const d = 15 * Math.sin(u * Math.PI) ** 0.6 * (1 + 0.4 * fbm(j * 0.9 + seed, t * 0.6));
      ctx.lineTo(fr[j].x + fr[j].nx * d, fr[j].y + fr[j].ny * d);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const sub: WaveState = { ...st, seed, depth: 2, grow: clamp(0.35 + st.grow * 0.65) };
    const rng = mulberry32(seed);
    for (let k = 0; k < 4; k++) {
      const f = fr[Math.floor(fr.length * (0.6 + 0.38 * (k / 3)))];
      const ang = Math.atan2(-f.ny * 0.5 + f.ty * 0.9, -f.nx * 0.5 + f.tx * 0.9);
      this.branch(ctx, hash(seed, k), f.x, f.y, ang, (h * 0.5 + 12) * (0.7 + rng() * 0.5), 6, 1 + rng() * 0.7, 0, sub);
    }
    ctx.globalAlpha = 1;
  }

  private foreground(ctx: CanvasRenderingContext2D, t: number) {
    for (let r = 0; r < 5; r++) {
      const y = 930 + r * 22;
      ctx.strokeStyle = `rgba(200,225,238,${0.18 - r * 0.025})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = -10; x <= WIDTH + 10; x += 8) {
        const yy = y + 8 * Math.sin(x * 0.012 - t * 0.9 + r * 1.3) + 4 * fbm(x * 0.04 + r, t * 0.4);
        x === -10 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- boat

  private boat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, ph: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.06 * Math.sin(t * 1.1 + ph));
    ctx.scale(s, s);
    ctx.fillStyle = '#d9b56a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-100, -14);
    ctx.quadraticCurveTo(-60, 16, 0, 18);
    ctx.quadraticCurveTo(70, 16, 112, -26);
    ctx.quadraticCurveTo(60, 2, 0, 4);
    ctx.quadraticCurveTo(-60, 2, -100, -14);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const bx = -60 + i * 28;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(bx, -12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx, -8);
      ctx.lineTo(bx + 18, 22 + 3 * Math.sin(t * 2 + i));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- great wave

  private wave(ctx: CanvasRenderingContext2D, st: WaveState, id: string, label: string) {
    ctx.save();
    ctx.globalAlpha = st.alpha;
    const k = lerp(0.5, 1, st.rise) + 0.012 * Math.sin(st.t * 0.9 + st.seed);
    const ax = 260;
    const ay = 1010;
    const r = mulberry32(st.shape);
    const c = this.opts.chaos;
    const height = 1 + (lerp(0.82, 1.18, r()) - 1) * c;
    const reach = 1 + (lerp(0.8, 1.25, r()) - 1) * c;
    const droop = lerp(-30, 40, r()) * c + (1 - c) * 5;
    const jb = BACK.map(() => (r() - 0.5) * 2 * c);
    const ju = UNDER.map(() => (r() - 0.5) * 2 * c);
    ju[0] = jb[jb.length - 1];
    // Weights: how strongly the curl region (vs. the wave's foot) is reshaped.
    const wb = (i: number) => (i / (BACK.length - 1)) ** 1.5;
    const wu = (j: number) => 1 - 0.85 * (j / (UNDER.length - 1));
    const tf = (p: Pt, w: number, jit: number): Pt => ({
      x: ax + (p.x - ax) * k * (1 + (reach - 1) * w) + jit * 14 * w,
      y: ay + (p.y - ay) * k * (1 + (height - 1) * Math.min(1, w + 0.3)) + (droop * w * k) * (p.y < 700 ? 1 : 0.3) + jit * 22 * w,
    });
    const back = frames(spline(BACK.map((p, i) => tf(p, wb(i), jb[i])), 14));
    const under = frames(spline(UNDER.map((p, j) => tf(p, wu(j), ju[j])), 14));

    // Report the crest's screen position (through whatever transforms are active) for the overlay.
    const top = back.reduce((a, b) => (b.y < a.y ? b : a));
    const m = ctx.getTransform();
    const pt = m.transformPoint({ x: top.x, y: top.y - 50 });
    const ov = this.ov(id);
    this.markers.push({ id, label, x: pt.x, y: pt.y, dir: m.a > 0 ? 1 : -1, speed: ov.speed, alpha: st.alpha });

    const body = new Path2D();
    back.forEach((p, i) => (i ? body.lineTo(p.x, p.y) : body.moveTo(p.x, p.y)));
    under.forEach((p) => body.lineTo(p.x, p.y));
    body.lineTo(-200, 1010);
    body.closePath();

    const crest = Math.min(...back.map((f) => f.y));
    const g = ctx.createLinearGradient(0, crest, 0, ay);
    g.addColorStop(0, '#2f6fa8');
    g.addColorStop(0.5, '#17426f');
    g.addColorStop(1, '#0a2446');
    ctx.fillStyle = g;
    ctx.fill(body);

    ctx.save();
    ctx.clip(body);
    ctx.lineJoin = 'round';

    // Dark shadow beneath the curling lip.
    ctx.strokeStyle = 'rgba(6,20,45,0.28)';
    ctx.lineWidth = 46;
    this.offsetLine(ctx, under, 26, 0, under.length - 1, 0, st.t, 0);

    // Striations along the face of the hollow.
    for (let i = 1; i <= 24; i++) {
      const u = i / 24;
      ctx.strokeStyle = mix([215, 232, 240], [70, 120, 165], u);
      ctx.globalAlpha = 0.9 * (1 - u) ** 1.2 * st.alpha;
      ctx.lineWidth = 2.4 * (1 - u) + 0.6;
      this.offsetLine(ctx, under, i * 4.2, 0, under.length - 1, 3, st.t, i);
    }

    // Contour lines sweeping up the back of the wave.
    for (let i = 1; i <= 16; i++) {
      ctx.strokeStyle = '#aacde6';
      ctx.globalAlpha = 0.3 * (1 - i / 18) * st.alpha;
      ctx.lineWidth = 1.4;
      const j0 = Math.floor(back.length * 0.02 * i);
      const j1 = back.length - 1 - Math.floor(back.length * 0.012 * i);
      this.offsetLine(ctx, back, i * 5.5, j0, j1, 2.2, st.t, i * 3);
    }
    ctx.restore();
    ctx.globalAlpha = st.alpha;

    // Ink outline along the wave itself only (not the clipped base edges).
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    [...back, ...under].forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    this.foamCap(ctx, back, st);
    this.fingers(ctx, back, k, st);
    this.spray(ctx, back, st);
    ctx.restore();
  }

  private offsetLine(ctx: CanvasRenderingContext2D, fr: Frame[], d: number, i0: number, i1: number, wob: number, t: number, ph: number) {
    ctx.beginPath();
    for (let j = i0; j <= i1; j++) {
      const f = fr[j];
      const w = d + wob * fbm(j * 0.3 + ph, t * 0.7);
      const x = f.x + f.nx * w;
      const y = f.y + f.ny * w;
      j === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private foamCap(ctx: CanvasRenderingContext2D, back: Frame[], st: WaveState) {
    const n = back.length;
    const i0 = Math.floor(n * 0.36);
    const width = (u: number) => 3 + 48 * smooth(0, 0.2, u) * (1 - 0.8 * smooth(0.55, 1, u));

    ctx.save();
    ctx.globalAlpha = st.foam * st.alpha;
    ctx.beginPath();
    for (let j = i0; j < n; j++) {
      const f = back[j];
      ctx.lineTo(f.x - f.nx * 3, f.y - f.ny * 3);
    }
    for (let j = n - 1; j >= i0; j--) {
      const f = back[j];
      const u = (j - i0) / (n - 1 - i0);
      const d = width(u) * (1 + 0.35 * fbm(j * 0.8, st.t * 0.5));
      ctx.lineTo(f.x + f.nx * d, f.y + f.ny * d);
    }
    ctx.closePath();
    ctx.fillStyle = FOAM;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Billowy clumps along the lower edge of the cap, so the froth looks piled up.
    ctx.globalAlpha = st.foam * st.alpha;
    ctx.fillStyle = FOAM;
    const rng = mulberry32(hash(st.seed, 900));
    for (let i = 0; i < 55; i++) {
      const j = i0 + Math.floor(rng() * (n - i0));
      const f = back[j];
      const u = (j - i0) / (n - 1 - i0);
      const d = width(u) * (0.7 + rng() * 0.5);
      const rad = (4 + rng() * 11) * (0.5 + 0.7 * smooth(0, 0.3, u)) * (1 - 0.5 * smooth(0.7, 1, u));
      ctx.beginPath();
      ctx.arc(f.x + f.nx * d, f.y + f.ny * d, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    // Foam streaks trailing down the back of the wave.
    ctx.strokeStyle = FOAM;
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = st.foam * st.alpha * 0.55;
    for (let i = 0; i < 11; i++) {
      this.offsetLine(ctx, back, 18 + i * 9, Math.floor(n * (0.34 + i * 0.02)), Math.floor(n * (0.95 - i * 0.04)), 3, st.t, i * 7);
    }
    ctx.restore();
  }

  /** Claws of foam along the lip; each is a recursive, curling tendril. */
  private fingers(ctx: CanvasRenderingContext2D, back: Frame[], k: number, st: WaveState) {
    const rng = mulberry32(st.seed);
    const count = 8 + Math.floor(rng() * 5);
    ctx.save();
    ctx.globalAlpha = st.foam * st.alpha;
    ctx.fillStyle = FOAM;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    for (let j = 0; j < count; j++) {
      const u = lerp(0.55, 0.995, (j / (count - 1)) ** 0.9);
      const f = back[Math.floor(u * (back.length - 1))];
      const ang = Math.atan2(-f.ny * 0.6 + f.ty * 0.9, -f.nx * 0.6 + f.tx * 0.9);
      const len = (70 + 70 * rng()) * (0.6 + 0.4 * u) * k;
      this.branch(ctx, hash(st.seed, j), f.x, f.y, ang, len, (15 + 8 * rng()) * k, 1.1 + 0.8 * rng(), 0, st);
    }
    ctx.restore();
  }

  private branch(ctx: CanvasRenderingContext2D, seed: number, x: number, y: number, ang: number, len: number, w: number, curl: number, level: number, st: WaveState) {
    const f = easeOutCubic(clamp(st.grow * (st.depth + 1) - level));
    if (f <= 0.001) return;

    const r = mulberry32(seed);
    const L = len * f;
    const steps = 10;
    const sway = 0.06 * Math.sin(st.t * 1.4 + (seed % 628) * 0.01);
    const total = curl * (1 + sway * 2);
    const w1 = level === st.depth ? 0 : w * 0.55;

    let a = ang + sway;
    let px = x;
    let py = y;
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i <= steps; i++) {
      const wi = lerp(w, w1, i / steps) * 0.5;
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      left.push({ x: px + nx * wi, y: py + ny * wi });
      right.push({ x: px - nx * wi, y: py - ny * wi });
      a += total / steps;
      px += (Math.cos(a) * L) / steps;
      py += (Math.sin(a) * L) / steps;
    }
    ctx.beginPath();
    left.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();
    if (level <= 1) ctx.stroke();

    if (level < st.depth) {
      const n = level === 0 ? 3 : 2;
      for (let c = 0; c < n; c++) {
        const spread = (c - (n - 1) / 2) * (0.75 + 0.3 * r());
        const cc = curl * (0.75 + 0.35 * r()) * (r() < 0.22 ? -0.8 : 1);
        this.branch(ctx, hash(seed, c), px, py, a + spread, len * (0.58 + 0.1 * r()), w1, cc, level + 1, st);
      }
    } else {
      const m = r() < 0.4 ? 1 : 0;
      const reach = easeOutCubic(clamp(st.grow));
      for (let d = 0; d < m; d++) {
        const dist = (6 + r() * 18) * reach;
        const da = a + (r() - 0.5) * 1.6;
        const fall = st.dissolve ** 2 * (120 + r() * 220);
        const rad = (1.6 + r() * 2) * Math.max(f, 0.3);
        ctx.beginPath();
        ctx.arc(px + Math.cos(da) * dist, py + Math.sin(da) * dist + fall, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** A cloud of droplets thrown off the crest; sizes follow a power law. */
  private spray(ctx: CanvasRenderingContext2D, back: Frame[], st: WaveState) {
    const reach = easeOutCubic(clamp(st.grow));
    ctx.save();
    ctx.globalAlpha = st.foam * st.alpha;
    ctx.fillStyle = FOAM;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < this.opts.spray; i++) {
      const r = mulberry32(hash(st.seed, 500 + i));
      const f = back[Math.floor((0.5 + 0.5 * r()) * (back.length - 1))];
      const d = (18 + r() ** 1.5 * 170) * reach;
      const jitter = (r() - 0.5) * 1.2;
      const ox = -f.nx + f.tx * 0.7;
      const oy = -f.ny + f.ty * 0.7;
      const cs = Math.cos(jitter);
      const sn = Math.sin(jitter);
      const fall = st.dissolve ** 2 * (100 + r() * 260);
      ctx.beginPath();
      ctx.arc(f.x + (ox * cs - oy * sn) * d, f.y + (ox * sn + oy * cs) * d + fall + 14 * Math.sin(st.t + i), 2 + r() ** 3 * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- print finishing

  private finish(ctx: CanvasRenderingContext2D) {
    if (!this.paper) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 256;
      const tc = tile.getContext('2d')!;
      const img = tc.createImageData(256, 256);
      const rng = mulberry32(9);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 215 + rng() * 40;
        img.data[i] = v;
        img.data[i + 1] = v - 6;
        img.data[i + 2] = v - 22;
        img.data[i + 3] = 255;
      }
      tc.putImageData(img, 0, 0);
      tc.strokeStyle = 'rgba(150,120,70,0.12)';
      for (let i = 0; i < 60; i++) {
        tc.beginPath();
        const x = rng() * 256;
        const y = rng() * 256;
        tc.moveTo(x, y);
        tc.lineTo(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 30);
        tc.stroke();
      }
      this.paper = ctx.createPattern(tile, 'repeat')!;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = this.paper;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();

    const v = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.4, WIDTH / 2, HEIGHT / 2, WIDTH * 0.62);
    v.addColorStop(0, 'rgba(70,45,10,0)');
    v.addColorStop(1, 'rgba(70,45,10,0.3)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}
