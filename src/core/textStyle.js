// Estilo do texto projetado. Só valores fechados (chaves, hex, números em passos de 10):
// nada vira CSS livre, então um tema importado ou um patch via IPC não injeta estilo.
const FONTS = ['sans', 'serif', 'condensed', 'slab'];
const ALIGNS = ['left', 'center', 'right'];
const POSITIONS = ['top', 'middle', 'bottom'];
const SIZE_MIN = 50;
const SIZE_MAX = 150;
const SIZE_STEP = 10;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const DEFAULT_TEXT_STYLE = Object.freeze({
  font: 'sans',
  color: '#ffffff',
  size: 100,
  align: 'center',
  position: 'middle',
  uppercase: false,
  shadow: true,
  showLabel: true,
});

const isBool = (v) => typeof v === 'boolean';
const FIELD_CHECKS = {
  font: (v) => FONTS.includes(v),
  color: (v) => typeof v === 'string' && HEX_COLOR.test(v),
  size: (v) => Number.isInteger(v) && v >= SIZE_MIN && v <= SIZE_MAX && v % SIZE_STEP === 0,
  align: (v) => ALIGNS.includes(v),
  position: (v) => POSITIONS.includes(v),
  uppercase: isBool,
  shadow: isBool,
  showLabel: isBool,
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
  DEFAULT_TEXT_STYLE, FONTS, ALIGNS, POSITIONS, SIZE_MIN, SIZE_MAX, SIZE_STEP,
  isValidStylePatch, mergeStyle, normalizeStyle,
};
