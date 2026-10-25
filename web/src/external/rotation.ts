import type { Padding, RotationController } from '../infra/globe';

/** The slice of the MapLibre map the rotation needs. */
export interface RotatableMap {
  getCenter(): { lng: number; lat: number };
  easeTo(options: Record<string, unknown>): unknown;
  stop(): unknown;
  on(event: 'moveend', cb: () => void): unknown;
}

// One step: 12° of longitude westward in 3 s, linear, chained on moveend.
const STEP_DEGREES = 12;
const STEP_MS = 3000;

/** Spins the globe slowly until stopped (like globe.taboo.tv). */
export class IdleRotation implements RotationController {
  private isRunning = false;
  private listeners: ((running: boolean) => void)[] = [];

  constructor(private readonly map: RotatableMap, private readonly padding: () => Padding) {
    map.on('moveend', () => {
      if (this.isRunning) this.step();
    });
  }

  get running(): boolean {
    return this.isRunning;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.notify();
    this.step();
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.map.stop();
    this.notify();
  }

  toggle(): boolean {
    if (this.isRunning) this.stop();
    else this.start();
    return this.isRunning;
  }

  onChange(cb: (running: boolean) => void): void {
    this.listeners.push(cb);
  }

  private step(): void {
    const c = this.map.getCenter();
    this.map.easeTo({ center: [c.lng - STEP_DEGREES, c.lat], duration: STEP_MS, easing: (t: number) => t, padding: this.padding() });
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb(this.isRunning));
  }
}
