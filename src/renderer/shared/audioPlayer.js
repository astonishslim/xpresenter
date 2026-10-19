// Áudio de fundo (música antes do culto): regras puras do player. Quem toca é a janela do operador;
// aqui ficam a ordem das faixas, o fade-out e o momento de baixar o som. Usado no navegador (global) e nos testes.
(function defineAudioPlayer(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.audioPlayer = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  const DEFAULT_VOLUME = 0.8;
  const FADE_MS = 3000;

  // Próxima faixa; -1 no fim da lista (sem repetir) ou sem faixas.
  function nextIndex(index, count, loop) {
    if (count <= 0) return -1;
    if (index + 1 < count) return index + 1;
    return loop ? 0 : -1;
  }

  // Próxima faixa que dá para tocar (pula as que o arquivo sumiu); -1 se não há. Com repetir, uma única
  // faixa tocável repete a si mesma.
  function nextPlayableIndex(index, tracks, loop) {
    const count = tracks.length;
    for (let step = 1; step <= count; step += 1) {
      const j = index + step;
      if (!loop && j >= count) return -1;
      const at = j % count;
      if (!tracks[at].missing) return at;
    }
    return -1;
  }

  // Faixa anterior; na primeira, recomeça a primeira.
  const prevIndex = (index, count) => (count <= 0 ? -1 : Math.max(0, index - 1));

  // Volume durante o fade-out: desce em linha reta do volume inicial até zero.
  function fadeVolume(startVolume, elapsedMs, durationMs) {
    if (durationMs <= 0 || elapsedMs >= durationMs) return 0;
    if (elapsedMs <= 0) return startVolume;
    return startVolume * (1 - elapsedMs / durationMs);
  }

  function clampVolume(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, value));
  }

  // Há algo no ar (slide ou vídeo/imagem/câmera em tela cheia)?
  const isLive = (state) => Boolean(state && state.layers && (state.layers.media || state.layers.content.slide));

  // O conteúdo passou de nada para algo no ar: hora de baixar a música de fundo.
  const enteredLive = (prev, next) => !isLive(prev) && isLive(next);

  return { DEFAULT_VOLUME, FADE_MS, nextIndex, nextPlayableIndex, prevIndex, fadeVolume, clampVolume, isLive, enteredLive };
}));
