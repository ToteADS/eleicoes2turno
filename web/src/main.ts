import '@fontsource/archivo/400.css';
import '@fontsource/archivo/500.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/archivo/800.css';
import './presenter/styles.css';
import { createMapLibreMap } from './external/maplibre-factory';
import { MapLibreGlobe } from './external/maplibre-globe';
import { ApiClient } from './infra/api';
import { GeoLoader } from './infra/geo';
import { Round1Loader } from './infra/round1';
import { detectLocale, setLocale } from './i18n';
import { createApp, type AppDeps } from './presenter/app';

const locale = detectLocale(navigator.language);
setLocale(locale);
document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale;

async function start(): Promise<void> {
  let api: AppDeps['api'] = new ApiClient();
  let pollMs: number | undefined;
  // DEV ONLY: ?demo=anim fakes a moving count (import.meta.env.DEV is false in builds, so
  // this branch and the demo module are dropped from production bundles)
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'anim') {
    const demo = await import('./infra/demo-api');
    api = demo.demoApi(api);
    pollMs = demo.DEMO_POLL_MS;
  }
  const globe = new MapLibreGlobe(createMapLibreMap);
  if (import.meta.env.DEV) (window as unknown as { __globe: MapLibreGlobe }).__globe = globe;
  await createApp({
    root: document.getElementById('app')!,
    globe,
    api,
    geo: new GeoLoader(),
    round1: new Round1Loader(),
    pollMs,
  });
}

void start();
