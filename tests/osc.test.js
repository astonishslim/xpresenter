const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeMessage, decodePacket, parseArgs } = require('../src/core/osc');

test('codifica e decodifica mensagem com inteiro, float e string (alinhamento de 4 bytes)', () => {
  const buf = encodeMessage('/luz/cena', [{ type: 'i', value: 3 }, { type: 'f', value: 0.5 }, { type: 's', value: 'Refrão' }]);
  assert.equal(buf.length % 4, 0);
  const [msg] = decodePacket(buf);
  assert.equal(msg.address, '/luz/cena');
  assert.deepEqual(msg.args, [3, 0.5, 'Refrão']);
});

test('mensagem sem argumentos', () => {
  const [msg] = decodePacket(encodeMessage('/apresentador/next', []));
  assert.deepEqual(msg, { address: '/apresentador/next', args: [] });
});

test('decodifica bundle com várias mensagens', () => {
  const a = encodeMessage('/a', [{ type: 'i', value: 1 }]);
  const b = encodeMessage('/b', []);
  const size = (n) => { const s = Buffer.alloc(4); s.writeInt32BE(n); return s; };
  const bundle = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), size(a.length), a, size(b.length), b]);
  assert.deepEqual(decodePacket(bundle).map((m) => m.address), ['/a', '/b']);
});

test('pacote malformado devolve lista vazia, sem lançar', () => {
  for (const bad of [Buffer.from('lixo'), Buffer.from([0x2f, 0x61]), Buffer.alloc(0), Buffer.from('/a\0\0,i\0\0\0\0')]) {
    assert.deepEqual(decodePacket(bad), [], bad.toString('hex'));
  }
});

test('recusa endereço inválido ao codificar', () => {
  assert.throws(() => encodeMessage('sem-barra', []), /endereço/i);
  assert.throws(() => encodeMessage('/a b', []), /endereço/i);
});

test('parseArgs converte texto da regra: inteiros, decimais e textos', () => {
  assert.deepEqual(parseArgs('1 0.5 cena'), [{ type: 'i', value: 1 }, { type: 'f', value: 0.5 }, { type: 's', value: 'cena' }]);
  assert.deepEqual(parseArgs(''), []);
  assert.equal(parseArgs('a b c d e f g h i').length, 8, 'no máximo 8 argumentos');
});
