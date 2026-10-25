# Apuração 2º turno — Globo interativo · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site público com globo 3D (MapLibre) que mostra a apuração oficial do TSE do 2º turno, alimentado por uma API Go que faz polling e cache dos JSONs do TSE.

**Architecture:** Um container. `api/` (Go, Clean Architecture) faz polling do TSE, agrega e serve `/api/v1/*` + os estáticos de `web/dist`. `web/` (Vite + TS puro) desenha o globo via um adapter MapLibre atrás de uma interface nossa; geometrias pré-processadas e versionadas.

**Tech Stack:** Go 1.25, gorilla/mux, joho/godotenv, golang.org/x/time/rate · Vite 6, TypeScript 5, maplibre-gl 5.6.0, @turf/bbox + @turf/bbox-clip 7.2.0, topojson-client 3.1.0, @fontsource/archivo, Vitest · Docker (distroless nonroot) · GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-25-apuracao-globo-design.md`

## Global Constraints

- Repositório público `ToteADS/eleicoes2turno`. **Nenhum segredo** no repo; só `.env.example` com placeholders.
- Commits sem nenhuma assinatura de IA (sem `Co-Authored-By`, sem "Generated with").
- Código, nomes e comentários em inglês; texto ao usuário via i18n (`pt` padrão, `en`, `es`), chaves flat com prefixo por feature.
- TSE: base `https://resultados.tse.jus.br/oficial`, ciclo `ele2026`, eleição `6258`, cargo `c0001`. Candidatos por número: `13` → vermelho `#d7262d` (esquerda); `22` → azul `#1f5fe0` (direita). Cinza "sem dado/fora do filtro" `#e3e6eb`.
- Poller: ciclo rápido 30 s (BR, 28 UFs incl. `zz`, 186 cidades do exterior); municípios concorrência 4 com `If-Modified-Since`; nunca descartar o último dado bom.
- API: só GET; `Cache-Control: public, max-age=15, s-maxage=30, stale-while-revalidate=60` + `ETag` nos dados; assets com hash `max-age=31536000, immutable`.
- Rate limit por IP: 20 req/s, burst 40. IP = `CF-Connecting-IP` se `TRUST_CLOUDFLARE=true`, senão 1º item de `X-Forwarded-For`, senão `RemoteAddr`.
- AdSense: `ADSENSE_CLIENT` (ex. `ca-pub-9424129340132469`) via env; `ads.txt` = `google.com, pub-XXXXXXXX, DIRECT, f08c47fec0942fa0` só quando configurado. Banner próprio padrão: imagem `/ads/tapp-banner.svg`, link `https://tapp.solutions`.
- Totais derivados são rotulados como soma ("soma das UFs", "soma das cidades"); o oficial é o arquivo BR.
- Breakpoints: celular `<640px`, tablet `640–1023px`, desktop `≥1024px`. Alvos de toque ≥44px. Sem rolagem horizontal.
- Antes das 17h (TSE zerado): estado "aguardando divulgação", nunca "0% × 0%".

## Review Focus

1. **TSE zerado antes das 17h** → card mostra "Aguardando divulgação do TSE (17h)", áreas em cinza; não mostra 0,00% × 0,00% nem selo "LIDERA". (teste em Task 2 e Task 6)
2. **TSE fora do ar / 5xx / timeout no meio da noite** → API continua servindo o último snapshot; `stale: true` no payload depois de 3 ciclos sem sucesso; frontend mostra "dados de HH:MM". (teste em Task 4)
3. **Troca rápida de filtros** (usuário muda Estado enquanto municípios ainda carregam) → vale a última seleção; resposta atrasada é descartada. (teste em Task 6)
4. **Município sem geometria / código IBGE ausente** → ignorado sem quebrar o resto; cidades do exterior não têm `cdi`. (teste em Task 2 e Task 7)
5. **Celular em paisagem baixa (ex. 740×360)** → painel de resultados recolhido não cobre mais que 40% da altura; filtros em folha; globo sempre visível. (verificação manual em Task 8)

---

## File Structure

```
api/
  cmd/api/main.go                         # wiring, graceful shutdown
  internal/domain/entities/result.go      # AreaResult, Candidate, Snapshot
  internal/domain/entities/abroad.go      # AbroadCity, Country
  internal/domain/repositories/store.go   # ResultStore interface
  internal/domain/repositories/source.go  # ResultSource interface (TSE)
  internal/domain/usecases/aggregate.go   # SumResults, BuildCountries, BuildSummary
  internal/domain/services/poller.go      # fast cycle + municipality sweep
  internal/infra/tse/client.go            # HTTP client w/ If-Modified-Since
  internal/infra/tse/parse.go             # TSE "-u" JSON → AreaResult
  internal/infra/tse/catalog.go           # mun-e006258-cm.json → municipality list
  internal/infra/tse/testdata/*.json      # real fixtures
  internal/infra/cache/memory.go          # ResultStore impl w/ pre-serialized payloads
  internal/presentation/handlers/*.go     # summary, municipalities, abroad, config, adstxt, health
  internal/presentation/middlewares/*.go  # security headers/CSP, ratelimit, cors
  internal/presentation/routes/routes.go
  pkg/config/config.go  pkg/logger/logger.go  pkg/response/response.go  pkg/errors/errors.go
  assets/abroad-cities.json               # go:embed (city→country)
web/
  index.html  vite.config.ts  tsconfig.json
  public/geo/states.json  public/geo/world.json  public/geo/mun/<uf>.json  public/ads/tapp-banner.svg
  src/main.ts
  src/domain/types.ts        # mirrors API contract
  src/domain/filters.ts      # FilterState + transitions
  src/domain/split.ts        # splitFeature
  src/domain/format.ts       # pt-BR number/percent
  src/infra/api.ts           # ApiClient
  src/infra/globe.ts         # GlobeRenderer interface
  src/external/maplibre-globe.ts  # MapLibre+Turf adapter
  src/external/rotation.ts   # idle rotation controller
  src/presenter/filters-card.ts  results-card.ts  globe-controls.ts  ad-slot.ts  tooltip.ts  app.ts
  src/presenter/styles.css
  src/i18n/{index.ts,pt.json,en.json,es.json}
data/
  build_geo.py            # states/mun/world simplification → web/public/geo
  build_abroad.py         # TSE config + manual table → api/assets/abroad-cities.json
  abroad_countries.py     # manual city→country table (from mockup, reviewed)
Dockerfile  .dockerignore  .env.example  .gitignore  README.md  LICENSE(MIT)
.github/workflows/ci.yml  .github/dependabot.yml
```

## API contract (shared by Tasks 2–8)

```jsonc
// AreaResult — votes as integers; "released" false while TSE is zeroed
{ "el":0, "comp":0, "abst":0, "vv":0, "vb":0, "vn":0, "l":0, "f":0,
  "st":0, "ts":0, "dg":"25/10/2026", "hg":"17:12:03", "released":false }
// GET /api/v1/summary
{ "updatedAt":"RFC3339", "stale":false,
  "candidates":[{"n":13,"name":"LULA","party":"PT","sqcand":"280002542548"},
                {"n":22,"name":"FLÁVIO BOLSONARO","party":"PL","sqcand":"280002551544"}],
  "br":AreaResult, "brUfsSum":AreaResult, "zz":AreaResult,
  "ufs":{"ac":AreaResult,...}, "countries":{"392":AreaResult,...} }
// GET /api/v1/uf/{uf}/municipalities   (uf lowercase, 27 UFs)
{ "uf":"ba", "updatedAt":"...", "items":{"2900207":AreaResult,...} }   // key = IBGE code
// GET /api/v1/abroad/cities
{ "updatedAt":"...", "items":{"30627":AreaResult,...} }                 // key = TSE code
// GET /api/v1/config
{ "ads":{ "adsenseClient":"", "slotResults":"", "slotMobile":"",
          "house":{"image":"/ads/tapp-banner.svg","link":"https://tapp.solutions","alt":"Tapp Solutions"} } }
```

---

### Task 1: Repo scaffold + geometry/abroad data

**Files:**
- Create: `data/abroad_countries.py` (move from mockup scratchpad), `data/build_abroad.py`, `data/build_geo.py`, `api/assets/abroad-cities.json`, `web/public/geo/{states,world}.json`, `web/public/geo/mun/<uf>.json` ×27, `.gitignore`, `LICENSE`, `.env.example`
- Init: `git init`, `gh repo create ToteADS/eleicoes2turno --public`

**Interfaces:**
- Produces: `abroad-cities.json` = `[{cd,nm,country,iso,lat,lon}]` (186, `nm` title-case), written to both `api/assets/` and `web/public/data/`; `states.json` GeoJSON with `properties.uf` (uppercase); `mun/<uf>.json` GeoJSON with `properties.id` (IBGE 7 dígitos) and `properties.name`; `world.json` GeoJSON (50m, sem Antártida e sem Brasil) with `properties.iso` (int).

- [ ] **Step 1:** `build_abroad.py` reads TSE `mun-e006258-cm.json` block `zz` + `abroad_countries.C`; fails if any TSE city is missing from the table; writes `api/assets/abroad-cities.json`. Run: `python3 -I data/build_abroad.py` → prints `186 cities, 133 countries`.
- [ ] **Step 2:** `build_geo.py`: Douglas-Peucker (ε=0.01° states, 0.004° municipalities, rounding 3 decimals) over `click_that_hood` states and `tbrugz/geodata-br` municipalities; world-atlas 50m topojson → GeoJSON. Run: `python3 -I data/build_geo.py` → 27 mun files, total `web/public/geo` < 12 MB.
- [ ] **Step 3:** `.gitignore` (`node_modules`, `dist`, `.env`, `.superpowers/`, `coverage`), MIT `LICENSE`, `.env.example` (all keys from Task 5 with empty/placeholder values).
- [ ] **Step 4:** Commit `chore: scaffold repo with geometry and abroad city data`; create public repo and push.

### Task 2: Go domain entities + TSE parser

**Files:**
- Create: `api/go.mod` (module `eleicoes2turno`), `internal/domain/entities/{result,abroad}.go`, `internal/infra/tse/{parse,catalog}.go`, `internal/infra/tse/testdata/{br-zeroed.json,mun-ba-abare.json,released-sample.json,mun-cm-sample.json}`
- Test: `internal/infra/tse/parse_test.go`, `catalog_test.go`

**Interfaces:**
- Produces:
  - `type AreaResult struct{ Electorate, Turnout, Abstention, Valid, Blank, Null, Lula, Flavio, SectionsCounted, SectionsTotal int64; Date, Time string; Released bool }` with JSON tags `el,comp,abst,vv,vb,vn,l,f,st,ts,dg,hg,released`.
  - `type Candidate struct{ Number int; Name, Party, Sqcand string }` (tags `n,name,party,sqcand`).
  - `func ParseResult(b []byte) (entities.AreaResult, []entities.Candidate, error)` — maps `e.te/e.c/e.a`, `v.vv/v.vb/v.tvn`, `s.st/s.ts`, `dg/hg`, candidate `vap` by number 13/22; `Released = SectionsCounted > 0`.
  - `type Municipality struct{ UF, TSECode, IBGECode, Name string }`; `func ParseCatalog(b []byte) ([]Municipality, error)` (excludes nothing; `zz` entries have empty IBGE).

- [ ] **Step 1: failing tests** — `TestParseResult_Zeroed`: br-zeroed fixture → `Electorate==158745502`, `Lula==0`, `Released==false`, 2 candidates with sqcand `280002542548`/`280002551544`. `TestParseResult_Released`: synthetic released-sample (vap 13=600, 22=400, st=10, ts=20) → `Lula==600`, `Flavio==400`, `Released==true`. `TestParseResult_Invalid`: `[]byte("{")` → error. `TestParseCatalog`: sample → BA Abaré `{UF:"ba",TSECode:"33030",IBGECode:"2900207"}`; zz entry with `IBGECode==""`.
- [ ] **Step 2:** `cd api && go test ./internal/infra/tse/...` → FAIL (undefined).
- [ ] **Step 3:** implement; numbers in TSE are strings → `strconv.ParseInt`, empty → 0.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5:** commit `feat(api): TSE result and catalog parsing`.

### Task 3: Aggregation usecases + memory store

**Files:**
- Create: `internal/domain/usecases/aggregate.go`, `internal/domain/repositories/{store,source}.go`, `internal/infra/cache/memory.go`
- Test: `aggregate_test.go`, `memory_test.go`

**Interfaces:**
- Consumes: Task 2 entities.
- Produces:
  - `func SumResults(rs ...entities.AreaResult) entities.AreaResult` (sums ints; `Released` if any released; `Date/Time` = latest).
  - `func BuildCountries(cities []entities.AbroadCity, byCode map[string]entities.AreaResult) map[int]entities.AreaResult`.
  - `type Snapshot struct{ UpdatedAt time.Time; Stale bool; Candidates []Candidate; BR, BRUfsSum, ZZ AreaResult; UFs map[string]AreaResult; Countries map[int]AreaResult }`.
  - `type ResultStore interface{ SetSummary(Snapshot); SetMunicipalities(uf string, items map[string]AreaResult, at time.Time); SetAbroadCities(items map[string]AreaResult, at time.Time); Payload(key string) (body []byte, gz []byte, etag string, ok bool) }` keys: `summary`, `mun:<uf>`, `abroad`.
  - `type ResultSource interface{ Fetch(ctx context.Context, path string) (body []byte, notModified bool, err error) }`.
- [ ] **Step 1: failing tests** — `TestSumResults` (two areas sum; released OR); `TestBuildCountries_Japan` (3 cities 30627/30198/29742 → key 392 sums); `TestMemoryStore_PayloadETagChanges` (SetSummary twice with different data → different etag; same data → same etag; gz decompresses to body).
- [ ] **Step 2–4:** run FAIL → implement (etag = first 16 hex of sha256) → PASS.
- [ ] **Step 5:** commit `feat(api): aggregation and in-memory payload store`.

### Task 4: Poller service + TSE HTTP client

**Files:**
- Create: `internal/infra/tse/client.go`, `internal/domain/services/poller.go`
- Test: `client_test.go` (httptest), `poller_test.go` (fake ResultSource)

**Interfaces:**
- Consumes: `ResultSource`, `ResultStore`, `ParseResult`, `ParseCatalog`, `SumResults`, `BuildCountries`.
- Produces: `func NewClient(base string, timeout time.Duration) *Client` (implements `ResultSource`; keeps per-path `Last-Modified` + last body; sends `If-Modified-Since`; on 304 returns cached body with `notModified=true`); `func NewPoller(src ResultSource, store ResultStore, cat []Municipality, abroad []AbroadCity, opt PollerOptions) *Poller`; `type PollerOptions struct{ FastInterval time.Duration; MunConcurrency int }`; `func (p *Poller) Run(ctx context.Context)`; `func (p *Poller) RunFastOnce(ctx) error`; `func (p *Poller) SweepMunicipalitiesOnce(ctx) error`.
- Paths: `ele2026/6258/dados/br/br-c0001-e006258-u.json`, `.../dados/<uf>/<uf>-c0001-e006258-u.json`, `.../dados/<uf>/<uf><cd>-c0001-e006258-u.json`.
- [ ] **Step 1: failing tests** — `TestClient_ConditionalGet` (server returns 200 + Last-Modified, then 304 when header present → second call `notModified==true` and same body); `TestPoller_FastOnce_BuildsSummary` (fake source with BR + 2 UFs + zz + 3 Japan cities → `store.Payload("summary")` JSON has `countries.392`, `brUfsSum` = sum of UFs); `TestPoller_KeepsLastGoodOnError` (2nd fast cycle all errors → payload unchanged; after 3 failed cycles `stale==true`); `TestPoller_SweepGroupsByUF` (municipalities written under `mun:ba` keyed by IBGE; entries without IBGE skipped).
- [ ] **Step 2–4:** FAIL → implement (fast cycle uses errgroup-style bounded concurrency 8; sweep concurrency `MunConcurrency`; write `mun:<uf>` after each UF completes) → PASS.
- [ ] **Step 5:** commit `feat(api): TSE poller with conditional requests`.

### Task 5: HTTP presentation, config, main

**Files:**
- Create: `pkg/config/config.go`, `pkg/logger/logger.go`, `pkg/response/response.go`, `pkg/errors/errors.go`, `internal/presentation/middlewares/{security,ratelimit,cors}.go`, `internal/presentation/handlers/{data,config,adstxt,health,static}.go`, `internal/presentation/routes/routes.go`, `cmd/api/main.go`
- Test: `middlewares/*_test.go`, `handlers/*_test.go`, `config_test.go`

**Interfaces:**
- Consumes: `ResultStore`, `Poller`.
- Produces: env keys — `PORT` (8080), `TSE_BASE_URL` (spec base), `FAST_INTERVAL` (30s), `MUN_CONCURRENCY` (4), `ALLOWED_ORIGIN` (`https://eleicoes2turno.tapp.solutions`), `TRUST_CLOUDFLARE` (false), `STATIC_DIR` (`/app/web`), `ADSENSE_CLIENT`, `ADSENSE_SLOT_RESULTS`, `ADSENSE_SLOT_MOBILE`, `HOUSE_AD_IMAGE` (`/ads/tapp-banner.svg`), `HOUSE_AD_LINK` (`https://tapp.solutions`), `HOUSE_AD_ALT` (`Tapp Solutions`).
- Routes: `GET /api/v1/summary`, `GET /api/v1/uf/{uf:[a-z]{2}}/municipalities` (404 for unknown UF; 503 `{"error":"not_ready"}` before first sweep of that UF), `GET /api/v1/abroad/cities`, `GET /api/v1/config`, `GET /ads.txt` (404 when no ADSENSE_CLIENT), `GET /healthz`, everything else → static with SPA fallback to `index.html`; `/assets/*` immutable cache.
- CSP: `default-src 'self'; img-src 'self' data: https://resultados.tse.jus.br; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self' blob:; child-src blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'` — when `ADSENSE_CLIENT` set, append AdSense hosts (`https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://adservice.google.com https://www.google.com https://tpc.googlesyndication.com` to script/img/frame/connect; `frame-src` added).
- [ ] **Step 1: failing tests** — `TestSecurityHeaders` (CSP contains `frame-ancestors 'none'`, HSTS, nosniff); `TestCSP_WithAdsense` (contains `pagead2.googlesyndication.com`); `TestRateLimit_429` (41 rapid requests same IP → at least one 429); `TestClientIP_Cloudflare` (TRUST_CLOUDFLARE uses `CF-Connecting-IP`); `TestSummary_ETag304` (If-None-Match → 304); `TestSummary_Gzip` (Accept-Encoding gzip → Content-Encoding gzip); `TestMunicipalities_UnknownUF404`; `TestAdsTxt` (client `ca-pub-9424129340132469` → body `google.com, pub-9424129340132469, DIRECT, f08c47fec0942fa0`; empty → 404); `TestConfigDefaults`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Server: `ReadHeaderTimeout 5s, ReadTimeout 10s, WriteTimeout 20s, IdleTimeout 60s`; SIGINT/SIGTERM shutdown 10s.
- [ ] **Step 5:** `go vet ./... && go test ./... -cover` green; run locally `go run ./cmd/api` and `curl -s localhost:8080/api/v1/summary | head -c 300` shows real BR electorate.
- [ ] **Step 6:** commit `feat(api): HTTP API, security middlewares and entrypoint`.

### Task 6: Web domain, API client, i18n

**Files:**
- Create: `web/package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/domain/{types,filters,split,format}.ts`, `src/infra/api.ts`, `src/i18n/{index.ts,pt.json,en.json,es.json}`
- Test: `src/domain/*.test.ts`, `src/infra/api.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: TS mirrors of the API contract (`AreaResult`, `Summary`, `MunicipalitiesResponse`, `AbroadCitiesResponse`, `PublicConfig`) + `AbroadCity {cd,nm,country,iso,lat,lon}` loaded from static `/data/abroad-cities.json` (Task 1).
  - `filters.ts`: `type Country = 'ALL' | 'BR' | number`; `interface FilterState{ country: Country; region: Region | 'ALL'; uf: string | null; city: string | null }`; `initialFilters(): FilterState` = `{country:'ALL',region:'ALL',uf:null,city:null}`; `setCountry/setRegion/setUf/setCity(state, v): FilterState` (setUf sets region; setCountry resets lower levels; setRegion clears uf/city); `REGION_OF: Record<string, Region>`.
  - `split.ts`: `splitFeature(f: Feature, share: number, props: object): Feature[]` (bbox-clip at `minX+(maxX-minX)*share`, west part `side:'L'`, east `side:'R'`; share outside (0,1) or NaN → single feature `side:'X'`); `leaderSide(r: AreaResult): 'L'|'R'|'X'`; `share(r): number|null` (null when not released or `l+f==0`).
  - `format.ts`: `formatInt(n)`, `formatPct(p, digits=2)` (pt-BR, e.g. `50,36%`).
  - `api.ts`: `class ApiClient{ constructor(base='/api/v1', fetchFn=fetch); summary(): Promise<Summary>; municipalities(uf): Promise<MunicipalitiesResponse>; abroadCities(); config() }` with `AbortSignal` support; `latest<T>(key, run)` helper that discards stale responses (last call per key wins).
  - i18n: `t(key)`, `setLocale(l)`, keys prefixed `filters_`, `results_`, `globe_`, `ads_`, `status_`.
- [ ] **Step 1: failing tests** — filters transitions (setUf('BA') → region 'NE'; setCountry(392) → uf/city null); `splitFeature` square 0..10 share .6 → L bbox maxX 6, R minX 6; share null → one `X`; `share()` zeroed → null; `formatPct(.5036)` → `50,36%`; `latest` race: two calls, first resolves last → only second result delivered; ApiClient builds `/api/v1/uf/ba/municipalities`.
- [ ] **Step 2–4:** `npm test` FAIL → implement → PASS.
- [ ] **Step 5:** commit `feat(web): domain, api client and i18n`.

### Task 7: Globe adapter (MapLibre) + rotation

**Files:**
- Create: `src/infra/globe.ts`, `src/external/maplibre-globe.ts`, `src/external/rotation.ts`
- Test: `src/external/rotation.test.ts`, `src/external/maplibre-globe.test.ts` (mocked `maplibre-gl`)

**Interfaces:**
- Consumes: `splitFeature`, `leaderSide`, types.
- Produces (`globe.ts`):
```ts
export interface GlobeRenderer {
  mount(el: HTMLElement): Promise<void>;
  setWorld(world: FeatureCollection, countries: Record<number, AreaResult>): void;
  setStates(states: FeatureCollection, ufs: Record<string, AreaResult>): void;
  setMunicipalities(uf: string | null, geo: FeatureCollection | null, items: Record<string, AreaResult>): void;
  setAbroadCities(cities: AbroadCity[], items: Record<string, AreaResult>): void;
  focus(view: GlobeView): void;          // highlight + dim + camera flight
  setPadding(p: {top:number,right:number,bottom:number,left:number}): void;
  onPick(cb: (pick: GlobePick) => void): void;   // click on country/state/municipality/city
  onHover(cb: (hover: GlobeHover | null) => void): void;
  onUserInteract(cb: () => void): void;
  rotation: RotationController;
  zoomIn(): void; zoomOut(): void; resetView(): void;
}
export type GlobeView = { kind:'all' } | { kind:'brazil', region: Region|'ALL' } | { kind:'uf', uf:string } | { kind:'municipality', uf:string, id:string } | { kind:'country', iso:number } | { kind:'abroadCity', cd:string };
export type GlobePick = { kind:'uf', uf:string } | { kind:'municipality', id:string } | { kind:'country', iso:number } | { kind:'abroadCity', cd:string } | { kind:'brazil' };
export interface RotationController { start(): void; stop(): void; toggle(): boolean; readonly running: boolean; onChange(cb:(running:boolean)=>void): void }
```
- Behavior: `{kind:'all'}` → camera centered on Brazil (`[-52,-14]`, zoom 1.8 desktop / 1.2 phone) and `rotation.start()`; any `focus` other than `all` stops rotation; user drag/wheel/touch stops rotation. Rotation = `easeTo` −12° longitude per 3 s linear. Countries crossing antimeridian (bbox width > 180°) and non-mainland pieces painted by leader (no split). Brazil excluded from world layer. Cities layer: halo + circle by leader, radius `3 + sqrt(el)/22` scaled by zoom (top-level `interpolate`).
- [ ] **Step 1: failing tests** — `rotation`: start → running true; stop → false; toggle twice returns false/true; onChange fires. Adapter (mock map): `focus({kind:'uf',uf:'BA'})` calls `fitBounds` with current padding and stops rotation; `focus({kind:'all'})` calls `flyTo` with center `[-52,-14]` then rotation starts on `moveend`.
- [ ] **Step 2–4:** FAIL → implement (port the mockup `globe.template.html` logic into the adapter) → PASS.
- [ ] **Step 5:** commit `feat(web): MapLibre globe adapter with idle rotation`.

### Task 8: Presenter — cards, controls, ads, responsive app

**Files:**
- Create: `index.html`, `src/main.ts`, `src/presenter/{app,filters-card,results-card,globe-controls,ad-slot,tooltip}.ts`, `src/presenter/styles.css`, `public/ads/tapp-banner.svg`
- Test: `src/presenter/results-card.test.ts`, `ad-slot.test.ts`, `app.test.ts` (jsdom, fake GlobeRenderer + fake ApiClient)

**Interfaces:**
- Consumes: everything above.
- Produces: `createApp({root, api, globe, i18n}): Promise<void>`; polling of `/summary` every 30 s (and municipalities of the selected UF every 60 s) while `document.visibilityState==='visible'`.
- Results card shows: crumb, title, sub (`"soma das UFs"` / `"soma das cidades"` labels when derived), sections %, candidate photo `https://resultados.tse.jus.br/oficial/ele2026/6258/fotos/br/<sqcand>.jpeg`, number+party, %, votes, LIDERA badge, red/blue bar, rows (válidos, brancos, nulos, comparecimento, abstenção, eleitorado), TSE timestamp, `stale` notice; zeroed → `status_waiting` text.
- Country select options order: `Todos os países`, `Brasil`, then countries A→Z.
- Globe controls (icon buttons, `aria-label` via i18n): play/pause, reset, zoom in, zoom out, fullscreen (hidden when Fullscreen API unavailable, e.g. iPhone).
- Ad slot: AdSense `<ins class="adsbygoogle">` when `adsenseClient` + slot set (script injected once); else house banner `<a rel="sponsored noopener" target="_blank">`; label "Publicidade". Desktop/tablet: inside results card bottom; phone: fixed 320×50 above bottom sheet.
- Responsive: phone — top bar (current scope + "Filtros" button opening a sheet with the 4 fields), bottom sheet collapsible (collapsed: both percentages + sections %); tablet portrait = phone layout with wider sheet; tablet landscape/desktop = floating cards (results 400px desktop, 340px tablet). Globe padding updated on resize and sheet toggle via `globe.setPadding`.
- [ ] **Step 1: failing tests** — results card zeroed → shows `status_waiting`, no LIDERA; released 600×400 → `60,00%`/`40,00%`, LIDERA on Lula; derived scope shows "soma"; ad slot with house config renders link `https://tapp.solutions` with `rel` containing `sponsored`; with adsense config renders `ins.adsbygoogle[data-ad-client="ca-pub-9424129340132469"]`; app: changing uf calls `globe.focus({kind:'uf',uf:'BA'})` and fetches municipalities once; picking a country on globe updates the country select.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** `npm run build` OK; local run (`go run` serving `web/dist`) — manual check in Chrome devtools at 390×844, 740×360, 820×1180, 1180×820, 1440×900: no overlap, globe visible, sheet ≤40% collapsed height.
- [ ] **Step 6:** commit `feat(web): floating cards, globe controls, ads and responsive layout`.

### Task 9: Container, CI, README, publish

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `README.md`

- [ ] **Step 1:** Dockerfile multi-stage: `node:20-alpine` (npm ci, build web) → `golang:1.25-alpine` (`CGO_ENABLED=0 go build -trimpath -ldflags "-s -w"`) → `gcr.io/distroless/static-debian12:nonroot`; copies binary + `web/dist` to `/app/web`; `EXPOSE 8080`; `USER nonroot`. Run: `docker build -t eleicoes2turno . && docker run --rm -p 8080:8080 eleicoes2turno` → `curl -s localhost:8080/healthz` = `ok`.
- [ ] **Step 2:** CI: on push/PR — `go vet`, `go test -cover`, `govulncheck`, `npm ci && npm test && npm run build`, `npm audit --audit-level=high`, docker build. Dependabot: gomod, npm, github-actions, docker weekly.
- [ ] **Step 3:** README (pt): o que é, fonte (TSE), arquitetura, rodar local, variáveis de ambiente, deploy no Coolify (Dockerfile, porta 8080, healthcheck `/healthz`, domínio, recomendação Cloudflare proxy + `TRUST_CLOUDFLARE=true`), anúncios (AdSense via env).
- [ ] **Step 4:** secret scan before push: `git ls-files | xargs grep -nE "(pk\.|sk_|AKIA|ghp_|-----BEGIN)"` → no matches; `npm audit` and `govulncheck` clean.
- [ ] **Step 5:** commit `chore: container, CI and docs`; push to `ToteADS/eleicoes2turno`.

### Task 10 (after the 17h peak): coverage + docs + hardening

- [ ] Raise Go and TS coverage to 100% on domain/usecases/infra/presenter logic (`go test ./... -coverprofile`, `vitest --coverage`).
- [ ] `docs/apuracao-globo.md` with the user's mandatory structure (Título, Descrição, O que foi feito, Tecnologias, Estrutura de arquivos, Como funciona, Testes, Dependências, Observações).
- [ ] Enable CodeQL workflow; review Dependabot PRs.
- [ ] Commit `test: full coverage` / `docs: feature documentation`.
