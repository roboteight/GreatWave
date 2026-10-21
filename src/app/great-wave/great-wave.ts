import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DEFAULT_OPTIONS, HEIGHT, WIDTH, WaveMarker, WaveOptions, WaveOverride, WaveRenderer } from './wave-renderer';

/** Full-screen animated canvas homage to Hokusai's "The Great Wave off Kanagawa". Click the canvas to break the wave early. */
@Component({
  selector: 'app-great-wave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'img',
    'aria-label': 'Animated Great Wave off Kanagawa with fractal foam',
  },
  template: `
    <canvas #canvas (click)="burst()"></canvas>

    @if (arrows()) {
      @for (m of markers(); track m.id) {
        @if (m.alpha > 0.15) {
          <button
            class="marker"
            type="button"
            [class.selected]="selectedId() === m.id"
            [style.left.px]="clamp(m.x / dpr(), 80, vw() - 80)"
            [style.top.px]="clamp(m.y / dpr(), 50, vh() - 50)"
            [style.opacity]="m.alpha"
            [attr.aria-label]="m.label + ', rolling ' + (m.dir > 0 ? 'right' : 'left') + ', speed ' + m.speed.toFixed(1)"
            (click)="select(m.id)"
          >
            <svg class="arrow" [class.rev]="m.dir < 0" [style.--flow.s]="1.2 / Math.max(m.speed, 0.2)" [attr.width]="56 + m.speed * 26" height="26" viewBox="0 0 100 26" preserveAspectRatio="none">
              <path class="shaft" d="M4 13 H80" />
              <path class="head" d="M70 3 L94 13 L70 23 Z" />
            </svg>
            <span class="tag">{{ m.label }} · {{ m.dir > 0 ? 'right' : 'left' }} ×{{ m.speed.toFixed(1) }}</span>
          </button>
        }
      }
    }

    @if (selected(); as m) {
      <section class="card" aria-label="Wave controls">
        <header>
          <h3>{{ m.label }}</h3>
          <button type="button" aria-label="Close" (click)="selectedId.set(null)">✕</button>
        </header>
        <div class="seg" role="group" aria-label="Direction">
          <button type="button" [class.on]="m.dir < 0" (click)="setOverride(m.id, { dir: -1 })">← Left</button>
          <button type="button" [class.on]="m.dir > 0" (click)="setOverride(m.id, { dir: 1 })">Right →</button>
        </div>
        <label>
          <span>Speed <output>×{{ m.speed.toFixed(1) }}</output></span>
          <input type="range" min="0" max="3" step="0.1" [value]="m.speed" (input)="setOverride(m.id, { speed: num($event) })" />
        </label>
        <button type="button" class="link" (click)="clearOverride(m.id)">Reset this wave</button>
      </section>
    }

    <button class="gear" type="button" aria-label="Toggle settings" [attr.aria-expanded]="open()" (click)="open.set(!open())">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </button>

    <aside class="panel" [class.open]="open()" [attr.aria-hidden]="!open()" [attr.inert]="open() ? null : ''">
      <h2>Settings</h2>

      <div class="row buttons">
        <button type="button" (click)="paused.set(!paused())">{{ paused() ? 'Play' : 'Pause' }}</button>
        <button type="button" (click)="burst()">New wave</button>
        <button type="button" (click)="toggleFullscreen()">Fullscreen</button>
      </div>

      <label>
        <span>Cycle length <output>{{ cycle() }}s</output></span>
        <input type="range" min="6" max="40" step="1" [value]="cycle()" (input)="cycle.set(num($event))" />
      </label>

      <label>
        <span>Fractal depth <output>{{ depth() }}</output></span>
        <input type="range" min="1" max="5" step="1" [value]="depth()" (input)="depth.set(num($event))" />
      </label>

      <label>
        <span>Spray droplets <output>{{ spray() }}</output></span>
        <input type="range" min="0" max="80" step="1" [value]="spray()" (input)="spray.set(num($event))" />
      </label>

      <label>
        <span>Wave variation <output>{{ chaos().toFixed(2) }}</output></span>
        <input type="range" min="0" max="1.5" step="0.05" [value]="chaos()" (input)="chaos.set(num($event))" />
      </label>

      <label>
        <span>Background waves</span>
        <select [value]="bgWaves()" (change)="bgWaves.set(num($event))">
          <option value="-1">Random</option>
          <option value="0">None</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>

      <label class="check"><input type="checkbox" [checked]="swells()" (change)="swells.set(checked($event))" /> Foam-capped swells</label>
      <label class="check"><input type="checkbox" [checked]="boats()" (change)="boats.set(checked($event))" /> Boats</label>
      <label class="check"><input type="checkbox" [checked]="arrows()" (change)="arrows.set(checked($event))" /> Wave direction arrows</label>

      <button type="button" class="reset" (click)="reset()">Reset to defaults</button>
    </aside>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      overflow: hidden;
      background: #14110c;
      font: 14px/1.4 system-ui, sans-serif;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
      cursor: pointer;
    }
    .marker {
      position: absolute;
      z-index: 1;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: #fff;
      cursor: pointer;
      transition: background 0.15s;
    }
    .marker:hover,
    .marker.selected,
    .marker:focus-visible {
      background: rgb(10 26 50 / 0.5);
      outline: none;
    }
    .arrow {
      overflow: visible;
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.55));
    }
    .arrow.rev {
      transform: scaleX(-1);
    }
    .shaft {
      fill: none;
      stroke: #fff8e1;
      stroke-width: 5;
      stroke-linecap: round;
      stroke-dasharray: 12 9;
      animation: flow var(--flow, 1.2s) linear infinite;
    }
    .head {
      fill: #fff8e1;
    }
    @keyframes flow {
      to {
        stroke-dashoffset: -21;
      }
    }
    .tag {
      font-size: 12px;
      white-space: nowrap;
      padding: 2px 8px;
      border-radius: 99px;
      background: rgb(10 26 50 / 0.7);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .marker:hover .tag,
    .marker.selected .tag,
    .marker:focus-visible .tag {
      opacity: 1;
    }
    .card {
      position: absolute;
      left: 20px;
      bottom: 20px;
      z-index: 3;
      width: 240px;
      box-sizing: border-box;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: #f6efd8;
      background: rgb(10 26 50 / 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid rgb(255 255 255 / 0.15);
      border-radius: 12px;
    }
    .card header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .card h3 {
      margin: 0;
      font-size: 14px;
    }
    .card button,
    .card input {
      font: inherit;
    }
    .card button {
      color: inherit;
      cursor: pointer;
      border: 1px solid rgb(255 255 255 / 0.25);
      border-radius: 6px;
      background: rgb(255 255 255 / 0.08);
      padding: 6px 10px;
    }
    .card header button {
      border: 0;
      background: transparent;
      padding: 2px 6px;
    }
    .card .seg {
      display: flex;
      gap: 6px;
    }
    .card .seg button {
      flex: 1;
    }
    .card .seg .on {
      background: #e9b94a;
      border-color: #e9b94a;
      color: #1b1405;
    }
    .card label {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .card label span {
      display: flex;
      justify-content: space-between;
    }
    .card input[type='range'] {
      width: 100%;
      accent-color: #e9b94a;
    }
    .card .link {
      border: 0;
      background: transparent;
      text-decoration: underline;
      opacity: 0.75;
      padding: 0;
      align-self: flex-start;
    }
    .gear {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 3;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border: 1px solid rgb(255 255 255 / 0.25);
      border-radius: 50%;
      color: #f6efd8;
      background: rgb(12 28 52 / 0.65);
      backdrop-filter: blur(8px);
      cursor: pointer;
    }
    .gear:hover {
      background: rgb(12 28 52 / 0.85);
    }
    .panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 2;
      width: 300px;
      max-width: 100vw;
      box-sizing: border-box;
      padding: 76px 22px 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow-y: auto;
      color: #f6efd8;
      background: rgb(10 26 50 / 0.82);
      backdrop-filter: blur(14px);
      border-left: 1px solid rgb(255 255 255 / 0.12);
      transform: translateX(100%);
      transition: transform 0.28s ease;
    }
    .panel.open {
      transform: none;
    }
    h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.7;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    label span {
      display: flex;
      justify-content: space-between;
    }
    output {
      opacity: 0.7;
      font-variant-numeric: tabular-nums;
    }
    label.check {
      flex-direction: row;
      align-items: center;
      gap: 8px;
    }
    input[type='range'] {
      width: 100%;
      accent-color: #e9b94a;
    }
    select,
    .panel button {
      font: inherit;
      color: inherit;
      padding: 7px 10px;
      border: 1px solid rgb(255 255 255 / 0.25);
      border-radius: 6px;
      background: rgb(255 255 255 / 0.08);
    }
    select option {
      color: #111;
    }
    .panel button {
      cursor: pointer;
    }
    .panel button:hover {
      background: rgb(255 255 255 / 0.18);
    }
    .buttons {
      display: flex;
      gap: 8px;
    }
    .buttons button {
      flex: 1;
      padding-inline: 4px;
    }
    .reset {
      margin-top: auto;
    }
  `,
})
export class GreatWave {
  protected readonly open = signal(false);
  protected readonly paused = signal(false);
  protected readonly cycle = signal(16);
  protected readonly depth = signal(DEFAULT_OPTIONS.depth);
  protected readonly spray = signal(DEFAULT_OPTIONS.spray);
  protected readonly chaos = signal(DEFAULT_OPTIONS.chaos);
  protected readonly bgWaves = signal(DEFAULT_OPTIONS.bgWaves);
  protected readonly swells = signal(DEFAULT_OPTIONS.swells);
  protected readonly boats = signal(DEFAULT_OPTIONS.boats);
  protected readonly arrows = signal(true);
  protected readonly overrides = signal<Record<string, WaveOverride>>({});
  protected readonly markers = signal<WaveMarker[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly dpr = signal(1);
  protected readonly vw = signal(1000);
  protected readonly vh = signal(700);
  protected readonly Math = Math;
  protected readonly selected = computed(() => this.markers().find((m) => m.id === this.selectedId()) ?? null);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer = new WaveRenderer();
  private clock = 0;
  private reroll = 0;
  private redraw = () => {};

  constructor() {
    afterNextRender(() => this.start());
    // Repaint when a setting changes (matters while paused or with reduced motion).
    effect(() => {
      this.options();
      this.cycle();
      this.redraw();
    });
  }

  protected num(e: Event) {
    return +(e.target as HTMLInputElement).value;
  }

  protected clamp(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
  }

  protected select(id: string) {
    this.selectedId.update((cur) => (cur === id ? null : id));
  }

  protected setOverride(id: string, patch: Partial<WaveOverride>) {
    this.overrides.update((o) => ({ ...o, [id]: { ...(o[id] ?? { dir: 1, speed: 1 }), ...patch } }));
  }

  protected clearOverride(id: string) {
    this.overrides.update(({ [id]: _, ...rest }) => rest);
  }

  protected checked(e: Event) {
    return (e.target as HTMLInputElement).checked;
  }

  protected burst() {
    this.clock = this.cycle() * 0.33;
    this.reroll++;
    this.redraw();
  }

  protected toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  protected reset() {
    this.cycle.set(16);
    this.depth.set(DEFAULT_OPTIONS.depth);
    this.spray.set(DEFAULT_OPTIONS.spray);
    this.chaos.set(DEFAULT_OPTIONS.chaos);
    this.bgWaves.set(DEFAULT_OPTIONS.bgWaves);
    this.swells.set(DEFAULT_OPTIONS.swells);
    this.boats.set(DEFAULT_OPTIONS.boats);
    this.arrows.set(true);
    this.overrides.set({});
    this.selectedId.set(null);
  }

  private options(): WaveOptions {
    return {
      depth: this.depth(),
      spray: this.spray(),
      bgWaves: this.bgWaves(),
      chaos: this.chaos(),
      swells: this.swells(),
      boats: this.boats(),
      overrides: this.overrides(),
    };
  }

  private start() {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d')!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      const cycle = this.cycle();
      const phase = reduced ? 0.66 : (this.clock % cycle) / cycle;
      // Cover the viewport: scale the 3:2 scene to fill, cropping whichever axis overflows.
      const s = Math.max(el.width / WIDTH, el.height / HEIGHT);
      ctx.setTransform(s, 0, 0, s, (el.width - WIDTH * s) / 2, (el.height - HEIGHT * s) / 2);
      this.renderer.render(ctx, phase, this.clock, this.options(), Math.floor(this.clock / cycle) + this.reroll * 5);
      if (this.arrows()) this.markers.set(this.renderer.markers);
    };
    this.redraw = draw;

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      this.dpr.set(dpr);
      this.vw.set(el.clientWidth);
      this.vh.set(el.clientHeight);
      el.width = Math.round(el.clientWidth * dpr);
      el.height = Math.round(el.clientHeight * dpr);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      if (!this.paused()) this.clock += Math.min((now - last) / 1000, 0.05);
      last = now;
      draw();
      raf = requestAnimationFrame(frame);
    };
    if (!reduced) raf = requestAnimationFrame(frame);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    });
  }
}
