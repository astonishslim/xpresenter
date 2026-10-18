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

  // Maior fonte (em cqh) em que o texto ainda cabe na área disponível.
  function fitText(textEl, container) {
    let lo = FONT_MIN;
    let hi = FONT_MAX;
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

    return {
      update(state) {
        const { background, content, cover, announcement } = state.layers;
        const bgKey = JSON.stringify(background);
        if (bgKey !== lastBg) {
          lastBg = bgKey;
          setBackground(layers.bg, background);
        }

        const slide = content.slide;
        layers.content.classList.toggle('hidden', !slide);
        const slideKey = slide ? `${slide.label}|${slide.text}|${container.clientWidth}x${container.clientHeight}` : '';
        if (slide && slideKey !== lastSlide) {
          lastSlide = slideKey;
          label.textContent = slide.label || '';
          text.textContent = slide.text;
          fitText(text, layers.content);
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
