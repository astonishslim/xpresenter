// Macros: um botão que faz várias coisas (aplicar tema, ligar props, mostrar mensagem, capa, cronômetro…).
// Os passos são uma lista fechada (macroSteps.js); cada um vira ações validadas do estado, então um macro
// editado à mão no macros.json não faz nada que o operador não pudesse fazer pela tela.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { STEP_TYPES } = require('../renderer/shared/macroSteps');
const { isValidAction, stampAction } = require('./state');
const { missingFileOf } = require('./fileCheck');

const MAX_MACROS = 30;
const MAX_STEPS = 20;
const MAX_NAME_CHARS = 40;
const MAX_MINUTES = 1440;
const CLOCK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SECONDS_PER_MINUTE = 60;

const VALUE_CHECKS = {
  name: (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= MAX_NAME_CHARS,
  minutes: (v) => Number.isInteger(v) && v >= 0 && v <= MAX_MINUTES,
  time: (v) => typeof v === 'string' && CLOCK_TIME_RE.test(v),
};

function sanitizeStep(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.do !== 'string' || !Object.hasOwn(STEP_TYPES, raw.do)) return null;
  const kind = STEP_TYPES[raw.do].value;
  if (kind === null) return { do: raw.do };
  if (!VALUE_CHECKS[kind](raw.value)) return null;
  return { do: raw.do, value: typeof raw.value === 'string' ? raw.value.trim() : raw.value };
}

function sanitizeMacro(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !Array.isArray(raw.steps)) return null;
  const name = raw.name.trim();
  if (!name || name.length > MAX_NAME_CHARS) return null;
  const steps = raw.steps.map(sanitizeStep).filter(Boolean).slice(0, MAX_STEPS);
  if (!steps.length) return null;
  return { id: typeof raw.id === 'string' && raw.id && raw.id.length <= 64 ? raw.id : randomUUID(), name, steps };
}

const EXAMPLES = [
  { name: 'Zerar a tela', steps: [{ do: 'clear' }, { do: 'propsClear' }, { do: 'messageClear' }, { do: 'coverOff' }, { do: 'blackOff' }] },
  { name: 'Contagem para as 19h', steps: [{ do: 'timerUntil', value: '19:00' }, { do: 'timerShow' }, { do: 'coverOn' }] },
];

// Passo inválido num macros.json editado à mão sai do macro; o log diz qual macro perdeu passos.
function sanitizeLogged(raw) {
  const macro = sanitizeMacro(raw);
  const asked = raw && Array.isArray(raw.steps) ? Math.min(raw.steps.length, MAX_STEPS) : 0;
  if (macro && macro.steps.length < asked) {
    console.error(`[macros] "${macro.name}": ${asked - macro.steps.length} passo(s) inválido(s) descartado(s)`);
  }
  return macro;
}

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = new Set();
    const names = new Set();
    return (Array.isArray(data) ? data : []).map(sanitizeLogged).filter((m) => {
      if (!m || ids.has(m.id) || names.has(m.name.toLowerCase())) return false;
      ids.add(m.id);
      names.add(m.name.toLowerCase());
      return true;
    }).slice(0, MAX_MACROS);
  } catch (err) {
    if (err.code === 'ENOENT') return EXAMPLES.map(sanitizeMacro);
    console.error(`[macros] não foi possível ler ${file}: ${err.message}`);
    keepBackup(file); // o próximo "salvar" regrava o arquivo: guarda o que estava lá
    return [];
  }
}

// Arquivo ilegível (JSON quebrado por edição à mão): renomeia para .bak em vez de deixar o próximo salvar apagá-lo.
function keepBackup(file) {
  try {
    fs.renameSync(file, `${file}.bak`);
  } catch (err) {
    console.error(`[macros] não foi possível guardar a cópia de ${file}: ${err.message}`);
  }
}

function persist(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function createMacroLibrary(file) {
  let macros = load(file);
  const commit = (next) => {
    macros = next;
    persist(file, macros);
  };
  const result = (ok, reason) => ({ ok, ...(reason ? { reason } : {}), macros: clone(macros) });

  return {
    list: () => clone(macros),
    get: (id) => clone(macros.find((m) => m.id === id) || null),
    save(input) {
      // Passo inválido não é descartado em silêncio: o macro não salva e o operador vê qual passo corrigir.
      const steps = input && Array.isArray(input.steps) ? input.steps : [];
      const badStep = steps.findIndex((s) => !sanitizeStep(s));
      if (badStep >= 0) return result(false, `Passo ${badStep + 1} inválido: escolha algo que exista ou preencha o valor.`);
      if (steps.length > MAX_STEPS) return result(false, `No máximo ${MAX_STEPS} passos.`);
      const macro = sanitizeMacro(input);
      if (!macro) return result(false, `Dê um nome (até ${MAX_NAME_CHARS}) e ao menos um passo válido.`);
      const exists = macros.some((m) => m.id === macro.id);
      if (macros.some((m) => m.id !== macro.id && m.name.toLowerCase() === macro.name.toLowerCase())) {
        return result(false, 'Já existe um macro com esse nome.');
      }
      if (!exists && macros.length >= MAX_MACROS) return result(false, `Limite de ${MAX_MACROS} macros.`);
      commit(exists ? macros.map((m) => (m.id === macro.id ? macro : m)) : [...macros, macro]);
      return result(true);
    },
    remove(id) {
      commit(macros.filter((m) => m.id !== id));
      return result(true);
    },
  };
}

// Executa os passos na ordem. Um passo que falha é relatado e os outros continuam (melhor um culto quase
// pronto do que um botão que não faz nada). Tudo cai na janela de agrupamento do store: um passo só no desfazer.
function createMacroRunner({ dispatch, getState, now = Date.now, themeActions, getProp, getMessage, messages }) {
  // Valida como o IPC valida (ação conhecida, arquivo existente) e despacha com o relógio carimbado.
  function send(action) {
    if (!isValidAction(action)) return 'Ação inválida.';
    const missing = missingFileOf(action);
    if (missing) return `Arquivo não encontrado: ${decodeURIComponent(missing.replace(/^file:\/\/\//, ''))}`;
    dispatch(stampAction(action, now()));
    return null;
  }
  const firstFailure = (actions) => actions.map(send).find(Boolean) || null;
  // Liga/desliga só se ainda não está como pedido (as ações do estado são alternadores).
  const ensure = (isOn, wanted, action) => (isOn() === wanted ? null : send(action));
  const timer = () => getState().timer;

  const RUN = {
    theme: (name) => {
      const actions = themeActions(name);
      return actions ? firstFailure(actions) : `Tema não encontrado: ${name}`;
    },
    propOn: (name) => {
      const prop = getProp(name);
      return prop ? send({ type: 'showProp', prop }) : `Prop não encontrado: ${name}`;
    },
    propOff: (name) => {
      const prop = getProp(name);
      return prop ? send({ type: 'hideProp', id: prop.id }) : `Prop não encontrado: ${name}`;
    },
    propsClear: () => send({ type: 'clearProps' }),
    message: (name) => {
      const template = getMessage(name);
      if (!template) return `Modelo de mensagem não encontrado: ${name}`;
      const res = messages.show(template, {});
      return res.ok ? null : res.reason;
    },
    messageClear: () => { messages.clear(); return null; },
    coverOn: () => ensure(() => getState().layers.cover.visible, true, { type: 'toggleCover' }),
    coverOff: () => ensure(() => getState().layers.cover.visible, false, { type: 'toggleCover' }),
    blackOn: () => ensure(() => getState().blackout, true, { type: 'blackout' }),
    blackOff: () => ensure(() => getState().blackout, false, { type: 'blackout' }),
    clear: () => send({ type: 'clear' }),
    timerCountdown: (minutes) => send({ type: 'timerSet', mode: 'countdown', seconds: minutes * SECONDS_PER_MINUTE }),
    timerUntil: (time) => send({ type: 'timerUntil', time }),
    timerReset: () => send({ type: 'timerReset' }),
    // "Até o horário" já está contando: iniciar não é erro, só não há o que fazer.
    timerStart: () => (timer().mode === 'until' ? null : ensure(() => timer().startedAt != null, true, { type: 'timerToggle' })),
    timerPause: () => (timer().mode === 'until' ? null : ensure(() => timer().startedAt != null, false, { type: 'timerToggle' })),
    timerShow: () => ensure(() => timer().visible, true, { type: 'timerVisible' }),
    timerHide: () => ensure(() => timer().visible, false, { type: 'timerVisible' }),
  };

  return {
    run(raw) {
      const macro = sanitizeMacro(raw);
      if (!macro) return { ok: false, reason: 'Macro inválido ou sem passos.', results: [] };
      const results = macro.steps.map((step) => {
        let reason = null;
        try {
          reason = RUN[step.do](step.value);
        } catch (err) {
          reason = err.message;
        }
        return { do: step.do, ok: reason === null, ...(reason ? { reason } : {}) };
      });
      return { ok: results.every((r) => r.ok), results };
    },
  };
}

module.exports = { sanitizeStep, sanitizeMacro, createMacroLibrary, createMacroRunner, MAX_STEPS, MAX_MACROS };
