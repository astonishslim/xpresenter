// Texto dos slides de um PPTX (um ZIP de XMLs). Só o texto: para manter o visual, exporte como PDF.
// O arquivo vem do usuário: limites contra bomba de descompressão e nenhuma interpretação além de <a:t>/<a:p>.
const { unzipSync } = require('fflate');

const LIMITS = {
  MAX_FILE_BYTES: 200 * 1024 * 1024,
  MAX_SLIDES: 500,
  MAX_SLIDE_XML_BYTES: 5 * 1024 * 1024,
  MAX_TOTAL_XML_BYTES: 100 * 1024 * 1024,
};
const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return Object.hasOwn(ENTITIES, code) ? ENTITIES[code] : whole;
  });
}

// Um parágrafo (<a:p>) por linha; os trechos (<a:t>) de um parágrafo são juntados.
function slideText(xml) {
  const paragraphs = xml.split(/<a:p[\s>]/).slice(1).map((p) => {
    const runs = [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    return runs.join('').replace(/\s+/g, ' ').trim();
  });
  return paragraphs.filter(Boolean).join('\n');
}

function unzipSlides(buffer) {
  let total = 0;
  try {
    return unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        if (!SLIDE_PATH.test(file.name)) return false;
        if (file.originalSize > LIMITS.MAX_SLIDE_XML_BYTES) throw new Error('slide grande demais');
        total += file.originalSize;
        if (total > LIMITS.MAX_TOTAL_XML_BYTES) throw new Error('conteúdo grande demais');
        return true;
      },
    });
  } catch (err) {
    if (/grande demais/.test(err.message)) throw new Error(`Arquivo PPTX com ${err.message}.`);
    throw new Error('O arquivo não é um PPTX válido.');
  }
}

function extractPptxSlides(buffer) {
  if (!buffer || buffer.length > LIMITS.MAX_FILE_BYTES) throw new Error('Arquivo PPTX grande demais (máximo 200 MB).');
  const files = unzipSlides(buffer);
  const entries = Object.entries(files)
    .map(([name, data]) => ({ number: Number(name.match(SLIDE_PATH)[1]), data }))
    .sort((a, b) => a.number - b.number)
    .slice(0, LIMITS.MAX_SLIDES);
  if (!entries.length) throw new Error('Nenhum slide encontrado no PPTX.');
  const decoder = new TextDecoder();
  return entries
    .map(({ number, data }) => ({ number, text: slideText(decoder.decode(data)) }))
    .filter((s) => s.text);
}

module.exports = { extractPptxSlides, LIMITS };
