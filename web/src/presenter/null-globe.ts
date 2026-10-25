import type { GlobeRenderer, RotationController } from '../infra/globe';

/** Stand-in when the real globe cannot start (no WebGL): the cards keep working. */
export class NullGlobe implements GlobeRenderer {
  readonly rotation: RotationController = { running: false, start() {}, stop() {}, toggle: () => false, onChange() {} };
  mount(): Promise<void> { return Promise.resolve(); }
  setWorld(): void {}
  setStates(): void {}
  setMunicipalities(): void {}
  setAbroadCities(): void {}
  focus(): void {}
  setPadding(): void {}
  onPick(): void {}
  onHover(): void {}
  onUserInteract(): void {}
  zoomIn(): void {}
  zoomOut(): void {}
}
