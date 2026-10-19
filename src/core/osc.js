// OSC 1.0 mínimo (sem dependências): mensagens com int32 (i), float32 (f) e string (s), e bundles na leitura.
// Pacotes vêm da rede: a leitura nunca lança, devolve [] para o que não entender.
const MAX_ARGS = 8;
const MAX_STRING = 200;
const ADDRESS_RE = /^\/[\x21-\x7e]{0,99}$/;
const BUNDLE_TAG = '#bundle';

const pad4 = (n) => (n + 3) & ~3;

function oscString(value) {
  const bytes = Buffer.from(`${value}\0`, 'utf8');
  const out = Buffer.alloc(pad4(bytes.length));
  bytes.copy(out);
  return out;
}

function encodeMessage(address, args) {
  if (typeof address !== 'string' || !ADDRESS_RE.test(address) || /[\s#,]/.test(address)) {
    throw new Error(`Endereço OSC inválido: ${address}`);
  }
  const list = (args || []).slice(0, MAX_ARGS);
  const parts = list.map((a) => {
    if (a.type === 'i') { const b = Buffer.alloc(4); b.writeInt32BE(a.value | 0); return b; }
    if (a.type === 'f') { const b = Buffer.alloc(4); b.writeFloatBE(a.value); return b; }
    return oscString(String(a.value).slice(0, MAX_STRING));
  });
  return Buffer.concat([oscString(address), oscString(`,${list.map((a) => (a.type === 'i' || a.type === 'f' ? a.type : 's')).join('')}`), ...parts]);
}

function readString(buf, offset) {
  const end = buf.indexOf(0, offset);
  if (end < 0) throw new Error('string sem fim');
  return { value: buf.toString('utf8', offset, end), next: pad4(end + 1) };
}

function decodeMessage(buf) {
  const address = readString(buf, 0);
  if (!address.value.startsWith('/')) throw new Error('endereço');
  if (address.next >= buf.length) return { address: address.value, args: [] };
  const tags = readString(buf, address.next);
  if (!tags.value.startsWith(',')) throw new Error('tags');
  let offset = tags.next;
  const args = [...tags.value.slice(1)].slice(0, MAX_ARGS).map((t) => {
    if (t === 'i' || t === 'f') {
      if (offset + 4 > buf.length) throw new Error('curto');
      const v = t === 'i' ? buf.readInt32BE(offset) : buf.readFloatBE(offset);
      offset += 4;
      return t === 'f' ? Math.round(v * 1e6) / 1e6 : v;
    }
    if (t === 's') {
      const s = readString(buf, offset);
      offset = s.next;
      return s.value.slice(0, MAX_STRING);
    }
    throw new Error(`tipo ${t}`);
  });
  return { address: address.value, args };
}

function decodePacket(buf, depth = 0) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 4 || depth > 4) return [];
    if (buf.toString('latin1', 0, 7) === BUNDLE_TAG) {
      const out = [];
      let offset = 16; // "#bundle\0" + timetag
      while (offset + 4 <= buf.length) {
        const size = buf.readInt32BE(offset);
        if (size <= 0 || offset + 4 + size > buf.length) break;
        out.push(...decodePacket(buf.subarray(offset + 4, offset + 4 + size), depth + 1));
        offset += 4 + size;
      }
      return out;
    }
    return [decodeMessage(buf)];
  } catch {
    return [];
  }
}

// Argumentos escritos numa regra ("1 0.5 cena") viram tipos OSC.
function parseArgs(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).slice(0, MAX_ARGS).map((t) => {
    if (/^-?\d+$/.test(t)) return { type: 'i', value: Number(t) };
    if (/^-?\d*\.\d+$/.test(t)) return { type: 'f', value: Number(t) };
    return { type: 's', value: t };
  });
}

module.exports = { encodeMessage, decodePacket, parseArgs, ADDRESS_RE };
