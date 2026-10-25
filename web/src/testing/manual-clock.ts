import type { FrameClock } from '../infra/animation';

/** A frame clock driven by hand: `step(ms)` moves time and runs one animation frame. */
export class ManualClock implements FrameClock {
  t = 0;
  private queue = new Map<number, () => void>();
  private next = 1;

  now = () => this.t;
  request = (cb: () => void) => {
    const id = this.next++;
    this.queue.set(id, cb);
    return id;
  };
  cancel = (id: number) => { this.queue.delete(id); };

  get pending(): number {
    return this.queue.size;
  }

  step(ms = 16): void {
    this.t += ms;
    const due = [...this.queue.values()];
    this.queue.clear();
    due.forEach((cb) => cb());
  }

  /** runs frames until nothing is waiting (or `max` frames) */
  run(ms = 16, max = 1000): void {
    for (let i = 0; i < max && this.queue.size; i++) this.step(ms);
  }
}
