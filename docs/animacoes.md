# Animações das atualizações ao vivo

## Título

Animações quando chegam números novos da apuração.

## Descrição

A cada consulta de 30 s, quando o TSE soltou números novos para a vista que já está na tela, nada
"pula": no globo, a linha vermelho × azul de cada área desliza da fatia antiga para a nova e as
cores misturam suavemente (cinza → cor quando a área recebe os primeiros números; vermelho ↔ azul
quando o líder muda nas peças inteiras e nos pontos do exterior). No card de resultados,
percentuais, votos, válidos/brancos/nulos/comparecimento/abstenção e o "% das seções" contam do
valor antigo até o novo, com o mesmo formato pt-BR de sempre em cada quadro, e o valor que mudou
pisca de leve uma vez. As barras (progresso das seções e Lula × Flávio) deslizam.

Nada anima na primeira carga, ao trocar filtro, turno ou área selecionada (lá já existe o voo da
câmera), nem com `prefers-reduced-motion: reduce`: os valores aparecem na hora, como antes.

## O que foi feito

- **Tween genérico** (`infra/animation.ts`): laço de `requestAnimationFrame` atrás de um
  `FrameClock` (testável), com easing ease-out cúbico, intervalo mínimo entre quadros, `cancel` e
  `finish`, e `prefersReducedMotion()`.
- **Matemática pura** (`domain/tween.ts`, `domain/color.ts`): easing, `lerp`, progresso e mistura
  de cores em OKLab.
- **Números** (`presenter/number-tween.ts`): `NumberTween` escreve nos nós de texto, contando do
  valor que está na tela (inclusive no meio de outra contagem) até o novo; pulso CSS `.bump`.
- **Card** (`presenter/results-card.ts`): `render(..., animate)`; só anima se a área for a mesma do
  render anterior; linhas de totais atualizadas no lugar (só reconstrói se o conjunto de linhas
  mudar); classe `.instant` desliga as transições das barras quando não é atualização.
- **Globo** (`external/area-look.ts`, `external/maplibre-globe.ts`): cada área vira um `AreaLook`
  (fatia + cores oeste/leste/líder). O adaptador guarda o que está desenhado por fonte (`br`,
  `world`, `muni`, `cities`) e, com `{ animate: true }`, interpola só as áreas que mudaram,
  redesenhando a fonte; áreas sem mudança reaproveitam os pedaços já cortados.
- **App** (`presenter/app.ts`): `poll()` passa `animate` só se nenhum filtro/turno mudou durante a
  consulta (`viewEpoch`), se estiver no 2º turno e sem movimento reduzido.
- **Demo só em DEV** (`infra/demo-api.ts` + `main.ts`): `?demo=anim` mexe nos números a cada
  consulta e encurta o intervalo para 5 s. Fica atrás de `import.meta.env.DEV`, então o build de
  produção não inclui o módulo (verificado no bundle).

## Tecnologias usadas

TypeScript, Vite, MapLibre GL (GeoJSON `setData`), CSS transitions/keyframes, `color-mix()`,
`requestAnimationFrame`, `matchMedia`, Vitest + jsdom (relógio de quadros manual), puppeteer-core
(capturas e medição).

## Estrutura de arquivos

```
web/src/domain/tween.ts               easing ease-out cúbico, lerp, clamp, progresso
web/src/domain/color.ts               sRGB ↔ OKLab, mixColor (extremos exatos)
web/src/infra/animation.ts            FrameClock, tween(), prefersReducedMotion()
web/src/infra/globe.ts                PaintOptions { animate } nos set* do GlobeRenderer
web/src/infra/demo-api.ts             DEV ONLY: API que mexe nos números (?demo=anim)
web/src/external/area-look.ts         AreaLook, lookOf, mixLook, props das peças
web/src/external/maplibre-globe.ts    draw() por fonte com tween, cache de pedaços, limites de custo
web/src/presenter/number-tween.ts     NumberTween (contagem + pulso)
web/src/presenter/result-rows.ts      resultRowData (modelo) + HTML das linhas
web/src/presenter/results-card.ts     render(..., animate) com contagens no lugar
web/src/presenter/app.ts              animate só em poll da mesma vista
web/src/presenter/styles.css          --ease-out, .instant, .bump, reduced-motion
web/src/main.ts                       liga a demo só em DEV
web/src/testing/manual-clock.ts       relógio de quadros manual para os testes
```

## Como funciona

**Números.** `NumberTween.set(el, valor, formato, animate)` lembra o último valor de cada
elemento. Sem `animate`, ou sem valor anterior, ou se o texto formatado não muda, escreve na hora.
Senão roda um tween de 800 ms (ease-out cúbico) chamando `formato(lerp(antigo, novo, e))` a cada
quadro e termina exatamente no texto final; o elemento ganha `.bump` (fundo `currentColor` a 10%
que some em 1,2 s, largura `fit-content`). O subtítulo de seções conta mas não pisca (é uma frase
inteira). Um render sem `animate` chama `finishAll()` e para tudo no valor final.

**Barras.** Já eram CSS transitions; agora `0.8s cubic-bezier(0.33, 1, 0.68, 1)` (o mesmo ease-out
cúbico) e desligadas pela classe `.instant` em render que não é atualização.

**Globo.** O 2º turno não pinta uma cor por área: corta cada área numa linha norte-sul na fatia
do Lula (oeste vermelho, leste azul). Então o tween interpola a **fatia** (posição da linha) e as
**cores** em OKLab (cinza → cor ao receber os primeiros números; líder antigo → novo nas peças
inteiras e nos pontos do exterior). Como o MapLibre não faz transição de cores data-driven nem de
geometria, cada quadro recorta só as áreas que mudaram e chama `setData` na fonte. Peças no meio
do caminho usam `side: 'W'` + `color` (a expressão de cor já suporta); no fim voltam para
`L`/`R`/`X`, idêntico ao desenho sem animação. Duração 700 ms.

Custo controlado: o intervalo entre redesenhos é `clamp(custo × 4, 33, 160)` ms (≈30 fps quando
barato, menos quando caro); um redesenho acima de **24 ms** (thread principal) encerra o tween na
hora; mais de **1.200** áreas mudando pulam o tween. Trocar de estado zera o que está desenhado na
fonte de municípios, então nunca anima entre estados diferentes.

**Medições** (Chrome headless, SwiftShader; `frameCosts` = recorte + `setData` por redesenho):

| Caso | por redesenho |
|---|---|
| Estados, desktop | mediana 0,2–0,3 ms, máx 0,7 ms |
| Estados, celular 390×844 com CPU 4× mais lenta | mediana 1,2–1,3 ms, máx 1,4 ms |
| MG inteiro (853 municípios mudando), desktop | mediana 3,5 ms, máx 5,4 ms |
| MG inteiro, CPU 4× mais lenta | mediana 14,3 ms, máx 20,8 ms |
| SP (645), CPU 4× | mediana 9 ms, máx 17,8 ms |
| BA (417), CPU 4× | mediana 6,2 ms, máx 9,9 ms |

Os callbacks de quadro do card (contagem de texto) ficam abaixo de 1 ms (p95 0,5–0,9 ms no
desktop, 0,6–0,8 ms no celular).

**Demo local.** `npm run dev` e abrir `http://127.0.0.1:5173/?demo=anim`: a primeira resposta é
a real; a cada 5 s votos crescem 0–12% por candidato, brancos/nulos 0–3%, seções +3%.

## Testes

Vitest, relógio de quadros manual (`ManualClock`) em vez de rAF real:

- `domain/tween.test.ts`: easing (0, 1, meio, entrada fora do intervalo), `lerp` exato no fim,
  progresso e duração zero.
- `domain/color.test.ts`: extremos exatos, ida e volta sRGB ↔ OKLab, branco sem croma, meio
  vermelho × azul roxo e mais claro que a média sRGB, cinza → vermelho monotônico.
- `infra/animation.test.ts`: quadros com easing e último quadro = 1, `minInterval`, `cancel`,
  `finish` idempotente, quadro após cancelamento, relógio do navegador, `prefersReducedMotion`.
- `presenter/number-tween.test.ts`: primeiro valor instantâneo, contagem com formato pt-BR em todo
  quadro, contagem para baixo de percentuais, sem tween/pulso quando o texto não muda, valor sem
  animate no meio de um tween, continuação do valor em tela, `text()`, `finishAll()`, sem pulso.
- `presenter/results-card.test.ts`: primeiro render instantâneo (`.instant`), atualização conta
  tudo e termina idêntica a um render novo, só pisca o que mudou, troca de área instantânea, render
  sem animate no meio, linhas que aparecem são reconstruídas, sem números, `checked-ago` intocado.
- `external/area-look.test.ts`: looks, mistura nos extremos, linha deslizando, fade de/para cinza,
  props em repouso × no meio.
- `external/maplibre-globe.test.ts`: sem animate é instantâneo, primeira pintura não anima, linha
  desliza e termina nos lados de repouso, fade do cinza, só áreas alteradas, mesmos números não
  animam, outro estado não anima, cancelamento por chamada sem animate, cores de líder em peças
  de ultramar e pontos, 1º turno nunca anima, redesenho caro encerra, muitas áreas pulam, intervalo.
- `presenter/app.test.ts`: primeira pintura e filtros sem animação e poll da mesma vista com
  animação; poll iniciado antes de mudar filtro não anima; movimento reduzido não anima.
- `infra/demo-api.test.ts`: crescimento consistente e respostas encadeadas.

Total da suíte web: 237 testes passando. Todos os arquivos novos com 100% de linhas e branches.

## Dependências

Nenhuma nova. Medição/capturas com o puppeteer-core já usado nas ferramentas locais.

## Observações

- Durações: números 800 ms, barras 800 ms (CSS), globo 700 ms; pulso 1,2 s.
- Medições em SwiftShader (GPU por software) subestimam a fluidez real do render do MapLibre; os
  números do recorte + `setData` são de CPU e valem como referência.
- Os municípios dos estados ainda sem números locais (MG tinha 0 liberados) foram medidos com um
  benchmark que muda os 853 de uma vez (pior caso).
- O `window.__globe` (para ler `frameCosts`) só existe em DEV.
