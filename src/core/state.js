const DEFAULT_BACKGROUND = { kind: 'color', value: '#000000' };

function initialState() {
  return {
    blackout: false,
    layers: {
      background: { ...DEFAULT_BACKGROUND },
      content: { slide: null },
      cover: { visible: false },
      announcement: { text: null },
    },
  };
}

const HANDLERS = {
  showSlide: (s, a) => ({ ...s, blackout: false, layers: { ...s.layers, content: { slide: a.slide } } }),
  clear: (s) => ({ ...s, layers: { ...s.layers, content: { slide: null } } }),
  blackout: (s) => ({ ...s, blackout: !s.blackout }),
  toggleCover: (s) => ({ ...s, layers: { ...s.layers, cover: { visible: !s.layers.cover.visible } } }),
  setBackground: (s, a) => ({ ...s, layers: { ...s.layers, background: { ...a.background } } }),
  setAnnouncement: (s, a) => ({ ...s, layers: { ...s.layers, announcement: { text: a.text || null } } }),
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const UNSAFE_URL_CHARS = /["')\\\s]/;

// Cor hex, ou URL file: local sem host (impede SMB/NTLM e carga remota).
function isValidBackground(bg) {
  if (!bg || typeof bg.value !== 'string') return false;
  if (bg.kind === 'color') return HEX_COLOR.test(bg.value);
  if (bg.kind !== 'image' && bg.kind !== 'video') return false;
  if (UNSAFE_URL_CHARS.test(bg.value)) return false;
  try {
    const url = new URL(bg.value);
    return url.protocol === 'file:' && url.host === '';
  } catch {
    return false;
  }
}

const REQUIRED_FIELD = {
  showSlide: (a) => a.slide && typeof a.slide.text === 'string',
  setBackground: (a) => isValidBackground(a.background),
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

module.exports = { initialState, reduce, isValidAction };
