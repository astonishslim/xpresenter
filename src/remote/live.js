// Transmissão (OBS/vMix, e NDI pelo OBS): a letra ao vivo sobre fundo transparente.
//   modo=faixa (padrão): faixa inferior, para sobrepor ao vídeo da câmera.
//   modo=tela: letra em tela cheia, com cor/fonte/maiúsculas do tema (para telão via NDI, ou chroma).
// Some quando a tela está preta, a letra está oculta ou o conteúdo foi limpo.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const RETRY_MS = 3000;
const FULL = params.get('modo') === 'tela';
const FONT_MAX_VH = 14;
const FONT_MIN_VH = 3;
const FIT_STEPS = 8;
const FIT_FILL = 0.85;
// Mesmas chaves do tema (textStyle.font); só fontes do sistema.
const FONTS = {
  sans: "'Segoe UI', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  condensed: "'Bahnschrift SemiCondensed', 'Arial Narrow', 'Segoe UI', sans-serif",
  slab: "Rockwell, 'Roboto Slab', Georgia, serif",
};
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

if (params.get('fundo') === 'verde') document.body.classList.add('chroma');
if (FULL) document.body.classList.add('full');

// Maior fonte (vh) em que a letra cabe na tela (modo tela cheia).
function fit(el) {
  let lo = FONT_MIN_VH;
  let hi = FONT_MAX_VH;
  for (let i = 0; i < FIT_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}vh`;
    const fits = el.scrollHeight <= window.innerHeight * FIT_FILL && el.scrollWidth <= window.innerWidth * FIT_FILL;
    if (fits) lo = mid; else hi = mid;
  }
  el.style.fontSize = `${lo}vh`;
}

let lastState = null;

function render(state) {
  lastState = state;
  const { content } = state.layers;
  const slide = content.slide;
  const style = state.textStyle || {};
  // Página de PDF (só imagem) não tem letra para mostrar aqui.
  const visible = Boolean(slide && slide.text && slide.text.trim()) && !content.hidden && !state.blackout;
  const bar = $('bar');
  bar.classList.toggle('visible', visible);
  bar.classList.toggle('upper', Boolean(style.uppercase));
  if (FULL) {
    bar.style.color = HEX_COLOR.test(style.color || '') ? style.color : '#ffffff';
    bar.style.fontFamily = FONTS[style.font] || FONTS.sans;
  }
  if (!slide) return;
  $('label').textContent = slide.label || '';
  $('text').textContent = slide.text;
  if (FULL && visible) fit($('text'));
}

function connect() {
  const token = encodeURIComponent(params.get('t') || '');
  const events = new EventSource(`/api/events?t=${token}`);
  events.onmessage = (e) => render(JSON.parse(e.data));
  // Token errado devolve 401 e o EventSource não tenta de novo sozinho: reconecta com intervalo.
  events.onerror = () => {
    if (events.readyState === EventSource.CLOSED) setTimeout(connect, RETRY_MS);
  };
}

window.addEventListener('resize', () => lastState && render(lastState));
connect();
