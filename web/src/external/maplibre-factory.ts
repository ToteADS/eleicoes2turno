// The only module that imports maplibre-gl (R1: the library stays behind our adapter).
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapLike } from './maplibre-globe';

setWorkerUrl(workerUrl);

const SEA = '#f4f6f9';

export function createMapLibreMap(el: HTMLElement): MapLike {
  return new MapLibreMap({
    container: el,
    style: {
      version: 8,
      projection: { type: 'globe' },
      sky: {
        'sky-color': '#ffffff',
        'horizon-color': '#eef2f7',
        'fog-color': '#ffffff',
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.6, 7, 0],
      },
      sources: {},
      layers: [{ id: 'sea', type: 'background', paint: { 'background-color': SEA } }],
    },
    center: [-52, -14],
    zoom: window.innerWidth < 640 ? 1.2 : 1.8,
    attributionControl: false,
    renderWorldCopies: false,
    maxPitch: 0,
    pitchWithRotate: false,
    touchPitch: false,
  }) as unknown as MapLike;
}
