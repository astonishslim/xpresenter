// Janela de projeção. Parâmetros na URL (montados pelo processo principal a partir da configuração das saídas):
// profile (full|lyrics|background), audio, rx/rw (parte do quadro virtual que esta tela mostra), bl/br (blending).
const params = new URLSearchParams(location.search);
// Parâmetro ausente usa o padrão (Number(null) seria 0, e rw = 0 esticaria o quadro ao máximo).
const num = (key, fallback) => {
  if (!params.has(key)) return fallback;
  const v = Number(params.get(key));
  return Number.isFinite(v) ? v : fallback;
};
const { PROFILES, applyProfile, blendStops } = window.outputConfig;
const profile = PROFILES.includes(params.get('profile')) ? params.get('profile') : 'full';
const audio = params.get('audio') === '1';
const region = { x: Math.min(Math.max(num('rx', 0), 0), 1), w: Math.min(Math.max(num('rw', 1), 0.05), 1) };
const blend = { left: Math.min(Math.max(num('bl', 0), 0), 0.5), right: Math.min(Math.max(num('br', 0), 0), 0.5) };

const root = document.getElementById('root');
// Quadro virtual = largura desta tela / região; desloca para mostrar só a parte desta tela.
root.style.width = `${100 / region.w}vw`;
root.style.left = `${(-region.x / region.w) * 100}vw`;

function addBlend(side, width) {
  if (!width) return;
  const stops = blendStops().map((s) => `rgba(0, 0, 0, ${s.alpha}) ${s.at * 100}%`).join(', ');
  const el = document.createElement('div');
  el.className = `blend ${side}`;
  el.style.width = `${width * 100}vw`;
  el.style.background = `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${stops})`;
  document.body.appendChild(el);
}
addBlend('left', blend.left);
addBlend('right', blend.right);

const stage = window.createStage(root, { audio });
let lastState = null;

function render(state) {
  lastState = state;
  stage.update(applyProfile(state, profile));
}

window.apresentador.getState().then(render);
window.apresentador.onState(render);
window.addEventListener('resize', () => lastState && render(lastState));
