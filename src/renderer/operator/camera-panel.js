/* global window */
// Câmera ou placa de captura (HDMI, câmera virtual do OBS): escolhe o dispositivo, confere no preview e usa
// como fundo ou em tela cheia. Só imagem, sem som. Cada janela abre o seu fluxo (veja stage.js).
(function exposeCameraPanel(root) {
  const $ = (id) => document.getElementById(id);

  function initCameraPanel({ api }) {
    const dialog = $('camera-dialog');
    let stream = null;
    let seq = 0;
    const setStatus = (text) => { $('cam-status').textContent = text; };
    const hasDevice = () => Boolean($('cam-device').value);

    function stopPreview() {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      $('cam-preview').srcObject = null;
    }

    async function startPreview() {
      const mine = ++seq;
      stopPreview();
      if (!hasDevice()) return;
      try {
        const next = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: $('cam-device').value } }, audio: false });
        if (mine !== seq || !dialog.open) {
          next.getTracks().forEach((track) => track.stop()); // o diálogo fechou ou a escolha mudou enquanto abria
          return;
        }
        stream = next;
        $('cam-preview').srcObject = next;
        setStatus('');
      } catch (err) {
        if (mine === seq) setStatus(`Não foi possível abrir esta câmera (em uso por outro programa?): ${err.message}`);
      }
    }

    // Devolve true se o dispositivo selecionado mudou (sumiu da lista): o preview precisa reiniciar.
    async function loadDevices() {
      const keep = $('cam-device').value;
      try {
        // O navegador só revela o nome dos dispositivos depois da primeira permissão: abre e fecha uma câmera qualquer.
        const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        probe.getTracks().forEach((track) => track.stop());
      } catch (err) {
        $('cam-device').replaceChildren(new Option('Nenhuma câmera disponível', ''));
        setStatus(`Nenhuma câmera disponível, ou o acesso foi negado: ${err.message}`);
        syncButtons();
        return true;
      }
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId);
      $('cam-device').replaceChildren(...devices.map((d, i) => new Option(d.label || `Câmera ${i + 1}`, d.deviceId)));
      if (devices.some((d) => d.deviceId === keep)) $('cam-device').value = keep;
      if (!devices.length) setStatus('Nenhuma câmera ou placa de captura encontrada.');
      syncButtons();
      return $('cam-device').value !== keep;
    }

    function syncButtons() {
      $('cam-bg').disabled = !hasDevice();
      $('cam-full').disabled = !hasDevice();
    }

    async function use(action) {
      try {
        await api.dispatch(action);
        dialog.close();
      } catch (err) {
        setStatus(String(err && err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      }
    }
    const label = () => ($('cam-device').selectedOptions[0] || {}).textContent || 'Câmera';

    $('btn-bg-camera').addEventListener('click', async () => {
      setStatus('Procurando câmeras…');
      dialog.showModal();
      await loadDevices();
      await startPreview();
    });
    $('cam-device').addEventListener('change', () => { syncButtons(); startPreview(); });
    $('cam-bg').addEventListener('click', () => use({ type: 'setBackground', background: { kind: 'camera', value: $('cam-device').value } }));
    $('cam-full').addEventListener('click', () => use({ type: 'showMedia', media: { kind: 'camera', value: $('cam-device').value, title: label(), loop: false } }));
    $('cam-close').addEventListener('click', () => dialog.close());
    // Fechar o diálogo (botão, Esc ou usar) solta a câmera do preview.
    dialog.addEventListener('close', () => { seq += 1; stopPreview(); });
    // Câmera plugada ou removida com o diálogo aberto: atualiza a lista.
    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        if (dialog.open && await loadDevices()) startPreview();
      });
    }
  }

  root.initCameraPanel = initCameraPanel;
}(window));
