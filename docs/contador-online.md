# Contador "pessoas online agora"

## Título

Contador ao vivo de pessoas com o site aberto.

## Descrição

Uma pílula pequena, com um ponto verde pulsando, mostra quantas pessoas estão com o site aberto
agora ("● 1.234 pessoas online agora", "1 pessoa online agora" no singular). Cada aba aberta manda
um batimento para a API a cada 60 s; a API conta as abas que bateram nos últimos 150 s. Não há
cadastro, cookie, IP guardado nem qualquer dado pessoal: só um id aleatório por aba.

## O que foi feito

- **API:** rota `POST /api/v1/presence`, contrato `PresenceTracker` no domínio, implementação em
  memória com limpeza periódica, handler com validação estrita, ligação no `main.go` (parada no
  graceful shutdown) e no `routes.go` (passa pelo limite de requisições por IP).
- **Web:** `PresenceDto` (regra R3), método `ApiClient.presence(dto)`, gerador do id da aba,
  componente `OnlineCounter` e textos em pt/en/es.
- **Layout:** pílula pendurada logo abaixo do card de filtros (desktop e tablet em paisagem) ou da
  barra superior (celular e tablet em retrato), sem encostar no painel inferior nem nos controles
  do globo.

## Tecnologias usadas

- Go 1.25, `net/http`, gorilla/mux, `hash/maphash`, `sync/atomic`.
- TypeScript, Vite, Vitest + jsdom (timers falsos), `crypto.randomUUID`, `sessionStorage`,
  Page Visibility API.

## Estrutura de arquivos

```
api/internal/domain/repositories/presence.go       contrato PresenceTracker (Seen, Count)
api/internal/infra/presence/memory.go              MemoryTracker: mapa em memória + ticker de limpeza
api/internal/infra/presence/memory_test.go         testes + benchmarks
api/internal/presentation/handlers/presence.go     handler POST /presence (validação, no-store)
api/internal/presentation/handlers/presence_test.go
api/internal/presentation/routes/routes.go         rota + 405 para outros métodos
api/cmd/api/main.go                                TTL 150 s, limpeza a cada 10 s, teto de 300 mil abas
web/src/domain/dtos/presence-dto.ts                PresenceDto.toJson() → { id }
web/src/domain/types.ts                            PresenceAnswer { online }
web/src/infra/api.ts                               ApiClient.presence(dto)
web/src/infra/tab-id.ts                            id aleatório da aba (sessionStorage com fallback em memória)
web/src/presenter/online-counter.ts                pílula + batimento + pausa com a aba oculta
web/src/presenter/app.ts                           compõe o contador no #topbar e para no dispose
web/src/presenter/styles.css                       .online / .online-dot (+ breakpoints)
web/src/i18n/{pt,en,es}.json                       online_count, online_count_one
```

## Como funciona

**Navegador.** Ao abrir, a aba gera um id com `crypto.randomUUID()` (ou 128 bits aleatórios em
hexadecimal quando a página não está em contexto seguro) e guarda em `sessionStorage`, então
recarregar a página conta como a mesma pessoa. Se o storage estiver bloqueado (modo privado, dados
do site bloqueados), o id fica só em memória. O `OnlineCounter` manda `POST /api/v1/presence` com
`PresenceDto` na hora e depois a cada 60 s. Com `document.hidden` o batimento pausa; quando a aba
volta a ficar visível, manda um na hora e retoma o intervalo. A pílula fica oculta até a primeira
resposta boa, mantém o último número se uma requisição falhar e some depois de 2 falhas seguidas
(resposta sem número válido conta como falha). No celular ela também some enquanto a folha de
filtros está aberta.

**Servidor.** O handler limita o corpo a 256 bytes (`http.MaxBytesReader`), recusa campos
desconhecidos e dados depois do objeto, e exige id com 8–64 caracteres `[A-Za-z0-9-]`; qualquer
coisa fora disso é 400 (`invalid_body` / `invalid_id`) via `pkg/response`. Outros métodos recebem
405 com `Allow: POST` (sem isso um GET cairia no fallback da SPA). Toda resposta leva
`Cache-Control: no-store`, então o Cloudflare nunca guarda o número.

O `MemoryTracker` guarda `hash(id) → último batimento`:

- **Sem texto do visitante no mapa.** A chave é um `maphash` de 64 bits com semente aleatória por
  processo. Cada entrada custa algumas dezenas de bytes (≈10 MB no teto de 300 mil), e o mapa não
  guarda nada que identifique alguém, nem o id em si.
- **Contagem barata.** Escolhemos a contagem incremental: cada `Seen` grava a entrada e copia o
  `len` do mapa (O(1)) para um contador atômico; `Count` só lê esse atômico, sem lock e sem varrer
  nada. A varredura que apaga as abas com mais de 150 s roda em um ticker a cada 10 s (≈0,5 ms
  para 100 mil abas). O preço é uma aba fechada seguir contada por até 10 s além do TTL, o que é
  irrelevante para um número de "online agora". Recontar a cada requisição custaria O(n) por
  batimento; um contador só recalculado no ticker deixaria a primeira pessoa vendo "0".
- **Teto e fail open.** Acima de 300 mil abas, ids novos não entram, mas o pedido continua
  respondendo com a contagem atual (mesma política do limite de requisições). Ids já conhecidos
  continuam renovando.
- **Desligamento.** `Start(10s, ctx.Done())` devolve um canal que fecha quando o ticker para; o
  `main.go` espera esse canal depois do `srv.Shutdown`.

Carga: 100 mil abas a cada 60 s dão ≈1,7 mil batimentos/s. No benchmark (Apple M2), o caminho
`Seen` + `Count` leva 58 ns/op em 1 CPU e 182 ns/op com 10 CPUs disputando o mesmo lock (≈5,5
milhões/s), com 0 alocações. Isso é mais de 3.000× a carga esperada.

## Testes (o que foi testado, coverage, cenários)

Comandos: `cd api && gofmt -l . && go vet ./... && go test -race ./... -cover` ·
`cd web && npx vitest run --coverage && npx tsc --noEmit && npm run build`.

**Coverage do código novo:** `infra/presence` 100%; `handlers/presence.go` 100%; `routes` 100%;
`presence-dto.ts`, `tab-id.ts` e `online-counter.ts` 100% (v8). O `main.go` não tem teste, como
antes.

**Cenários Go**
- Contagem de ids distintos (repetir um id não conta duas vezes).
- Expiração pelo TTL: exatamente 150 s ainda conta, 151 s não; batimento renova o prazo.
- Teto: id novo acima do teto não entra, id conhecido renova, volta a ter espaço depois da limpeza.
- 16 goroutines chamando `Seen`/`Count`/`Prune` ao mesmo tempo (com `-race`).
- Ticker limpa sozinho e para quando o canal `stop` fecha.
- Handler: resposta `{"online":n}`, `no-store`, `Content-Type`; limites de 8 e 64 caracteres;
  rejeita corpo vazio, não-JSON, sem id, id não-string, curto, longo, com espaço, unicode, HTML,
  campo desconhecido, dois objetos, corpo acima de 256 bytes (inclusive objeto válido com
  espaços); entrada inválida nunca chega ao tracker.
- Rotas: POST conta pelo roteador real (com CSP), GET/PUT/DELETE → 405 com `Allow`, rota sujeita
  ao limite por IP (429).
- Benchmarks: `BenchmarkSeenCount` (100 mil abas, paralelo) e `BenchmarkPrune100k`.

**Cenários web**
- DTO serializa só o id; `ApiClient.presence` faz POST JSON `no-store` em `/api/v1/presence` e
  lança erro em status ruim.
- Id da aba: reaproveita o da sessão, troca valor inválido guardado, cai para memória quando
  `getItem`/`setItem` lançam, usa `sessionStorage` + UUID por padrão, gera hex quando falta
  `randomUUID`, valida igual à API.
- Contador: oculto até a primeira resposta, número formatado (`1.234`), singular para 1, tradução
  (en), batimento a cada 60 s, pausa com a aba oculta e batimento imediato ao voltar, não bate
  se abrir em segundo plano, aguenta 1 falha e some com 2 seguidas, resposta malformada, `stop`
  ignora respostas atrasadas.
- App: a pílula aparece dentro do `#topbar` e o `dispose` para o batimento.

**Visual:** capturas em 1440×900, 820×1180, 390×844 e 844×390 com 8–9 abas abertas.

## Dependências

Nenhuma dependência nova. Go usa só a biblioteca padrão (`hash/maphash`, `sync/atomic`) além do
gorilla/mux que já existia; a web usa APIs do navegador.

## Observações

- O número conta **abas**, não pessoas: quem abre o site em duas abas conta duas vezes. Uma aba
  duplicada pelo navegador copia o `sessionStorage` e conta como a mesma.
- Uma aba em segundo plano para de bater e sai da contagem em até ~160 s; volta assim que fica
  visível.
- Cada réplica tem o próprio contador. Com uma réplica (o recomendado no README) o número é o
  total; com várias, cada uma mostraria só as suas abas.
- O contador zera quando o processo reinicia e volta ao valor real em ~60 s.
- Corpo acima de 256 bytes recebe 400, não 413, para manter uma resposta única para entrada
  inválida.
- O CORS da API continua liberando só GET: o site chama a rota na mesma origem, então POST
  vindo de outra origem com JSON é barrado pelo preflight.
