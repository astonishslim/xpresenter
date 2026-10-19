# Apresentador

Aplicativo desktop (Electron) para projetar **letras de músicas**, **versículos** e **avisos** no culto, com
**controle remoto pelo celular**. Inspirado na experiência de uso de apps como o Spresenter, mas escrito do zero
(nenhum código de terceiros foi copiado).

## Como usar

```bash
npm install
npm start
```

1. **+ Música** cria uma música. Use `[Verso 1]`, `[Refrão]`, `[Ponte]` para marcar seções; linha em branco separa slides.
   Acordes inline como `[Am]` são ignorados na projeção.
2. **Projetar** abre a saída: em tela cheia no monitor externo, ou em janela se houver um só monitor.
3. Clique num slide para colocá-lo ao vivo. Atalhos: `→`/`Espaço` próximo, `←` anterior, `B` preto, `Esc` limpar.
4. **Bíblia**: escolha a versão e digite uma referência (`João 3:16-17`, `1 Co 13:4-7`, `Salmo 23`) **ou palavras**
   (`amou o mundo`, `"assim amou Deus"` para frase exata). A busca ignora acentos e maiúsculas. Clique num resultado para
   abrir a passagem; cada verso vira um slide com a versão no rótulo (`João 3:16 · TB`).
   - **Incluídas** (livres): Tradução Brasileira (TB), Almeida 1911 (ALM1911) e Bíblia Livre (BLIVRE, CC BY 3.0 BR, com atribuição
     obrigatória exibida no app). Fonte e licenças em `data/bibles/SOURCES.md`; para atualizar: `npm run bibles`.
   - **Importar** outras versões: botão de importar ou **arraste o arquivo** para a seção Bíblia. Aceita JSON (lista de livros,
     um arquivo por livro como o `damarals/biblias`, ou o formato do app) e **Zefania XML**. Versões importadas podem ser removidas.
   - ARA, ARC, NVI, NAA, NTLH e outras são de editoras: **não vêm no app**. Importe somente arquivos que você tenha o direito de usar.
5. **Culto** é a ordem do culto (músicas e versículos); reordene e remova.
6. **Remoto** mostra um endereço para abrir no celular (mesma rede Wi-Fi). O endereço contém um token novo a cada execução.

## Preview, Programa e retorno de palco

- **Preview** (azul) mostra o slide selecionado antes de ir ao ar; **Programa** (verde) espelha exatamente a saída.
  Clique seleciona, **duplo clique** / **Enter** / **Ao vivo ▶** envia. Setas e Espaço avançam ao vivo, e o Preview passa a
  mostrar o próximo slide. Marque "Clique envia direto ao vivo" para o modo direto.
- **Retorno de palco** (para banda e pregador): slide atual, próximo, relógio, aviso de tela preta e mensagem livre.
  Abre em tela cheia no monitor escolhido ou em janela. Também funciona em tablet/celular: botão **Remoto** mostra o link.
- **Grade bento**: a tela do operador é uma grade de 12 colunas com blocos de tamanhos variados.
  - **Mover bloco**: arraste a alça ⠿ do bloco sobre outro (ele toma o lugar do alvo), ou foque a alça e use as setas.
  - **Redimensionar**: arraste o canto ◢ (encaixa nas células da grade), ou foque o canto e use as setas; duplo clique restaura.
  - **Mover seção**: cada seção (Músicas, Bíblia, Preview, Programa, Slides, Controles, Retorno, Culto) tem a alça ⋮⋮.
    Arraste para outro bloco, antes/depois de outra seção, ou para um bloco vazio. Pelo teclado: ↑ ↓ reordena dentro do
    bloco e ← → manda para o bloco anterior/seguinte. Seções também recolhem.
  - **Restaurar layout** volta a tudo ao padrão. O layout (blocos, tamanhos e seções) fica salvo. Seções novas de versões
    futuras entram no bloco padrão sem desfazer o seu arranjo.
- **Presets de layout** (seletor **Layout** no cabeçalho): troca o arranjo inteiro com um clique.
  - **Padrão**, **Culto** (monitores grandes no topo, slides e controles embaixo), **Ensaio** (biblioteca e slides em
    destaque) e **Operador de mídia** (monitores e controles em faixa, retorno e slides abaixo). Todos preenchem a grade
    12×12 sem buracos.
  - **Salvar layout…** guarda o arranjo atual com um nome (até 20; mesmo nome substitui). **Excluir** pede confirmação com
    um segundo clique. Se você mexer no arranjo, o seletor mostra **Personalizado**. Trocar de preset não altera o que
    está ao vivo.

## Cabeçalho e modo "editar painéis"

- O cabeçalho é uma linha de ícones em grupos: **ao vivo** (anterior, próximo, limpar, preto, capa), **layout** (seletor de
  preset, salvar, excluir, restaurar e **editar painéis**) e **saída** (controle remoto e Projetar).
- As alças de **mover bloco**, **mover seção** e **redimensionar** ficam **ocultas** por padrão. Clique em **editar painéis**
  (ícone de painéis, no grupo Layout) para mostrá-las; o botão fica azul e os blocos ganham contorno tracejado. Clique de novo
  para concluir. Com o modo desligado, mover e redimensionar ficam desativados de fato (teclado e arrastar incluídos).
- O modo **não é salvo**: o app sempre abre travado, para ninguém desmontar a tela no meio do culto. O layout editado é mantido.
- Trocar de preset, salvar e restaurar layout funcionam sem ligar o modo de edição.

## Interface compacta com ícones

Os botões usam ícones minúsculos (14 px; 12 px nos menores) no estilo de apps de projeção como o Spresenter, com o texto só
nos botões principais (`Projetar`). Todo botão só de ícone tem `title` (dica ao passar o mouse) e `aria-label`. Os ícones são do
[Lucide](https://lucide.dev) (licença ISC, em `licenses/lucide-LICENSE.txt`), embutidos em `src/renderer/shared/icons.js` só com
os usados. Para trocar ou acrescentar: edite a lista em `scripts/build-icons.js` e rode `npm run icons` (gera também a cópia
em `src/remote/icons.js`, usada pelo controle remoto do celular e pelo retorno de palco).

## Busca de músicas e letras da internet

- A busca de **Músicas** procura no **título e na letra**, sem diferenciar acentos e maiúsculas, pelo início das palavras
  (`aguas` acha "águas", `perd` acha "perdoar"). Use `"entre aspas"` para frase exata. Quem foi achado pela letra mostra a
  linha encontrada abaixo do título. Marcadores de seção e acordes não entram na busca.
- **Buscar letra na internet** (ícone de globo, ou o atalho que aparece quando nada é encontrado na biblioteca): digite o nome
  e, se quiser, o artista. As letras vêm do [LRCLIB](https://lrclib.net), uma base aberta e gratuita mantida pela comunidade,
  sem cadastro. Resultados repetidos são agrupados. Escolha um, confira a letra e clique em **Revisar e salvar…**: ela abre
  no editor para você marcar as seções (`[Refrão]`…) antes de salvar.
- Letras de músicas têm direitos autorais. Projete só o que sua igreja tem licença para usar (ex.: CCLI).
- Se o serviço estiver ocupado ou sem internet, o app avisa e não trava; a busca na biblioteca continua funcionando offline.

## Camadas: ocultar letra, fundo e aviso

- No cabeçalho, o grupo **Camadas** oculta e mostra a **letra** (atalho `L`), o **fundo** e o **aviso** sem perder o
  conteúdo: a letra volta no mesmo slide, o aviso volta com o mesmo texto. Botão aceso = camada oculta.
- Enviar outro slide ao vivo volta a mostrar a letra. Trocar o fundo mantém se ele está oculto.
- **Escurecer** (em "Aviso e fundo"): 10% a 80% de escurecimento sobre a imagem ou o vídeo, para a letra ler melhor.
- O retorno de palco mostra "LETRA OCULTA" enquanto a letra estiver escondida.

## Transmissão (OBS / vMix)

O botão de controle remoto mostra também o endereço da **Transmissão** (`/live.html?t=…`): uma página com **fundo
transparente** e a letra ou o versículo ao vivo numa faixa inferior. No OBS, adicione uma **Fonte de navegador**
(Browser Source) de 1920×1080 com esse endereço; no vMix, uma entrada **Web Browser**. Para softwares sem transparência,
acrescente `&fundo=verde` e use chroma key. A faixa some com tela preta, letra oculta ou conteúdo limpo.

## Fundo, estilo do texto e temas

Nas seções **Aviso e fundo** (cor, imagem, vídeo) e **Tema e texto** (estilo, temas):

- **Fundo**: cor, imagem ou **vídeo** (MP4, WebM, M4V, OGV; toca em loop e sem som). Só arquivos locais.
- **Estilo do texto**: fonte (sem serifa, serifada, condensada, slab; só fontes do sistema, funciona sem internet), tamanho
  máximo (50–150%, o texto continua encaixando automaticamente), cor, alinhamento, posição (topo, meio, base), tudo em
  maiúsculas, sombra e rótulo (Verso, Refrão, referência). Vale na saída, no Preview e no Programa na hora.
- **Temas**: **Salvar tema** guarda o fundo e o estilo que estão na saída agora, com um nome (até 30; mesmo nome substitui).
  Escolher um tema aplica os dois de uma vez, sem mexer no slide ao vivo. Se você mudar algo, o seletor mostra
  "Sem tema (personalizado)". Excluir pede um segundo clique.
- O app **reabre com o último fundo e estilo** usados (arquivo `themes.json` na pasta de dados do app).
- O controle remoto do celular não altera fundo nem estilo. Os valores do estilo são fechados (listas, cor hex e números),
  então um `themes.json` editado à mão não consegue injetar CSS: campos inválidos voltam ao padrão.

## Biblioteca de mídia

Seção **Mídia** (no bloco da biblioteca): imagens (JPG, PNG, WebP, GIF) e vídeos (MP4, WebM, M4V, OGV) com miniaturas.
- **Adicionar**: botão de importar (vários de uma vez) ou **arraste os arquivos** para a seção. O app guarda só a referência
  (não copia vídeos grandes); se o arquivo for movido ou apagado, o cartão aparece como "arquivo não encontrado".
- **Clique** na miniatura: vira o **fundo** (imagem ou vídeo em loop, sem som).
- **▶ (tela cheia)**: mostra a imagem ou o **vídeo com som** no lugar da letra. Sob o Programa aparecem pausar/tocar,
  voltar ao início e a barra de progresso. Mandar um slide ou limpar (Esc) encerra o vídeo.
- **Adicionar ao culto**: o vídeo/imagem vira um item do culto, enviado ao vivo como qualquer slide.
- Só a primeira janela de projeção toca o som; Preview e Programa ficam mudos. O retorno de palco mostra "AGORA · VÍDEO".
- O app desliga a economia de energia do Chromium para vídeo e relógios não pararem com a janela encoberta.

## Várias saídas, panorâmico e edge blending

Botão **Configurar saídas** (ícone de monitor com engrenagem, no grupo Saída):
- Marque os monitores que projetam e **o que cada um mostra**: **Tudo**, **Só letra** (sobre preto: telas laterais, tela da
  banda, captura) ou **Só fundo e mídia** (tela de ambiente). Sem nenhum marcado, cada monitor externo mostra tudo, como antes.
- **Panorâmico** (2 a 4 telas): uma imagem larga dividida entre os monitores, na posição 1, 2, 3… de cada um.
  - **Sem sobreposição**: recorte simples, para **painéis de LED** lado a lado.
  - **Com sobreposição** (5% a 30%): para projetores que cruzam a imagem. As bordas internas ganham **edge blending**
    (rampa corrigida por gama 2,2) para a emenda não aparecer. Ajuste a porcentagem até a faixa sobreposta ficar com o mesmo
    brilho do resto.
- Salvar com a projeção aberta reabre as janelas no novo arranjo. O som dos vídeos sai só pela primeira saída que mostra mídia.

## Importar apresentação (PDF e PowerPoint)

Botão de apresentação na seção **Culto**:
- **PDF**: cada página vira um slide de imagem (1920 px de largura) e o arquivo entra no culto como um item. Ideal para os
  slides do pregador: no PowerPoint/Google Slides/Keynote, **exporte como PDF** e importe aqui. Até 300 páginas, 100 MB.
  As páginas ficam na pasta de dados do app e são apagadas quando o item sai do culto.
- **PPTX**: importa só o **texto** de cada slide (como slides de texto, no estilo do tema). Para manter o visual, use PDF.
- O PDF é renderizado com o [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0, cópia em `src/renderer/vendor/pdfjs`;
  atualizar com `npm run vendor:pdfjs`). O PPTX é lido com o [fflate](https://github.com/101arrowz/fflate) (MIT), com limites
  contra arquivos que se expandem demais.

## Transições, legenda e tema automático

- **Transição** (em "Tema e texto"): corte seco ou fade (rápido, normal, lento, muito lento). No fade, o slide
  anterior some enquanto o novo aparece (crossfade). A transição faz parte do tema.
- **Legenda**: uma linha num canto da tela, com variáveis: `{titulo}` (música ou passagem), `{rotulo}` (Verso, Refrão…),
  `{hora}`, `{data}` e `{cronometro}`. Ex.: `{titulo} · {hora}` ou `Faltam {cronometro}`. Variável vazia some junto com o
  separador. Enter ou sair do campo aplica. Também faz parte do tema.
- **Tema automático**: escolha o tema das **músicas** e o dos **versículos**. Quando um item novo entra ao vivo, o tema dele é
  aplicado antes do primeiro slide. Cada música pode ter **tema próprio** (no editor da música), que vale mais que o padrão.
  Avançar dentro do mesmo item não reaplica, então ajustes feitos à mão durante a música são mantidos.

## Cronômetro

Na seção **Cronômetro**: **regressiva** (minutos) ou **cronômetro** (conta para cima), com iniciar/pausar e zerar.
- **No retorno** aparece no cabeçalho sempre que estiver em uso: amarelo no último minuto, vermelho e negativo quando estoura
  (ex.: `-01:20`, tempo da pregação). Em tablet, usa o relógio do computador do operador, não o do aparelho.
- **Na projeção**, só se você ligar o botão de TV: grande no centro quando não há letra (contagem antes do culto, inclusive
  sobre a capa) e pequeno no canto quando há letra. Também pode entrar na legenda com `{cronometro}`.

## Camadas da projeção

Fundo (cor/imagem/vídeo) → Conteúdo (slide) → Legenda → Capa → Cronômetro → Aviso (rodapé) → Preto. Estado central em
`src/core/state.js`. `src/renderer/shared/liveInfo.js` (cronômetro e variáveis da legenda) tem uma cópia idêntica em
`src/remote/` (o servidor remoto só serve aquela pasta); um teste confere.

## Arquitetura

```
src/core/      lógica pura e testada (songParser, songSearch, lyricsOnline, bible, state, textStyle, themeLibrary, store, library, remoteServer)
src/main/      processo principal Electron (janelas, IPC, preload)
src/renderer/  operator/ (operador), output/ (projeção), shared/ (palco reutilizado por saída, Preview e Programa; layoutModel.js com o modelo puro da grade bento)
src/remote/    controle remoto, retorno de palco e página de transmissão (HTTP + SSE, sem dependências)
```

## Testes

```bash
npm test            # unitários/integração
npm run coverage    # com cobertura
```

## Segurança do controle remoto

HTTP simples em rede local, com token de 128 bits por execução, bloqueio após 10 tentativas erradas e lista de ações
permitidas (o celular não troca fundo). Use apenas em Wi-Fi confiável.

## Próximos passos sugeridos

Biblioteca de mídia com miniaturas (e vídeo como item do culto), várias saídas com conteúdo diferente, NDI, importação de
PPTX/PDF, atualização automática do instalador.
