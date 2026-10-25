# Apuração 2º turno 2026 — Globo interativo (design)

Data: 2026-10-25 (dia do 2º turno). Domínio: `eleicoes2turno.tapp.solutions`.
Repositório: público no GitHub, conta **ToteADS**. Deploy: Coolify (o usuário cria o subdomínio).

## 1. Intenção

Um site de acompanhamento da apuração do 2º turno para Presidente, construído em torno de um
**globo 3D interativo** (referência: globe.taboo.tv). Cada área (país, estado, município) é
pintada com uma "divisão" vermelho (Lula) × azul (Flávio Bolsonaro): a área é cortada por uma
linha norte-sul na proporção dos votos — vermelho à esquerda, azul à direita. Visual **clean**,
tema claro, globo ocupando a tela inteira; filtros e resultados em **cards flutuantes**.

Precisa estar no ar hoje, antes do pico da apuração (urnas fecham 17h de Brasília; o TSE só
divulga a partir daí, inclusive o exterior).

### Objetivos
- Mostrar resultados oficiais do TSE com atualização automática.
- Navegação por filtros que **pilotam a câmera** do globo (voo `flyTo`/`fitBounds`).
- Funcionar muito bem em **celular, tablet e desktop**.
- Repositório público com arquitetura limpa, sem segredos e sem vulnerabilidades conhecidas.
- Espaços de anúncio prontos (banner próprio hoje; AdSense ligável por configuração depois).

### Não-objetivos (hoje)
- Governador, 1º turno, histórico de eleições anteriores.
- Contas de usuário, comentários, compartilhamento social elaborado.
- Previsões/projeções próprias — só dados oficiais.

### Anti-objetivos (seria fracasso mesmo "funcionando")
- Mostrar número que não veio do TSE como se fosse oficial (o mockup usa dados fictícios;
  produção **nunca**).
- Derrubar/ser bloqueado pelo TSE por excesso de requisições, ou cair no pico de acesso.
- Anúncio cobrindo o globo ou os números no celular.
- Segredo (token, chave) commitado no repositório público.

## 2. Fonte de dados (verificado hoje contra a API pública do TSE)

Base: `https://resultados.tse.jus.br/oficial`. Ciclo `ele2026`, eleição **6258** (Federal, 2º turno).
Tudo público, sem autenticação; CORS aberto; `cache-control: max-age≈60`.

| Recurso | Caminho |
|---|---|
| Config de eleições | `comum/config/ele-c.json` |
| Municípios por UF (+ exterior `zz`) | `ele2026/6258/config/mun-e006258-cm.json` — campo `cd` (código TSE), `cdi` (código IBGE; vazio no exterior), `nm` |
| Totais Brasil (inclui exterior) | `ele2026/6258/dados/br/br-c0001-e006258-u.json` |
| Totais UF | `ele2026/6258/dados/<uf>/<uf>-c0001-e006258-u.json` (28 incl. `zz`) |
| Totais município / cidade do exterior | `ele2026/6258/dados/<uf>/<uf><cd>-c0001-e006258-u.json` |
| Foto do candidato | `ele2026/6258/fotos/br/<sqcand>.jpeg` |

São **5.570 municípios + 186 cidades no exterior + 28 UFs + BR**. Não existe arquivo agregado
"todos os municípios de uma UF". Campos usados do arquivo `-u`: `dg/hg` (data/hora), `s.st/s.ts/s.pst`
(seções totalizadas), `e.te/e.c/e.a` (eleitorado/comparecimento/abstenção), `v.vv/v.vb/v.tvn`
(válidos/brancos/nulos), `carg[0].agr[].par[].cand[]` (`n`, `nmu`, `sqcand`, `vap`, `pvapn`, `e`).

O TSE **não agrupa o exterior por país**. O mapeamento cidade→país (+ ISO numérico + lat/lon) é
uma tabela nossa (já montada: 186 cidades, 133 países; eleitorado confere com o TSE: 916.683).

## 3. Arquitetura

Monorepo, **um container** no Coolify: a API em Go serve `/api/v1/*` **e** os arquivos estáticos
do frontend.

```
eleicoes2turno/
├── api/                      # Go — Clean Architecture (padrão do usuário)
│   ├── cmd/api/main.go
│   ├── internal/domain/{entities,repositories,usecases,services}
│   ├── internal/infra/{tse,cache,http}
│   ├── internal/presentation/{handlers,middlewares,routes}
│   └── pkg/{config,errors,logger,response}
├── web/                      # Vite + TypeScript puro
│   └── src/{domain,infra,external,presenter,i18n}
├── data/                     # scripts de preparo de geometria (one-off, reprodutíveis)
├── Dockerfile                # multi-stage: node build → go build → distroless nonroot
├── docs/
└── .github/                  # CI (lint+test+build), Dependabot, CodeQL
```

### 3.1 Backend (Go)
- Stack: gorilla/mux, godotenv (config singleton), `golang.org/x/time/rate`. Sem banco.
- **Poller** (serviço de domínio + adapter TSE em `infra/tse`):
  - Ciclo rápido (~30 s): BR, 28 UFs e as 186 cidades do exterior.
  - Ciclo de municípios: 5.570 arquivos com concorrência limitada (≈8) e `If-Modified-Since`
    (respostas 304 são baratas), varredura contínua.
  - Backoff em erro; nunca apaga o último dado bom (serve o "stale" com timestamp).
  - Antes das 17h o TSE devolve zeros — tratado como "aguardando divulgação".
- **Cache em memória** (interface em `domain/repositories`, impl em `infra/cache`), snapshot
  pré-serializado em JSON (+ gzip) para servir barato no pico.
- **Endpoints** (`/api/v1`, somente GET, respostas pequenas e cacheáveis com `Cache-Control` curto + `ETag`):
  - `GET /summary` — BR, UFs, exterior total, países (agregados das cidades), metadados de atualização.
  - `GET /uf/{uf}/municipalities` — resultados por código IBGE da UF.
  - `GET /abroad/cities` — resultados por cidade do exterior.
  - `GET /config` — configuração pública do frontend (anúncios), vinda de variáveis de ambiente.
  - `GET /healthz`.
- **Segurança**: cabeçalhos (CSP estrita, HSTS, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy, frame-ancestors none), rate limit por IP (confiando em `X-Forwarded-For`
  só do proxy do Coolify), CORS restrito ao domínio, timeouts de servidor, graceful shutdown,
  roda como usuário não-root em imagem distroless. Nenhum segredo necessário.

### 3.2 Frontend (Vite + TS)
- Camadas (Clean Arch adaptada): `domain` (entidades de resultado, regras de agregação,
  máquina de estados dos filtros), `infra` (cliente da nossa API, interface do renderizador),
  `external` (adapter **MapLibre GL** + Turf — encapsulados atrás da nossa interface, regra R1),
  `presenter` (cards, controles, responsividade).
- **MapLibre GL JS** (open source, globo nativo, sem token) — não Mapbox (token pago).
- Geometria **pré-processada e versionada** em `web/public/geo/`: UFs, municípios por UF
  (simplificados), países (world-atlas 50m). Nada de CDN de terceiros em runtime.
- Fonte self-hosted (Archivo via @fontsource) para manter a CSP fechada.
- Fotos dos candidatos servidas do domínio do TSE (liberado em `img-src`).
- i18n: `pt` (padrão), `en`, `es`, chaves flat com prefixo por feature.

## 4. Comportamento

### Filtros (card flutuante)
`País → Região → Estado → Cidade`.
- **País** (padrão: **Todos os países**): `Todos os países`, `Brasil`, depois os 133 países do exterior.
  - *Todos*: globo mostra estados do Brasil + todos os países com votos; painel mostra o total
    oficial (BR, que inclui o exterior).
  - *Brasil*: só o Brasil; Região/Estado/Cidade habilitados.
  - *País estrangeiro*: Região/Estado desabilitados; Cidade lista as cidades daquele país.
- Região → zoom na região (demais estados em cinza). Estado → carrega municípios da UF e voa até ela.
  Cidade (busca por nome) → voa até o município/cidade.
- Clicar no globo (país, estado, município, ponto de cidade) também filtra.

### Globo
- Ao abrir: centrado no **Brasil** e **girando** devagar (como a Taboo).
- **Para de girar** quando o usuário interage (arrastar, roda/pinça, toque, clique) ou troca filtro.
- **Controles do globo** (grupo flutuante): girar/pausar, reiniciar (volta ao Brasil e volta a
  girar), aproximar, afastar, tela cheia. Acessíveis por teclado, com rótulos.
- Voos respeitam a área ocupada pelos cards (padding dinâmico).
- Cidades do exterior: pontos coloridos pelo líder, tamanho pelo eleitorado. Países pequenos
  demais para o mapa (Hong Kong, Singapura, ilhas) aparecem só como ponto.
- Países que cruzam a linha de data (Rússia, Fiji) e territórios separados: pintados pelo
  vencedor, sem divisão.

### Card de resultados
Caminho (ex. "Exterior › Japão"), nome do recorte, % de seções totalizadas, foto + número +
partido + % + votos de cada candidato, selo "LIDERA", barra vermelho/azul, válidos, brancos,
nulos, comparecimento, abstenção, eleitorado, horário da última atualização do TSE.
Estado "aguardando divulgação (17h)" enquanto o TSE estiver zerado.

#### Atualização
O site busca o resumo a cada 30 s com a aba visível. Quando a aba volta a ficar visível
(`visibilitychange`), busca na hora em vez de esperar o próximo ciclo; uma flag evita duas
buscas simultâneas. Ao lado de "Atualizado pelo TSE às HH:MM" aparece "verificado há 12 s"
(a partir de 60 s, "verificado há 2 min"): é a idade da última busca do resumo que deu certo,
medida no navegador, para mostrar que o site está vivo mesmo quando o arquivo do TSE não muda.
Só esse rótulo é redesenhado, a cada 1 s (`web/src/presenter/checked-ago.ts`); o card inteiro
não. Só no 2º turno: o 1º turno é um retrato final e não mostra o rótulo. Textos em pt/en/es
(`status_checked_s`, `status_checked_min`).

### Responsividade
- **Desktop (≥1024)**: filtros no topo à esquerda, resultados à direita (≈400px), controles embaixo à esquerda.
- **Tablet (640–1023)**: paisagem igual ao desktop com card mais estreito; retrato com resultados em painel inferior.
- **Celular (<640)**: barra superior compacta com o recorte atual; filtros abrem numa folha
  (sheet); resultados num painel inferior recolhível (recolhido mostra só as duas %);
  controles do globo à direita. Alvos de toque ≥44px. Sem rolagem horizontal.

### Anúncios
- Componente `AdSlot` com dois posicionamentos: dentro do card de resultados (desktop/tablet) e
  banner 320×50 fixo acima do painel inferior (celular) — nunca sobre o globo/números.
- Fonte configurável por ambiente (`/api/v1/config`): banner próprio (imagem + link) **hoje**;
  AdSense (`ADSENSE_CLIENT`, slots) depois — o ID de publisher é público. `ads.txt` servido
  quando configurado. CSP ganha os domínios do AdSense apenas quando ele estiver ligado.
- Slot vazio quando nada configurado (não quebra o layout).

## 5. Qualidade

Fluxo do usuário: desenvolver → testes (meta 100% de coverage) → executar → documentar em
`docs/<feature>.md`.
- Go: testes de domínio/usecases, parser do TSE com fixtures reais, cache, handlers (httptest),
  middlewares (segurança, rate limit).
- TS: Vitest para domínio (agregação, divisão de geometria, filtros), cliente da API e
  presenter onde testável; o adapter MapLibre testado com mocks na fronteira da interface.
- CI no GitHub Actions: lint, testes, `govulncheck`, `npm audit`, build da imagem. Dependabot + CodeQL.

## 6. Decisões do usuário (após revisão)
- **Prioridade**: núcleo no ar antes das 17h; coverage 100%, docs completas, CodeQL/Dependabot
  depois do pico, ainda hoje à noite.
  - Núcleo = dados reais (BR, UFs, exterior, municípios), globo, filtros, controles do globo,
    responsivo, AdSlot com banner próprio, cabeçalhos de segurança/rate limit, testes do essencial
    (parser TSE, agregação, handlers, filtros).
- **Tráfego**: pode viralizar (100k+). Consequências:
  - Respostas da API cacheáveis na borda: `Cache-Control: public, max-age=15, s-maxage=30,
    stale-while-revalidate=60` + `ETag`; payloads pré-serializados e pré-comprimidos.
  - Assets do frontend e geometrias com hash no nome e `immutable` (1 ano).
  - Recomendação ao usuário: ligar o proxy do Cloudflare para o subdomínio. O rate limit lê
    `CF-Connecting-IP` quando `TRUST_CLOUDFLARE=true`; caso contrário o 1º salto de
    `X-Forwarded-For` vindo do Traefik.
  - O polling do TSE é independente do tráfego (um poller por processo); recomendado 1 réplica.
- **Banner de hoje**: banner próprio da Tapp Solutions (criado pelo assistente), link
  `https://tapp.solutions`, trocável por variável de ambiente.

## 7. Decisões tomadas pelo assistente (para revisão)
- Divisão vermelho/azul pela **largura do bounding box** de cada área (como no mockup), em
  todos os níveis (países, UFs, municípios); recalculada só quando o resultado muda.
- Poller do TSE conservador: ciclo rápido ~30 s (BR, UFs, exterior); municípios com
  concorrência 4 e `If-Modified-Since` (TSE responde 304, verificado), ciclo completo ≈5 min.
- Tabela cidade→país vai para `data/abroad-cities.json`, gerada por script reprodutível a partir
  do config do TSE + tabela manual revisada.
- Totais não publicados pelo TSE são **somas rotuladas**: filtro "Brasil" = soma das 27 UFs
  ("soma das UFs"); país do exterior = soma das cidades. O total oficial é o de "Todos os países" (arquivo BR).
- Área ainda sem dado do TSE (zerada ou não buscada): cinza + "aguardando"; cada área mostra o
  próprio horário de atualização do TSE (`dg`/`hg`), e o rodapé mostra o horário do nosso último ciclo.
- Nome do repositório `eleicoes2turno`; módulo Go `eleicoes2turno`.
- MapLibre em vez de Mapbox (sem token/custo).
- Um único container (Go servindo API + estáticos) para simplificar o Coolify.
- Sem banco: cache em memória (um processo). Se precisar escalar horizontalmente, cada réplica faz seu próprio polling.
- i18n com `pt` como idioma padrão (site brasileiro), `en`/`es` disponíveis.
- Tema claro (como no último mockup).

## 8. Deixado para quem constrói
- Valores exatos de intervalo/concorrência do poller (dentro do respeito ao TSE).
- Nível de simplificação das geometrias (equilíbrio peso × fidelidade no celular).
- Detalhes visuais finos dos controles e do painel inferior.
