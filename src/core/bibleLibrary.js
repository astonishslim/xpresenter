// Versões da Bíblia em disco: as que vêm no app (builtinDir) e as importadas pelo usuário (userDir).
const fs = require('node:fs');
const path = require('node:path');
const { convertAuto, validateBible, sanitizeCode } = require('./bibleFormats');

const MAX_USER_VERSIONS = 30;
const META_FIELDS = ['code', 'name', 'year', 'license', 'source', 'attribution'];

const toMeta = (bible, builtin) => ({ ...Object.fromEntries(META_FIELDS.map((k) => [k, bible[k]])), builtin });

function readVersions(dir, builtin) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`[bíblias] não foi possível ler ${dir}: ${err.message}`);
    return [];
  }
  return names.flatMap((file) => {
    try {
      const bible = validateBible(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
      const code = sanitizeCode(bible.code);
      return code ? [{ ...bible, code, builtin }] : [];
    } catch (err) {
      console.error(`[bíblias] ${file} ignorado: ${err.message}`);
      return [];
    }
  });
}

function createBibleLibrary({ builtinDir, userDir }) {
  const versions = new Map(); // code -> bible completa
  const load = () => {
    versions.clear();
    [...readVersions(builtinDir, true), ...readVersions(userDir, false)].forEach((b) => {
      if (!versions.has(b.code)) versions.set(b.code, b);
    });
  };
  load();

  const userCount = () => [...versions.values()].filter((b) => !b.builtin).length;
  const uniqueCode = (wanted) => {
    if (!versions.has(wanted)) return wanted;
    for (let n = 2; ; n += 1) {
      const candidate = `${wanted.slice(0, 12)}-${n}`;
      if (!versions.has(candidate)) return candidate;
    }
  };

  return {
    list: () => [...versions.values()]
      .map((b) => toMeta(b, b.builtin))
      .sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.name.localeCompare(b.name, 'pt-BR')),

    get: (code) => versions.get(sanitizeCode(code) || '') || null,

    importText(text, fileName) {
      if (userCount() >= MAX_USER_VERSIONS) throw new Error(`Limite de ${MAX_USER_VERSIONS} versões importadas atingido. Remova alguma antes.`);
      const converted = convertAuto(text, fileName);
      const bible = { ...converted, code: uniqueCode(converted.code), builtin: false };
      fs.mkdirSync(userDir, { recursive: true });
      const file = path.join(userDir, `${bible.code}.json`);
      const { builtin, ...onDisk } = bible;
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(onDisk));
      fs.renameSync(`${file}.tmp`, file);
      versions.set(bible.code, bible);
      return toMeta(bible, false);
    },

    remove(code) {
      const key = sanitizeCode(code);
      const bible = key && versions.get(key);
      if (!bible || bible.builtin) return false;
      fs.rmSync(path.join(userDir, `${key}.json`), { force: true });
      versions.delete(key);
      return true;
    },
  };
}

module.exports = { createBibleLibrary };
