const $ = (id) => document.getElementById(id);
const FONT_MAX_VH = 11;
const FONT_MIN_VH = 3;

// Maior fonte (em vh) em que o texto ainda cabe na área disponível.
function fitText(el, container) {
  let lo = FONT_MIN_VH;
  let hi = FONT_MAX_VH;
  for (let i = 0; i < 8; i += 1) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}vh`;
    const fits = el.scrollHeight <= container.clientHeight * 0.8 && el.scrollWidth <= container.clientWidth;
    if (fits) lo = mid; else hi = mid;
  }
  el.style.fontSize = `${lo}vh`;
}

function renderBackground(bg) {
  const el = $('background');
  el.replaceChildren();
  el.style.backgroundImage = '';
  el.style.backgroundColor = '#000';
  if (bg.kind === 'image') el.style.backgroundImage = `url("${bg.value}")`;
  else if (bg.kind === 'video') {
    const video = document.createElement('video');
    Object.assign(video, { src: bg.value, autoplay: true, loop: true, muted: true });
    el.appendChild(video);
  } else el.style.backgroundColor = bg.value;
}

let lastBackground = '';
function render(state) {
  const { background, content, cover, announcement } = state.layers;

  const key = JSON.stringify(background);
  if (key !== lastBackground) {
    lastBackground = key;
    renderBackground(background);
  }

  const slide = content.slide;
  $('content').classList.toggle('hidden', !slide);
  if (slide) {
    $('label').textContent = slide.label || '';
    $('text').textContent = slide.text;
    fitText($('text'), $('content'));
  }

  $('cover').classList.toggle('visible', cover.visible);
  $('announcement').textContent = announcement.text || '';
  $('announcement').classList.toggle('visible', Boolean(announcement.text));
  $('blackout').classList.toggle('visible', state.blackout);
}

window.apresentador.getState().then(render);
window.apresentador.onState(render);
window.addEventListener('resize', () => window.apresentador.getState().then(render));
