// Cadastro canônico dos 66 livros (cânon protestante) com nomes, siglas e apelidos em português.
// Serve para a mesma referência ("Jo 3:16") valer em qualquer versão importada.

const MIN_PREFIX = 3;

// [id, nome, sigla, apelidos...]. Apelidos sem acento e minúsculos; o acento só decide Jó x João.
const RAW = [
  [1, 'Gênesis', 'Gn', 'gen', 'genesis'],
  [2, 'Êxodo', 'Êx', 'ex', 'exo', 'exodo'],
  [3, 'Levítico', 'Lv', 'lev', 'levitico'],
  [4, 'Números', 'Nm', 'num', 'numeros'],
  [5, 'Deuteronômio', 'Dt', 'deut', 'deuteronomio'],
  [6, 'Josué', 'Js', 'jos', 'josue'],
  [7, 'Juízes', 'Jz', 'juizes'],
  [8, 'Rute', 'Rt'],
  [9, '1 Samuel', '1Sm', '1sam', '1samuel'],
  [10, '2 Samuel', '2Sm', '2sam', '2samuel'],
  [11, '1 Reis', '1Rs', '1reis'],
  [12, '2 Reis', '2Rs', '2reis'],
  [13, '1 Crônicas', '1Cr', '1cron', '1cronicas'],
  [14, '2 Crônicas', '2Cr', '2cron', '2cronicas'],
  [15, 'Esdras', 'Ed', 'esd'],
  [16, 'Neemias', 'Ne', 'nee'],
  [17, 'Ester', 'Et', 'est'],
  [18, 'Jó', 'Jó', 'job'],
  [19, 'Salmos', 'Sl', 'salmo', 'ps', 'salm'],
  [20, 'Provérbios', 'Pv', 'prov', 'proverbios'],
  [21, 'Eclesiastes', 'Ec', 'ecl', 'eclesiastes'],
  [22, 'Cantares', 'Ct', 'cantares', 'cantico', 'canticos', 'canticodoscanticos', 'cantaresdesalomao'],
  [23, 'Isaías', 'Is', 'isaias'],
  [24, 'Jeremias', 'Jr', 'jer'],
  [25, 'Lamentações', 'Lm', 'lam', 'lamentacoes'],
  [26, 'Ezequiel', 'Ez', 'eze', 'ezeq'],
  [27, 'Daniel', 'Dn', 'dan'],
  [28, 'Oseias', 'Os', 'ose'],
  [29, 'Joel', 'Jl'],
  [30, 'Amós', 'Am', 'amos'],
  [31, 'Obadias', 'Ob', 'oba'],
  [32, 'Jonas', 'Jn'],
  [33, 'Miqueias', 'Mq', 'miq', 'miqueas'],
  [34, 'Naum', 'Na'],
  [35, 'Habacuque', 'Hc', 'hab'],
  [36, 'Sofonias', 'Sf', 'sof'],
  [37, 'Ageu', 'Ag'],
  [38, 'Zacarias', 'Zc', 'zac'],
  [39, 'Malaquias', 'Ml', 'mal'],
  [40, 'Mateus', 'Mt', 'mat'],
  [41, 'Marcos', 'Mc', 'mar', 'marc'],
  [42, 'Lucas', 'Lc', 'luc'],
  [43, 'João', 'Jo', 'joao'],
  [44, 'Atos', 'At', 'atosdosapostolos'],
  [45, 'Romanos', 'Rm', 'rom'],
  [46, '1 Coríntios', '1Co', '1cor', '1corintios'],
  [47, '2 Coríntios', '2Co', '2cor', '2corintios'],
  [48, 'Gálatas', 'Gl', 'gal', 'galatas'],
  [49, 'Efésios', 'Ef', 'efe', 'efesios'],
  [50, 'Filipenses', 'Fp', 'fil', 'filip'],
  [51, 'Colossenses', 'Cl', 'col'],
  [52, '1 Tessalonicenses', '1Ts', '1tes', '1tessalonicenses'],
  [53, '2 Tessalonicenses', '2Ts', '2tes', '2tessalonicenses'],
  [54, '1 Timóteo', '1Tm', '1tim', '1timoteo'],
  [55, '2 Timóteo', '2Tm', '2tim', '2timoteo'],
  [56, 'Tito', 'Tt'],
  [57, 'Filemom', 'Fm', 'filemon', 'filemom'],
  [58, 'Hebreus', 'Hb', 'heb'],
  [59, 'Tiago', 'Tg', 'tia'],
  [60, '1 Pedro', '1Pe', '1ped', '1pedro'],
  [61, '2 Pedro', '2Pe', '2ped', '2pedro'],
  [62, '1 João', '1Jo', '1joao'],
  [63, '2 João', '2Jo', '2joao'],
  [64, '3 João', '3Jo', '3joao'],
  [65, 'Judas', 'Jd', 'jud'],
  [66, 'Apocalipse', 'Ap', 'apoc', 'revelacao', 'revelacoes'],
];

const BOOKS = RAW.map(([id, name, abbrev]) => ({ id, name, abbrev }));
const BY_ID = new Map(BOOKS.map((b) => [b.id, b]));

const strip = (text) => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '');
// Chave de comparação: minúscula, sem espaços/pontos/hífens (mantém acentos).
const compact = (text) => String(text ?? '').toLowerCase().replace(/[\s.\-_]+/g, '');

// 1) chave com acento (decide Jó x João); 2) chave sem acento; 3) prefixo único.
const ACCENTED = new Map();
const PLAIN = new Map();
RAW.forEach(([id, name, abbrev, ...aliases]) => {
  [name, abbrev, ...aliases].forEach((label) => {
    ACCENTED.set(compact(label), id);
    const plain = strip(compact(label));
    if (!PLAIN.has(plain)) PLAIN.set(plain, id);
  });
});
PLAIN.set('jo', 43); // sem acento, "Jo" é João; Jó só é reconhecido com acento (ou como "Job")

const PLAIN_NAMES = RAW.map(([id, name]) => [strip(compact(name)), id]);

function resolveBook(input) {
  const key = compact(input);
  if (!key) return null;
  if (ACCENTED.has(key)) return ACCENTED.get(key);
  const plain = strip(key);
  if (PLAIN.has(plain)) return PLAIN.get(plain);
  if (plain.length < MIN_PREFIX) return null;
  const hits = new Set(PLAIN_NAMES.filter(([name]) => name.startsWith(plain)).map(([, id]) => id));
  return hits.size === 1 ? [...hits][0] : null;
}

const bookById = (id) => BY_ID.get(id) || null;

module.exports = { BOOKS, resolveBook, bookById, strip };
