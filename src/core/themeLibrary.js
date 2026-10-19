// Temas salvos (fundo + estilo do texto, com nome) e o visual atual, restaurado ao reabrir o app.
const fs = require('node:fs');
const path = require('node:path');
const { isValidBackground, DEFAULT_BACKGROUND } = require('./state');
const { normalizeStyle } = require('./textStyle');

const MAX_THEMES = 30;
const MAX_NAME_CHARS = 40;

function validateThemeName(input) {
  const name = typeof input === 'string' ? input.trim() : '';
  if (!name) return { ok: false, reason: 'Dê um nome ao tema.' };
  if (name.length > MAX_NAME_CHARS) return { ok: false, reason: `Use até ${MAX_NAME_CHARS} caracteres.` };
  return { ok: true, name };
}

// Fundo inválido vira null; estilo é sempre completado com o padrão.
function toLook(input) {
  const background = input && isValidBackground(input.background)
    ? { kind: input.background.kind, value: input.background.value }
    : null;
  return { background, style: normalizeStyle(input && input.style) };
}

const defaultLook = () => ({ background: { ...DEFAULT_BACKGROUND }, style: normalizeStyle(null) });

function sanitizeThemes(list) {
  if (!Array.isArray(list)) return [];
  return list.flatMap((t) => {
    const checked = validateThemeName(t && t.name);
    const look = toLook(t);
    return checked.ok && look.background ? [{ name: checked.name, ...look }] : [];
  }).slice(0, MAX_THEMES);
}

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const current = toLook(data && data.current);
    return {
      themes: sanitizeThemes(data && data.themes),
      current: current.background ? current : defaultLook(),
    };
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[temas] não foi possível ler ${file}: ${err.message}`);
    return { themes: [], current: defaultLook() };
  }
}

function persist(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

function createThemeLibrary(file) {
  let data = load(file);
  const commit = (next) => {
    data = next;
    persist(file, data);
  };

  return {
    list: () => clone(data.themes),
    get: (name) => {
      const hit = typeof name === 'string' && data.themes.find((t) => sameName(t.name, name));
      return hit ? clone(hit) : null;
    },

    save(name, input) {
      const checked = validateThemeName(name);
      if (!checked.ok) throw new Error(`Nome inválido: ${checked.reason}`);
      const look = toLook(input);
      if (!look.background) throw new Error('O fundo deste tema é inválido.');
      const existing = data.themes.find((t) => sameName(t.name, checked.name));
      if (!existing && data.themes.length >= MAX_THEMES) {
        throw new Error(`Limite de ${MAX_THEMES} temas salvos. Exclua algum antes.`);
      }
      const theme = { name: existing ? existing.name : checked.name, ...look };
      const themes = existing
        ? data.themes.map((t) => (t === existing ? theme : t))
        : [...data.themes, theme];
      commit({ ...data, themes });
      return clone(theme);
    },

    remove(name) {
      if (typeof name !== 'string') return;
      commit({ ...data, themes: data.themes.filter((t) => !sameName(t.name, name)) });
    },

    getCurrent: () => clone(data.current),
    setCurrent(input) {
      const look = toLook(input);
      if (!look.background) return;
      commit({ ...data, current: look });
    },
  };
}

const SAVE_DEBOUNCE_MS = 500;
const lookOf = (state) => ({ background: state.layers.background, style: state.textStyle });

// Grava o visual atual (fundo + estilo) quando ele muda, para o app reabrir igual.
// Com atraso: arrastar o seletor de cor dispara dezenas de mudanças por segundo.
// Devolve flush(), que grava na hora o que estiver pendente (ao fechar o app).
function persistCurrentLook({ store, themes, delayMs = SAVE_DEBOUNCE_MS }) {
  let lastKey = JSON.stringify(lookOf(store.getState()));
  let timer = null;
  const save = () => {
    timer = null;
    try {
      themes.setCurrent(lookOf(store.getState()));
    } catch (err) {
      console.error(`[temas] não foi possível salvar o visual atual: ${err.message}`);
    }
  };
  store.subscribe((state) => {
    const key = JSON.stringify(lookOf(state));
    if (key === lastKey) return;
    lastKey = key;
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });
  return function flush() {
    if (!timer) return;
    clearTimeout(timer);
    save();
  };
}

module.exports = { createThemeLibrary, validateThemeName, persistCurrentLook, lookOf, MAX_THEMES };
