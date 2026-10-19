// Páginas de PDF importadas, gravadas como PNG em <dir>/<id>/page-NNN.png.
// O id e o conteúdo vêm do renderer: validados aqui (nada de travessia de pasta nem arquivo que não seja PNG).
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const MAX_PAGES = 300;
const MAX_PAGE_BYTES = 25 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isValidImportId = (id) => typeof id === 'string' && ID_RE.test(id);

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  return null;
}

function createImportStore(dir) {
  const folderOf = (id) => path.join(dir, id);
  // Importações em andamento (ainda não entraram no culto): o prune não pode apagá-las.
  const pending = new Set();

  return {
    MAX_PAGES,
    create() {
      const id = randomUUID();
      fs.mkdirSync(folderOf(id), { recursive: true });
      pending.add(id);
      return id;
    },
    // A importação terminou (entrou no culto ou foi descartada).
    settle(id) {
      pending.delete(id);
    },

    savePage(id, index, bytes) {
      if (!isValidImportId(id)) throw new Error('Importação inválida.');
      if (!Number.isInteger(index) || index < 0 || index >= MAX_PAGES) throw new Error(`Número de página inválido (máximo ${MAX_PAGES}).`);
      const data = toBuffer(bytes);
      if (!data || data.length > MAX_PAGE_BYTES || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('A página precisa ser uma imagem PNG.');
      }
      fs.mkdirSync(folderOf(id), { recursive: true });
      const file = path.join(folderOf(id), `page-${String(index + 1).padStart(3, '0')}.png`);
      fs.writeFileSync(file, data);
      return pathToFileURL(file).href;
    },

    remove(id) {
      if (!isValidImportId(id)) return;
      pending.delete(id);
      fs.rmSync(folderOf(id), { recursive: true, force: true });
    },

    // Apaga as importações (só pastas com id válido) fora de `inUse` e que não estão em andamento.
    prune(inUse) {
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        return [];
      }
      const removed = names.filter((n) => isValidImportId(n) && !inUse.has(n) && !pending.has(n));
      removed.forEach((n) => fs.rmSync(folderOf(n), { recursive: true, force: true }));
      return removed;
    },
  };
}

module.exports = { createImportStore, isValidImportId, MAX_PAGES };
