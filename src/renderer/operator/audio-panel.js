/* global window */
// Áudio de fundo: músicas locais tocadas antes do culto, nesta janela (o computador do operador).
// Baixa o som sozinho (fade-out) quando o primeiro slide ou vídeo entra ao vivo. A lista fica no processo
// principal (audio.json); volume, repetir e fade automático ficam neste navegador.
(function exposeAudioPanel(root) {
  const { nextPlayableIndex, prevIndex, fadeVolume, clampVolume, enteredLive, FADE_MS, DEFAULT_VOLUME } = root.audioPlayer;
  const KEYS = { volume: 'apresentador.audioVolume', fade: 'apresentador.audioFade', loop: 'apresentador.audioLoop' };
  const FADE_TICK_MS = 100;
  const PERCENT = 100;
  const $ = (id) => document.getElementById(id);

  // Armazenamento pode falhar (janela anônima, dados bloqueados): o painel funciona sem ele.
  const readSetting = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch {
      return fallback;
    }
  };
  const saveSetting = (key, value) => {
    try { localStorage.setItem(key, String(value)); } catch { /* sem persistência */ }
  };

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

  function initAudioPanel({ api }) {
    let tracks = [];
    let index = -1;
    let state = null;
    let fadeTimer = null;
    const player = new Audio();
    player.preload = 'auto';
    let volume = clampVolume(Number(readSetting(KEYS.volume, DEFAULT_VOLUME)));
    const setStatus = (text) => { $('audio-status').textContent = text; };

    // ---------- Player ----------
    function cancelFade() {
      clearInterval(fadeTimer);
      fadeTimer = null;
      player.volume = volume;
    }

    function renderState() {
      const playing = !player.paused;
      root.icons.setIcon($('btn-audio-toggle'), playing ? 'pause' : 'play');
      $('btn-audio-toggle').title = playing ? 'Pausar' : 'Tocar';
      $('btn-audio-toggle').setAttribute('aria-label', playing ? 'Pausar música de fundo' : 'Tocar música de fundo');
      $('btn-audio-fade').disabled = !playing;
      $('audio-list').querySelectorAll('li').forEach((li, i) => li.classList.toggle('active', i === index));
    }

    function play(i) {
      const track = tracks[i];
      if (!track) return;
      if (track.missing) {
        setStatus(`Arquivo não encontrado: ${track.name}`);
        return;
      }
      cancelFade();
      index = i;
      player.src = track.url;
      player.play().then(() => setStatus(`Tocando: ${track.name}`)).catch((err) => {
        // Trocar de faixa rápido aborta o pedido anterior: não é erro, e não pode apagar o "Tocando" da faixa nova.
        if (err.name !== 'AbortError') setStatus(`Não foi possível tocar ${track.name}: ${err.message}`);
      });
      renderState();
    }

    function stop(message) {
      cancelFade();
      player.pause();
      setStatus(message);
      renderState();
    }

    function toggle() {
      if (!player.src || index < 0) {
        const first = tracks.findIndex((t) => !t.missing);
        if (first >= 0) play(first);
        else setStatus('Adicione músicas para tocar.');
        return;
      }
      if (player.paused) {
        cancelFade();
        player.play().then(() => setStatus(`Tocando: ${tracks[index].name}`)).catch((err) => {
          if (err.name !== 'AbortError') setStatus(`Não foi possível tocar: ${err.message}`);
        });
      } else {
        stop('Pausado.');
      }
      renderState();
    }

    // Próxima faixa que dá para tocar: as que o arquivo sumiu são puladas (silêncio antes do culto seria pior).
    function next() {
      const j = nextPlayableIndex(index, tracks, $('audio-loop').checked);
      if (j < 0) stop('Fim da lista.');
      else play(j);
    }

    // Baixa o som em FADE_MS e para; o volume volta ao escolhido para a próxima vez.
    function fadeOut() {
      if (player.paused) return;
      clearInterval(fadeTimer);
      const start = player.volume;
      const t0 = Date.now();
      fadeTimer = setInterval(() => {
        const v = fadeVolume(start, Date.now() - t0, FADE_MS);
        player.volume = clampVolume(v);
        if (v <= 0) stop('Música baixada (fade-out).');
      }, FADE_TICK_MS);
      setStatus('Baixando o som…');
    }

    player.addEventListener('ended', () => {
      // A faixa acabou no meio do fade-out: termina o fade (para), em vez de começar outra em volume cheio.
      if (fadeTimer !== null) stop('Música baixada (fade-out).');
      else next();
    });
    // Arquivo que não abre (corrompido, formato sem suporte): avisa e passa para a próxima. Se todas falharem
    // em sequência, para (sem isso duas faixas ruins ficariam pulando uma para a outra para sempre).
    let errorStreak = 0;
    player.addEventListener('playing', () => { errorStreak = 0; });
    player.addEventListener('error', () => {
      const track = tracks[index];
      if (track) setStatus(`Não foi possível ler o arquivo: ${track.name}`);
      errorStreak += 1;
      const j = errorStreak < tracks.length ? nextPlayableIndex(index, tracks, $('audio-loop').checked) : -1;
      if (j >= 0 && j !== index) {
        play(j);
        setStatus(`${$('audio-status').textContent} Passando para a próxima.`);
      } else {
        renderState();
      }
    });

    // ---------- Lista ----------
    function renderList() {
      $('audio-list').replaceChildren(...(tracks.length ? tracks.map((track, i) => el('li', {
        title: track.missing ? 'Arquivo não encontrado' : `Tocar ${track.name}`,
        class: track.missing ? 'is-missing' : '',
        onclick: () => play(i),
      },
      el('span', {}, track.missing ? `${track.name} (não encontrado)` : track.name),
      miniButton('arrow-up', 'Subir na lista', (e) => { e.stopPropagation(); move(track.id, i - 1); }),
      miniButton('x', 'Remover da lista', (e) => { e.stopPropagation(); remove(track.id); }))) : [el('li', { class: 'hint' }, 'Adicione músicas (ou arraste os arquivos para cá).')]));
      renderState();
    }

    // A faixa que está tocando continua a mesma depois de reordenar ou remover.
    async function refresh(keepId) {
      const playingId = keepId === undefined ? (tracks[index] || {}).id : keepId;
      tracks = await api.audio.list();
      index = playingId ? tracks.findIndex((t) => t.id === playingId) : -1;
      renderList();
    }
    async function move(id, to) {
      await api.audio.move(id, Math.max(0, to));
      refresh();
    }
    async function remove(id) {
      const removingCurrent = (tracks[index] || {}).id === id;
      await api.audio.remove(id);
      if (removingCurrent) stop('');
      refresh(removingCurrent ? null : undefined);
    }
    async function report(res) {
      setStatus(res.skipped ? `${res.added.length} adicionada(s); ${res.skipped} ignorada(s) (outro tipo, repetida ou fora do limite).` : '');
      await refresh();
    }

    $('btn-audio-add').addEventListener('click', async () => report(await api.audio.add()));
    $('btn-audio-toggle').addEventListener('click', toggle);
    $('btn-audio-next').addEventListener('click', next);
    $('btn-audio-prev').addEventListener('click', () => { const j = prevIndex(index, tracks.length); if (j >= 0) play(j); });
    $('btn-audio-fade').addEventListener('click', fadeOut);

    // Arquivos soltos sobre a seção.
    const fold = document.querySelector('details[data-key="audio"]');
    fold.addEventListener('dragover', (e) => { e.preventDefault(); fold.classList.add('file-over'); });
    fold.addEventListener('dragleave', () => fold.classList.remove('file-over'));
    fold.addEventListener('drop', async (e) => {
      e.preventDefault();
      fold.classList.remove('file-over');
      if (e.dataTransfer && e.dataTransfer.files.length) report(await api.audio.addFiles([...e.dataTransfer.files]));
    });

    // ---------- Ajustes ----------
    $('audio-volume').value = String(Math.round(volume * PERCENT));
    $('audio-volume').addEventListener('input', (e) => {
      volume = clampVolume(Number(e.target.value) / PERCENT);
      saveSetting(KEYS.volume, volume);
      if (fadeTimer === null) player.volume = volume;
    });
    $('audio-fade-auto').checked = readSetting(KEYS.fade, '1') !== '0';
    $('audio-fade-auto').addEventListener('change', (e) => saveSetting(KEYS.fade, e.target.checked ? '1' : '0'));
    $('audio-loop').checked = readSetting(KEYS.loop, '1') !== '0';
    $('audio-loop').addEventListener('change', (e) => saveSetting(KEYS.loop, e.target.checked ? '1' : '0'));
    player.volume = volume;

    return {
      async load() {
        await refresh(null);
      },
      // Entrou o primeiro slide ou vídeo ao vivo: baixa a música de fundo (se ligada e tocando).
      render(next) {
        if ($('audio-fade-auto').checked && enteredLive(state, next) && !player.paused && fadeTimer === null) fadeOut();
        state = next;
      },
      // Comandos OSC (/xpresenter/audio/toggle|next|fade) chegam pelo operador.
      command(name) {
        if (name === 'audio/toggle') toggle();
        else if (name === 'audio/next') next();
        else if (name === 'audio/fade') fadeOut();
      },
    };
  }

  root.initAudioPanel = initAudioPanel;
}(window));
