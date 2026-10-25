# Título

Visão do 1º turno (eleição presidencial 2026) no globo da apuração

# Descrição

O site, que mostrava só o 2º turno ao vivo, ganhou a opção **"1º turno | 2º turno"** na barra superior
(desktop e celular). O 2º turno continua sendo o padrão; `?turno=1` abre o 1º turno direto. No 1º turno,
cada área (estado, município, país, cidade do exterior) é pintada inteira com a cor de quem venceu ali,
mais clara quando a vitória foi apertada. O card de resultados lista os 12 candidatos ordenados por
votos, com foto, número · partido, votos, % e barra na cor do candidato.

O resultado do 1º turno é final (100% das seções, TSE 05/10/2026). Por isso ele é servido como um
**snapshot estático** em `web/public/data/r1/`: em produção o site nunca consulta o TSE para o 1º turno
e essa visão não faz polling.

# O que foi feito

- **Snapshot**: `data/fetch_r1.py` baixa os arquivos brutos do TSE (eleição 6257) para um cache local
  ignorado pelo git, sem pressa e respeitando o TSE. `data/build_r1.py` gera os JSON compactos a partir do cache.
- **Domínio**: modelo para N candidatos (`MultiResult`, `Round1Summary`), vencedor, ranking e soma de
  áreas (`multi.ts`), além da paleta de cores por candidato (`palette.ts`). O modelo Lula × Flávio do
  2º turno continua igual (`AreaResult` agora estende `BaseResult`, com os mesmos campos).
- **Globo**: a interface `GlobeRenderer` aceita, além do resultado do 2º turno, um `SolidFill`
  (cor do vencedor). O adapter MapLibre pinta a área inteira (`side: 'W'`) com essa cor. O 2º turno
  mantém a divisão vermelho × azul.
- **Câmera no celular**: com o painel inferior (padding de baixo maior que o de cima), o `fitBounds`
  do globo do MapLibre falhava ("Map cannot fit…", e no 2º turno o voo para o Brasil nem acontecia)
  ou parava fora do centro. Nesse layout o adapter calcula o centro e o zoom e usa `flyTo`. No desktop
  continua o `fitBounds` de antes.
- **Card do 1º turno**: `Round1Card` monta `CandidateList` (top 5 + "Ver todos os N candidatos" /
  "Ver menos") e as linhas de eleitorado/comparecimento/brancos/nulos, extraídas para `result-rows.ts`
  e usadas também pelo card do 2º turno. O status é "Resultado final · 100% das seções" no lugar das
  linhas de atualização ao vivo e de TSE instável.
- **Navegação**: `RoundToggle` (controle segmentado) na barra do `FiltersCard`, e o turno na URL
  (`round-url.ts`, `history.replaceState`). Trocar de turno mantém os filtros e a câmera e só troca
  os dados e as cores. O polling roda só no 2º turno.
- **Tooltip**: no 1º turno mostra os 3 primeiros da área, cada um na sua cor.
- **Responsivo**: no celular o painel recolhido mostra os 2 primeiros. Com o painel totalmente
  expandido (lista longa), os controles do globo se escondem para não cobrir a barra superior.
- **i18n**: chaves novas `app_title_r1`, `app_title_short`, `round_*`, `r1_*` em pt, en e es.

# Tecnologias usadas

- Python 3 (biblioteca padrão) para baixar e montar o snapshot.
- TypeScript + Vite 6, MapLibre GL 6 (globo), Vitest 4 + jsdom, cobertura com `@vitest/coverage-v8`.
- puppeteer-core + Chrome (swiftshader) para os screenshots de verificação (ferramenta local, fora do repositório).

# Estrutura de arquivos

```
data/
├── fetch_r1.py                 # download resumível do TSE (≤2 req/s, back-off em 429) → data/.cache/r1/
└── build_r1.py                 # cache → web/public/data/r1/
web/public/data/r1/
├── summary.json                # candidatos, Brasil, UFs, exterior (zz), soma das UFs, países
├── mun/<uf>.json               # municípios por código IBGE
└── abroad.json                 # cidades do exterior por código TSE
web/src/
├── domain/
│   ├── types.ts                # BaseResult, MultiResult, Round1Summary, Round
│   ├── multi.ts                # winnerIndex, ranking, sumMulti
│   └── palette.ts              # candidateColor, shade
├── infra/
│   ├── globe.ts                # SolidFill, AreaPaint (interface do globo)
│   └── round1.ts               # Round1Loader + decodeArea (formato compacto)
├── external/maplibre-globe.ts  # pinta SolidFill; voo calculado com painel inferior
└── presenter/
    ├── app.ts                  # compõe: estado do turno, carga sob demanda, sem polling no 1º turno
    ├── round-toggle.ts         # "1º turno | 2º turno"
    ├── round-url.ts            # ?turno=1
    ├── round1-card.ts          # card do 1º turno
    ├── candidate-list.ts       # lista ordenada, top 5 + ver todos
    ├── round1-paint.ts         # resultado → cor do vencedor (SolidFill)
    ├── result-rows.ts          # linhas de totais (compartilhadas pelos dois cards)
    ├── scope.ts                # describeScope genérico (os dois turnos)
    ├── tooltip.ts              # showRanking
    ├── filters-card.ts         # espaço para o toggle + título por turno
    └── styles.css
```

# Como funciona

1. **Snapshot** (uma vez, offline):
   ```bash
   python3 -I data/fetch_r1.py     # ~5.800 arquivos, ~50 min; pode ser interrompido e retomado
   python3 -I data/build_r1.py     # falha se faltar arquivo (use --allow-missing só para testes)
   ```
   `fetch_r1.py` é sequencial, faz no máximo 2 requisições por segundo, pula o que já está no cache e,
   ao receber 429, para por 60 s e dobra a pausa a cada novo 429 (até 10 min). O catálogo TSE↔IBGE vem
   de `config/mun-e006257-cm.json` (os 5.757 códigos são idênticos aos do 2º turno).
   `build_r1.py` confere que os municípios de cada UF somam exatamente o arquivo da UF.
2. **Formato compacto**: cada área é `[el, comp, abst, vv, vb, vn, st, ts, ...votos]`, com os votos
   alinhados à ordem de `summary.candidates` (ordenada pelos votos no Brasil). Os candidatos trazem
   `n`, `name`, `party`, `sqcand` e `runoff` (foi ao 2º turno). Os países do exterior são a soma das
   cidades (tabela `abroad-cities.json`). "Brasil" é a soma das UFs, como no 2º turno.
3. **Front**: `readRound(location.search)` escolhe o turno. O 1º turno carrega `summary.json` e
   `abroad.json`, e `mun/<uf>.json` quando um estado é escolhido (cada arquivo uma vez só). O vencedor
   de cada área vira cor: `shade(cor, participação)` mistura a cor com branco, pálida até 35% dos votos
   válidos e cor cheia a partir de 75%. Empate ou área sem dado fica cinza.
4. **Cores**: 13 Lula `#d7262d` (`--lula`), 22 Flávio `#1f5fe0` (`--flavio`), 70 `#f28e2b`, 14 `#2e9e5b`,
   55 `#7b4fc9`, 30 `#138d9c`, 80 `#b0307a`, 16 `#8b5a2b`, 27 `#7d9a1e`, 21 `#5b6b7f`, 35 `#e58fc0`,
   29 `#2f3b45`. Números desconhecidos recebem uma cor de reserva estável.
5. **Fotos**: `https://resultados.tse.jus.br/oficial/ele2026/6257/fotos/br/<sqcand>.jpeg` (verificado: 200).

# Testes

**O que foi testado** (Vitest; testes escritos antes do código):
- `domain/multi.test.ts`: vencedor (empate, sem votos, não divulgado), ranking (ordem, participação,
  empates mantêm a ordem nacional, votos ausentes), soma de áreas, paleta (cores do 2º turno mantidas,
  12 cores distintas, reserva estável) e `shade`.
- `infra/round1.test.ts`: decodificação do formato compacto, carga do resumo, cache por arquivo,
  erro HTTP com nova tentativa, `fetch` padrão.
- `external/maplibre-globe.test.ts`: áreas inteiras com a cor do vencedor (estados, países, municípios,
  pontos do exterior), cinza sem vencedor, expressão de cor das camadas, pontos do 2º turno, voo
  calculado com painel inferior (centro, zoom por largura/altura, padding).
- `presenter/round1.test.ts`: URL do turno, toggle, `describeScope` com dados do 1º turno (soma de
  região voto a voto), cores por área, `CandidateList` (top 5, ver todos/ver menos, estado mantido entre
  renders, sem dados, escape de HTML), `Round1Card` (status final, sem dados, contagem parcial),
  tooltip dos dois turnos, `resultRows`.
- `presenter/app.test.ts`: abrir com `?turno=1`, trocar de turno mantendo filtros e atualizando a URL,
  1º turno sem polling, hover dos dois turnos, snapshot ausente, falhas de arquivos do 1º turno e dos
  municípios do 2º turno, carga do 2º turno sob demanda, trocas rápidas de turno ou de estado.

**Cenários**: Brasil, região, estado (BA), município, país do exterior (Japão), cidade do exterior,
empate, área sem dados, arquivo faltando, troca de turno durante a carga.

**Coverage**: 120 testes passando (eram 68). Os módulos novos têm 100% de linhas, statements, branches
e funções: `multi.ts`, `palette.ts`, `round1.ts`, `round-toggle.ts`, `round-url.ts`, `round1-card.ts`,
`round1-paint.ts`, `candidate-list.ts` e `result-rows.ts`. O código novo dentro de `app.ts`,
`maplibre-globe.ts`, `tooltip.ts`, `scope.ts` e `filters-card.ts` está coberto. Esses arquivos ficam
abaixo de 100% por causa de trechos que já existiam antes (eventos do MapLibre, padding da tela,
controles). O total do projeto foi de ~82% para ~84% de statements. Os scripts Python não têm testes
automatizados. A verificação deles é a checagem de soma município → UF dentro de `build_r1.py`.

**Visual**: screenshots 1440×900 e 390×844 do 1º turno em Brasil, BA (inclusive painel expandido no
celular) e Japão, mais o 2º turno no celular para comparação.

# Dependências

Nenhuma dependência nova no `web/` nem no `api/`. Os scripts usam só a biblioteca padrão do Python 3.10+.

# Observações

- O backend não mudou: o 1º turno é estático e servido pelo Vite (dev) ou pelo servidor de arquivos da API (produção).
- O snapshot (`web/public/data/r1/`, ~0,5 MB) é versionado. O cache bruto (`data/.cache/r1/`) não é.
- Mudança que também afeta o 2º turno: no celular e no tablet em retrato, o voo para uma área usa
  `flyTo` com centro e zoom calculados no lugar do `fitBounds`, que no globo falhava nesse layout. No
  desktop nada mudou.
- No celular, com o painel de resultados totalmente expandido, os controles do globo ficam escondidos
  (`.dock:has(.results.expanded) ~ .controls`).
- O nome "Flávio Bolsonaro" é corrigido no build (`NAME_OVERRIDES`). Os outros nomes vêm do nome de
  urna do TSE em formato de título (ex.: "Escritor Augusto Cury", "Clariana Barao", sem acento, como no TSE).
- O selo "2º TURNO" marca os dois candidatos que foram ao 2º turno, em qualquer recorte.
