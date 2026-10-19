// Baixa as versões em português de uso LIVRE do repositório damarals/biblias e grava em data/bibles/.
// Só estas três estão na lista de permitidas: as demais (ARA, ARC, NVI, NAA, NTLH...) são de editoras e
// exigem licença; para essas, use "Importar" no app com um arquivo que você tenha o direito de usar.
// Uso: node scripts/fetch-bibles.js
const fs = require('node:fs');
const path = require('node:path');
const { fromBookFiles } = require('../src/core/bibleFormats');

const REPO = 'damarals/biblias';
const OUT_DIR = path.join(__dirname, '..', 'data', 'bibles');
const CONCURRENCY = 8;
const EXPECTED_BOOKS = 66;
const VERSE_RANGE = [30000, 31800]; // total de versos não vazios esperado numa Bíblia completa

const BOOK_FILES = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'];

// Lista fechada de propósito (ver o aviso no topo).
const FREE = {
  TB: {
    name: 'Tradução Brasileira',
    license: 'Domínio público',
    attribution: 'Tradução Brasileira (TB). Texto em domínio público, conforme informado pelo repositório damarals/biblias.',
  },
  ALM1911: {
    name: 'Almeida 1911',
    license: 'Domínio público',
    attribution: 'Almeida 1911. Texto em domínio público, conforme informado pelo repositório damarals/biblias. Ortografia da época.',
  },
  BLIVRE: {
    name: 'Bíblia Livre',
    license: 'CC BY 3.0 BR',
    attribution: 'Bíblia Livre (BLIVRE), Copyright © 2018 Diego Santos, Mario Sérgio e Marco Teles. Licença Creative Commons Atribuição 3.0 Brasil.',
  },
};

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'apresentador-fetch-bibles' } });
  if (!res.ok) throw new Error(`${res.status} ao baixar ${url}`);
  return res.json();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function main() {
  const { sha } = await getJson(`https://api.github.com/repos/${REPO}/commits/main`);
  console.log(`Repositório ${REPO} @ ${sha.slice(0, 7)}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const notes = [];

  for (const [code, info] of Object.entries(FREE)) {
    const base = `https://raw.githubusercontent.com/${REPO}/${sha}/data/canonical/${code}`;
    const repoMeta = await getJson(`${base}/meta.json`);
    const files = await mapLimit(BOOK_FILES, CONCURRENCY, (b) => getJson(`${base}/${b}.json`));

    const bible = fromBookFiles({
      code,
      name: info.name,
      year: repoMeta.year,
      license: info.license,
      attribution: info.attribution,
      source: `github.com/${REPO}@${sha.slice(0, 7)}/data/canonical/${code}`,
    }, files);

    const verses = bible.books.reduce((n, b) => n + b.chapters.flat().filter(Boolean).length, 0);
    if (bible.books.length !== EXPECTED_BOOKS) throw new Error(`${code}: ${bible.books.length} livros (esperado ${EXPECTED_BOOKS})`);
    if (verses < VERSE_RANGE[0] || verses > VERSE_RANGE[1]) throw new Error(`${code}: ${verses} versos fora do esperado ${VERSE_RANGE}`);

    fs.writeFileSync(path.join(OUT_DIR, `${code}.json`), JSON.stringify(bible));
    console.log(`${code}: ${bible.books.length} livros, ${verses} versos`);
    notes.push(`### ${info.name} (${code})\n- Licença: ${info.license}\n- Atribuição: ${info.attribution}\n- Fonte: ${bible.source}\n- Versos: ${verses}\n`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'SOURCES.md'), `# Versões da Bíblia incluídas\n\nGerado por \`node scripts/fetch-bibles.js\`. Texto baixado de https://github.com/${REPO}.\n\n${notes.join('\n')}\n## Outras versões\n\nARA, ARC, NVI, NAA, NTLH e outras são de editoras e **não** estão incluídas. Para usá-las, importe um arquivo que você tenha o direito de usar (botão Importar na seção Bíblia).\n`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
