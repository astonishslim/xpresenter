/* global window */
// Grade bento: blocos movíveis e redimensionáveis, seções que mudam de bloco, layout salvo.
(function exposeLayout(root) {
  const STORAGE_KEY = 'apresentador.layout';
  // Posição vem da ordem (grid-auto-flow: dense); o layout guarda ordem, tamanhos e seções por bloco.
  const { TILE_IDS, DEFAULT_LAYOUT } = root.layoutPresets;
  const DEFAULT_SPANS = DEFAULT_LAYOUT.spans;
  const DEFAULT_SECTIONS = DEFAULT_LAYOUT.sections;
  const KEY_DELTA = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
  const DRAG_MIME = 'application/x-apresentador-layout';

  const $ = (id) => document.getElementById(id);
  const tileEl = (id) => $(`tile-${id}`);
  const foldEl = (key) => document.querySelector(`details.fold[data-key="${key}"]`);
  const tileOfSection = (sections, key) => Object.keys(sections).find((t) => sections[t].includes(key));

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function write(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // armazenamento indisponível: o layout só não persiste
    }
  }

  function freshState(saved) {
    const M = root.layoutModel;
    return {
      order: M.resolveOrder(saved.order, TILE_IDS),
      spans: M.resolveSpans(saved.spans, DEFAULT_SPANS),
      sections: M.resolveSections(saved.sections, DEFAULT_SECTIONS),
      folds: saved.folds && typeof saved.folds === 'object' ? saved.folds : {},
    };
  }

  function createController() {
    let state = freshState(read());
    // Referências guardadas antes de mover qualquer coisa: replaceChildren tira seções do DOM.
    const folds = Object.fromEntries(Object.values(DEFAULT_SECTIONS).flat().map((key) => [key, foldEl(key)]));
    const differs = (actual, wanted) => actual.length !== wanted.length || wanted.some((el, i) => actual[i] !== el);

    // Idempotente: só mexe no DOM onde algo mudou (re-inserir um nó derruba a captura do ponteiro).
    const render = () => {
      const main = $('layout');
      const tiles = state.order.map(tileEl);
      if (differs([...main.children], tiles)) main.append(...tiles);
      TILE_IDS.forEach((id) => {
        const tile = tileEl(id);
        tile.style.setProperty('--c', state.spans[id].c);
        tile.style.setProperty('--r', state.spans[id].r);
        const body = tile.querySelector('.tile-body');
        const wanted = state.sections[id].map((key) => folds[key]);
        // childNodes (não children): espaços em branco do HTML original impediriam o :empty da dica.
        if (differs([...body.childNodes], wanted)) body.replaceChildren(...wanted);
      });
      document.querySelectorAll('details.fold').forEach((d) => {
        if (d.dataset.key in state.folds) d.open = state.folds[d.dataset.key];
      });
    };
    const listeners = new Set();
    const set = (patch, focusSelector) => {
      state = { ...state, ...patch };
      render();
      write(state);
      listeners.forEach((fn) => fn(layoutOf(state)));
      if (focusSelector) document.querySelector(focusSelector)?.focus();
    };
    return {
      get: () => state,
      set,
      render,
      reset: () => set({ ...freshState({}) }),
      onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    };
  }

  // Só o que um preset guarda (sem o estado aberto/fechado das seções).
  const layoutOf = ({ order, spans, sections }) => ({ order: [...order], spans: { ...spans }, sections: { ...sections } });

  // ---------- Arrastar e soltar (blocos e seções) ----------
  function bindDrag(ctl) {
    const M = root.layoutModel;
    let drag = null; // { kind: 'tile' | 'section', id }
    const clearMarks = () => document.querySelectorAll('.dragging, .drop-target, .drop-end, .drop-before, .drop-after')
      .forEach((n) => n.classList.remove('dragging', 'drop-target', 'drop-end', 'drop-before', 'drop-after'));
    const start = (e, kind, id, el) => {
      drag = { kind, id };
      e.dataTransfer.setData(DRAG_MIME, `${kind}:${id}`);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    };
    const finish = () => { drag = null; clearMarks(); };
    const dropSection = (key, tileId, refKey, after) => {
      const sections = M.moveSection(ctl.get().sections, key, tileId, refKey, after);
      ctl.set({ sections }, `details.fold[data-key="${key}"] .fold-grip`);
    };

    document.querySelectorAll('.tile').forEach((tile) => {
      const tileId = tile.dataset.tile;
      const grip = tile.querySelector('.tile-grip');
      grip.addEventListener('dragstart', (e) => start(e, 'tile', tileId, tile));
      grip.addEventListener('dragend', finish);
      tile.addEventListener('dragover', (e) => {
        if (!drag || (drag.kind === 'tile' && drag.id === tileId)) return;
        e.preventDefault();
        clearMarks();
        (drag.kind === 'tile' ? tile : tile.querySelector('.tile-body')).classList.add(drag.kind === 'tile' ? 'drop-target' : 'drop-end');
      });
      tile.addEventListener('drop', (e) => {
        if (!drag) return;
        e.preventDefault();
        const current = drag;
        finish();
        if (current.kind === 'tile') ctl.set({ order: M.moveTo(ctl.get().order, current.id, tileId) }, `#tile-${current.id} .tile-grip`);
        else dropSection(current.id, tileId, null, false);
      });
    });

    document.querySelectorAll('details.fold').forEach((fold) => {
      const key = fold.dataset.key;
      const grip = fold.querySelector('.fold-grip');
      grip.addEventListener('dragstart', (e) => { e.stopPropagation(); start(e, 'section', key, fold); });
      grip.addEventListener('dragend', finish);
      const half = (e) => e.clientY > fold.getBoundingClientRect().top + fold.getBoundingClientRect().height / 2;
      fold.addEventListener('dragover', (e) => {
        if (!drag || drag.kind !== 'section' || drag.id === key) return;
        e.preventDefault();
        e.stopPropagation();
        clearMarks();
        fold.classList.add(half(e) ? 'drop-after' : 'drop-before');
      });
      fold.addEventListener('drop', (e) => {
        if (!drag || drag.kind !== 'section') return;
        e.preventDefault();
        e.stopPropagation();
        const { id } = drag;
        const after = half(e);
        finish();
        if (id !== key) dropSection(id, tileOfSection(ctl.get().sections, key), key, after);
      });
    });
  }

  // ---------- Teclado: mover blocos e seções ----------
  function bindKeyboard(ctl) {
    const M = root.layoutModel;
    document.querySelectorAll('.tile-grip').forEach((grip) => {
      const id = grip.closest('.tile').dataset.tile;
      grip.addEventListener('keydown', (e) => {
        const delta = KEY_DELTA[e.key];
        if (!delta) return;
        e.preventDefault();
        ctl.set({ order: M.move(ctl.get().order, id, delta) }, `#tile-${id} .tile-grip`);
      });
    });

    document.querySelectorAll('.fold-grip').forEach((grip) => {
      const key = grip.closest('.fold').dataset.key;
      grip.addEventListener('keydown', (e) => {
        const delta = KEY_DELTA[e.key];
        if (!delta) return;
        e.preventDefault();
        const { sections, order } = ctl.get();
        const tileId = tileOfSection(sections, key);
        const list = sections[tileId];
        const at = list.indexOf(key);
        const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        const neighbor = list[at + delta];
        let next;
        if (vertical && neighbor) {
          next = M.moveSection(sections, key, tileId, neighbor, delta > 0);
        } else {
          const targetTile = order[order.indexOf(tileId) + delta];
          if (!targetTile) return;
          next = M.moveSection(sections, key, targetTile, null, false);
        }
        ctl.set({ sections: next }, `details.fold[data-key="${key}"] .fold-grip`);
      });
    });
  }

  // ---------- Redimensionar blocos ----------
  function bindResize(ctl) {
    const M = root.layoutModel;
    const main = $('layout');
    const metrics = () => {
      const css = getComputedStyle(main);
      return { colW: parseFloat(css.gridTemplateColumns), rowH: parseFloat(css.gridTemplateRows), gap: parseFloat(css.columnGap) || 0 };
    };
    const setSpan = (id, c, r) => ctl.set({ spans: { ...ctl.get().spans, [id]: { c, r } } });

    document.querySelectorAll('.resize-handle').forEach((handle) => {
      const tile = handle.closest('.tile');
      const id = tile.dataset.tile;
      let origin = null;

      handle.addEventListener('pointerdown', (e) => {
        handle.setPointerCapture(e.pointerId);
        const rect = tile.getBoundingClientRect();
        origin = { left: rect.left, top: rect.top };
        handle.classList.add('dragging');
        document.body.classList.add('resizing');
      });
      handle.addEventListener('pointermove', (e) => {
        if (!origin) return;
        const { colW, rowH, gap } = metrics();
        setSpan(id, M.spanFromPixels(e.clientX - origin.left, colW, gap), M.spanFromPixels(e.clientY - origin.top, rowH, gap));
      });
      const stop = () => { origin = null; handle.classList.remove('dragging'); document.body.classList.remove('resizing'); };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
      handle.addEventListener('dblclick', () => setSpan(id, DEFAULT_SPANS[id].c, DEFAULT_SPANS[id].r));
      handle.addEventListener('keydown', (e) => {
        const dc = { ArrowLeft: -1, ArrowRight: 1 }[e.key] || 0;
        const dr = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
        if (!dc && !dr) return;
        e.preventDefault();
        const { c, r } = ctl.get().spans[id];
        setSpan(id, M.clampSpan(c + dc), M.clampSpan(r + dr));
      });
    });
  }

  function bindFolds(ctl) {
    document.querySelectorAll('details.fold').forEach((d) => {
      d.addEventListener('toggle', () => {
        const state = ctl.get();
        if (state.folds[d.dataset.key] === d.open) return;
        ctl.set({ folds: { ...state.folds, [d.dataset.key]: d.open } });
      });
    });
  }

  function initLayout() {
    const ctl = createController();
    ctl.render();
    bindDrag(ctl);
    bindKeyboard(ctl);
    bindResize(ctl);
    bindFolds(ctl);
    $('btn-reset-layout').addEventListener('click', () => {
      ctl.reset();
      document.querySelectorAll('details.fold').forEach((d) => { d.open = true; });
    });
    return {
      getLayout: () => layoutOf(ctl.get()),
      applyLayout: (layout) => ctl.set(layoutOf(root.layoutPresets.normalizeLayout(layout))),
      onChange: ctl.onChange,
    };
  }

  root.initLayout = initLayout;
}(window));
