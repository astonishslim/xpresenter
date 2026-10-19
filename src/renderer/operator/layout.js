/* global window */
// Painéis dinâmicos: divisores arrastáveis, seções recolhíveis e layout salvo.
(function exposeLayout(root) {
  const STORAGE_KEY = 'apresentador.layout';
  const DEFAULTS = { c1: 300, c3: 380 };
  const MIN_COL = 200;
  const MAX_FRACTION = 0.45;
  const KEY_STEP = 20;
  const PANEL_IDS = ['library', 'slides-panel', 'right'];
  const PANEL_MIME = 'application/x-apresentador-panel';

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function write(layout) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // armazenamento indisponível: o layout só não persiste
    }
  }

  const clamp = (value, total) => Math.round(Math.max(MIN_COL, Math.min(value, total * MAX_FRACTION)));

  const resolveOrder = (saved) => root.panelOrder.resolveOrder(saved, PANEL_IDS);

  function bindPanelDrag(getOrder, setOrder) {
    const { swap, move } = root.panelOrder;
    let dragId = null;
    const clearMarks = () => document.querySelectorAll('.panel').forEach((p) => p.classList.remove('dragging', 'drop-target'));

    PANEL_IDS.forEach((id) => {
      const panel = document.getElementById(id);
      const grip = panel.querySelector('.grip');

      grip.addEventListener('dragstart', (e) => {
        dragId = id;
        e.dataTransfer.setData(PANEL_MIME, id);
        e.dataTransfer.effectAllowed = 'move';
        panel.classList.add('dragging');
      });
      grip.addEventListener('dragend', () => { dragId = null; clearMarks(); });
      grip.addEventListener('keydown', (e) => {
        const delta = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!delta) return;
        e.preventDefault();
        setOrder(move(getOrder(), id, delta), id);
      });

      panel.addEventListener('dragover', (e) => {
        if (!dragId || dragId === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        panel.classList.add('drop-target');
      });
      panel.addEventListener('dragleave', (e) => {
        if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop-target');
      });
      panel.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = dragId;
        clearMarks();
        dragId = null;
        if (from && from !== id) setOrder(swap(getOrder(), from, id), from);
      });
    });
  }

  function initLayout() {
    const main = document.getElementById('layout');
    let layout = read();

    const apply = () => {
      main.style.setProperty('--c1', `${layout.c1 || DEFAULTS.c1}px`);
      main.style.setProperty('--c3', `${layout.c3 || DEFAULTS.c3}px`);
    };
    const update = (patch) => {
      layout = { ...layout, ...patch };
      apply();
      write(layout);
    };

    const bindSplitter = (id, key, widthFromPointer) => {
      const bar = document.getElementById(id);
      const total = () => main.getBoundingClientRect().width;
      const current = () => layout[key] || DEFAULTS[key];

      bar.addEventListener('pointerdown', (e) => {
        bar.setPointerCapture(e.pointerId);
        bar.classList.add('dragging');
        document.body.classList.add('resizing');
      });
      bar.addEventListener('pointermove', (e) => {
        if (!bar.hasPointerCapture(e.pointerId)) return;
        update({ [key]: clamp(widthFromPointer(e.clientX, main.getBoundingClientRect()), total()) });
      });
      const stop = (e) => {
        if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId);
        bar.classList.remove('dragging');
        document.body.classList.remove('resizing');
      };
      bar.addEventListener('pointerup', stop);
      bar.addEventListener('pointercancel', stop);
      bar.addEventListener('dblclick', () => update({ [key]: DEFAULTS[key] }));
      bar.addEventListener('keydown', (e) => {
        const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        const sign = key === 'c1' ? 1 : -1;
        update({ [key]: clamp(current() + sign * dir * KEY_STEP, total()) });
      });
    };

    // Ordem dos painéis: arrastar a alça sobre outro painel troca os dois; ← → na alça move um passo.
    // Os divisores ficam fixos; a largura pertence à posição (esquerda/direita), não ao painel.
    let order = resolveOrder(layout.order);
    const applyOrder = () => {
      const [a, b, c] = order.map((id) => document.getElementById(id));
      main.append(a, document.getElementById('split-left'), b, document.getElementById('split-right'), c);
    };
    const setOrder = (next, focusId) => {
      order = next;
      applyOrder();
      update({ order });
      if (focusId) document.querySelector(`#${focusId} .grip`).focus();
    };
    bindPanelDrag(() => order, setOrder);
    applyOrder();

    const PAD = 12;
    bindSplitter('split-left', 'c1', (x, rect) => x - rect.left - PAD);
    bindSplitter('split-right', 'c3', (x, rect) => rect.right - x - PAD);

    // Seções recolhíveis: lembra quais estavam abertas.
    const folds = layout.folds || {};
    document.querySelectorAll('details.fold').forEach((d) => {
      const { key } = d.dataset;
      if (key in folds) d.open = folds[key];
      d.addEventListener('toggle', () => update({ folds: { ...(layout.folds || {}), [key]: d.open } }));
    });

    document.getElementById('btn-reset-layout').addEventListener('click', () => {
      layout = {};
      write(layout);
      order = [...PANEL_IDS];
      applyOrder();
      apply();
      document.querySelectorAll('details.fold').forEach((d) => { d.open = true; });
    });

    apply();
  }

  root.initLayout = initLayout;
}(window));
