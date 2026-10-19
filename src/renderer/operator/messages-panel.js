/* global window */
// Mensagens com modelo: escolhe o modelo, preenche os campos ({criança}, {placa}…) e manda para a tela,
// para o retorno de palco ou para os dois. Os modelos e o tempo para sumir ficam no processo principal.
(function exposeMessagesPanel(root) {
  const CONFIRM_MS = 3000;
  const FIELD_RE = /\{([^{}]{1,30})\}/g;
  const TARGET_LABELS = { screen: 'na tela', stage: 'no retorno', both: 'na tela e no retorno' };
  const SECONDS = [0, 10, 15, 20, 30, 45, 60, 120, 300];
  const $ = (id) => document.getElementById(id);

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => node.setAttribute(k, v));
    node.append(...children);
    return node;
  }

  const fieldsOf = (text) => [...new Set([...String(text).matchAll(FIELD_RE)].map((m) => m[1].trim()).filter(Boolean))];
  // Prévia igual à do processo principal (lá é que vale): troca os campos e limpa espaços.
  const fill = (text, values) => String(text).replace(FIELD_RE, (_w, name) => (values[name.trim()] || '').trim())
    .replace(/\s{2,}/g, ' ').trim();
  const secondsLabel = (s) => (s ? `some em ${s >= 60 ? `${s / 60} min` : `${s} s`}` : 'fica até tirar');
  const cleanError = (err) => String(err && err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  function initMessagesPanel({ api }) {
    let templates = [];
    let shownText = null; // o que o último "Mostrar" pôs no ar (para o status sumir junto com a mensagem)
    const select = $('msg-template');
    const current = () => templates.find((t) => t.id === select.value) || null;
    const setStatus = (text) => { $('msg-status').textContent = text; };

    const values = () => Object.fromEntries([...$('msg-fields').querySelectorAll('input')].map((i) => [i.dataset.field, i.value]));

    const renderPreview = () => {
      const t = current();
      $('msg-preview').textContent = t ? fill(t.text, values()) : '';
      $('msg-preview').title = t ? `${TARGET_LABELS[t.target]}, ${secondsLabel(t.seconds)}` : '';
    };

    const renderFields = () => {
      const t = current();
      $('btn-msg-edit').disabled = !t;
      $('btn-msg-delete').hidden = !t;
      $('btn-msg-show').disabled = !t;
      resetDeleteConfirm();
      $('msg-fields').replaceChildren(...(t ? fieldsOf(t.text) : []).map((name) => {
        const input = el('input', { placeholder: name, 'aria-label': name, maxlength: '80', autocomplete: 'off' });
        input.dataset.field = name;
        return el('div', { class: 'row' }, input);
      }));
      $('msg-target').textContent = t ? `${TARGET_LABELS[t.target]} · ${secondsLabel(t.seconds)}` : '';
      renderPreview();
    };

    const renderSelect = (keep) => {
      select.replaceChildren(...(templates.length
        ? templates.map((t) => el('option', { value: t.id }, t.name))
        : [el('option', { value: '' }, 'Nenhum modelo')]));
      if (keep && templates.some((t) => t.id === keep)) select.value = keep;
      renderFields();
    };

    async function show() {
      const t = current();
      if (!t) return;
      try {
        const res = await api.messages.show(t.id, values());
        shownText = res.ok ? res.text : null;
        setStatus(res.ok ? `No ar ${TARGET_LABELS[t.target]}: ${secondsLabel(t.seconds)}.` : res.reason);
      } catch (err) {
        setStatus(cleanError(err));
      }
    }

    select.addEventListener('change', renderFields);
    $('msg-fields').addEventListener('input', renderPreview);
    // Enter no último campo (ou em qualquer um) mostra a mensagem.
    $('msg-fields').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); show(); } });
    $('btn-msg-show').addEventListener('click', show);
    $('btn-msg-clear').addEventListener('click', async () => { await api.messages.clear(); setStatus(''); });

    // ---------- Criar/editar modelo ----------
    const dialog = $('message-dialog');
    $('msg-ed-seconds').replaceChildren(...SECONDS.map((s) => el('option', { value: String(s) }, s ? secondsLabel(s).replace('some em ', 'Some em ') : 'Fica até tirar')));
    const openDialog = (t) => {
      dialog.dataset.id = t ? t.id : '';
      $('msg-ed-name').value = t ? t.name : '';
      $('msg-ed-text').value = t ? t.text : '';
      $('msg-ed-seconds').value = String(t && SECONDS.includes(t.seconds) ? t.seconds : 30);
      $('msg-ed-target').value = t ? t.target : 'screen';
      $('msg-ed-error').textContent = '';
      dialog.showModal();
      $('msg-ed-name').focus();
    };
    $('btn-msg-new').addEventListener('click', () => openDialog(null));
    $('btn-msg-edit').addEventListener('click', () => openDialog(current()));
    $('msg-ed-cancel').addEventListener('click', () => dialog.close());
    $('msg-ed-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = dialog.dataset.id || undefined;
      const res = await api.messages.save({
        id,
        name: $('msg-ed-name').value,
        text: $('msg-ed-text').value,
        seconds: Number($('msg-ed-seconds').value),
        target: $('msg-ed-target').value,
      });
      if (!res.ok) { $('msg-ed-error').textContent = res.reason; return; }
      templates = res.templates;
      const name = $('msg-ed-name').value.trim().toLowerCase();
      renderSelect(id || (templates.find((t) => t.name.toLowerCase() === name) || {}).id);
      dialog.close();
    });

    // Excluir com dois cliques, como temas e layouts.
    let confirmTimer = null;
    const setDeleteState = (confirming) => {
      const btn = $('btn-msg-delete');
      btn.classList.toggle('confirming', confirming);
      btn.title = confirming ? 'Clique de novo para confirmar a exclusão' : 'Excluir o modelo selecionado';
      btn.setAttribute('aria-label', confirming ? 'Confirmar exclusão do modelo' : 'Excluir modelo');
      root.icons.setIcon(btn, confirming ? 'check' : 'trash');
    };
    function resetDeleteConfirm() {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      setDeleteState(false);
    }
    $('btn-msg-delete').addEventListener('click', async () => {
      if (!confirmTimer) {
        setDeleteState(true);
        confirmTimer = setTimeout(resetDeleteConfirm, CONFIRM_MS);
        return;
      }
      const res = await api.messages.remove(select.value);
      templates = res.templates;
      renderSelect();
    });

    return {
      async load() {
        templates = await api.messages.list();
        renderSelect();
      },
      names: () => templates.map((t) => t.name),
      // A mensagem saiu do ar (tempo esgotado, tirada à mão, trocada): apaga o "No ar…".
      render(state) {
        if (!shownText || state.layers.announcement.text === shownText || state.stage.message === shownText) return;
        shownText = null;
        setStatus('');
      },
    };
  }

  root.initMessagesPanel = initMessagesPanel;
}(window));
