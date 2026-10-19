const { initialState, reduce } = require('./state');

// Desfazer ao vivo: guarda o que estava na projeção antes de cada mudança.
const UNDO_LIMIT = 50;
// Ações seguidas dentro desta janela são um passo só (tema automático + slide que entram juntos).
const MERGE_MS = 150;
// Fora do desfazer (e mantidos ao desfazer): cronômetro, controle do vídeo, aviso, mensagem do palco e props.
// Aviso e mensagem têm tempo para sumir, e prop é ligado de propósito: desfazer um slide não os traz de volta nem os tira.
const NOT_UNDOABLE = new Set(['timerSet', 'timerUntil', 'timerToggle', 'timerReset', 'timerVisible', 'mediaControl', 'setStageMessage', 'setAnnouncement',
  'showProp', 'hideProp', 'clearProps']);

const snapshotOf = (s) => ({ blackout: s.blackout, layers: s.layers, textStyle: s.textStyle, next: s.stage.next });
const restore = (s, snap) => ({
  ...s,
  blackout: snap.blackout,
  layers: { ...snap.layers, announcement: s.layers.announcement, props: s.layers.props },
  textStyle: snap.textStyle,
  stage: { ...s.stage, next: snap.next },
});

function createStore(state = initialState(), { now = Date.now } = {}) {
  let current = state;
  let past = [];
  let future = [];
  let stepStartedAt = -Infinity;
  // Travado (seguindo outro computador): só o estado recebido de lá (replace) muda a projeção.
  let locked = false;
  const listeners = new Set();

  const notify = () => listeners.forEach((listener) => {
    try {
      listener(current);
    } catch (err) {
      console.error(`[store] assinante falhou: ${err.message}`);
    }
  });

  const record = (action) => {
    if (NOT_UNDOABLE.has(action.type)) return;
    const t = now();
    if (t - stepStartedAt >= MERGE_MS) {
      past = [...past, snapshotOf(current)].slice(-UNDO_LIMIT);
      stepStartedAt = t;
    }
    future = [];
  };

  // Move um passo de `from` para `to` (desfazer ou refazer).
  const travel = (from, to) => {
    if (!from.length) return { from, to };
    const snap = from[from.length - 1];
    const nextTo = [...to, snapshotOf(current)];
    current = restore(current, snap);
    stepStartedAt = -Infinity; // a próxima ação abre um passo novo
    notify();
    return { from: from.slice(0, -1), to: nextTo };
  };

  return {
    getState: () => current,
    dispatch(action) {
      if (locked) return current;
      const next = reduce(current, action);
      if (next === current) return current;
      record(action);
      current = next;
      notify();
      return current;
    },
    undo() {
      if (locked) return current;
      ({ from: past, to: future } = travel(past, future));
      return current;
    },
    redo() {
      if (locked) return current;
      ({ from: future, to: past } = travel(future, past));
      return current;
    },
    lock(on) {
      locked = Boolean(on);
    },
    isLocked: () => locked,
    // Troca o estado inteiro (vindo de outro computador). Zera o histórico: não há para onde desfazer.
    replace(next) {
      current = next;
      past = [];
      future = [];
      stepStartedAt = -Infinity;
      notify();
      return current;
    },
    history: () => ({ canUndo: past.length > 0, canRedo: future.length > 0 }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

module.exports = { createStore };
