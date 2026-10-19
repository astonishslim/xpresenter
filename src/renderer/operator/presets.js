/* global window */
// Seletor de presets de layout: prontos (Padrão, Culto, Ensaio, Operador de mídia) e os salvos pelo usuário.
(function exposePresets(root) {
  const STORAGE_KEY = 'apresentador.presets';
  const CUSTOM_VALUE = '__custom';
  const CONFIRM_MS = 3000;
  const P = root.layoutPresets;
  const $ = (id) => document.getElementById(id);

  function load() {
    try {
      return P.sanitizeSaved(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return [];
    }
  }

  function persist(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // armazenamento indisponível: o preset vale só até fechar o app
    }
  }

  function option(value, label) {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = label;
    return el;
  }

  function initPresets(layoutApi) {
    let saved = load();
    const select = $('preset-select');

    const findByValue = (value) => {
      if (value.startsWith('b:')) return P.BUILTIN.find((b) => `b:${b.id}` === value)?.layout;
      if (value.startsWith('u:')) return saved.find((s) => `u:${s.name}` === value)?.layout;
      return undefined;
    };

    // Seleciona o preset cujo conteúdo é igual ao layout atual; senão "Personalizado".
    const currentValue = () => {
      const now = layoutApi.getLayout();
      const builtin = P.BUILTIN.find((b) => P.sameLayout(b.layout, now));
      if (builtin) return `b:${builtin.id}`;
      const custom = saved.find((s) => P.sameLayout(s.layout, now));
      return custom ? `u:${custom.name}` : CUSTOM_VALUE;
    };

    const renderSelect = () => {
      const builtins = document.createElement('optgroup');
      builtins.label = 'Prontos';
      builtins.append(...P.BUILTIN.map((b) => option(`b:${b.id}`, b.name)));
      select.replaceChildren(builtins);
      if (saved.length) {
        const mine = document.createElement('optgroup');
        mine.label = 'Meus layouts';
        mine.append(...saved.map((s) => option(`u:${s.name}`, s.name)));
        select.append(mine);
      }
      const custom = option(CUSTOM_VALUE, 'Personalizado');
      custom.disabled = true;
      select.append(custom);
      sync();
    };

    const sync = () => {
      const value = currentValue();
      select.value = value;
      $('btn-preset-delete').hidden = !value.startsWith('u:');
      resetDeleteConfirm();
    };

    select.addEventListener('change', () => {
      const layout = findByValue(select.value);
      if (layout) layoutApi.applyLayout(layout);
      sync();
    });
    layoutApi.onChange(sync);

    // ---- Salvar o layout atual ----
    const dialog = $('preset-dialog');
    const showError = (text) => { $('preset-error').textContent = text; };
    $('btn-preset-save').addEventListener('click', () => {
      $('preset-name').value = select.value.startsWith('u:') ? select.value.slice(2) : '';
      showError('');
      dialog.showModal();
      $('preset-name').focus();
    });
    $('preset-cancel').addEventListener('click', () => dialog.close());
    $('preset-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const checked = P.validatePresetName($('preset-name').value);
      if (!checked.ok) return showError(checked.reason);
      const existing = saved.find((s) => s.name.toLowerCase() === checked.name.toLowerCase());
      if (!existing && saved.length >= P.MAX_SAVED) return showError(`Limite de ${P.MAX_SAVED} layouts salvos. Exclua algum antes.`);
      const layout = layoutApi.getLayout();
      // Mesmo nome (sem diferenciar maiúsculas) substitui o layout e mantém o nome já salvo.
      saved = existing
        ? saved.map((s) => (s === existing ? { name: existing.name, layout } : s))
        : [...saved, { name: checked.name, layout }];
      persist(saved);
      dialog.close();
      renderSelect();
      return undefined;
    });

    // ---- Excluir (dois cliques, para evitar perda acidental) ----
    let confirmTimer = null;
    const setDeleteState = (confirming) => {
      const btn = $('btn-preset-delete');
      const label = confirming ? 'Clique de novo para confirmar a exclusão' : 'Excluir o layout salvo selecionado';
      btn.classList.toggle('confirming', confirming);
      btn.title = label;
      btn.setAttribute('aria-label', confirming ? 'Confirmar exclusão do layout' : 'Excluir layout salvo');
      root.icons.setIcon(btn, confirming ? 'check' : 'trash');
    };
    function resetDeleteConfirm() {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      setDeleteState(false);
    }
    $('btn-preset-delete').addEventListener('click', () => {
      if (!confirmTimer) {
        setDeleteState(true);
        confirmTimer = setTimeout(resetDeleteConfirm, CONFIRM_MS);
        return;
      }
      const name = select.value.slice(2);
      saved = saved.filter((s) => s.name !== name);
      persist(saved);
      renderSelect();
    });

    renderSelect();
  }

  root.initPresets = initPresets;
}(window));
