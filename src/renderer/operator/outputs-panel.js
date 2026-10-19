/* global window */
// Diálogo "Saídas de projeção": monitor a monitor, se projeta, o que mostra e a posição no panorâmico.
// A validação definitiva (monitores existentes, limites) é feita no processo principal.
(function exposeOutputsPanel(root) {
  const $ = (id) => document.getElementById(id);
  const PROFILE_LABELS = { full: 'Tudo', lyrics: 'Só letra (fundo preto)', background: 'Só fundo e mídia' };
  const OVERLAPS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'checked') node.checked = v;
      else node.setAttribute(k, v);
    });
    node.append(...children);
    return node;
  }

  const select = (options, value, label) => {
    const s = el('select', { 'aria-label': label });
    s.append(...options.map(([v, text]) => el('option', { value: String(v) }, text)));
    s.value = String(value);
    return s;
  };

  function initOutputsPanel({ api }) {
    const dialog = $('outputs-dialog');
    let displays = [];

    $('outputs-overlap').replaceChildren(...OVERLAPS.map((o) => el('option', { value: String(o) }, o ? `${Math.round(o * 100)}%` : 'nenhuma (LED)')));

    const spanOptions = () => [[0, '—'], ...Array.from({ length: Number($('outputs-span-count').value) }, (_, i) => [i + 1, `Tela ${i + 1}`])];

    function renderRows(config) {
      const byId = new Map(config.screens.map((s) => [s.displayId, s]));
      $('outputs-rows').replaceChildren(...displays.map((d) => {
        const s = byId.get(d.id) || { enabled: false, profile: 'full', span: 0 };
        return el('tr', { 'data-display': String(d.id) },
          el('td', {}, el('input', { type: 'checkbox', 'aria-label': `Projetar em ${d.label}`, checked: s.enabled })),
          el('td', {}, d.label),
          el('td', {}, select(Object.entries(PROFILE_LABELS), s.profile, `O que ${d.label} mostra`)),
          el('td', {}, select(spanOptions(), s.span, `Posição de ${d.label} no panorâmico`)));
      }));
    }

    const readForm = () => ({
      spanCount: Number($('outputs-span-count').value),
      overlap: Number($('outputs-overlap').value),
      screens: [...$('outputs-rows').children].map((tr) => {
        const [check, profile, span] = tr.querySelectorAll('input, select');
        return { displayId: Number(tr.dataset.display), enabled: check.checked, profile: profile.value, span: Number(span.value) };
      }),
    });

    $('btn-outputs-config').addEventListener('click', async () => {
      const res = await api.outputs.getConfig();
      displays = res.displays;
      $('outputs-span-count').value = String(res.config.spanCount);
      $('outputs-overlap').value = String(res.config.overlap);
      $('outputs-error').textContent = '';
      renderRows(res.config);
      dialog.showModal();
    });
    // Mudar a quantidade de telas refaz as opções de posição mantendo o resto do formulário.
    $('outputs-span-count').addEventListener('change', () => renderRows(readForm()));
    $('outputs-cancel').addEventListener('click', () => dialog.close());
    $('outputs-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = readForm();
      const spans = form.screens.filter((s) => s.enabled && s.span).map((s) => s.span);
      if (new Set(spans).size !== spans.length) {
        $('outputs-error').textContent = 'Duas telas na mesma posição do panorâmico. Escolha posições diferentes.';
        return;
      }
      try {
        await api.outputs.setConfig(form);
        dialog.close();
      } catch (err) {
        $('outputs-error').textContent = 'Não foi possível salvar a configuração.';
        console.error(`[saídas] ${err.message}`);
      }
    });
  }

  root.initOutputsPanel = initOutputsPanel;
}(window));
