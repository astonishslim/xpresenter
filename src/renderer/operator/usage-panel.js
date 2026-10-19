/* global window */
// Relatório de uso das músicas (CCLI): escolhe o período, confere a lista e exporta para planilha (CSV).
// Os dados ficam no processo principal (usage.jsonl); aqui só se pede a lista e a exportação.
(function exposeUsagePanel(root) {
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const cleanError = (err) => String(err && err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  function row(entry) {
    const li = document.createElement('li');
    const title = document.createElement('span');
    title.textContent = entry.title;
    const small = document.createElement('small');
    small.textContent = [entry.date.split('-').reverse().join('/'), entry.time, entry.author, entry.ccli && `CCLI ${entry.ccli}`].filter(Boolean).join(' · ');
    li.append(title, small);
    return li;
  }

  function initUsagePanel({ api }) {
    const dialog = $('usage-dialog');
    const period = () => ({ from: $('usage-from').value || undefined, to: $('usage-to').value || undefined });
    let seq = 0;

    async function refresh() {
      const mine = ++seq;
      $('usage-error').textContent = '';
      try {
        const { total, entries } = await api.usage.list(period());
        if (mine !== seq) return; // chegou uma consulta mais nova
        $('usage-summary').textContent = total
          ? `${total} ${total === 1 ? 'registro' : 'registros'} no período${total > entries.length ? ` (mostrando os ${entries.length} mais recentes)` : ''}.`
          : 'Nenhuma música registrada neste período.';
        $('usage-list').replaceChildren(...entries.map(row));
        $('usage-export').disabled = !total;
      } catch (err) {
        $('usage-error').textContent = cleanError(err);
      }
    }

    $('btn-usage').addEventListener('click', () => {
      // Padrão: o mês corrente.
      const now = new Date();
      if (!$('usage-from').value) $('usage-from').value = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      if (!$('usage-to').value) $('usage-to').value = isoDate(now);
      dialog.showModal();
      refresh();
    });
    $('usage-from').addEventListener('change', refresh);
    $('usage-to').addEventListener('change', refresh);
    $('usage-close').addEventListener('click', () => dialog.close());
    $('usage-export').addEventListener('click', async () => {
      try {
        const res = await api.usage.export(period());
        if (res.ok) $('usage-summary').textContent = `Relatório salvo (${res.count} registros): ${res.path}`;
        else if (res.reason) $('usage-error').textContent = res.reason;
      } catch (err) {
        $('usage-error').textContent = cleanError(err);
      }
    });
  }

  root.initUsagePanel = initUsagePanel;
}(window));
