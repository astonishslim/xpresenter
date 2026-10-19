const test = require('node:test');
const assert = require('node:assert/strict');
const { PROFILES, sanitizeConfig, spanGeometry, planOutputs, blendStops, applyProfile } = require('../src/core/outputConfig');
const { initialState, reduce } = require('../src/core/state');

const displays = [
  { id: 1, primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: 2, primary: false, bounds: { x: 1920, y: 0, width: 1920, height: 1080 } },
  { id: 3, primary: false, bounds: { x: 3840, y: 0, width: 1920, height: 1080 } },
];

test('spanGeometry: telas lado a lado sem sobreposição dividem o quadro em partes iguais', () => {
  assert.deepEqual(spanGeometry(0, 2, 0), { region: { x: 0, w: 0.5 }, blend: { left: 0, right: 0 } });
  assert.deepEqual(spanGeometry(1, 2, 0), { region: { x: 0.5, w: 0.5 }, blend: { left: 0, right: 0 } });
  assert.deepEqual(spanGeometry(0, 1, 0.2), { region: { x: 0, w: 1 }, blend: { left: 0, right: 0 } });
});

test('spanGeometry: com sobreposição, as regiões se cruzam e as bordas internas ganham rampa', () => {
  const a = spanGeometry(0, 2, 0.2);
  const b = spanGeometry(1, 2, 0.2);
  // quadro virtual = 2 - 0.2 = 1.8 larguras de projetor
  assert.ok(Math.abs(a.region.w - 1 / 1.8) < 1e-9);
  assert.ok(Math.abs(b.region.x - 0.8 / 1.8) < 1e-9);
  assert.ok(a.region.x + a.region.w > b.region.x, 'as duas regiões se sobrepõem');
  assert.deepEqual(a.blend, { left: 0, right: 0.2 });
  assert.deepEqual(b.blend, { left: 0.2, right: 0 });
  const mid = spanGeometry(1, 3, 0.1);
  assert.deepEqual(mid.blend, { left: 0.1, right: 0.1 });
});

test('blendStops: rampa de 0 (preto) a 1 (transparente) corrigida por gama', () => {
  const stops = blendStops(2.2);
  assert.equal(stops[0].alpha, 1);
  assert.equal(stops[stops.length - 1].alpha, 0);
  for (let i = 1; i < stops.length; i += 1) assert.ok(stops[i].alpha <= stops[i - 1].alpha, 'monótona');
  // no meio da sobreposição cada projetor dá metade da luz: luz = (1 - alpha)^gama ≈ 0.5
  const middle = stops.find((s) => s.at === 0.5);
  assert.ok(Math.abs((1 - middle.alpha) ** 2.2 - 0.5) < 0.01);
});

test('sanitizeConfig: só monitores existentes, perfis conhecidos e números dentro do limite', () => {
  const cfg = sanitizeConfig({
    screens: [
      { displayId: 2, enabled: true, profile: 'lyrics', span: 1 },
      { displayId: 3, enabled: true, profile: 'hack', span: 2 },
      { displayId: 99, enabled: true, profile: 'full', span: 1 },
      { displayId: 2, enabled: false, profile: 'full', span: 0 },
      'lixo',
    ],
    spanCount: 7,
    overlap: 0.9,
  }, displays);
  assert.deepEqual(cfg.screens.map((s) => [s.displayId, s.profile, s.span]), [[2, 'lyrics', 1], [3, 'full', 2]]);
  assert.equal(cfg.spanCount, 4);
  assert.equal(cfg.overlap, 0.3);
  assert.deepEqual(sanitizeConfig(null, displays), { screens: [], spanCount: 2, overlap: 0 });
  assert.ok(PROFILES.includes('background'));
});

test('planOutputs: sem configuração, uma saída completa por monitor externo; som só na primeira', () => {
  const plan = planOutputs(sanitizeConfig(null, displays), displays);
  assert.deepEqual(plan.map((p) => [p.displayId, p.profile, p.audio]), [[2, 'full', true], [3, 'full', false]]);
  assert.deepEqual(plan[0].region, { x: 0, w: 1 });
});

test('planOutputs: só um monitor → uma saída em janela', () => {
  const plan = planOutputs(sanitizeConfig(null, [displays[0]]), [displays[0]]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].displayId, null);
});

test('planOutputs: configuração com perfis e panorâmico de 2 telas com sobreposição', () => {
  const cfg = sanitizeConfig({
    screens: [
      { displayId: 2, enabled: true, profile: 'full', span: 1 },
      { displayId: 3, enabled: true, profile: 'full', span: 2 },
      { displayId: 1, enabled: false, profile: 'lyrics', span: 0 },
    ],
    spanCount: 2,
    overlap: 0.15,
  }, displays);
  const plan = planOutputs(cfg, displays);
  assert.deepEqual(plan.map((p) => p.displayId), [2, 3]);
  assert.deepEqual(plan[0].blend, { left: 0, right: 0.15 });
  assert.deepEqual(plan[1].blend, { left: 0.15, right: 0 });
  assert.deepEqual(plan.map((p) => p.audio), [true, false]);
});

test('planOutputs: monitor só com letra não leva o som se houver outro que mostre mídia', () => {
  const cfg = sanitizeConfig({ screens: [{ displayId: 2, enabled: true, profile: 'lyrics' }, { displayId: 3, enabled: true, profile: 'full' }] }, displays);
  assert.deepEqual(planOutputs(cfg, displays).map((p) => p.audio), [false, true]);
});

test('applyProfile: só letra tira fundo e mídia; só fundo tira letra, legenda, aviso e cronômetro', () => {
  let s = reduce(initialState(), { type: 'setBackground', background: { kind: 'image', value: 'file:///C:/a.png' } });
  s = reduce(s, { type: 'showSlide', slide: { text: 'Aleluia' } });
  s = reduce(s, { type: 'setAnnouncement', text: 'Aviso' });
  s = reduce(s, { type: 'timerVisible' });
  assert.equal(applyProfile(s, 'full'), s);
  const lyrics = applyProfile(s, 'lyrics');
  assert.deepEqual(lyrics.layers.background, { kind: 'color', value: '#000000' });
  assert.equal(lyrics.layers.content.slide.text, 'Aleluia');
  const bg = applyProfile(s, 'background');
  assert.equal(bg.layers.content.slide, null);
  assert.equal(bg.layers.announcement.text, null);
  assert.equal(bg.timer.visible, false);
  assert.equal(bg.textStyle.caption, '');
  assert.equal(bg.layers.background.value, 'file:///C:/a.png');
  assert.equal(s.layers.content.slide.text, 'Aleluia', 'não muta o original');
});
