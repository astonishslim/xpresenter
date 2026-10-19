// Estado recebido de outro computador (seguindo o líder): nada é copiado às cegas. O estado novo é montado
// campo a campo, só com o que passa nas mesmas validações do resto do app (fundo, slide, props, estilo…), e o
// relógio do líder é convertido para o deste computador.
const { initialState, isValidAction, isValidBackground, isValidProp } = require('./state');
const { normalizeStyle } = require('./textStyle');
const { itemOf, MAX_ACTIVE_PROPS } = require('./propModel');

const MAX_TEXT_CHARS = 5000;
const MAX_META_CHARS = 200;
const MAX_ANNOUNCEMENT_CHARS = 500;
const MAX_TIMER_MS = 48 * 60 * 60 * 1000;
const TIMER_MODES = ['countdown', 'stopwatch', 'until'];
const DIM_MAX = 80;
const DIM_STEP = 10;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const okStamp = (v) => Number.isFinite(v) && v > 0;
const okDuration = (v) => Number.isFinite(v) && Math.abs(v) <= MAX_TIMER_MS;

function pickBackground(bg, fallback) {
  if (!isValidBackground(bg)) return fallback;
  const dim = Number.isInteger(bg.dim) && bg.dim >= 0 && bg.dim <= DIM_MAX && bg.dim % DIM_STEP === 0 ? { dim: bg.dim } : {};
  return { kind: bg.kind, value: bg.value, ...(bg.hidden === true ? { hidden: true } : {}), ...dim };
}

function pickMedia(media) {
  if (!isObject(media) || !isValidAction({ type: 'showMedia', media })) return null;
  return {
    kind: media.kind,
    value: media.value,
    title: typeof media.title === 'string' ? media.title.slice(0, MAX_META_CHARS) : '',
    loop: media.loop === true,
    key: typeof media.key === 'string' ? media.key.slice(0, MAX_META_CHARS) : null,
    playing: media.playing === true,
    seq: Number.isInteger(media.seq) && media.seq >= 0 ? media.seq : 0,
  };
}

function pickSlide(slide) {
  if (!isObject(slide) || typeof slide.text !== 'string' || slide.text.length > MAX_TEXT_CHARS) return null;
  if (!isValidAction({ type: 'showSlide', slide, next: null })) return null;
  const out = { text: slide.text };
  ['label', 'title', 'key'].forEach((k) => { if (typeof slide[k] === 'string') out[k] = slide[k].slice(0, MAX_META_CHARS); });
  if (typeof slide.image === 'string') out.image = slide.image;
  if (Number.isInteger(slide.index)) out.index = slide.index;
  if (Array.isArray(slide.chords)) out.chords = slide.chords.map((line) => line.map((e) => ({ at: e.at, chord: e.chord })));
  return out;
}

function pickProps(props) {
  const items = props && Array.isArray(props.items) ? props.items : [];
  return items.filter((p) => isObject(p) && isValidProp(p)).map(itemOf).slice(-MAX_ACTIVE_PROPS);
}

function pickStage(stage) {
  const s = isObject(stage) ? stage : {};
  const next = isObject(s.next) && text(s.next.text, MAX_TEXT_CHARS) !== null
    ? { label: typeof s.next.label === 'string' ? s.next.label.slice(0, MAX_META_CHARS) : undefined, text: s.next.text }
    : null;
  return { next, message: text(s.message, MAX_ANNOUNCEMENT_CHARS) || null };
}

// startedAt e targetAt estão no relógio do líder: somar a diferença (relógio daqui menos o de lá) os põe no daqui.
function pickTimer(timer, offsetMs, fallback) {
  if (!isObject(timer) || !TIMER_MODES.includes(timer.mode) || !okDuration(timer.setMs) || !okDuration(timer.baseMs)) return fallback;
  const until = timer.mode === 'until';
  if (until && !okStamp(timer.targetAt)) return fallback;
  return {
    mode: timer.mode,
    setMs: timer.setMs,
    baseMs: timer.baseMs,
    startedAt: okStamp(timer.startedAt) ? timer.startedAt + offsetMs : null,
    targetAt: until ? timer.targetAt + offsetMs : null,
    visible: timer.visible === true,
  };
}

// Devolve o estado novo (um objeto só nosso) ou null se o que veio não é um estado.
function sanitizeSyncedState(raw, { offsetMs = 0 } = {}) {
  if (!isObject(raw) || !isObject(raw.layers)) return null;
  const base = initialState();
  const L = raw.layers;
  const content = isObject(L.content) ? L.content : {};
  const announcement = isObject(L.announcement) ? L.announcement : {};
  return {
    blackout: raw.blackout === true,
    layers: {
      background: pickBackground(L.background, base.layers.background),
      media: pickMedia(L.media),
      content: { slide: pickSlide(content.slide), hidden: content.hidden === true },
      cover: { visible: isObject(L.cover) && L.cover.visible === true },
      announcement: { text: text(announcement.text, MAX_ANNOUNCEMENT_CHARS) || null, ...(announcement.hidden === true ? { hidden: true } : {}) },
      props: { items: pickProps(L.props) },
    },
    textStyle: normalizeStyle(raw.textStyle),
    stage: pickStage(raw.stage),
    timer: pickTimer(raw.timer, offsetMs, base.timer),
  };
}

module.exports = { sanitizeSyncedState };
