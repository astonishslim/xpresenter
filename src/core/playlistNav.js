// Navegação pelo culto feita no computador (pedido do controle remoto: "item X, slide N").
// O celular não manda o conteúdo do slide: assim não injeta texto nem caminho de arquivo na projeção.
const findItem = (playlist, itemId) => (Array.isArray(playlist) ? playlist.find((i) => i && i.id === itemId) : undefined);

function slideActionFor(playlist, itemId, index) {
  const item = findItem(playlist, itemId);
  if (!item || !Array.isArray(item.slides) || !Number.isInteger(index) || index < 0 || index >= item.slides.length) return null;
  const slide = item.slides[index];
  if (slide.media) return { type: 'showMedia', media: { ...slide.media } };
  const next = item.slides[index + 1];
  const { media: _media, index: _index, ...fields } = slide;
  return {
    type: 'showSlide',
    slide: { ...fields, title: item.title, key: `${item.id}:${index}` },
    next: next && !next.media ? { label: next.label, text: next.text } : null,
  };
}

// Tema automático do item (mesma regra do operador): versículo → padrão de versículos; música → tema próprio
// (se ainda existir) ou padrão de músicas; o resto não troca o tema.
function themeNameFor(item, songs, defaults, themeNames) {
  if (!item) return null;
  if (item.kind === 'verse') return defaults.verse || null;
  if (item.kind !== 'song') return null;
  const song = (songs || []).find((s) => s.id === item.refId);
  const own = song && song.theme;
  const exists = own && themeNames.some((n) => n.toLowerCase() === own.toLowerCase());
  return exists ? own : defaults.song || null;
}

module.exports = { slideActionFor, themeNameFor, findItem };
