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
import { detectLocale, setLocale } from './i18n';
import { createApp } from './presenter/app';

const locale = detectLocale(navigator.language);
setLocale(locale);
document.documentElement.lang = locale === 'pt' ? 'pt-BR' : locale;

void createApp({
  root: document.getElementById('app')!,
  globe: new MapLibreGlobe(createMapLibreMap),
  api: new ApiClient(),
  geo: new GeoLoader(),
});
