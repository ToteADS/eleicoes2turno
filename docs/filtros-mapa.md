# Filtros do mapa: tipo de mapa e % de urnas apuradas

## Título

Opções de visualização do mapa no 2º turno: "Tipo de mapa" e "Mostrar % de urnas apuradas".

## Descrição

Duas opções novas no card de filtros (no celular, dentro da folha aberta pelo botão "Filtros"):

- **Tipo de mapa** (select):
  - **Porcentagem** (padrão): o desenho de sempre, cada área cortada por uma linha na fatia do
    Lula (vermelho a oeste, azul a leste).
  - **Mais votos**: cada área inteira na cor de quem lidera ali (Lula vermelho, Flávio azul),
    cinza sem votos e um cinza mais escuro (neutro) em empate exato.
- **Rótulos > Mostrar % de urnas apuradas** (switch, desligado por padrão): um rótulo no centro de
  cada área visível com o percentual de seções totalizadas daquela área (`st / ts`), no formato do
  idioma ("37,5%" em pt/es, "37.5%" em en).

As duas valem para todas as camadas: países, estados, municípios e pontos das cidades do exterior.
No 1º turno (resultado final, vários candidatos) as duas opções ficam **escondidas**: o mapa usa as
cores do vencedor de cada área e não há rótulos (seriam 100% em todo lugar). A escolha do usuário
continua guardada e volta ao retornar para o 2º turno.

## O que foi feito

- **Domínio**: `MapOptions` (`type: 'share' | 'leader'`, `sectionLabels`), padrões e as opções
  fixas do 1º turno; `sectionsLabel()` formata o percentual; `labelPoint()` acha o ponto do rótulo
  (polo de inacessibilidade, algoritmo polylabel) a partir da geometria que já existe.
- **Visual das áreas** (`external/area-look.ts`): `lookOf(r, 'leader')` devolve um `AreaLook` sem
  linha de corte e com as três cores iguais à do líder (`TIE` no empate, `GHOST` sem dados). Como é
  o mesmo `AreaLook` do modo porcentagem, o tween das atualizações ao vivo funciona igual: uma troca
  de líder mistura a cor em OKLab (vermelho ↔ azul), e uma área que recebe os primeiros números
  surge do cinza.
- **Globo** (`external/maplibre-globe.ts`): `setMapOptions()` no `GlobeRenderer`; os `set*` usam o
  tipo atual ao montar cada área. Rótulos numa camada `symbol` própria (`labels`) com uma fonte
  GeoJSON de pontos, montada uma vez por tarefa (microtask) mesmo quando uma consulta redesenha as
  quatro camadas. Filtro por vista em `focus()`.
- **Imagens dos rótulos** (`external/label-image.ts`): o estilo não tem servidor de glyphs, então
  cada texto vira um ícone desenhado em canvas (fonte Archivo 700, texto escuro com halo branco),
  criado sob demanda pelo `setMissingStyleImageResolver` do MapLibre, um por texto distinto.
- **UI** (`presenter/map-options-control.ts`): o select e o switch, num módulo próprio, dentro de um
  slot do card de filtros (`FiltersCard.mapSlot`).
- **URL** (`presenter/map-options-url.ts`): `?mapa=votos` e `?urnas=1`, só quando diferentes do
  padrão (como `?turno=1`). A escolha sobrevive a recarregar a página e às consultas.
- **App** (`presenter/app.ts`): mantém `mapOptions`, aplica as opções efetivas (as do 1º turno
  quando nele) a cada pintura e repinta na hora ao trocar (sem tween: não é atualização de dados).
- **Correção encontrada no caminho**: no celular, escolher um estado com a folha de filtros aberta
  não aproximava a câmera (o voo era calculado com o padding da folha aberta, sem espaço). Agora a
  folha fecha antes do voo. E, com a folha aberta, os controles do globo (zoom etc.) ficam
  escondidos, porque a folha mais alta chegava até eles.
- **i18n**: chaves `map_type`, `map_type_share`, `map_type_leader`, `map_labels`,
  `map_labels_sections` em pt/en/es.

## Tecnologias usadas

TypeScript, MapLibre GL (camada `symbol` com `icon-image`, `symbol-sort-key`, colisão nativa,
`setMissingStyleImageResolver`, `addImage`), Canvas 2D, `Intl.NumberFormat`, algoritmo polylabel
(polo de inacessibilidade), Vitest + jsdom, puppeteer-core (capturas e medições).

## Estrutura de arquivos

```
web/src/domain/map-options.ts               MapType, MapOptions, padrões, opções do 1º turno
web/src/domain/label-point.ts               labelPoint / poleOfInaccessibility (polylabel)
web/src/domain/format.ts                    sectionsLabel(): "37,5%", "<0,1%", null sem dados
web/src/infra/globe.ts                      GlobeRenderer.setMapOptions()
web/src/external/area-look.ts               lookOf(r, type), cor TIE do empate
web/src/external/label-image.ts             ícone de rótulo em canvas (texto + halo)
web/src/external/maplibre-globe.ts          tipo de mapa, camada/fonte "labels", filtros por vista
web/src/presenter/map-options-control.ts    select "Tipo de mapa" + switch dos rótulos
web/src/presenter/map-options-url.ts        ?mapa=votos / ?urnas=1
web/src/presenter/filters-card.ts           slot .map-slot dentro de .filters
web/src/presenter/app.ts                    estado, URL, opções efetivas por turno, fecha a folha antes do voo
web/src/presenter/null-globe.ts             setMapOptions() vazio
web/src/presenter/styles.css                .map-slot, .switch, folha do celular
web/src/i18n/{pt,en,es}.json                textos novos
```

## Como funciona

1. Na carga, `readMapOptions(location.search)` lê a URL; o controle mostra os valores.
2. Toda pintura (`paintGlobe`) chama `globe.setMapOptions(efetivas)` antes dos `set*`. No 1º turno
   as efetivas são sempre as padrão (e as áreas chegam como `SolidFill`, que ignoram o tipo).
3. **Tipo de mapa**: o adaptador converte cada `AreaResult` em `AreaLook` com o tipo atual. No
   "Mais votos" o look não tem `share`, então a área é desenhada inteira com `leadProps` (lados
   `L`/`R` em repouso, `W` + cor durante o tween ou no empate). Ao trocar o tipo, o app repinta sem
   `animate`: tudo é redesenhado na hora. Numa consulta com números novos, `draw()` só faz tween
   das áreas cujo look mudou; no "Mais votos" isso é exatamente a troca de líder (ou a chegada dos
   primeiros números), já que a fatia não aparece.
4. **Rótulos**: cada `set*` registra, por tipo de área (`world`, `br`, `muni`, `city`), uma função
   que monta os pontos; com os rótulos ligados, a fonte `labels` é recalculada uma vez por tarefa.
   Cada ponto tem `kind`, `key`, `img` (`pct:<texto>`) e `rank` (menos o tamanho da área, ou menos o
   eleitorado nas cidades do exterior). O `symbol-sort-key` usa o `rank`, então áreas maiores ganham
   a disputa e o MapLibre descarta os rótulos que colidiriam (`icon-allow-overlap: false`).
5. **Onde fica o rótulo**: o polo de inacessibilidade da maior parte de cada área (sempre dentro
   do polígono, mesmo em formatos côncavos), calculado na primeira vez que a área ganha um rótulo
   e guardado por forma (`WeakMap`). Pontos das cidades do exterior usam lat/lon da cidade.
6. **Vista**: `focus()` filtra a camada: vista geral = países + estados; Brasil/região = estados
   (da região); estado = municípios; município = só ele; país/cidade do exterior = cidades daquele
   país.
7. **Texto**: `st / ts` arredondado para baixo com uma casa (só mostra 100% quando tudo foi
   apurado). Sem resultado, sem seções ou com 0 seções apuradas: sem rótulo (a área já está cinza e
   o "0%" só tiraria espaço de números reais). Algo apurado mas menos de 0,1%: "<0,1%".
8. **Imagem**: na primeira vez que o MapLibre precisa de `pct:37,5%`, o resolver desenha o texto
   em canvas na densidade da tela (máx. 2x) e registra com `addImage`. Há no máximo ~1.000 textos
   distintos, cada um com poucos KB.

## Testes

- `domain/map-options.test.ts`: padrões e opções do 1º turno; `sectionsLabel` em pt/en/es,
  arredondamento para baixo, `<0,1%`, casos sem rótulo, limite de 100%; `labelPoint` (quadrado,
  forma em L, C, seta, multipolígono pega a maior parte e ignora partes vazias, buracos, formas
  degeneradas).
- `external/area-look.test.ts`: "Mais votos" vermelho/azul, empate neutro diferente de "sem dados",
  sem dados cinza, padrão continua porcentagem, troca de líder mistura a cor sem linha.
- `external/label-image.test.ts`: sem canvas = `null`; tamanho pelo texto e densidade; halo antes
  do texto; densidade limitada a 2.
- `external/maplibre-globe.test.ts`: "Mais votos" em estados/países/municípios/cidades; troca de
  tipo repinta sem tween; troca de líder faz tween e termina no novo lado; mesma liderança não
  anima; 1º turno ignora o tipo; camada `labels` (symbol, escondida, sort key, sem `text-field`);
  rótulos desligados não montam nada; ligados: posição, texto, quem fica sem rótulo; ligar depois
  e desligar; desligar antes da microtask; uma consulta = um `setData`; todos os tipos de área;
  áreas maiores com prioridade; atualizam a cada consulta e somem com os municípios; idioma;
  imagem criada uma vez por texto; filtros por vista.
- `presenter/map-options.test.ts`: URL (leitura e escrita só do que difere do padrão) e o
  controle (opções e padrões, valores dados, escondido, eventos, i18n).
- `presenter/app.test.ts`: opções no card com padrões no globo; trocar tipo repinta sem animar e
  grava na URL; começa pela URL e mantém nas consultas; 1º turno esconde e usa as opções padrão
  (e volta às escolhidas no 2º); abrir direto no 1º turno; a folha do celular fecha antes do voo.
- Resultado: **289 testes passando** (28 arquivos). Cobertura de 100% (linhas, branches e funções)
  em todos os arquivos novos (`map-options.ts`, `label-point.ts`, `label-image.ts`,
  `map-options-control.ts`, `map-options-url.ts`) e em `format.ts` e `area-look.ts`.
  `npm run build` passa.

## Dependências

Nenhuma nova. Usa `maplibre-gl` e `@turf/bbox`, que já estavam no projeto; o polylabel foi escrito
em `domain/label-point.ts` (pequeno, sem pacote).

## Observações

- **Desempenho** (medido no Chrome headless com CPU 4x mais lenta, imitando um celular): montar os
  rótulos de MG (853 municípios, 505 com rótulo) leva ~90 ms na primeira vez (cálculo dos polos,
  feito uma vez por forma) e ~1 ms nas consultas seguintes. Os polos dos países também custam
  ~90 ms uma única vez, ao ligar os rótulos. Com os rótulos desligados não há custo: nada é
  calculado nem desenhado. O FPS do globo girando com e sem rótulos ficou igual dentro do ruído do
  renderizador por software (8–12 fps nos dois casos); vale conferir num aparelho real.
- O tween das atualizações ao vivo continua nos dois modos; os rótulos não animam, só trocam de
  texto a cada consulta.
- Na vista geral os rótulos de países perto da borda do globo aparecem achatados na borda; é o
  comportamento do MapLibre com ícones alinhados à tela (alinhar ao mapa fazia os rótulos sumirem
  em zoom baixo).
- A API local usada nos testes manuais não tem `/presence` e `/notice` (404); o app segue sem eles.
