/* global window */
// Busca de letra na internet: o operador escolhe um resultado, confere a letra e abre no editor para salvar.
(function exposeLyricsPanel(root) {
  const $ = (id) => document.getElementById(id);

  function initLyricsPanel({ api, openEditor }) {
    const dialog = $('lyrics-dialog');
    let results = [];
    let chosen = null;

    const setMessage = (text) => { $('lyrics-msg').textContent = text; };

    const choose = (item) => {
      chosen = item;
      $('lyrics-preview').textContent = item ? item.lyrics : '';
      $('lyrics-use').disabled = !item;
      [...$('lyrics-results').children].forEach((li) => li.classList.toggle('active', Number(li.dataset.index) === results.indexOf(item)));
    };

    const renderResults = () => {
      $('lyrics-results').replaceChildren(...results.map((r, i) => {
        const li = document.createElement('li');
        li.dataset.index = String(i);
        li.tabIndex = 0;
        const head = document.createElement('span');
        head.textContent = r.artist ? `${r.title} · ${r.artist}` : r.title;
        const preview = document.createElement('small');
        preview.textContent = r.preview;
        li.append(head, preview);
        li.addEventListener('click', () => choose(r));
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); choose(r); } });
        return li;
      }));
    };

    // Só a busca mais recente pode mexer na tela: uma resposta lenta e antiga não sobrescreve a nova.
    let searchSeq = 0;
    const search = async () => {
      const title = $('lyrics-title').value.trim();
      if (!title) { setMessage('Digite o nome da música.'); $('lyrics-title').focus(); return; }
      const seq = ++searchSeq;
      const isCurrent = () => seq === searchSeq;
      $('lyrics-go').disabled = true;
      setMessage('Buscando…');
      results = [];
      renderResults();
      choose(null);
      try {
        const res = await api.lyrics.search(title, $('lyrics-artist').value.trim());
        if (!isCurrent()) return;
        if (!res.ok) { setMessage(res.reason); return; }
        results = res.results;
        renderResults();
        setMessage(results.length
          ? `${results.length} resultado(s). Clique para ver a letra.`
          : 'Nada encontrado. Confira a grafia ou informe o artista.');
        if (results.length) choose(results[0]);
      } catch (err) {
        if (isCurrent()) setMessage('Não foi possível buscar agora.');
        console.error(`[letras] ${err.message}`);
      } finally {
        if (isCurrent()) $('lyrics-go').disabled = false;
      }
    };

    $('lyrics-form').addEventListener('submit', (e) => { e.preventDefault(); search(); });
    $('lyrics-cancel').addEventListener('click', () => dialog.close());
    $('lyrics-use').addEventListener('click', () => {
      if (!chosen) return;
      dialog.close();
      openEditor({ title: chosen.title, text: chosen.lyrics });
    });

    return {
      // Abre com o termo já digitado na busca local (quando nada foi achado na biblioteca).
      open(prefill = '') {
        if (prefill) $('lyrics-title').value = prefill;
        setMessage('');
        dialog.showModal();
        $('lyrics-title').focus();
        if (prefill) search();
      },
    };
  }

  root.initLyricsPanel = initLyricsPanel;
}(window));
