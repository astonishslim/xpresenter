const { DEFAULT_TEXT_STYLE, isValidStylePatch, mergeStyle } = require('./textStyle');
const { timerValueMs } = require('../renderer/shared/liveInfo');

const TIMER_MODES = ['countdown', 'stopwatch'];
const TIMER_MAX_SECONDS = 24 * 60 * 60;
const DEFAULT_TIMER_SECONDS = 5 * 60;
// Ações que dependem do relógio: quem despacha (IPC/remoto) carimba `now`, e o reducer continua puro.
const TIMED_ACTIONS = new Set(['timerToggle', 'timerUntil']);
const CLOCK_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timerAtStart = (mode, setMs) => ({ mode, setMs, baseMs: mode === 'countdown' ? setMs : 0, startedAt: null, targetAt: null });

// Próxima vez que o relógio local marca HH:MM (hoje, ou amanhã se já passou). Fica em ms para todos os aparelhos.
function nextClockTime(time, now) {
  const [, hours, minutes] = CLOCK_TIME_RE.exec(time);
  const today = new Date(now);
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate(), Number(hours), Number(minutes), 0, 0);
  if (target.getTime() > now) return target.getTime();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, Number(hours), Number(minutes), 0, 0).getTime();
}

function stampAction(action, now) {
  return action && TIMED_ACTIONS.has(action.type) ? { ...action, now } : action;
}

const DEFAULT_BACKGROUND = { kind: 'color', value: '#000000' };
// Camadas que o operador pode ocultar sem perder o conteúdo (a capa e o preto já são liga/desliga).
const TOGGLEABLE_LAYERS = ['background', 'content', 'announcement'];
const DIM_MAX = 80;
const DIM_STEP = 10;

const pickLayerFlags = (layer) => ({
  ...(layer.hidden ? { hidden: true } : {}),
  ...(layer.dim ? { dim: layer.dim } : {}),
});

// `look` (opcional) é o visual restaurado do disco: { background, style }, já validado.
function initialState(look = {}) {
  return {
    blackout: false,
    layers: {
      background: { ...(look.background || DEFAULT_BACKGROUND) },
      media: null, // vídeo/imagem em tela cheia como item do culto (acima do fundo, no lugar da letra)
      content: { slide: null },
      cover: { visible: false },
      announcement: { text: null },
    },
    textStyle: { ...(look.style || DEFAULT_TEXT_STYLE) },
    stage: { next: null, message: null },
    timer: { ...timerAtStart('countdown', DEFAULT_TIMER_SECONDS * 1000), visible: false },
  };
}

const withTimer = (s, patch) => ({ ...s, timer: { ...s.timer, ...patch } });

// Título e rótulo vão para a legenda, recalculada várias vezes por segundo: corta o excesso (sem recusar o slide).
const MAX_SLIDE_META_CHARS = 200;
const clampSlideMeta = (slide) => ({
  ...slide,
  ...(typeof slide.title === 'string' ? { title: slide.title.slice(0, MAX_SLIDE_META_CHARS) } : {}),
  ...(typeof slide.label === 'string' ? { label: slide.label.slice(0, MAX_SLIDE_META_CHARS) } : {}),
});

const TIMER_HANDLERS = {
  timerSet: (s, a) => withTimer(s, timerAtStart(a.mode, a.mode === 'countdown' ? a.seconds * 1000 : 0)),
  // Liga/pausa: ao pausar, guarda o valor do instante; ao ligar, marca o início.
  timerUntil: (s, a) => (Number.isFinite(a.now)
    ? withTimer(s, { mode: 'until', setMs: 0, baseMs: 0, startedAt: null, targetAt: nextClockTime(a.time, a.now) })
    : s),
  timerToggle: (s, a) => {
    if (!Number.isFinite(a.now) || s.timer.mode === 'until') return s; // até o horário não pausa
    if (s.timer.startedAt == null) return withTimer(s, { startedAt: a.now });
    return withTimer(s, { baseMs: timerValueMs(s.timer, a.now), startedAt: null });
  },
  // Zerar tira do modo "até o horário" e volta à regressiva padrão.
  timerReset: (s) => withTimer(s, s.timer.mode === 'until'
    ? timerAtStart('countdown', DEFAULT_TIMER_SECONDS * 1000)
    : timerAtStart(s.timer.mode, s.timer.setMs)),
  timerVisible: (s) => withTimer(s, { visible: !s.timer.visible }),
};

const HANDLERS = {
  showSlide: (s, a) => ({
    ...s,
    blackout: false,
    // Slide novo volta a mostrar a letra e encerra o vídeo/imagem que estava no ar.
    layers: { ...s.layers, media: null, content: { slide: clampSlideMeta(a.slide), hidden: false } },
    stage: { ...s.stage, next: a.next || null },
  }),
  clear: (s) => ({ ...s, layers: { ...s.layers, media: null, content: { slide: null } }, stage: { ...s.stage, next: null } }),
  showMedia: (s, a) => ({
    ...s,
    blackout: false,
    layers: {
      ...s.layers,
      content: { slide: null },
      media: {
        kind: a.media.kind,
        value: a.media.value,
        title: (a.media.title || '').slice(0, MAX_SLIDE_META_CHARS),
        loop: Boolean(a.media.loop),
        // Slide do culto de origem ("item:índice"): o remoto, o tema automático e o OSC sabem onde estão.
        key: typeof a.media.key === 'string' ? a.media.key.slice(0, MAX_SLIDE_META_CHARS) : null,
        playing: true,
        seq: ((s.layers.media && s.layers.media.seq) || 0) + 1,
      },
    },
    stage: { ...s.stage, next: null },
  }),
  mediaControl: (s, a) => {
    const media = s.layers.media;
    if (!media) return s;
    const next = a.command === 'restart'
      ? { ...media, playing: true, seq: media.seq + 1 }
      : { ...media, playing: a.command === 'play' };
    return { ...s, layers: { ...s.layers, media: next } };
  },
  setStageMessage: (s, a) => ({ ...s, stage: { ...s.stage, message: a.text || null } }),
  blackout: (s) => ({ ...s, blackout: !s.blackout }),
  toggleCover: (s) => ({ ...s, layers: { ...s.layers, cover: { visible: !s.layers.cover.visible } } }),
  // Trocar o fundo mantém se ele está oculto e quanto está escurecido.
  setBackground: (s, a) => ({
    ...s,
    layers: { ...s.layers, background: { ...pickLayerFlags(s.layers.background), kind: a.background.kind, value: a.background.value } },
  }),
  setAnnouncement: (s, a) => ({ ...s, layers: { ...s.layers, announcement: { ...s.layers.announcement, text: a.text || null } } }),
  toggleLayer: (s, a) => {
    const layer = s.layers[a.layer];
    return { ...s, layers: { ...s.layers, [a.layer]: { ...layer, hidden: !layer.hidden } } };
  },
  setBackgroundDim: (s, a) => ({ ...s, layers: { ...s.layers, background: { ...s.layers.background, dim: a.value } } }),
  ...TIMER_HANDLERS,
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

const isOptionalText = (v) => v == null || typeof v === 'string';
const MEDIA_COMMANDS = ['play', 'pause', 'restart'];

const REQUIRED_FIELD = {
  showSlide: (a) => a.slide && typeof a.slide.text === 'string'
    && isOptionalText(a.slide.title) && isOptionalText(a.slide.label)
    && (a.slide.image == null || isValidBackground({ kind: 'image', value: a.slide.image }))
    && (a.next == null || typeof a.next.text === 'string'),
  showMedia: (a) => a.media && isValidBackground(a.media) && isOptionalText(a.media.title) && isOptionalText(a.media.key)
    && (a.media.loop == null || typeof a.media.loop === 'boolean'),
  mediaControl: (a) => MEDIA_COMMANDS.includes(a.command),
  timerSet: (a) => TIMER_MODES.includes(a.mode) && Number.isInteger(a.seconds) && a.seconds >= 0 && a.seconds <= TIMER_MAX_SECONDS,
  timerUntil: (a) => typeof a.time === 'string' && CLOCK_TIME_RE.test(a.time),
  setStageMessage: (a) => typeof a.text === 'string',
  setBackground: (a) => isValidBackground(a.background),
  setTextStyle: (a) => isValidStylePatch(a.style),
  toggleLayer: (a) => TOGGLEABLE_LAYERS.includes(a.layer),
  setBackgroundDim: (a) => Number.isInteger(a.value) && a.value >= 0 && a.value <= DIM_MAX && a.value % DIM_STEP === 0,
};

function isValidAction(action) {
  if (!action || typeof action.type !== 'string' || !Object.hasOwn(HANDLERS, action.type)) return false;
  const check = REQUIRED_FIELD[action.type];
  return check ? Boolean(check(action)) : true;
}

// Chave do que está no ar ("item:índice"), seja slide ou mídia; null se nada veio do culto.
function liveKeyOf(state) {
  const { content, media } = state.layers;
  if (media) return media.key || null;
  return content.slide && typeof content.slide.key === 'string' ? content.slide.key : null;
}

function reduce(state, action) {
  const handler = action && Object.hasOwn(HANDLERS, action.type) ? HANDLERS[action.type] : null;
  return handler ? handler(state, action) : state;
}

module.exports = { initialState, reduce, isValidAction, isValidBackground, stampAction, liveKeyOf, DEFAULT_BACKGROUND };
