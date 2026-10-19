// Estilo do texto projetado. Só valores fechados (chaves, hex, números em passos de 10):
// nada vira CSS livre, então um tema importado ou um patch via IPC não injeta estilo.
const FONTS = ['sans', 'serif', 'condensed', 'slab'];
const ALIGNS = ['left', 'center', 'right'];
const POSITIONS = ['top', 'middle', 'bottom'];
const SIZE_MIN = 50;
const SIZE_MAX = 150;
const SIZE_STEP = 10;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TRANSITIONS = ['cut', 'fade'];
const TRANSITION_MIN_MS = 100;
const TRANSITION_MAX_MS = 2000;
const TRANSITION_STEP_MS = 100;
const CAPTION_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const MAX_CAPTION_CHARS = 80;
const OUTLINES = ['none', 'thin', 'thick'];
const BOX_MAX = 80;
const BOX_STEP = 10;
const BLUR_MAX = 20;
const BLUR_STEP = 5;
// Legenda é texto de uma linha (vai por textContent): sem quebras, controle nem marcas invisíveis de direção.
// eslint-disable-next-line no-control-regex
const CAPTION_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/;
const inSteps = (v, min, max, step) => Number.isInteger(v) && v >= min && v <= max && v % step === 0;

const DEFAULT_TEXT_STYLE = Object.freeze({
  font: 'sans',
  color: '#ffffff',
  size: 100,
  align: 'center',
  position: 'middle',
  uppercase: false,
  shadow: true,
  showLabel: true,
  transition: 'fade',
  transitionMs: 400,
  caption: '',
  captionPosition: 'top-right',
  outline: 'none', // contorno da letra
  box: 0, // caixa escura atrás do texto, em % de opacidade (0 = sem caixa)
  blur: 0, // desfoque do fundo, em passos de 5
});

const isBool = (v) => typeof v === 'boolean';
const FIELD_CHECKS = {
  font: (v) => FONTS.includes(v),
  color: (v) => typeof v === 'string' && HEX_COLOR.test(v),
  size: (v) => inSteps(v, SIZE_MIN, SIZE_MAX, SIZE_STEP),
  align: (v) => ALIGNS.includes(v),
  position: (v) => POSITIONS.includes(v),
  uppercase: isBool,
  shadow: isBool,
  showLabel: isBool,
  transition: (v) => TRANSITIONS.includes(v),
  transitionMs: (v) => inSteps(v, TRANSITION_MIN_MS, TRANSITION_MAX_MS, TRANSITION_STEP_MS),
  caption: (v) => typeof v === 'string' && v.length <= MAX_CAPTION_CHARS && !CAPTION_FORBIDDEN.test(v),
  captionPosition: (v) => CAPTION_POSITIONS.includes(v),
  outline: (v) => OUTLINES.includes(v),
  box: (v) => inSteps(v, 0, BOX_MAX, BOX_STEP),
  blur: (v) => inSteps(v, 0, BLUR_MAX, BLUR_STEP),
};

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
  && Object.getPrototypeOf(v) === Object.prototype;

// Patch parcial: ao menos um campo, todos conhecidos e válidos.
function isValidStylePatch(patch) {
  if (!isPlainObject(patch)) return false;
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every((k) => Object.hasOwn(FIELD_CHECKS, k) && FIELD_CHECKS[k](patch[k]));
}

function mergeStyle(style, patch) {
  return { ...style, ...patch };
}

// Para dados de disco: aproveita os campos válidos e completa com o padrão.
function normalizeStyle(input) {
  const source = isPlainObject(input) ? input : {};
  const valid = Object.keys(FIELD_CHECKS)
    .filter((k) => Object.hasOwn(source, k) && FIELD_CHECKS[k](source[k]))
    .map((k) => [k, source[k]]);
  return { ...DEFAULT_TEXT_STYLE, ...Object.fromEntries(valid) };
}

module.exports = {
  DEFAULT_TEXT_STYLE, FONTS, ALIGNS, POSITIONS, SIZE_MIN, SIZE_MAX, SIZE_STEP, TRANSITIONS, CAPTION_POSITIONS, MAX_CAPTION_CHARS,
  OUTLINES, BOX_MAX, BOX_STEP, BLUR_MAX, BLUR_STEP,
  isValidStylePatch, mergeStyle, normalizeStyle,
};
