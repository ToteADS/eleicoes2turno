# Apuração 2º turno 2026 · Globo ao vivo

Acompanhe a apuração do 2º turno da eleição presidencial de 2026 em um **globo 3D interativo**.
Cada área — país, estado, município — é dividida em vermelho (Lula, à esquerda) e azul
(Flávio Bolsonaro, à direita) na proporção dos votos. Os filtros **País → Região → Estado → Cidade**
fazem a câmera voar até o recorte escolhido.

Produção: <https://eleicoes2turno.tapp.solutions>

## Dados

Todos os números vêm dos arquivos públicos do TSE em `resultados.tse.jus.br` (eleição `6258`,
cargo Presidente). O TSE só divulga a partir das 17h de Brasília; antes disso o site mostra
"aguardando divulgação".

- O total oficial é o de **Todos os países** (arquivo do Brasil, que inclui o exterior).
- "Brasil" sozinho, regiões e países do exterior são **somas** (das UFs ou das cidades), sempre rotuladas.
- O TSE não agrupa o exterior por país: a tabela cidade → país é nossa (`data/abroad_countries.py`).
- Geometrias: IBGE (estados e municípios) e Natural Earth (países), simplificadas em `data/build_geo.py`.

## Arquitetura

Um único container: a API em Go faz o polling do TSE, guarda tudo em memória e serve a API e o site.

```
api/   Go (Clean Architecture): domain (entities, usecases, services, repositories)
       infra (tse client/parser, cache) · presentation (handlers, middlewares, routes) · pkg
web/   Vite + TypeScript: domain · infra (API, geometria, interface do globo)
       external (adapter MapLibre GL) · presenter (cards, controles, anúncios) · i18n (pt/en/es)
data/  scripts que geram as geometrias e a tabela do exterior
```

- **Polling:** Brasil, UFs e exterior a cada 30 s. Os 5.570 municípios são varridos com
  concorrência 4 e `If-Modified-Since`, então o TSE responde 304 quando nada mudou.
- **Pico de acesso:** as respostas são pré-serializadas e pré-comprimidas, com `ETag` e
  `Cache-Control` pensado para CDN.
- **Segurança:** CSP estrita, HSTS, limite de requisições por IP, CORS restrito, usuário não-root.
  Não há segredos: todos os valores de configuração são públicos.

## API

Tudo sob `/api/v1`, com limite de requisições por IP (30 req/s, rajada de 60).

| Rota | Uso |
|---|---|
| `GET /summary` | Brasil, UFs, exterior, países e metadados de atualização |
| `GET /uf/{uf}/municipalities` | Resultados dos municípios de uma UF (sigla minúscula) |
| `GET /abroad/cities` | Resultados das cidades do exterior |
| `GET /config` | Configuração pública do site (anúncios) |
| `POST /presence` | Batimento da aba aberta (`{"id":"<id aleatório da aba>"}`, até 256 bytes, id com 8–64 caracteres `[A-Za-z0-9-]`). Responde `{"online": n}` com `Cache-Control: no-store`; entrada inválida → 400, outro método → 405. Detalhes em [`docs/contador-online.md`](docs/contador-online.md) |
| `GET /healthz` | Healthcheck (fora de `/api/v1`) |

## Rodar localmente

```bash
# API (porta 8080) — precisa de internet para falar com o TSE
cd api && go run ./cmd/api

# Web com hot reload (proxy de /api para a porta 8080)
cd web && npm ci && npm run dev
```

Testes: `cd api && go test -race ./...` · `cd web && npm test`

Container: `docker build -t eleicoes2turno . && docker run -p 8080:8080 eleicoes2turno`

## Variáveis de ambiente

Veja `.env.example`. As principais:

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `8080` | Porta HTTP |
| `ALLOWED_ORIGIN` | `https://eleicoes2turno.tapp.solutions` | CORS da API |
| `TRUST_CLOUDFLARE` | `false` | `true` quando o Cloudflare faz proxy (usa `CF-Connecting-IP` no limite de requisições) |
| `FAST_INTERVAL` | `30s` | Intervalo do ciclo rápido |
| `MUN_CONCURRENCY` | `1` | Requisições simultâneas ao TSE na varredura de municípios |
| `MUN_PACE` | `500ms` | Pausa após cada requisição da varredura (o TSE bloqueia clientes que pedem demais) |
| `ABROAD_EVERY` | `4` | Atualiza as cidades do exterior a cada N ciclos rápidos |
| `ADSENSE_CLIENT` | vazio | ID de publisher (`ca-pub-…`); liga o AdSense e o `/ads.txt` |
| `ADSENSE_SLOT_RESULTS` / `ADSENSE_SLOT_MOBILE` | vazio | Blocos de anúncio |
| `HOUSE_AD_IMAGE` / `HOUSE_AD_LINK` / `HOUSE_AD_ALT` | banner da Tapp | Banner próprio, mostrado quando o AdSense não está configurado |

## Deploy (Coolify)

1. Crie uma aplicação a partir deste repositório usando o **Dockerfile**, com a porta `8080`.
2. Healthcheck: `GET /healthz`. A imagem já define `HEALTHCHECK` com `wget`.
3. Domínio: `https://eleicoes2turno.tapp.solutions`.
4. Recomendado para picos de acesso: Cloudflare na frente, com proxy ligado, e `TRUST_CLOUDFLARE=true`.
5. Rode **uma réplica**, porque cada réplica faz o próprio polling do TSE.

## Licença

MIT. Os dados são do TSE (públicos), as malhas geográficas são do IBGE e os países são do Natural Earth (domínio público).
