// Copia o pdf.js (Mozilla, Apache-2.0) para src/renderer/vendor/pdfjs, usado para importar PDF.
// Uso: npm run vendor:pdfjs   (depois de atualizar pdfjs-dist)
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules', 'pdfjs-dist');
const out = path.join(root, 'src', 'renderer', 'vendor', 'pdfjs');
const { version } = require(path.join(src, 'package.json'));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  fs.copyFileSync(path.join(src, 'build', file), path.join(out, file));
}
// Fontes padrão (PDFs que não embutem Helvetica/Times etc.)
fs.cpSync(path.join(src, 'standard_fonts'), path.join(out, 'standard_fonts'), { recursive: true });
fs.writeFileSync(path.join(out, 'VERSION'), `${version}\n`);
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(root, 'licenses', 'pdfjs-LICENSE.txt'));
console.log(`pdf.js ${version} copiado para ${path.relative(root, out)}`);
