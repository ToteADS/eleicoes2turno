# Eleito (vencedor declarado pelo TSE)

## Descricao

Quando o TSE declara o vencedor do 2º turno, o site mostra o selo **ELEITO** no
card de resultados e um aviso verde no topo: "{Nome} é eleito presidente do
Brasil". O vencedor vem **somente** de marcações do próprio TSE no arquivo de
resultado — nunca de uma conta feita pelo site:

1. `"e": "s"` no candidato (eleito declarado) → aviso "{Nome} é eleito
   presidente do Brasil".
2. Senão, `"md": "e"` no topo do arquivo BR → o candidato com mais votos no
   total Brasil (`l` × `f`) aparece como eleito, com o aviso "{Nome} está
   matematicamente eleito" / "Segundo o TSE, o resultado já está definido com
   {pct} das seções totalizadas." Empate → ninguém.
3. Senão, ninguém (o card mostra "LIDERA" como antes).

O campo `md` **não é documentado pelo TSE**. Na noite de 25/10/2026 (99,98% das
seções totalizadas) o arquivo BR passou a trazer `"md": "e"`, `"and": "p"` e
`"tf": "n"`, ainda sem `"e": "s"` para ninguém. Interpretamos `md: "e"` como
"matematicamente definido – eleito"; qualquer outro valor (ou ausência) é
ignorado. `and` não é lido.

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
- Resultado matematicamente definido: o parser lê `md` do topo do arquivo e
  `/api/v1/summary` expõe `br.mathDefined: true` quando `md == "e"` (omitido
  enquanto `false`). No front, `resolveWinner(candidates, br)` aplica as regras
  1–3 acima e devolve `{ candidate, kind: 'declared' | 'mathematical' }`; o card
  de resultados e o aviso usam esse helper. Novas chaves i18n
  `elected_math_title`, `elected_math_body`.

## Tecnologias usadas

Go (encoding/json, testing), TypeScript, Vite, Vitest, CSS.

## Estrutura de arquivos

```
api/internal/domain/entities/result.go        Candidate.Elected/Status, AreaResult.Final
api/internal/infra/tse/parse.go                lê e/st/tf/md
api/internal/infra/tse/testdata/br-elected.json
api/internal/infra/tse/testdata/br-math-defined.json  arquivo BR real de 25/10/2026 22:10 (md=e)
api/internal/infra/tse/parse_test.go
api/internal/presentation/handlers/handlers_test.go
web/src/domain/types.ts
web/src/domain/elected.ts (+ .test.ts)         resolveWinner, electedCandidate, displayName, DISPLAY_NAME
web/src/presenter/results-card.ts (+ .test.ts) selo ELEITO
web/src/presenter/notice-banner.ts (+ .test.ts) aviso "elected"
web/src/presenter/styles.css                   .won, .cand.elected, .notice[data-kind="elected"]
web/src/i18n/{pt,en,es}.json
```

## Como funciona

1. O poller baixa o arquivo BR do TSE; `ParseResult` converte `e == "s"` em
   `Elected: true` e guarda `st` em `Status`. Os candidatos do snapshot vêm do
   arquivo BR (no ciclo de cidades do exterior, os do último snapshot).
2. O front recebe `summary.candidates` e `summary.br`. `resolveWinner()` devolve
   o primeiro com `elected === true` (`declared`); senão, se
   `br.mathDefined === true` e `l !== f`, o líder nacional (`mathematical`);
   senão `null`.
3. `ResultsCard.render` (recebe o `br` nacional) mostra `.won` só nesse
   candidato e esconde todo `.lead` enquanto houver eleito (o cargo é nacional:
   vale em estados, cidades e exterior, mesmo onde o eleito perde).
4. `bannerFor(notice, summary)` decide o aviso, por prioridade:
   aviso manual do servidor > vencedor declarado > alerta automático de TSE parado.
   O texto usa os nomes curtos do card ("Lula", "Flávio Bolsonaro") e o % de
   seções totalizadas do BR (`st/ts`, 100% se faltar).

## Testes

- Go (`go test ./...`, `go vet ./...`): parse do arquivo BR real com `md: "e"`
  (`MathDefined`, votos, ninguém com `Elected`); `md` ausente/`""`/`"n"`/`"s"` não
  marca; `/summary` traz `br.mathDefined: true` e omite quando `false`.
- Go: parse com fixture `e: "s"`/`st: "Eleito"`/`tf: "s"`;
  arquivo sem declaração não marca ninguém; JSON do `/summary` sempre traz
  `elected` (inclusive `false`), `status` e `br.final`.
- Web (Vitest): `resolveWinner` (declarado vence o líder; matemático para Lula
  e para Flávio; sem flag / flag não-booleana → ninguém; empate ou líder fora da
  lista → ninguém); `bannerFor` matemático (título/corpo pt, en, es; declarado
  tem prioridade; empate sem aviso); `ResultsCard` com ELEITO matemático em
  estado onde o eleito perde, LIDERA sem flag/empate, flag do TSE vence.
- Web (Vitest): `electedCandidate` (nulo sem marcação, só `true` estrito),
  `displayName`; `bannerFor` (vencedor substitui alerta automático, aviso manual
  vence, nunca infere por votos, fallback 100%, traduções en/es); `NoticeBanner`
  troca ícone e link; `ResultsCard` (LIDERA sem eleito, ELEITO e sem LIDERA com
  eleito, selo mantido em estado onde o eleito perde, remoção do selo, traduções).
- Checagem visual com summary simulado (Lula eleito) em 1440x900 e 390x844 pt-BR.

## Dependencias

Nenhuma nova.

## Observacoes

- Antes da declaração o TSE publica `"e": "n"` e `"st": ""`: sem `md: "e"`, nada muda na tela.
- Se o TSE passar a marcar `"e": "s"`, o aviso troca sozinho para o texto de
  eleito declarado (e o selo segue a marcação do TSE).
- Se o TSE remover a marcação, o selo e o aviso somem no próximo poll.
- Para sobrepor o aviso de vencedor, publique um aviso manual em `/api/v1/notice`.
