const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/core/bibleFormats');

const META = { code: 'tb', name: 'Tradução Brasileira', license: 'public-domain', year: 1917 };

test('sanitizeText tira tags, caracteres de controle e espaços sobrando', () => {
  assert.equal(F.sanitizeText('  No <i>princípio</i>\u0000  era\n o   Verbo. '), 'No princípio era o Verbo.');
  assert.equal(F.sanitizeText(null), '');
  assert.equal(F.sanitizeText(42), '42');
});

test('sanitizeText limita o tamanho de um verso', () => {
  assert.equal(F.sanitizeText('a'.repeat(5000)).length, F.MAX_VERSE_CHARS);
});

test('sanitizeCode normaliza o código da versão', () => {
  assert.equal(F.sanitizeCode('  ara 2017! '), 'ARA2017');
  assert.equal(F.sanitizeCode('x'.repeat(40)).length, 16);
  assert.equal(F.sanitizeCode('!!!'), null);
  assert.equal(F.sanitizeCode(undefined), null);
});

// ---------- livros por arquivo (damarals/biblias) ----------
const book = (id, name, abbrev, chapters) => ({ id, code: 'X', name, abbrev, chapters: chapters.map((verses, i) => ({ number: i + 1, verses: verses.map((text, j) => ({ number: j + 1, text })) })) });

test('fromBookFiles monta a versão a partir de um arquivo por livro, ordenada por id', () => {
  const bible = F.fromBookFiles(META, [book(63, '2 João', '2Jo', [['A', 'B']]), book(1, 'Gênesis', 'Gn', [['No princípio', 'E a terra']])]);
  assert.equal(bible.code, 'TB');
  assert.equal(bible.name, 'Tradução Brasileira');
  assert.deepEqual(bible.books.map((b) => b.id), [1, 63]);
  assert.deepEqual(bible.books[1].chapters, [['A', 'B']]);
});

test('fromBookFiles preenche versos ausentes com vazio para manter os números certos', () => {
  const b = book(40, 'Mateus', 'Mt', [['um', 'dois']]);
  b.chapters[0].verses.push({ number: 4, text: 'quatro' }); // o 3 não existe nesta versão
  const bible = F.fromBookFiles(META, [b]);
  assert.deepEqual(bible.books[0].chapters[0], ['um', 'dois', '', 'quatro']);
});

test('fromBookFiles rejeita livro sem capítulos ou com versos que não são texto', () => {
  assert.throws(() => F.fromBookFiles(META, [{ id: 1, name: 'Gênesis', chapters: 'x' }]), /capítulos/i);
  assert.throws(() => F.fromBookFiles(META, [{ id: 1, name: 'Gênesis', abbrev: 'Gn', chapters: [{ number: 1, verses: [{ number: 1, text: { a: 1 } }] }] }]), /verso/i);
});

// ---------- formato simples (thiagobodruk / app) ----------
test('fromJson aceita lista de livros { abbrev, name, chapters: [[...]] } e atribui ids pelo nome', () => {
  const bible = F.fromJson([
    { abbrev: 'gn', name: 'Gênesis', chapters: [['a', 'b']] },
    { abbrev: 'jo', name: 'João', chapters: [['c']] },
  ], META);
  assert.deepEqual(bible.books.map((b) => b.id), [1, 43]);
  assert.equal(bible.name, 'Tradução Brasileira');
});

test('fromJson aceita o formato do próprio app e preserva os metadados dele', () => {
  const bible = F.fromJson({ code: 'abc', name: 'Minha', license: 'cc-by', books: [{ name: 'Rute', abbrev: 'Rt', chapters: [['x']] }] }, {});
  assert.equal(bible.code, 'ABC');
  assert.equal(bible.license, 'cc-by');
  assert.equal(bible.books[0].id, 8);
});

test('fromJson atribui ids por posição quando vierem 66 livros sem nome reconhecível', () => {
  const books = Array.from({ length: 66 }, (_, i) => ({ name: `Livro ${i}`, abbrev: `L${i}`, chapters: [['v']] }));
  const bible = F.fromJson(books, META);
  assert.equal(bible.books[0].id, 1);
  assert.equal(bible.books[65].id, 66);
});

test('fromJson não inventa ids quando não dá para saber (livros soltos e desconhecidos)', () => {
  const bible = F.fromJson([{ name: 'Apócrifo Qualquer', abbrev: 'Ap?', chapters: [['v']] }], META);
  assert.equal(bible.books[0].id, undefined);
});

test('fromJson rejeita formatos que não são Bíblia', () => {
  assert.throws(() => F.fromJson({ foo: 1 }, META), /formato/i);
  assert.throws(() => F.fromJson('texto', META), /formato/i);
  assert.throws(() => F.fromJson([], META), /vazi/i);
  assert.throws(() => F.fromJson([{ name: 'X', chapters: [['a', 5]] }], META), /verso/i);
});

// ---------- Zefania XML ----------
const ZEF = `<?xml version="1.0" encoding="UTF-8"?>
<XMLBIBLE biblename="Almeida de Teste" status="v" version="2.0">
  <BIBLEBOOK bnumber="43" bname="João" bsname="Jo">
    <CHAPTER cnumber="1">
      <VERS vnumber="1">No princípio era o <STYLE css="x">Verbo</STYLE>, &amp; o Verbo estava com Deus.</VERS>
      <VERS vnumber="2">Ele estava no princípio &#8212; com Deus.</VERS>
    </CHAPTER>
    <CHAPTER cnumber="2"><VERS vnumber="1">Três dias depois, &quot;houve&quot; bodas.</VERS></CHAPTER>
  </BIBLEBOOK>
  <BIBLEBOOK bnumber="1" bname="Gênesis"><CHAPTER cnumber="1"><VERS vnumber="1">No princípio criou Deus.</VERS></CHAPTER></BIBLEBOOK>
</XMLBIBLE>`;

test('fromZefania lê livros, capítulos e versos, decodifica entidades e remove marcações internas', () => {
  const bible = F.fromZefania(ZEF, {});
  assert.equal(bible.name, 'Almeida de Teste');
  assert.deepEqual(bible.books.map((b) => b.id), [1, 43]);
  const joao = bible.books[1];
  assert.equal(joao.name, 'João');
  assert.equal(joao.chapters[0][0], 'No princípio era o Verbo, & o Verbo estava com Deus.');
  assert.equal(joao.chapters[0][1], 'Ele estava no princípio — com Deus.');
  assert.equal(joao.chapters[1][0], 'Três dias depois, "houve" bodas.');
});

test('fromZefania rejeita XML sem livros', () => {
  assert.throws(() => F.fromZefania('<XMLBIBLE biblename="x"></XMLBIBLE>', {}), /livro/i);
});

// ---------- detecção automática ----------
test('convertAuto detecta XML e JSON pelo conteúdo', () => {
  assert.equal(F.convertAuto(ZEF, 'qualquer.xml', {}).books.length, 2);
  const json = JSON.stringify([{ abbrev: 'gn', name: 'Gênesis', chapters: [['a']] }]);
  assert.equal(F.convertAuto(json, 'x.json', META).books.length, 1);
});

test('convertAuto usa o nome do arquivo como nome/código quando faltarem', () => {
  const json = JSON.stringify([{ abbrev: 'gn', name: 'Gênesis', chapters: [['a']] }]);
  const bible = F.convertAuto(json, 'minha-biblia_20.json', {});
  assert.equal(bible.code, 'MINHA-BIBLIA_20');
  assert.equal(bible.name, 'minha-biblia_20');
});

test('convertAuto dá mensagem clara para JSON inválido e para arquivo grande demais', () => {
  assert.throws(() => F.convertAuto('{nao e json', 'a.json', {}), /JSON/);
  assert.throws(() => F.convertAuto('x'.repeat(F.MAX_FILE_BYTES + 1), 'a.json', {}), /grande/i);
});

// ---------- limites ----------
test('validateBible limita livros, capítulos e versos', () => {
  const ok = { code: 'A', name: 'A', books: [{ id: 1, name: 'Gn', abbrev: 'Gn', chapters: [['a']] }] };
  assert.equal(F.validateBible(ok), ok);
  assert.throws(() => F.validateBible({ ...ok, books: Array.from({ length: 100 }, () => ok.books[0]) }), /livros/i);
  assert.throws(() => F.validateBible({ ...ok, books: [{ ...ok.books[0], chapters: Array.from({ length: 500 }, () => ['a']) }] }), /capítulos/i);
  assert.throws(() => F.validateBible({ ...ok, books: [{ ...ok.books[0], chapters: [Array.from({ length: 1000 }, () => 'a')] }] }), /versos/i);
  assert.throws(() => F.validateBible({ ...ok, books: [{ ...ok.books[0], id: 7 }, { ...ok.books[0], id: 7 }] }), /repetid/i);
});
