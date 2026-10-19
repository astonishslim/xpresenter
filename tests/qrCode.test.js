const test = require('node:test');
const assert = require('node:assert/strict');
const { qrRows } = require('../src/core/qrCode');

test('gera uma matriz quadrada de 0 e 1 para o endereço do controle remoto', () => {
  const rows = qrRows('http://192.168.0.10:5151/?t=0123456789abcdef0123456789abcdef');
  assert.ok(rows.length >= 21);
  assert.ok(rows.every((r) => r.length === rows.length && /^[01]+$/.test(r)));
});

test('os três cantos de localização estão presentes (começa com 1111111)', () => {
  const rows = qrRows('http://10.0.0.2:5151/?t=abcdefgh');
  const n = rows.length;
  assert.ok(rows[0].startsWith('1111111'));
  assert.ok(rows[0].endsWith('1111111'));
  assert.ok(rows[n - 1].startsWith('1111111'));
});

test('texto vazio, que não é texto ou grande demais não gera QR', () => {
  assert.equal(qrRows(''), null);
  assert.equal(qrRows(null), null);
  assert.equal(qrRows('x'.repeat(3000)), null);
});
