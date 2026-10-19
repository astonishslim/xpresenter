// Mensagens com modelo: "Pais de {criança}, compareçam ao berçário." O operador preenche os campos e a
// mensagem vai para a tela (aviso), para o retorno de palco, ou para os dois; com tempo, some sozinha.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const FIELD_RE = /\{([^{}]{1,30})\}/g;
const MAX_TEMPLATES = 30;
const MAX_NAME_CHARS = 40;
const MAX_TEXT_CHARS = 200;
const MAX_VALUE_CHARS = 80;
const MAX_ID_CHARS = 64;
const MAX_SECONDS = 3600;
const TARGETS = ['screen', 'stage', 'both'];
const MS_PER_SECOND = 1000;

const EXAMPLES = [
  { name: 'Berçário', text: 'Pais de {criança}, por favor compareçam ao berçário.', seconds: 30, target: 'screen' },
  { name: 'Veículo', text: 'Veículo placa {placa}: favor comparecer à recepção.', seconds: 30, target: 'screen' },
  { name: 'Tempo (palco)', text: 'Faltam {minutos} minutos', seconds: 0, target: 'stage' },
];

function fieldsOf(text) {
  if (typeof text !== 'string') return [];
  const names = [...text.matchAll(FIELD_RE)].map((m) => m[1].trim()).filter(Boolean);
  return [...new Set(names)];
}

function fillMessage(text, values) {
  const source = values && typeof values === 'object' ? values : {};
  const filled = String(text ?? '').replace(FIELD_RE, (_whole, name) => {
    const value = Object.hasOwn(source, name.trim()) ? source[name.trim()] : '';
    return typeof value === 'string' ? value.trim().slice(0, MAX_VALUE_CHARS) : '';
  });
  return filled.replace(/\s{2,}/g, ' ').trim().slice(0, MAX_TEXT_CHARS);
}

// Valores vindos do operador: só texto, e só dos campos que o modelo tem.
function pickValues(text, raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(fieldsOf(text)
    .filter((name) => Object.hasOwn(source, name) && typeof source[name] === 'string')
    .map((name) => [name, source[name]]));
}

function sanitizeTemplate(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || typeof raw.text !== 'string') return null;
  const name = raw.name.trim();
  const text = raw.text.trim();
  if (!name || name.length > MAX_NAME_CHARS || !text || text.length > MAX_TEXT_CHARS) return null;
  const okId = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= MAX_ID_CHARS;
  const okSeconds = Number.isInteger(raw.seconds) && raw.seconds >= 0 && raw.seconds <= MAX_SECONDS;
  return {
    id: okId ? raw.id : randomUUID(),
    name,
    text,
    seconds: okSeconds ? raw.seconds : 0,
    target: TARGETS.includes(raw.target) ? raw.target : 'screen',
  };
}

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Arquivo editado à mão: id e nome (sem diferenciar maiúsculas) não podem se repetir.
    const ids = new Set();
    const names = new Set();
    return (Array.isArray(data) ? data : []).map(sanitizeTemplate).filter((t) => {
      if (!t || ids.has(t.id) || names.has(t.name.toLowerCase())) return false;
      ids.add(t.id);
      names.add(t.name.toLowerCase());
      return true;
    }).slice(0, MAX_TEMPLATES);
  } catch (err) {
    if (err.code === 'ENOENT') return EXAMPLES.map(sanitizeTemplate);
    console.error(`[mensagens] não foi possível ler ${file}: ${err.message}`);
    return [];
  }
}

function persist(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function createMessageLibrary(file) {
  let templates = load(file);
  const commit = (next) => {
    templates = next;
    persist(file, templates);
  };
  const result = (ok, reason) => ({ ok, ...(reason ? { reason } : {}), templates: clone(templates) });

  return {
    list: () => clone(templates),
    get: (id) => clone(templates.find((t) => t.id === id) || null),
    save(input) {
      const template = sanitizeTemplate(input);
      if (!template) return result(false, `Dê um nome (até ${MAX_NAME_CHARS}) e um texto (até ${MAX_TEXT_CHARS} caracteres).`);
      const exists = templates.some((t) => t.id === template.id);
      if (templates.some((t) => t.id !== template.id && t.name.toLowerCase() === template.name.toLowerCase())) {
        return result(false, 'Já existe um modelo com esse nome.');
      }
      if (!exists && templates.length >= MAX_TEMPLATES) return result(false, `Limite de ${MAX_TEMPLATES} modelos.`);
      commit(exists ? templates.map((t) => (t.id === template.id ? template : t)) : [...templates, template]);
      return result(true);
    },
    remove(id) {
      commit(templates.filter((t) => t.id !== id));
      return result(true);
    },
  };
}

// Mostra a mensagem preenchida e agenda a retirada. Só apaga o que ela mesma pôs (se o operador trocou, fica).
function createMessageRunner({ dispatch, getState, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  let shown = null; // { text, target }

  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const takeDown = () => {
    if (!shown) return;
    const state = getState();
    if (shown.target !== 'stage' && state.layers.announcement.text === shown.text) dispatch({ type: 'setAnnouncement', text: '' });
    if (shown.target !== 'screen' && state.stage.message === shown.text) dispatch({ type: 'setStageMessage', text: '' });
    shown = null;
  };

  return {
    show(template, values) {
      const text = fillMessage(template.text, values);
      if (!text) return { ok: false, reason: 'A mensagem ficou vazia: preencha os campos.' };
      cancel();
      takeDown(); // a anterior sai de onde estava, mesmo que a nova vá para outro lugar
      if (template.target !== 'stage') dispatch({ type: 'setAnnouncement', text });
      if (template.target !== 'screen') dispatch({ type: 'setStageMessage', text });
      shown = { text, target: template.target };
      if (template.seconds > 0) {
        timer = setTimer(() => {
          timer = null;
          takeDown();
        }, template.seconds * MS_PER_SECOND);
      }
      return { ok: true, text };
    },
    clear() {
      cancel();
      takeDown();
    },
    stop: cancel,
  };
}

module.exports = { fieldsOf, fillMessage, pickValues, sanitizeTemplate, createMessageLibrary, createMessageRunner };
