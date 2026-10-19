/* global window */
(function exposeStage(root) {
  const FONT_MAX = 11;
  const FONT_MIN = 3;
  const FIT_STEPS = 8;
  const CONTENT_FILL = 0.8;
  const TICK_MS = 250;
  const GHOST_GRACE_MS = 80;
  const { fillTemplate, formatTimer, timerValueMs, isTimerInUse } = root.liveInfo;

  function el(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  // Maior fonte (em cqh) em que o texto ainda cabe na área disponível. `scale` vem do tamanho do tema (50–150%).
  function fitText(textEl, container, scale = 1) {
    let lo = FONT_MIN * Math.min(scale, 1);
    let hi = FONT_MAX * scale;
    for (let i = 0; i < FIT_STEPS; i += 1) {
      const mid = (lo + hi) / 2;
      textEl.style.fontSize = `${mid}cqh`;
      const fits = textEl.scrollHeight <= container.clientHeight * CONTENT_FILL && textEl.scrollWidth <= container.clientWidth;
      if (fits) lo = mid; else hi = mid;
    }
    textEl.style.fontSize = `${lo}cqh`;
  }

  function setBackground(bgEl, bg) {
    bgEl.replaceChildren();
    bgEl.style.backgroundImage = '';
    bgEl.style.backgroundColor = '#000';
    if (bg.kind === 'image') {
      bgEl.style.backgroundImage = `url("${bg.value}")`;
    } else if (bg.kind === 'video') {
      const video = document.createElement('video');
      Object.assign(video, { src: bg.value, autoplay: true, loop: true, muted: true });
      bgEl.appendChild(video);
    } else {
      bgEl.style.backgroundColor = bg.value;
    }
  }

  // Estilo vem validado do núcleo (chaves, hex e números); aqui vira atributos/variável CSS, nunca CSS livre.
  function applyTextStyle(stage, style) {
    stage.dataset.font = style.font;
    stage.dataset.align = style.align;
    stage.dataset.position = style.position;
    stage.dataset.caption = style.captionPosition;
    stage.style.setProperty('--text-color', style.color);
    stage.style.setProperty('--fade', style.transition === 'cut' ? '0ms' : `${style.transitionMs}ms`);
    stage.classList.toggle('upper', style.uppercase);
    stage.classList.toggle('no-shadow', !style.shadow);
    stage.classList.toggle('no-label', !style.showLabel);
  }

  const FALLBACK_STYLE = {
    font: 'sans', color: '#ffffff', size: 100, align: 'center', position: 'middle', uppercase: false, shadow: true,
    showLabel: true, transition: 'fade', transitionMs: 400, caption: '', captionPosition: 'top-right',
  };

  const pad = (n) => String(n).padStart(2, '0');

  // Crossfade: uma cópia do slide anterior some enquanto o novo aparece.
  function crossfade(content, ms) {
    const ghost = content.cloneNode(true);
    ghost.classList.add('ghost');
    content.after(ghost);
    content.classList.add('entering');
    void content.offsetWidth; // aplica o estado inicial antes de animar
    content.classList.remove('entering');
    ghost.classList.add('hidden');
    setTimeout(() => ghost.remove(), ms + GHOST_GRACE_MS);
  }

  // Monta as camadas dentro de `container` e devolve { update(state) }.
  // `now` permite usar o relógio do servidor (retorno em outro aparelho); na projeção é o relógio local.
  // Vídeo/imagem como item do culto. Recria só quando muda o arquivo ou o pedido de reinício (seq).
  function renderMedia(layer, media, audio, last) {
    const key = media ? `${media.kind}|${media.value}|${media.seq}` : '';
    if (key !== last.key) {
      last.key = key;
      layer.replaceChildren();
      layer.style.backgroundImage = '';
      if (media && media.kind === 'image') layer.style.backgroundImage = `url("${media.value}")`;
      if (media && media.kind === 'video') {
        const video = document.createElement('video');
        Object.assign(video, { src: media.value, loop: media.loop, muted: !audio, playsInline: true });
        layer.appendChild(video);
      }
    }
    layer.classList.toggle('visible', Boolean(media));
    const video = layer.querySelector('video');
    if (!video) return;
    if (media.playing && video.paused && !video.ended) {
      video.play().catch((err) => console.warn(`[mídia] não foi possível tocar ${media.title || media.value}: ${err.message}`));
    }
    if (!media.playing && !video.paused) video.pause();
  }

  function createStage(container, { now = () => Date.now(), audio = false } = {}) {
    const stage = el('div', 'stage');
    const mediaState = { key: '' };
    const layers = {
      bg: el('div', 'layer bg'),
      media: el('div', 'layer media'),
      content: el('div', 'layer content hidden'),
      caption: el('div', 'layer caption'),
      cover: el('div', 'layer cover'),
      timer: el('div', 'layer timer'),
      announcement: el('div', 'layer announcement'),
      blackout: el('div', 'layer blackout'),
    };
    const label = el('div', 'label');
    const text = el('div', 'text');
    const picture = el('img', 'slide-image'); // página de PDF importada
    picture.alt = '';
    const captionText = el('span', 'caption-text');
    const timerText = el('span', 'timer-text');
    layers.content.append(label, text, picture);
    layers.caption.append(captionText);
    layers.timer.append(timerText);
    stage.append(...Object.values(layers));
    container.replaceChildren(stage);

    let lastBg = '';
    let lastFit = '';
    let lastText = '';
    let lastStyle = '';
    let lastState = null;

    // Legenda e cronômetro mudam com o tempo: atualizados também pelo relógio, não só pelo estado.
    function renderLive() {
      if (!lastState) return;
      const t = now();
      const { timer } = lastState;
      const slide = lastState.layers.content.slide;
      const timerMs = timerValueMs(timer, t);
      const date = new Date(t);
      const style = lastState.textStyle || FALLBACK_STYLE;
      captionText.textContent = fillTemplate(style.caption, {
        titulo: slide && slide.title,
        rotulo: slide && slide.label,
        hora: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
        data: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`,
        cronometro: isTimerInUse(timer) ? formatTimer(timerMs) : '',
      });
      layers.caption.classList.toggle('visible', Boolean(captionText.textContent));

      const showTimer = Boolean(timer && timer.visible);
      layers.timer.classList.toggle('visible', showTimer);
      if (!showTimer) return;
      timerText.textContent = formatTimer(timerMs);
      layers.timer.classList.toggle('over', timer.mode === 'countdown' && timerMs <= 0 && isTimerInUse(timer));
      // Com letra na tela, o cronômetro vai para o canto; sem letra, ocupa o centro (ex.: contagem antes do culto).
      const lyricsOnScreen = Boolean(slide) && !lastState.layers.content.hidden;
      layers.timer.classList.toggle('corner', lyricsOnScreen);
    }
    setInterval(renderLive, TICK_MS);

    return {
      update(state) {
        const { background, content, cover, announcement } = state.layers;
        // Só recria o fundo (e reinicia um vídeo) quando o arquivo/cor muda; ocultar e escurecer não.
        const bgKey = `${background.kind}|${background.value}`;
        if (bgKey !== lastBg) {
          lastBg = bgKey;
          setBackground(layers.bg, background);
        }
        layers.bg.classList.toggle('off', Boolean(background.hidden));
        layers.bg.style.setProperty('--bg-dim', String((background.dim || 0) / 100));
        renderMedia(layers.media, state.layers.media || null, audio, mediaState);

        const style = state.textStyle || FALLBACK_STYLE;
        const styleKey = JSON.stringify(style);
        if (styleKey !== lastStyle) {
          lastStyle = styleKey;
          applyTextStyle(stage, style);
        }

        const slide = content.slide;
        const wasVisible = !layers.content.classList.contains('hidden');
        const visible = Boolean(slide) && !content.hidden;
        const textKey = slide ? `${slide.label}|${slide.text}|${slide.image || ''}` : '';
        // Troca de slide com os dois visíveis: crossfade. Aparecer/sumir usa a transição da própria camada.
        if (slide && textKey !== lastText && wasVisible && visible && style.transition === 'fade' && lastText) {
          crossfade(layers.content, style.transitionMs);
        }
        layers.content.classList.toggle('hidden', !visible);
        // O encaixe depende do texto, do tamanho do palco e do estilo (fonte, maiúsculas, tamanho, rótulo).
        const fitKey = slide ? `${textKey}|${container.clientWidth}x${container.clientHeight}|${styleKey}` : '';
        if (slide && fitKey !== lastFit) {
          lastFit = fitKey;
          layers.content.classList.toggle('has-image', Boolean(slide.image));
          if (slide.image) {
            picture.src = slide.image;
          } else {
            picture.removeAttribute('src');
            label.textContent = slide.label || '';
            text.textContent = slide.text;
            fitText(text, layers.content, style.size / 100);
          }
        }
        if (slide) lastText = textKey;

        layers.cover.classList.toggle('visible', cover.visible);
        layers.announcement.textContent = announcement.text || '';
        layers.announcement.classList.toggle('visible', Boolean(announcement.text) && !announcement.hidden);
        layers.blackout.classList.toggle('visible', state.blackout);

        lastState = state;
        renderLive();
      },
      // Para a barra de progresso do operador (o Programa toca o mesmo vídeo, sem som).
      mediaVideo: () => layers.media.querySelector('video'),
    };
  }

  root.createStage = createStage;
}(window));
