// Transmissão (OBS/vMix): mostra a letra ao vivo numa faixa inferior sobre fundo transparente.
// Some quando a tela está preta, a letra está oculta ou o conteúdo foi limpo.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const RETRY_MS = 3000;

if (params.get('fundo') === 'verde') document.body.classList.add('chroma');

function render(state) {
  const { content } = state.layers;
  const slide = content.slide;
  const visible = Boolean(slide) && !content.hidden && !state.blackout;
  $('bar').classList.toggle('visible', visible);
  $('bar').classList.toggle('upper', Boolean(state.textStyle && state.textStyle.uppercase));
  if (!slide) return;
  $('label').textContent = slide.label || '';
  $('text').textContent = slide.text;
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

connect();
