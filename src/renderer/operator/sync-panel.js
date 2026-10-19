/* global window */
// Seguir outro computador: este xpresenter espelha o outro (redundância, ou uma sala de transmissão separada).
// Enquanto segue, os controles daqui ficam bloqueados; o estado recebido é validado no processo principal.
(function exposeSyncPanel(root) {
  const $ = (id) => document.getElementById(id);

  function describe(status) {
    const host = status.host || 'o outro computador';
    switch (status.state) {
      case 'connecting': return `Conectando a ${host}…`;
      case 'connected': return `Seguindo ${host}. Os controles deste computador estão bloqueados.`;
      case 'reconnecting': return `Sem sinal de ${host}${status.reason ? ` (${status.reason})` : ''}. Tentando de novo… A projeção continua como estava; use "Parar de seguir" para assumir o controle.`;
      default: return status.reason || 'Não está seguindo outro computador.';
    }
  }

  function initSyncPanel({ api }) {
    const dialog = $('sync-dialog');

    function apply(status) {
      const active = status.state !== 'stopped';
      document.body.classList.toggle('following', active);
      $('sync-badge').hidden = !active;
      $('sync-badge').textContent = status.state === 'reconnecting' ? `SEM SINAL · ${status.host}` : `SEGUINDO · ${status.host}`;
      $('sync-badge').classList.toggle('lost', status.state === 'reconnecting');
      $('btn-sync').setAttribute('aria-pressed', String(active));
      $('sync-status').textContent = describe(status);
      $('sync-stop').disabled = !active;
      $('sync-start').disabled = active;
      $('sync-url').disabled = active;
    }

    $('btn-sync').addEventListener('click', () => {
      dialog.showModal();
      if (!$('sync-url').disabled) $('sync-url').focus();
    });
    $('sync-close').addEventListener('click', () => dialog.close());
    $('sync-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await api.sync.start($('sync-url').value);
      if (!res.ok) $('sync-status').textContent = res.reason;
    });
    $('sync-stop').addEventListener('click', () => api.sync.stop());

    api.sync.onStatus(apply);
    api.sync.status().then(apply);
  }

  root.initSyncPanel = initSyncPanel;
}(window));
