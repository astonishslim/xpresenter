/* global window */
// Biblioteca de mídia: miniaturas de imagens e vídeos; clique usa como fundo, ▶ põe em tela cheia ao vivo,
// e o vídeo/imagem pode entrar no culto como item próprio. Também cuida da barra do vídeo sob o Programa.
(function exposeMediaPanel(root) {
  const $ = (id) => document.getElementById(id);
  const PROGRESS_TICK_MS = 250;
  const KIND_LABEL = { image: 'Imagem', video: 'Vídeo' };

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    });
    node.append(...children);
    return node;
  }

  const iconButton = (name, label, onclick) => el('button', { class: 'mini', type: 'button', title: label, 'aria-label': label, onclick },
    root.icons.create(name, 12));

  // Slide que representa a mídia no culto/Slides: o goLive manda showMedia em vez de showSlide.
  const mediaSlide = (m) => ({ label: KIND_LABEL[m.kind], text: m.name, media: { kind: m.kind, value: m.url, title: m.name } });

  const formatTime = (s) => {
    const total = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  };

  function thumb(m) {
    if (m.missing) return el('div', { class: 'thumb missing' }, 'arquivo não encontrado');
    if (m.kind === 'image') return el('img', { class: 'thumb', src: m.url, alt: '', loading: 'lazy' });
    // preload=metadata mostra o primeiro quadro sem baixar o vídeo inteiro
    return el('video', { class: 'thumb', src: `${m.url}#t=0.5`, preload: 'metadata', muted: '' });
  }

  function initMediaPanel({ api, addToPlaylist, getProgramVideo }) {
    let items = [];
    const setMessage = (text) => { $('media-msg').textContent = text; };

    const render = () => {
      $('media-grid').replaceChildren(...items.map((m) => el('div', {
        class: `media-card${m.missing ? ' is-missing' : ''}`,
        title: m.missing ? `${m.name} (arquivo não encontrado)` : `${m.name}: clique para usar de fundo`,
      },
      el('button', {
        class: 'media-pick', type: 'button', 'aria-label': `Usar ${m.name} como fundo`,
        onclick: () => !m.missing && api.dispatch({ type: 'setBackground', background: { kind: m.kind, value: m.url } })
          .catch(() => { setMessage(`Arquivo não encontrado: ${m.name}.`); refresh(); }),
      }, thumb(m), el('span', { class: 'media-name' }, m.kind === 'video' ? root.icons.create('film', 10) : '', m.name)),
      el('div', { class: 'media-actions' },
        iconButton('circle-play', 'Mostrar agora em tela cheia (com som, se for vídeo)', () => !m.missing
          && api.dispatch({ type: 'showMedia', media: mediaSlide(m).media }).catch(() => { setMessage(`Arquivo não encontrado: ${m.name}.`); refresh(); })),
        iconButton('list-plus', 'Adicionar ao culto', () => addToPlaylist({ kind: 'media', refId: m.id, title: m.name, slides: [mediaSlide(m)] })),
        iconButton('x', 'Tirar da biblioteca (o arquivo continua no disco)', async () => { await api.media.remove(m.id); refresh(); })))));
    };

    async function refresh() {
      items = await api.media.list();
      render();
    }

    const report = (res) => {
      if (res.added.length) setMessage(`${res.added.length} adicionado(s).${res.skipped ? ` ${res.skipped} ignorado(s) (tipo não suportado, repetido ou limite).` : ''}`);
      else if (res.skipped) setMessage('Nada adicionado: tipo não suportado, repetido ou limite atingido.');
      refresh();
    };

    $('btn-media-add').addEventListener('click', async () => report(await api.media.add()));

    const zone = document.querySelector('details.fold[data-key="media"]');
    zone.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      zone.classList.add('drop-target');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drop-target'));
    zone.addEventListener('drop', async (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      zone.classList.remove('drop-target');
      report(await api.media.addFiles([...e.dataTransfer.files]));
    });

    // ---------- Barra do vídeo ao vivo (sob o Programa) ----------
    let liveMedia = null;
    $('btn-media-play').addEventListener('click', () => liveMedia
      && api.dispatch({ type: 'mediaControl', command: liveMedia.playing ? 'pause' : 'play' }));
    $('btn-media-restart').addEventListener('click', () => api.dispatch({ type: 'mediaControl', command: 'restart' }));
    setInterval(() => {
      const video = getProgramVideo();
      if (!liveMedia || !video || !video.duration) return;
      $('media-progress').value = video.currentTime / video.duration;
      $('media-time').textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }, PROGRESS_TICK_MS);

    return {
      refresh,
      renderLive(state) {
        liveMedia = state.layers.media;
        const isVideo = Boolean(liveMedia && liveMedia.kind === 'video');
        $('media-bar').hidden = !isVideo;
        if (!isVideo) return;
        const label = liveMedia.playing ? 'Pausar vídeo' : 'Tocar vídeo';
        const btn = $('btn-media-play');
        btn.title = label;
        btn.setAttribute('aria-label', label);
        if (btn.dataset.icon !== (liveMedia.playing ? 'pause' : 'play')) root.icons.setIcon(btn, liveMedia.playing ? 'pause' : 'play');
      },
    };
  }

  root.initMediaPanel = initMediaPanel;
}(window));
