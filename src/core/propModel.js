// Props: elementos fixos sobre a projeção (logo, QR do Pix, faixa com o nome do pregador).
// Só valores fechados: o prop vai para a tela por atributos e textContent, nunca como HTML ou CSS livre.
// A imagem (arquivo local) é validada por quem usa (state.js), junto com as regras de fundo.
const KINDS = ['image', 'text'];
const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'lower-third'];
const SIZE_MIN = 10;
const SIZE_MAX = 60;
const SIZE_STEP = 10;
const MAX_NAME_CHARS = 40;
const MAX_TEXT_CHARS = 80;
const MAX_ID_CHARS = 64;
const MAX_VALUE_CHARS = 2000;
const MAX_ACTIVE_PROPS = 6;
// Texto de uma linha: sem controle nem quebra (vai por textContent, mas a faixa é de uma linha só).
// eslint-disable-next-line no-control-regex
const TEXT_FORBIDDEN = /[\u0000-\u001F\u007F-\u009F]/;

const isString = (v) => typeof v === 'string';

// Tudo que não depende do arquivo da imagem.
function isValidPropFields(prop) {
  if (!prop || typeof prop !== 'object') return false;
  if (!isString(prop.id) || !prop.id || prop.id.length > MAX_ID_CHARS) return false;
  if (!KINDS.includes(prop.kind) || !POSITIONS.includes(prop.position)) return false;
  if (!Number.isInteger(prop.size) || prop.size < SIZE_MIN || prop.size > SIZE_MAX || prop.size % SIZE_STEP !== 0) return false;
  if (prop.name != null && (!isString(prop.name) || prop.name.length > MAX_NAME_CHARS)) return false;
  if (!isString(prop.value) || !prop.value) return false;
  if (prop.kind === 'text') return prop.value.length <= MAX_TEXT_CHARS && !TEXT_FORBIDDEN.test(prop.value);
  return prop.value.length <= MAX_VALUE_CHARS;
}

// O que a projeção precisa (sem o nome).
const itemOf = (prop) => ({ id: prop.id, kind: prop.kind, value: prop.value, position: prop.position, size: prop.size });

module.exports = {
  KINDS, POSITIONS, SIZE_MIN, SIZE_MAX, SIZE_STEP, MAX_NAME_CHARS, MAX_TEXT_CHARS, MAX_ACTIVE_PROPS, isValidPropFields, itemOf,
};
