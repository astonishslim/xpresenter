/* global window */
// Macros: um botão que faz várias coisas (tema, props, mensagem, capa, cronômetro…). Roda por clique, por
// Alt+1…9 ou por OSC (/xpresenter/macro/N). Os passos e a execução ficam no processo principal.
(function exposeMacrosPanel(root) {
  const CONFIRM_MS = 3000;
  const SHORTCUT_MAX = 9;
  const DEFAULT_MINUTES = 5;
  const DEFAULT_TIME = '19:00';
  const MAX_STEPS = 20;
  const $ = (id) => document.getElementById(id);
  const { STEP_TYPES } = root.macroSteps;
  const cleanError = (err) => String(err && err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    node.append(...children);
    return node;
  }
  const miniButton = (icon, label, onclick) => el('button', { class: 'mini', type: 'button', title: label, 'aria-label': label, onclick }, root.icons.create(icon, 12));

  function initMacrosPanel({ api, sources }) {
    let macros = [];
    const setStatus = (text) => { $('macro-status').textContent = text; };

    // ---------- Executar ----------
    async function run(macro) {
      try {
        const res = await api.macros.run(macro.id);
        const failed = res.results.filter((r) => !r.ok);
        if (res.ok) setStatus(`Macro "${macro.name}" executado (${res.results.length} ${res.results.length === 1 ? 'passo' : 'passos'}).`);
        else if (!res.results.length) setStatus(res.reason);
        else setStatus(`Macro "${macro.name}": ${failed.length} de ${res.results.length} passos falharam: ${failed.map((r) => r.reason).join(' · ')}`);
      } catch (err) {
        setStatus(cleanError(err));
      }
    }

    function renderList() {
      $('macro-list').replaceChildren(...(macros.length ? macros.map((macro, i) => {
        const key = i < SHORTCUT_MAX ? ` (Alt+${i + 1})` : '';
        const runBtn = el('button', { class: 'macro-run', type: 'button', title: `Executar ${macro.name}${key}`, onclick: () => run(macro) },
          root.icons.create('zap', 12), `${macro.name}${key}`);
        return el('li', {}, runBtn, miniButton('pencil', `Editar ${macro.name}`, () => openDialog(macro)));
      }) : [el('li', { class: 'hint' }, 'Nenhum macro. Use + para criar.')]));
    }

    // ---------- Editor: um passo = tipo + valor (conforme o tipo) ----------
    const dialog = $('macro-dialog');

    function valueControl(type, value) {
      const kind = STEP_TYPES[type].value;
      if (kind === 'name') {
        const names = sources[STEP_TYPES[type].source]();
        const select = el('select', { 'aria-label': 'Nome', class: 'step-value' });
        const list = value && !names.includes(value) ? [...names, value] : names;
        select.replaceChildren(...(list.length ? list.map((n) => el('option', { value: n }, names.includes(n) ? n : `${n} (não existe)`)) : [el('option', { value: '' }, '(nenhum cadastrado)')]));
        if (value) select.value = value;
        return select;
      }
      if (kind === 'minutes') {
        return el('input', { type: 'number', min: '0', max: '1440', step: '1', class: 'step-value narrow', 'aria-label': 'Minutos', value: String(value ?? DEFAULT_MINUTES) });
      }
      if (kind === 'time') return el('input', { type: 'time', class: 'step-value narrow clock', 'aria-label': 'Horário', value: value || DEFAULT_TIME });
      return el('span', { class: 'step-value muted' });
    }

    function stepRow(step = { do: 'clear' }) {
      const type = el('select', { 'aria-label': 'Passo', class: 'step-type' },
        ...Object.entries(STEP_TYPES).map(([key, def]) => el('option', { value: key }, def.label)));
      type.value = step.do;
      const slot = el('div', { class: 'step-slot' }, valueControl(step.do, step.value));
      type.addEventListener('change', () => slot.replaceChildren(valueControl(type.value, undefined)));
      const row = el('div', { class: 'row macro-step' }, type, slot,
        miniButton('arrow-up', 'Subir passo', () => { if (row.previousElementSibling) row.previousElementSibling.before(row); }),
        miniButton('x', 'Remover passo', () => row.remove()));
      return row;
    }

    function readSteps() {
      return [...$('macro-steps').querySelectorAll('.macro-step')].map((row) => {
        const type = row.querySelector('.step-type').value;
        const kind = STEP_TYPES[type].value;
        const control = row.querySelector('.step-value');
        if (kind === null) return { do: type };
        return { do: type, value: kind === 'minutes' ? Number(control.value) : control.value };
      });
    }

    function openDialog(macro) {
      dialog.dataset.id = macro ? macro.id : '';
      $('macro-name').value = macro ? macro.name : '';
      $('macro-steps').replaceChildren(...(macro ? macro.steps : [{ do: 'clear' }]).map(stepRow));
      $('macro-error').textContent = '';
      $('macro-delete').hidden = !macro;
      resetDeleteConfirm();
      dialog.showModal();
      $('macro-name').focus();
    }
    $('btn-macro-new').addEventListener('click', () => openDialog(null));
    $('macro-cancel').addEventListener('click', () => dialog.close());
    $('macro-step-add').addEventListener('click', () => {
      if ($('macro-steps').children.length >= MAX_STEPS) { $('macro-error').textContent = `No máximo ${MAX_STEPS} passos.`; return; }
      $('macro-steps').append(stepRow());
    });
    // Enter num campo de passo não salva o macro (seria fácil errar com o cronômetro).
    $('macro-steps').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

    $('macro-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await api.macros.save({ id: dialog.dataset.id || undefined, name: $('macro-name').value, steps: readSteps() });
      if (!res.ok) { $('macro-error').textContent = res.reason; return; }
      macros = res.macros;
      renderList();
      dialog.close();
    });

    // Excluir com dois cliques.
    let confirmTimer = null;
    const setDeleteState = (confirming) => {
      const btn = $('macro-delete');
      btn.classList.toggle('confirming', confirming);
      btn.textContent = confirming ? 'Clique de novo para excluir' : 'Excluir';
    };
    function resetDeleteConfirm() {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      setDeleteState(false);
    }
    $('macro-delete').addEventListener('click', async () => {
      if (!confirmTimer) {
        setDeleteState(true);
        confirmTimer = setTimeout(resetDeleteConfirm, CONFIRM_MS);
        return;
      }
      macros = (await api.macros.remove(dialog.dataset.id)).macros;
      renderList();
      dialog.close();
      setStatus('Macro excluído: os números (Alt+N e OSC) dos macros seguintes mudaram.');
    });

    return {
      async load() {
        macros = await api.macros.list();
        renderList();
      },
      // Alt+1…9: o N-ésimo macro da lista.
      runAt(index) {
        if (macros[index]) run(macros[index]);
      },
    };
  }

  root.initMacrosPanel = initMacrosPanel;
}(window));
