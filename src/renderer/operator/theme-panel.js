/* global window */
// Estilo do texto (fonte, tamanho, cor, alinhamento, posição, maiúsculas, sombra, rótulo) e temas salvos.
// A validação e a gravação ficam no processo principal; aqui só se envia o patch e se reflete o estado.
(function exposeThemePanel(root) {
  const CONFIRM_MS = 3000;
  const NONE = '';
  const SIZES = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
  const TOGGLES = { 'style-uppercase': 'uppercase', 'style-shadow': 'shadow', 'style-label': 'showLabel' };
  const SELECTS = { 'style-font': 'font', 'style-align': 'align', 'style-position': 'position' };
  const $ = (id) => document.getElementById(id);

  function option(value, label) {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = label;
    return el;
  }

  // Compara campo a campo (a ordem das chaves pode variar entre o disco e o estado).
  const sameFields = (a, b) => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
  };
  const sameLook = (theme, state) => sameFields(theme.background, state.layers.background)
    && sameFields(theme.style, state.textStyle);

  function initThemePanel({ api }) {
    let themes = [];
    let state = null;
    const select = $('theme-select');
    const setStyle = (patch) => api.dispatch({ type: 'setTextStyle', style: patch });

    // ---------- Controles de estilo ----------
    $('style-size').replaceChildren(...SIZES.map((s) => option(String(s), `${s}%`)));
    $('style-size').addEventListener('change', (e) => setStyle({ size: Number(e.target.value) }));
    Object.entries(SELECTS).forEach(([id, field]) => $(id).addEventListener('change', (e) => setStyle({ [field]: e.target.value })));
    $('style-color').addEventListener('input', (e) => setStyle({ color: e.target.value }));
    Object.entries(TOGGLES).forEach(([id, field]) => $(id).addEventListener('click', () => {
      if (state) setStyle({ [field]: !state.textStyle[field] });
    }));

    const renderStyle = (style) => {
      $('style-size').value = String(style.size);
      Object.entries(SELECTS).forEach(([id, field]) => { $(id).value = style[field]; });
      if (document.activeElement !== $('style-color')) $('style-color').value = style.color;
      Object.entries(TOGGLES).forEach(([id, field]) => $(id).setAttribute('aria-pressed', String(style[field])));
    };

    // ---------- Temas ----------
    const currentValue = () => {
      const hit = state && themes.find((t) => sameLook(t, state));
      return hit ? hit.name : NONE;
    };

    const syncSelect = () => {
      const value = currentValue();
      select.value = value;
      $('btn-theme-delete').hidden = value === NONE;
      resetDeleteConfirm();
    };

    const renderSelect = () => {
      const placeholder = option(NONE, themes.length ? 'Sem tema (personalizado)' : 'Nenhum tema salvo');
      placeholder.disabled = true;
      select.replaceChildren(placeholder, ...themes.map((t) => option(t.name, t.name)));
      syncSelect();
    };

    const useResult = (res) => {
      themes = res.themes;
      renderSelect();
      return res;
    };

    select.addEventListener('change', async () => {
      if (select.value === NONE) return;
      const res = useResult(await api.themes.apply(select.value));
      if (!res.ok) console.error(`[temas] ${res.reason}`);
    });

    // Salvar: guarda o que está na saída agora.
    const dialog = $('theme-dialog');
    const showError = (text) => { $('theme-error').textContent = text; };
    $('btn-theme-save').addEventListener('click', () => {
      $('theme-name').value = select.value;
      showError('');
      dialog.showModal();
      $('theme-name').focus();
    });
    $('theme-cancel').addEventListener('click', () => dialog.close());
    $('theme-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = useResult(await api.themes.save($('theme-name').value));
      if (!res.ok) return showError(res.reason.replace(/^Nome inválido: /, ''));
      dialog.close();
      return undefined;
    });

    // Excluir com dois cliques, como os layouts salvos.
    let confirmTimer = null;
    const setDeleteState = (confirming) => {
      const btn = $('btn-theme-delete');
      btn.classList.toggle('confirming', confirming);
      btn.title = confirming ? 'Clique de novo para confirmar a exclusão' : 'Excluir o tema selecionado';
      btn.setAttribute('aria-label', confirming ? 'Confirmar exclusão do tema' : 'Excluir tema');
      root.icons.setIcon(btn, confirming ? 'check' : 'trash');
    };
    function resetDeleteConfirm() {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      setDeleteState(false);
    }
    $('btn-theme-delete').addEventListener('click', async () => {
      if (!confirmTimer) {
        setDeleteState(true);
        confirmTimer = setTimeout(resetDeleteConfirm, CONFIRM_MS);
        return;
      }
      useResult(await api.themes.remove(select.value));
    });

    return {
      async load() {
        themes = await api.themes.list();
        renderSelect();
      },
      render(next) {
        const lookChanged = !state || !sameLook({ background: state.layers.background, style: state.textStyle }, next);
        state = next;
        renderStyle(next.textStyle);
        if (lookChanged) syncSelect();
      },
    };
  }

  root.initThemePanel = initThemePanel;
}(window));
