const test = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { extractPptxSlides, LIMITS } = require('../src/core/pptxText');

const slideXml = (...paragraphs) => `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${
  paragraphs.map((runs) => `<p:sp><p:txBody><a:p>${runs.map((t) => `<a:r><a:t>${t}</a:t></a:r>`).join('')}</a:p></p:txBody></p:sp>`).join('')
}</p:spTree></p:cSld></p:sld>`;

const pptx = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));

test('extrai o texto de cada slide na ordem numérica, um parágrafo por linha', () => {
  const buf = pptx({
    'ppt/slides/slide10.xml': slideXml(['Décimo']),
    'ppt/slides/slide2.xml': slideXml(['Bem-vindos'], ['Culto às ', '19h']),
    'ppt/slides/slide1.xml': slideXml(['Avisos da semana']),
    'ppt/slides/_rels/slide1.xml.rels': '<x/>',
    'docProps/app.xml': '<x/>',
  });
  const slides = extractPptxSlides(buf);
  assert.deepEqual(slides.map((s) => s.number), [1, 2, 10]);
  assert.equal(slides[1].text, 'Bem-vindos\nCulto às 19h');
});

test('decodifica entidades XML e ignora slides sem texto', () => {
  const buf = pptx({
    'ppt/slides/slide1.xml': slideXml(['Pão &amp; vinho &lt;3 &quot;ok&quot; &#233;']),
    'ppt/slides/slide2.xml': slideXml([]),
  });
  const slides = extractPptxSlides(buf);
  assert.equal(slides.length, 1);
  assert.equal(slides[0].text, 'Pão & vinho <3 "ok" é');
});

test('slide malicioso com muitos <a:t> sem fechamento é processado em tempo linear', () => {
  const evil = `<p:sld><a:p>${'<a:t>x'.repeat(200000)}</a:p></p:sld>`;
  const start = Date.now();
  extractPptxSlides(pptx({ 'ppt/slides/slide1.xml': evil, 'ppt/slides/slide2.xml': slideXml(['ok']) }));
  assert.ok(Date.now() - start < 1000, `levou ${Date.now() - start} ms`);
});

test('recusa arquivo que não é PPTX e protege contra bomba de descompressão', () => {
  assert.throws(() => extractPptxSlides(Buffer.from('não é zip')), /PPTX/i);
  assert.throws(() => extractPptxSlides(pptx({ 'word/document.xml': '<x/>' })), /nenhum slide/i);
  const huge = 'x'.repeat(LIMITS.MAX_SLIDE_XML_BYTES + 1);
  assert.throws(() => extractPptxSlides(pptx({ 'ppt/slides/slide1.xml': huge })), /grande/i);
});
