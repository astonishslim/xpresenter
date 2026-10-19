/* global window */
// Grade bento: blocos movíveis e redimensionáveis, seções que mudam de bloco, layout salvo.
(function exposeLayout(root) {
  const STORAGE_KEY = 'apresentador.layout';
  // Posição vem da ordem (grid-auto-flow: dense); o layout guarda ordem, tamanhos e seções por bloco.
  const { TILE_IDS, DEFAULT_LAYOUT } = root.layoutPresets;
  const DEFAULT_SPANS = DEFAULT_LAYOUT.spans;
  const DEFAULT_SECTIONS = DEFAULT_LAYOUT.sections;
  const isEditing = () => document.body.classList.contains('editing-layout');
  const KEY_DELTA = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
  const DRAG_MIME = 'application/x-apresentador-layout';
  const MARKS = ['dragging', 'drop-target', 'drop-end', 'drop-before', 'drop-after', 'land-before', 'land-after'];
  const clearDragMarks = () => document.querySelectorAll(MARKS.map((c) => `.${c}`).join(', ')).forEach((n) => n.classList.remove(...MARKS));

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
    const clearMarks = clearDragMarks;
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
      grip.addEventListener('dragstart', (e) => { if (!isEditing()) return e.preventDefault(); return start(e, 'tile', tileId, tile); });
      grip.addEventListener('dragend', finish);
      tile.addEventListener('dragover', (e) => {
        if (!drag || (drag.kind === 'tile' && drag.id === tileId)) return;
        e.preventDefault();
        clearMarks();
        if (drag.kind === 'tile') {
          // Linha suave na borda onde o bloco vai encaixar (antes ou depois do alvo).
          tile.classList.add(`land-${M.dropSide(ctl.get().order, drag.id, tileId)}`);
        } else {
          tile.querySelector('.tile-body').classList.add('drop-end');
        }
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
      grip.addEventListener('dragstart', (e) => { e.stopPropagation(); if (!isEditing()) return e.preventDefault(); return start(e, 'section', key, fold); });
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
        if (!delta || !isEditing()) return;
        e.preventDefault();
        ctl.set({ order: M.move(ctl.get().order, id, delta) }, `#tile-${id} .tile-grip`);
      });
    });

    document.querySelectorAll('.fold-grip').forEach((grip) => {
      const key = grip.closest('.fold').dataset.key;
      grip.addEventListener('keydown', (e) => {
        const delta = KEY_DELTA[e.key];
        if (!delta || !isEditing()) return;
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
  // Três alças por bloco: borda direita (só a largura), borda de baixo (só a altura) e o canto (as duas).
  // Perto do tamanho máximo o bloco encaixa no cheio; duplo clique numa borda alterna cheio/anterior naquele eixo.
  const EDGES = [
    { axis: 'c', name: 'edge-e', label: 'Redimensionar a largura do bloco', hint: 'Arraste para mudar a largura; duplo clique alterna a largura total (ou ← →, Home)' },
    { axis: 'r', name: 'edge-s', label: 'Redimensionar a altura do bloco', hint: 'Arraste para mudar a altura; duplo clique alterna a altura total (ou ↑ ↓, Home)' },
  ];
  const ARROWS = { ArrowLeft: ['c', -1], ArrowRight: ['c', 1], ArrowUp: ['r', -1], ArrowDown: ['r', 1] };

  function bindResize(ctl) {
    const M = root.layoutModel;
    const main = $('layout');
    const before = {}; // tamanho de antes de ir ao cheio, por bloco e eixo (não é salvo)
    const metrics = () => {
      const css = getComputedStyle(main);
      return { colW: parseFloat(css.gridTemplateColumns), rowH: parseFloat(css.gridTemplateRows), gap: parseFloat(css.columnGap) || 0 };
    };
    const setSize = (id, size) => ctl.set({ spans: { ...ctl.get().spans, [id]: size } });
    const fullToggle = (id, axis) => {
      const memo = before[id] || (before[id] = {});
      const res = M.toggleFull(ctl.get().spans[id], axis, memo[axis]);
      memo[axis] = res.before;
      setSize(id, res.size);
    };

    // 'both' é o canto que já vem no HTML; as bordas são criadas aqui.
    document.querySelectorAll('.tile').forEach((tile) => {
      EDGES.forEach((edge) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `resize-edge ${edge.name}`;
        el.dataset.axis = edge.axis;
        el.setAttribute('aria-label', edge.label);
        el.title = edge.hint;
        tile.append(el);
      });
    });

    document.querySelectorAll('.resize-handle, .resize-edge').forEach((handle) => {
      const tile = handle.closest('.tile');
      const id = tile.dataset.tile;
      const axis = handle.dataset.axis || 'both';
      let origin = null;

      handle.addEventListener('pointerdown', (e) => {
        if (!isEditing()) return;
        handle.setPointerCapture(e.pointerId);
        const rect = tile.getBoundingClientRect();
        origin = { left: rect.left, top: rect.top };
        handle.classList.add('dragging');
        document.body.classList.add('resizing', `resizing-${axis}`);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!origin) return;
        const { colW, rowH, gap } = metrics();
        const wide = M.snapToFull(M.spanFromPixels(e.clientX - origin.left, colW, gap));
        const high = M.snapToFull(M.spanFromPixels(e.clientY - origin.top, rowH, gap));
        const size = M.resizeAxis(ctl.get().spans[id], axis, axis === 'r' ? high : wide, high);
        const now = ctl.get().spans[id];
        if (size.c !== now.c || size.r !== now.r) setSize(id, size);
      });
      const stop = () => {
        origin = null;
        handle.classList.remove('dragging');
        document.body.classList.remove('resizing', 'resizing-c', 'resizing-r', 'resizing-both');
      };
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
      handle.addEventListener('dblclick', () => {
        if (!isEditing()) return;
        if (axis === 'both') setSize(id, { ...DEFAULT_SPANS[id] });
        else fullToggle(id, axis);
      });
      handle.addEventListener('keydown', (e) => {
        if (!isEditing()) return;
        if (e.key === 'Home' && axis !== 'both') {
          e.preventDefault();
          fullToggle(id, axis);
          return;
        }
        const arrow = ARROWS[e.key];
        if (!arrow || (axis !== 'both' && arrow[0] !== axis)) return;
        e.preventDefault();
        const size = ctl.get().spans[id];
        setSize(id, { ...size, [arrow[0]]: M.clampSpan(size[arrow[0]] + arrow[1]) });
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

  // Modo "editar painéis": as alças de mover/redimensionar só existem enquanto ele está ligado.
  // Não é persistido de propósito: o app sempre abre travado, para ninguém mexer sem querer no culto.
  function bindEditMode() {
    const btn = $('btn-edit-layout');
    const setEditing = (on) => {
      document.body.classList.toggle('editing-layout', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Concluir a edição dos painéis' : 'Editar painéis: mostrar as alças de mover e redimensionar';
      btn.setAttribute('aria-label', on ? 'Concluir edição dos painéis' : 'Editar painéis');
      if (!on) {
        clearDragMarks();
      }
    };
    btn.addEventListener('click', () => setEditing(!isEditing()));
    setEditing(false);
  }

  function initLayout() {
    const ctl = createController();
    ctl.render();
    bindDrag(ctl);
    bindKeyboard(ctl);
    bindResize(ctl);
    bindFolds(ctl);
    bindEditMode();
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
