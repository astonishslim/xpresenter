// Importar apresentação para o culto: PDF (cada página vira uma imagem 1920 px) ou PPTX (texto de cada slide).
// O pdf.js roda aqui, no operador; as páginas prontas vão em PNG para o processo principal gravar.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const STANDARD_FONTS = new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href;
const PAGE_WIDTH_PX = 1920;

const $ = (id) => document.getElementById(id);

async function renderPage(doc, number) {
  const page = await doc.getPage(number);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: PAGE_WIDTH_PX / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

async function importPdf(api, picked, report) {
  const task = pdfjs.getDocument({ data: picked.bytes, isEvalSupported: false, standardFontDataUrl: STANDARD_FONTS });
  const doc = await task.promise;
  const total = Math.min(doc.numPages, 300);
  const slides = [];
  try {
    for (let n = 1; n <= total; n += 1) {
      report(`Importando "${picked.name}": página ${n} de ${total}…`);
      const saved = await api.imports.savePage(picked.importId, n - 1, await renderPage(doc, n));
      if (!saved.ok) throw new Error(saved.reason);
      slides.push({ index: n - 1, label: `Página ${n}`, text: '', image: saved.url });
    }
  } finally {
    await task.destroy(); // libera o worker e a memória do documento
  }
  const truncated = doc.numPages > total ? ` (só as primeiras ${total} de ${doc.numPages} páginas)` : '';
  return { item: { kind: 'pdf', title: picked.name, importId: picked.importId, slides }, note: truncated };
}

const pptxItem = (picked) => ({
  item: {
    kind: 'pptx',
    title: picked.name,
    slides: picked.slides.map((s, i) => ({ index: i, label: `Slide ${s.number}`, text: s.text })),
  },
  note: ' Só o texto foi importado; para manter o visual, exporte como PDF no PowerPoint.',
});

// Devolve { ok, item } pronto para entrar no culto, ou { ok: false, reason }.
async function importPresentation(api, report = () => {}) {
  const picked = await api.imports.pick();
  if (!picked.ok) return picked;
  if (picked.kind === 'pptx') {
    if (!picked.slides.length) return { ok: false, reason: 'O PPTX não tem texto nos slides. Exporte como PDF.' };
    return { ok: true, ...pptxItem(picked) };
  }
  try {
    return { ok: true, ...(await importPdf(api, picked, report)) };
  } catch (err) {
    await api.imports.discard(picked.importId);
    console.error(`[importar] ${err.message}`);
    return { ok: false, reason: `Não foi possível ler o PDF (${err.message}).` };
  }
}

function bindImport({ api, onImported }) {
  const button = $('btn-import-presentation');
  const report = (text) => { $('import-msg').textContent = text; };
  button.addEventListener('click', async () => {
    button.disabled = true;
    report('Escolha o arquivo…');
    try {
      const res = await importPresentation(api, report);
      if (!res.ok) { report(res.reason === 'cancelado' ? '' : res.reason); return; }
      await onImported(res.item);
      report(`"${res.item.title}" entrou no culto com ${res.item.slides.length} slide(s).${res.note}`);
    } finally {
      button.disabled = false;
    }
  });
}

window.bindImport = bindImport;
window.dispatchEvent(new Event('import-panel-ready'));
