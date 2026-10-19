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
4. **Bíblia**: digite `João 3:16-17`. Importe sua versão em JSON (`{ name, books: [{ name, abbrev, chapters: [[versos]] }] }`).
   O app vem só com uma amostra mínima.
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
  - **Restaurar layout** volta a tudo ao padrão. O layout (blocos, tamanhos e seções) fica salvo.
- **Presets de layout** (seletor **Layout** no cabeçalho): troca o arranjo inteiro com um clique.
  - **Padrão**, **Culto** (monitores grandes no topo, slides e controles embaixo), **Ensaio** (biblioteca e slides em
    destaque) e **Operador de mídia** (monitores e controles em faixa, retorno e slides abaixo). Todos preenchem a grade
    12×12 sem buracos.
  - **Salvar layout…** guarda o arranjo atual com um nome (até 20; mesmo nome substitui). **Excluir** pede confirmação com
    um segundo clique. Se você mexer no arranjo, o seletor mostra **Personalizado**. Trocar de preset não altera o que
    está ao vivo.

## Interface compacta com ícones

Os botões usam ícones minúsculos (14 px; 12 px nos menores) no estilo de apps de projeção como o Spresenter, com o texto só
nos botões principais (`Projetar`). Todo botão só de ícone tem `title` (dica ao passar o mouse) e `aria-label`. Os ícones são do
[Lucide](https://lucide.dev) (licença ISC, em `licenses/lucide-LICENSE.txt`), embutidos em `src/renderer/shared/icons.js` só com
os usados. Para trocar ou acrescentar: edite a lista em `scripts/build-icons.js` e rode `npm run icons`.

## Camadas da projeção

Fundo (cor/imagem) → Conteúdo (slide) → Capa → Aviso (rodapé) → Preto. Estado central em `src/core/state.js`.

## Arquitetura

```
src/core/      lógica pura e testada (songParser, bible, state, store, library, remoteServer)
src/main/      processo principal Electron (janelas, IPC, preload)
src/renderer/  operator/ (operador), output/ (projeção), shared/ (palco reutilizado por saída, Preview e Programa; layoutModel.js com o modelo puro da grade bento)
src/remote/    controle remoto e retorno de palco (HTTP + SSE, sem dependências)
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

Vídeo de fundo na interface, temas salvos, NDI, importação de PPTX/PDF, empacotamento com `electron-builder`.
