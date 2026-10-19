/* global window */
// Seção Bíblia: escolher a versão, buscar por referência ou por palavras, importar e remover versões.
(function exposeBiblePanel(root) {
  const VERSION_KEY = 'apresentador.bibleVersion';
  const DEFAULT_VERSION = 'TB';
  const CONFIRM_MS = 3000;
  const MAX_DROP_BYTES = 20 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  const remember = (code) => { try { localStorage.setItem(VERSION_KEY, code); } catch { /* sem persistência */ } };
  const remembered = () => { try { return localStorage.getItem(VERSION_KEY); } catch { return null; } };

  function initBiblePanel({ api, showVerses }) {
    let versions = [];
    let confirmTimer = null;
    const current = () => $('bible-version').value;
    const say = (text) => { $('verse-msg').textContent = text; };

    function option(v) {
      const el = document.createElement('option');
      el.value = v.code;
      el.textContent = `${v.code} · ${v.name}`;
      return el;
    }

    function group(label, list) {
      const el = document.createElement('optgroup');
      el.label = label;
      el.append(...list.map(option));
      return el;
    }

    async function loadVersions(prefer) {
      versions = await api.bible.versions();
      const builtin = versions.filter((v) => v.builtin);
      const mine = versions.filter((v) => !v.builtin);
      $('bible-version').replaceChildren(...[builtin.length && group('Incluídas', builtin), mine.length && group('Importadas', mine)].filter(Boolean));
      const codes = versions.map((v) => v.code);
      const choice = [prefer, remembered(), DEFAULT_VERSION, codes[0]].find((c) => c && codes.includes(c));
      if (choice) $('bible-version').value = choice;
      updateInfo();
    }

    // Licença sempre visível; a atribuição (obrigatória na CC BY) aparece junto e na dica.
    function updateInfo() {
      const v = versions.find((x) => x.code === current());
      const info = $('bible-license');
      if (!v) {
        info.textContent = 'Nenhuma versão instalada. Importe um arquivo JSON ou Zefania XML.';
        $('btn-bible-remove').hidden = true;
        return;
      }
      const needsCredit = !/dom[ií]nio p[uú]blico/i.test(v.license || '');
      info.textContent = needsCredit && v.attribution ? `${v.license} · ${v.attribution}` : (v.license || 'Licença desconhecida');
      info.title = [v.attribution, v.source && `Fonte: ${v.source}`].filter(Boolean).join('\n');
      $('btn-bible-remove').hidden = v.builtin;
      resetConfirm();
    }

    function renderResults({ results, truncated }) {
      const list = $('bible-results');
      if (!results.length) {
        list.replaceChildren();
        say('Nada encontrado. Use uma referência (Jo 3:16) ou palavras (amou o mundo).');
        return;
      }
      say(truncated ? `Mostrando os primeiros ${results.length} resultados. Refine a busca.` : `${results.length} resultado(s).`);
      list.replaceChildren(...results.map((r) => {
        const li = document.createElement('li');
        const ref = document.createElement('strong');
        ref.textContent = r.reference;
        const snippet = document.createElement('span');
        snippet.className = 'snippet';
        snippet.textContent = r.text;
        li.append(ref, snippet);
        li.title = `${r.reference}: ${r.text}`;
        li.addEventListener('click', async () => {
          const found = await api.bible.lookup(current(), r.reference);
          if (found) showVerses(found);
        });
        return li;
      }));
    }

    // Primeiro tenta como referência; se não for, busca por palavras.
    async function run() {
      const query = $('verse-ref').value.trim();
      if (!query || !current()) return;
      const ref = await api.bible.lookup(current(), query);
      if (ref) {
        $('bible-results').replaceChildren();
        say(`${ref.reference} · ${ref.code}`);
        showVerses(ref);
        return;
      }
      renderResults(await api.bible.search(current(), query));
    }

    async function handleImport(result) {
      if (result.ok) {
        remember(result.meta.code);
        await loadVersions(result.meta.code);
        say(`Versão importada: ${result.meta.name} (${result.meta.code}).`);
      } else if (result.reason !== 'cancelado') {
        say(`Não foi possível importar: ${result.reason}`);
      }
    }

    function resetConfirm() {
      clearTimeout(confirmTimer);
      confirmTimer = null;
      const btn = $('btn-bible-remove');
      btn.classList.remove('confirming');
      btn.title = 'Remover esta versão importada';
      root.icons.setIcon(btn, 'trash');
    }

    async function removeCurrent() {
      const btn = $('btn-bible-remove');
      if (!confirmTimer) {
        btn.classList.add('confirming');
        btn.title = 'Clique de novo para confirmar a remoção';
        root.icons.setIcon(btn, 'check');
        confirmTimer = setTimeout(resetConfirm, CONFIRM_MS);
        return;
      }
      const code = current();
      resetConfirm();
      const { ok } = await api.bible.remove(code);
      await loadVersions();
      say(ok ? `Versão ${code} removida.` : 'Só versões importadas podem ser removidas.');
    }

    function bindDrop() {
      const zone = document.querySelector('details.fold[data-key="bible"]');
      const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
      zone.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        zone.classList.add('file-over');
      });
      zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('file-over'); });
      zone.addEventListener('drop', async (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        zone.classList.remove('file-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (file.size > MAX_DROP_BYTES) { say('Arquivo grande demais (máximo 20 MB).'); return; }
        say(`Importando ${file.name}…`);
        await handleImport(await api.bible.importText(await file.text(), file.name));
      });
    }

    $('btn-verse').addEventListener('click', run);
    $('verse-ref').addEventListener('keydown', (e) => e.key === 'Enter' && run());
    $('bible-version').addEventListener('change', () => {
      remember(current());
      updateInfo();
      if ($('verse-ref').value.trim()) run();
    });
    $('btn-import-bible').addEventListener('click', async () => handleImport(await api.bible.import()));
    $('btn-bible-remove').addEventListener('click', removeCurrent);
    bindDrop();
    return loadVersions();
  }

  root.initBiblePanel = initBiblePanel;
}(window));
