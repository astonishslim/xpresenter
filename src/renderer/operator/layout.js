/* global window */
// Painéis dinâmicos: divisores arrastáveis, seções recolhíveis e layout salvo.
(function exposeLayout(root) {
  const STORAGE_KEY = 'apresentador.layout';
  const DEFAULTS = { c1: 300, c3: 380 };
  const MIN_COL = 200;
  const MAX_FRACTION = 0.45;
  const KEY_STEP = 20;

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
      apply();
      document.querySelectorAll('details.fold').forEach((d) => { d.open = true; });
    });

    apply();
  }

  root.initLayout = initLayout;
}(window));
