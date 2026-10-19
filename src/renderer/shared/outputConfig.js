// Saídas de projeção: perfil de conteúdo por monitor, panorâmico (recorte em N telas) e edge blending.
// Funções puras, usadas no processo principal (plano de janelas), na janela de saída e nos testes.
(function defineOutputConfig(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.outputConfig = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  // full: tudo; lyrics: só letra/legenda sobre preto (laterais, tela da banda); background: só fundo e mídia (ambiente).
  const PROFILES = ['full', 'lyrics', 'background'];
  const SPAN_MIN = 2;
  const SPAN_MAX = 4;
  const OVERLAP_MAX = 0.3;
  const BLEND_STEPS = 10;
  const NO_BLEND = Object.freeze({ left: 0, right: 0 });
  const FULL_REGION = Object.freeze({ x: 0, w: 1 });

  const clamp = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

  // Tela `index` (0..count-1) de um panorâmico de `count` projetores que se sobrepõem `overlap` (fração da largura
  // de um projetor). O quadro virtual tem count - (count - 1) * overlap larguras de projetor.
  function spanGeometry(index, count, overlap) {
    if (count < 2) return { region: { ...FULL_REGION }, blend: { ...NO_BLEND } };
    const total = count - (count - 1) * overlap;
    return {
      region: { x: (index * (1 - overlap)) / total, w: 1 / total },
      blend: { left: index > 0 ? overlap : 0, right: index < count - 1 ? overlap : 0 },
    };
  }

  // Rampa da máscara preta na sobreposição: em `at` (0 = borda de fora, 1 = fim da sobreposição) a luz do projetor
  // é linear (as duas somam 1); a opacidade compensa a gama do projetor.
  function blendStops(gamma = 2.2) {
    return Array.from({ length: BLEND_STEPS + 1 }, (_, i) => {
      const at = i / BLEND_STEPS;
      return { at, alpha: Math.round((1 - at ** (1 / gamma)) * 1000) / 1000 };
    });
  }

  function sanitizeConfig(raw, displays) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const spanCount = Math.round(clamp(Number(src.spanCount), SPAN_MIN, SPAN_MAX, SPAN_MIN));
    const overlap = Math.round(clamp(Number(src.overlap), 0, OVERLAP_MAX, 0) * 100) / 100;
    const known = new Set((displays || []).map((d) => d.id));
    const seen = new Set();
    const screens = (Array.isArray(src.screens) ? src.screens : []).flatMap((s) => {
      if (!s || typeof s !== 'object' || !known.has(s.displayId) || seen.has(s.displayId)) return [];
      seen.add(s.displayId);
      const span = Number.isInteger(s.span) && s.span >= 1 && s.span <= spanCount ? s.span : 0;
      return [{ displayId: s.displayId, enabled: s.enabled === true, profile: PROFILES.includes(s.profile) ? s.profile : 'full', span }];
    });
    return { screens, spanCount, overlap };
  }

  // Lista de janelas a abrir. Sem configuração ativa: uma saída completa por monitor externo
  // (ou uma janela, se só houver um monitor). O som fica com a primeira saída que mostra mídia.
  function planOutputs(config, displays) {
    const byId = new Map(displays.map((d) => [d.id, d]));
    const enabled = config.screens.filter((s) => s.enabled && byId.has(s.displayId));
    let plan;
    if (enabled.length) {
      plan = enabled.map((s) => ({
        displayId: s.displayId,
        bounds: byId.get(s.displayId).bounds,
        profile: s.profile,
        ...(s.span ? spanGeometry(s.span - 1, config.spanCount, config.overlap) : { region: { ...FULL_REGION }, blend: { ...NO_BLEND } }),
      }));
    } else {
      const externals = displays.filter((d) => !d.primary);
      plan = externals.length
        ? externals.map((d) => ({ displayId: d.id, bounds: d.bounds, profile: 'full', region: { ...FULL_REGION }, blend: { ...NO_BLEND } }))
        : [{ displayId: null, bounds: null, profile: 'full', region: { ...FULL_REGION }, blend: { ...NO_BLEND } }];
    }
    const audioIndex = Math.max(0, plan.findIndex((p) => p.profile !== 'lyrics'));
    return plan.map((p, i) => ({ ...p, audio: i === audioIndex }));
  }

  // Estado visto por uma saída com esse perfil (não muta o original).
  function applyProfile(state, profile) {
    if (profile === 'lyrics') {
      return { ...state, layers: { ...state.layers, background: { kind: 'color', value: '#000000' }, media: null } };
    }
    if (profile === 'background') {
      return {
        ...state,
        layers: { ...state.layers, content: { slide: null }, announcement: { text: null } },
        textStyle: { ...state.textStyle, caption: '' },
        timer: state.timer ? { ...state.timer, visible: false } : state.timer,
      };
    }
    return state;
  }

  return { PROFILES, SPAN_MIN, SPAN_MAX, OVERLAP_MAX, spanGeometry, blendStops, sanitizeConfig, planOutputs, applyProfile };
}));
