const { DEFAULT_TEXT_STYLE, isValidStylePatch, mergeStyle } = require('./textStyle');

const DEFAULT_BACKGROUND = { kind: 'color', value: '#000000' };

// `look` (opcional) é o visual restaurado do disco: { background, style }, já validado.
function initialState(look = {}) {
  return {
    blackout: false,
    layers: {
      background: { ...(look.background || DEFAULT_BACKGROUND) },
      content: { slide: null },
      cover: { visible: false },
      announcement: { text: null },
    },
    textStyle: { ...(look.style || DEFAULT_TEXT_STYLE) },
    stage: { next: null, message: null },
  };
}

const HANDLERS = {
  showSlide: (s, a) => ({
    ...s,
    blackout: false,
    layers: { ...s.layers, content: { slide: a.slide } },
    stage: { ...s.stage, next: a.next || null },
  }),
  clear: (s) => ({ ...s, layers: { ...s.layers, content: { slide: null } }, stage: { ...s.stage, next: null } }),
  setStageMessage: (s, a) => ({ ...s, stage: { ...s.stage, message: a.text || null } }),
  blackout: (s) => ({ ...s, blackout: !s.blackout }),
  toggleCover: (s) => ({ ...s, layers: { ...s.layers, cover: { visible: !s.layers.cover.visible } } }),
  setBackground: (s, a) => ({ ...s, layers: { ...s.layers, background: { ...a.background } } }),
  setAnnouncement: (s, a) => ({ ...s, layers: { ...s.layers, announcement: { text: a.text || null } } }),
  setTextStyle: (s, a) => ({ ...s, textStyle: mergeStyle(s.textStyle, a.style) }),
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const UNSAFE_URL_CHARS = /["')\\\s]/;

// Caminho que o Windows trataria como compartilhamento de rede: //host, \\host, /\host (também codificados).
const NETWORK_PATH = /^[/\\]{2}/;

// Cor hex, ou URL file: local sem host (impede SMB/NTLM e carga remota).
// `file:////host/x` tem host vazio, mas o caminho começa com // e o Chromium abre \\host: por isso o teste do caminho.
function isValidBackground(bg) {
  if (!bg || typeof bg.value !== 'string') return false;
  if (bg.kind === 'color') return HEX_COLOR.test(bg.value);
  if (bg.kind !== 'image' && bg.kind !== 'video') return false;
  if (UNSAFE_URL_CHARS.test(bg.value)) return false;
  try {
    const url = new URL(bg.value);
    if (url.protocol !== 'file:' || url.host !== '') return false;
    return !NETWORK_PATH.test(decodeURIComponent(url.pathname));
  } catch {
    return false;
  }
}

const REQUIRED_FIELD = {
  showSlide: (a) => a.slide && typeof a.slide.text === 'string'
    && (a.next == null || typeof a.next.text === 'string'),
  setStageMessage: (a) => typeof a.text === 'string',
  setBackground: (a) => isValidBackground(a.background),
  setTextStyle: (a) => isValidStylePatch(a.style),
};

function isValidAction(action) {
  if (!action || typeof action.type !== 'string' || !Object.hasOwn(HANDLERS, action.type)) return false;
  const check = REQUIRED_FIELD[action.type];
  return check ? Boolean(check(action)) : true;
}

function reduce(state, action) {
  const handler = action && Object.hasOwn(HANDLERS, action.type) ? HANDLERS[action.type] : null;
  return handler ? handler(state, action) : state;
}

module.exports = { initialState, reduce, isValidAction, isValidBackground, DEFAULT_BACKGROUND };
