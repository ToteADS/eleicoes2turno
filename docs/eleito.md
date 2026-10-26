# Eleito (vencedor declarado pelo TSE)

## Descricao

Quando o TSE declara o vencedor do 2º turno, o site mostra o selo **ELEITO** no
card de resultados e um aviso verde no topo: "{Nome} é eleito presidente do
Brasil". O vencedor vem **somente** da marcação do próprio TSE no arquivo de
resultado (`"e": "s"` do candidato) — nunca é inferido pela conta de votos.

## O que foi feito

- API: o parser do arquivo `-u` do TSE lê, por candidato, `e` (eleito) e `st`
  (texto de situação, ex. "Eleito"), e no topo do arquivo `tf` (totalização
  finalizada). `/api/v1/summary` passa a expor `candidates[].elected`,
  `candidates[].status` e `br.final` (omitido enquanto `false`).
- Web: `Candidate` ganhou `elected?`/`status?` e `BaseResult` ganhou `final?`.
  Novo helper de domínio `electedCandidate()` (aceita só `elected === true`).
- Card de resultados: selo "ELEITO" (cor sólida do candidato + ícone de check,
  foto com anel na cor do candidato) em todas as visões do 2º turno; com um
  eleito, nenhum "LIDERA" aparece.
- Aviso do topo: novo tipo `elected` (verde, ícone de check) com link "Ver no
  TSE" para https://resultados.tse.jus.br/oficial/app/index.html.
- i18n pt/en/es: `results_elected`, `elected_title`, `elected_body`, `elected_link`.

## Tecnologias usadas

Go (encoding/json, testing), TypeScript, Vite, Vitest, CSS.

## Estrutura de arquivos

```
api/internal/domain/entities/result.go        Candidate.Elected/Status, AreaResult.Final
api/internal/infra/tse/parse.go                lê e/st/tf
api/internal/infra/tse/testdata/br-elected.json
api/internal/infra/tse/parse_test.go
api/internal/presentation/handlers/handlers_test.go
web/src/domain/types.ts
web/src/domain/elected.ts (+ .test.ts)         electedCandidate, displayName, DISPLAY_NAME
web/src/presenter/results-card.ts (+ .test.ts) selo ELEITO
web/src/presenter/notice-banner.ts (+ .test.ts) aviso "elected"
web/src/presenter/styles.css                   .won, .cand.elected, .notice[data-kind="elected"]
web/src/i18n/{pt,en,es}.json
```

## Como funciona

1. O poller baixa o arquivo BR do TSE; `ParseResult` converte `e == "s"` em
   `Elected: true` e guarda `st` em `Status`. Os candidatos do snapshot vêm do
   arquivo BR (no ciclo de cidades do exterior, os do último snapshot).
2. O front recebe `summary.candidates`. `electedCandidate()` devolve o primeiro
   com `elected === true`, ou `null`.
3. `ResultsCard.render` mostra `.won` só nesse candidato e esconde todo `.lead`
   enquanto houver eleito (o cargo é nacional: vale em estados, cidades e exterior).
4. `bannerFor(notice, summary)` decide o aviso, por prioridade:
   aviso manual do servidor > vencedor declarado > alerta automático de TSE parado.
   O texto usa os nomes curtos do card ("Lula", "Flávio Bolsonaro") e o % de
   seções totalizadas do BR (`st/ts`, 100% se faltar).

## Testes

- Go (`go test ./...`, `go vet ./...`): parse com fixture `e: "s"`/`st: "Eleito"`/`tf: "s"`;
  arquivo sem declaração não marca ninguém; JSON do `/summary` sempre traz
  `elected` (inclusive `false`), `status` e `br.final`.
- Web (Vitest): `electedCandidate` (nulo sem marcação, só `true` estrito),
  `displayName`; `bannerFor` (vencedor substitui alerta automático, aviso manual
  vence, nunca infere por votos, fallback 100%, traduções en/es); `NoticeBanner`
  troca ícone e link; `ResultsCard` (LIDERA sem eleito, ELEITO e sem LIDERA com
  eleito, selo mantido em estado onde o eleito perde, remoção do selo, traduções).
- Checagem visual com summary simulado (Lula eleito) em 1440x900 e 390x844 pt-BR.

## Dependencias

Nenhuma nova.

## Observacoes

- Antes da declaração o TSE publica `"e": "n"` e `"st": ""`: nada muda na tela.
- Se o TSE remover a marcação, o selo e o aviso somem no próximo poll.
- Para sobrepor o aviso de vencedor, publique um aviso manual em `/api/v1/notice`.
