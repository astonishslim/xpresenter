// Biblioteca de props (props.json): logo, QR do Pix, faixa com nome. Ligar e desligar no ar é feito
// pelas ações showProp/hideProp do estado; aqui só se guarda a lista, validada como o resto.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isValidProp } = require('./state');
const { MAX_NAME_CHARS } = require('./propModel');

const MAX_PROPS = 30;
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Prop da biblioteca: nome obrigatório; id novo se faltar. Devolve null se algo não serve.
function sanitizeProp(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') return null;
  const name = raw.name.trim();
  if (!name || name.length > MAX_NAME_CHARS) return null;
  const prop = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
    name,
    kind: raw.kind,
    value: typeof raw.value === 'string' ? raw.value.trim() : raw.value,
    position: raw.position,
    size: raw.size,
  };
  return isValidProp(prop) ? prop : null;
}

function load(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = new Set();
    const names = new Set();
    return (Array.isArray(data) ? data : []).map(sanitizeProp).filter((p) => {
      if (!p || ids.has(p.id) || names.has(p.name.toLowerCase())) return false;
      ids.add(p.id);
      names.add(p.name.toLowerCase());
      return true;
    }).slice(0, MAX_PROPS);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[props] não foi possível ler ${file}: ${err.message}`);
      try {
        fs.renameSync(file, `${file}.bak`); // o próximo "salvar" regrava o arquivo: guarda o que estava lá
      } catch (renameErr) {
        console.error(`[props] não foi possível guardar a cópia de ${file}: ${renameErr.message}`);
      }
    }
    return [];
  }
}

function persist(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function createPropLibrary(file) {
  let props = load(file);
  const commit = (next) => {
    props = next;
    persist(file, props);
  };
  const result = (ok, reason) => ({ ok, ...(reason ? { reason } : {}), props: clone(props) });

  return {
    list: () => clone(props),
    get: (id) => clone(props.find((p) => p.id === id) || null),
    findByName: (name) => clone(typeof name === 'string' ? props.find((p) => sameName(p.name, name)) || null : null),
    save(input) {
      const prop = sanitizeProp(input);
      if (!prop) return result(false, 'Prop inválido: dê um nome (até 40), um texto (até 80) ou uma imagem local, posição e tamanho.');
      const exists = props.some((p) => p.id === prop.id);
      if (props.some((p) => p.id !== prop.id && sameName(p.name, prop.name))) return result(false, 'Já existe um prop com esse nome.');
      if (!exists && props.length >= MAX_PROPS) return result(false, `Limite de ${MAX_PROPS} props.`);
      commit(exists ? props.map((p) => (p.id === prop.id ? prop : p)) : [...props, prop]);
      return result(true);
    },
    remove(id) {
      commit(props.filter((p) => p.id !== id));
      return result(true);
    },
  };
}

module.exports = { createPropLibrary, sanitizeProp };
