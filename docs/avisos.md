# Avisos (faixa de aviso no topo do site)

## Título

Faixa de aviso do site, publicada pelo operador ou gerada automaticamente quando o TSE para de atualizar.

## Descrição

Uma faixa âmbar no topo do card de filtros mostra um aviso curto (título, texto e um botão
"Saiba mais →" que abre em nova aba). Ela serve para momentos como "o TSE suspendeu a divulgação dos
resultados". O aviso é publicado e retirado por uma API protegida por token, sem novo deploy.

Quando não há aviso publicado, o próprio site avisa se a apuração parecer travada: com os resultados
já divulgados (`br.released`) e o arquivo do TSE (`br.dg` + `br.hg`, horário de Brasília) com mais de
10 minutos, aparece "O TSE não atualiza os resultados há X min", com link para as notícias do TSE.
O aviso publicado tem prioridade sobre o automático. A faixa só aparece na visão do 2º turno (o 1º
turno é um retrato final).

## O que foi feito

- **API:** entidade `Notice`, contrato `NoticeStore` no domínio, DTO `NoticeDTO` com normalização e
  validação (regra R3), implementação em memória com mutex, handler com `GET` público e
  `PUT`/`DELETE` protegidos por `Authorization: Bearer <NOTICE_ADMIN_TOKEN>`, rotas em `/api/v1/notice`
  e semente opcional via variáveis `NOTICE_*` (para o aviso sobreviver a um restart).
- **Web:** entidade `Notice`, model `noticeFromJson` (descarta link que não seja https),
  `ApiClient.notice()`, componente `NoticeBanner` e a regra `bannerFor` (aviso do servidor ou
  automático). Busca no início, a cada poll de 30 s e quando a aba volta a ficar visível.
- **Textos:** chaves `notice_*` em pt/en/es.

## Tecnologias usadas

- Go 1.25, `net/http`, gorilla/mux, `crypto/subtle` + `crypto/sha256` (comparação em tempo constante).
- TypeScript, Vite, Vitest + jsdom (timers e relógio falsos).

## Estrutura de arquivos

```
api/internal/domain/entities/notice.go          # entidade Notice
api/internal/domain/repositories/notice.go      # contrato NoticeStore
api/internal/domain/dtos/notice.go(+_test)      # NoticeDTO: Normalize, Validate, ToEntity
api/internal/infra/notice/memory.go(+_test)     # NoticeStore em memória
api/internal/presentation/handlers/notice.go(+_test)
api/internal/presentation/routes/routes.go      # GET/PUT/DELETE /api/v1/notice
api/pkg/config/config.go                        # NOTICE_ADMIN_TOKEN, NOTICE_TITLE/BODY/LINK_URL/LINK_LABEL
api/cmd/api/main.go                             # seedNotice
web/src/domain/types.ts                         # Notice
web/src/infra/notice-model.ts(+.test)           # noticeFromJson
web/src/infra/api.ts                            # ApiClient.notice()
web/src/presenter/notice-banner.ts(+.test)      # bannerFor, tseFileTime, NoticeBanner
web/src/presenter/app.ts                        # busca e renderização
web/src/presenter/styles.css                    # .notice*
web/src/i18n/{pt,en,es}.json                    # notice_*
```

## Como funciona

**API**

| Método | Rota | Auth | Resposta |
|---|---|---|---|
| GET | `/api/v1/notice` | pública | `{"notice": {...}}` ou `{"notice": null}`, `Cache-Control: no-store` |
| PUT | `/api/v1/notice` | Bearer | grava o aviso e devolve `{"notice": {...}}` |
| DELETE | `/api/v1/notice` | Bearer | apaga o aviso e devolve `{"notice": null}` |

- Sem `NOTICE_ADMIN_TOKEN` configurado, `PUT` e `DELETE` respondem 404 (escrita desligada).
- Token ausente ou errado: 401 com `WWW-Authenticate`. A comparação usa hashes SHA-256 em tempo
  constante, para não vazar o token nem o tamanho dele.
- Corpo do `PUT`: JSON com `title`, `body`, `linkUrl`, `linkLabel` (campos extras são recusados),
  até 4 KB. Regras: título obrigatório até 120 caracteres, texto até 400, rótulo até 40, sem
  caracteres de controle (o texto aceita quebra de linha), link vazio ou URL `https://` absoluta.
  Erros: 400 com `invalid_body`, `invalid_title`, `invalid_body_text`, `invalid_link` ou `invalid_label`.
- O aviso fica em memória. Para ele voltar sozinho depois de um restart, configure também
  `NOTICE_TITLE`, `NOTICE_BODY`, `NOTICE_LINK_URL` e `NOTICE_LINK_LABEL` (passam pela mesma validação;
  se forem inválidos o processo registra um aviso no log e sobe sem aviso).

**Publicar e retirar** (o token fica fora do repositório; use a variável `$TOKEN`):

```sh
curl -X PUT https://eleicoes2turno.tapp.solutions/api/v1/notice \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Apuração pausada pelo TSE","body":"O TSE suspendeu a divulgação dos resultados até o fim da votação.","linkUrl":"https://www.tse.jus.br/comunicacao/noticias","linkLabel":"Saiba mais"}'

curl -X DELETE https://eleicoes2turno.tapp.solutions/api/v1/notice -H "Authorization: Bearer $TOKEN"

curl https://eleicoes2turno.tapp.solutions/api/v1/notice
```

Os visitantes veem a mudança no próximo poll (até 30 s). Atenção: se as variáveis `NOTICE_*`
estiverem configuradas, o aviso volta no próximo restart mesmo depois de um `DELETE`; para retirá-lo
de vez, apague também essas variáveis no Coolify.

**Web**

- `bannerFor(notice, summary)` decide o conteúdo: aviso do servidor; senão, aviso automático quando
  `summary.br.released` e o arquivo do TSE tem mais de 10 min (`dg`/`hg` lidos como UTC-3); senão nada.
- `NoticeBanner` fica como primeiro filho do card de filtros, usa só `textContent` (nenhum texto do
  servidor vira HTML), abre o link com `target="_blank" rel="noopener"` e só mexe no DOM quando o
  conteúdo muda. Falha ao buscar o aviso mantém o último conhecido.
- No celular a faixa ocupa a largura do card, com o botão em linha própria; no desktop, até 640 px.

## Testes

- **Go:** DTO (válidos, limites, controle, UTF-8 inválido, links http/javascript/relativo/sem
  host/com usuário/longo), store (get/set/clear e concorrência), handler (GET vazio, set/get/clear,
  trim, token ausente/errado/prefixo/Basic/maiúsculas, escrita desligada sem token, corpos inválidos
  e grandes), rotas (fluxo completo, 405 com `Allow`, 404 sem token) e config. Cobertura de 100% em
  `dtos`, `infra/notice`, `pkg/config` e nas funções do handler de avisos.
- **Web:** `noticeFromJson` (completo, campos faltando, respostas malformadas, links não https),
  `ApiClient.notice` (sem cache, null, erro HTTP), `tseFileTime`, `bannerFor` (prioridade do servidor,
  limite de 10 min, antes da divulgação, carimbo inválido, traduções), `NoticeBanner` (posição,
  link em nova aba, escape de HTML, rótulo padrão, esconder partes vazias, sem re-render à toa) e o
  app (aviso no topo e atualizado a cada poll, aviso automático, falha mantém o último, escondido no
  1º turno).

## Dependências

Nenhuma nova.

## Observações

- O token de administração fica só no ambiente do Coolify e no arquivo local de segredos do
  operador; nunca no repositório.
- O aviso não é persistido em banco: a semente via `NOTICE_*` é o que garante que ele sobreviva a um
  restart ou deploy.
