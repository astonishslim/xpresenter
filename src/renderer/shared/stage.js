/* global window */
(function exposeStage(root) {
  const FONT_MAX = 11;
  const FONT_MIN = 3;
  const FIT_STEPS = 8;
  const CONTENT_FILL = 0.8;

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

  // Estilo vem validado do núcleo (chaves e hex); aqui vira atributos/variável CSS, nunca CSS livre.
  function applyTextStyle(stage, style) {
    stage.dataset.font = style.font;
    stage.dataset.align = style.align;
    stage.dataset.position = style.position;
    stage.style.setProperty('--text-color', style.color);
    stage.classList.toggle('upper', style.uppercase);
    stage.classList.toggle('no-shadow', !style.shadow);
    stage.classList.toggle('no-label', !style.showLabel);
  }

  const FALLBACK_STYLE = { font: 'sans', color: '#ffffff', size: 100, align: 'center', position: 'middle', uppercase: false, shadow: true, showLabel: true };

  // Monta as 5 camadas dentro de `container` e devolve { update(state) }.
  function createStage(container) {
    const stage = el('div', 'stage');
    const layers = {
      bg: el('div', 'layer bg'),
      content: el('div', 'layer content hidden'),
      cover: el('div', 'layer cover'),
      announcement: el('div', 'layer announcement'),
      blackout: el('div', 'layer blackout'),
    };
    const label = el('div', 'label');
    const text = el('div', 'text');
    layers.content.append(label, text);
    stage.append(...Object.values(layers));
    container.replaceChildren(stage);

    let lastBg = '';
    let lastSlide = '';
    let lastStyle = '';

    return {
      update(state) {
        const { background, content, cover, announcement } = state.layers;
        const bgKey = JSON.stringify(background);
        if (bgKey !== lastBg) {
          lastBg = bgKey;
          setBackground(layers.bg, background);
        }

        const style = state.textStyle || FALLBACK_STYLE;
        const styleKey = JSON.stringify(style);
        if (styleKey !== lastStyle) {
          lastStyle = styleKey;
          applyTextStyle(stage, style);
        }

        // O encaixe depende do texto, do tamanho do palco e do estilo (fonte, maiúsculas, tamanho, rótulo).
        const slide = content.slide;
        layers.content.classList.toggle('hidden', !slide);
        const slideKey = slide ? `${slide.label}|${slide.text}|${container.clientWidth}x${container.clientHeight}|${styleKey}` : '';
        if (slide && slideKey !== lastSlide) {
          lastSlide = slideKey;
          label.textContent = slide.label || '';
          text.textContent = slide.text;
          fitText(text, layers.content, style.size / 100);
        }

        layers.cover.classList.toggle('visible', cover.visible);
        layers.announcement.textContent = announcement.text || '';
        layers.announcement.classList.toggle('visible', Boolean(announcement.text));
        layers.blackout.classList.toggle('visible', state.blackout);
      },
    };
  }

  root.createStage = createStage;
}(window));
