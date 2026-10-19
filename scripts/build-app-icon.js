// Gera os ícones do app a partir de logo/logo-xpresenter.png.
// A logo tem o nome escrito embaixo, ilegível em 16–32 px: o ícone usa só o símbolo (círculo + play),
// achado pelos pixels claros acima do texto, centralizado num quadrado preto de cantos arredondados.
// Uso: npm run app-icon   (roda dentro do Electron, por causa do nativeImage)
const fs = require('node:fs');
const path = require('node:path');
const { app, nativeImage } = require('electron');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'logo', 'logo-xpresenter.png');
const SIZE = 512;
const SYMBOL_SHARE = 0.72; // quanto do lado do ícone o símbolo ocupa
const CORNER_SHARE = 0.2; // raio dos cantos em relação ao lado
const BRIGHT = 128;
const STROKE_GROW = 4; // px (em 512) acrescentados de cada lado do traço
const OUTPUTS = [
  path.join(ROOT, 'src', 'assets', 'icon.png'),
  path.join(ROOT, 'src', 'remote', 'icon.png'),
];

// Linhas com pixel claro, agrupadas em faixas separadas por linhas escuras: a primeira é o símbolo.
function symbolBounds(bitmap, width, height) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    let minX = width;
    let maxX = -1;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (Math.max(bitmap[i], bitmap[i + 1], bitmap[i + 2]) >= BRIGHT) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    rows.push(maxX >= 0 ? { minX, maxX } : null);
  }
  const top = rows.findIndex(Boolean);
  if (top < 0) throw new Error('logo sem pixels claros');
  let bottom = top;
  while (bottom + 1 < height && rows[bottom + 1]) bottom += 1;
  const band = rows.slice(top, bottom + 1);
  return {
    x: Math.min(...band.map((r) => r.minX)),
    y: top,
    width: Math.max(...band.map((r) => r.maxX)) - Math.min(...band.map((r) => r.minX)) + 1,
    height: bottom - top + 1,
  };
}

// O traço da logo é fino: reduzido a 16–32 px ele some. Engrossa (filtro de máximo num disco) antes de compor.
function thicken(bitmap, side, radius) {
  const out = Buffer.from(bitmap);
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
  }
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const i = (y * side + x) * 4;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue;
        const j = (ny * side + nx) * 4;
        for (let c = 0; c < 3; c += 1) out[i + c] = Math.max(out[i + c], bitmap[j + c]);
      }
    }
  }
  return out;
}

// Fundo preto, cantos arredondados transparentes (com borda suavizada) e o símbolo centralizado.
function compose(symbol) {
  const inner = Math.round(SIZE * SYMBOL_SHARE);
  const scaled = thicken(symbol.resize({ width: inner, height: inner, quality: 'best' }).toBitmap(), inner, STROKE_GROW);
  const offset = Math.round((SIZE - inner) / 2);
  const radius = SIZE * CORNER_SHARE;
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const dx = Math.max(radius - x - 0.5, x + 0.5 - (SIZE - radius), 0);
      const dy = Math.max(radius - y - 0.5, y + 0.5 - (SIZE - radius), 0);
      const alpha = Math.min(1, Math.max(0, radius - Math.hypot(dx, dy) + 0.5));
      const sx = x - offset;
      const sy = y - offset;
      if (sx >= 0 && sy >= 0 && sx < inner && sy < inner) scaled.copy(out, i, (sy * inner + sx) * 4, (sy * inner + sx) * 4 + 3);
      out[i + 3] = Math.round(alpha * 255);
      for (let c = 0; c < 3; c += 1) out[i + c] = Math.round(out[i + c] * alpha); // BGRA pré-multiplicado
    }
  }
  return nativeImage.createFromBitmap(out, { width: SIZE, height: SIZE });
}

app.whenReady().then(() => {
  try {
    const logo = nativeImage.createFromPath(SOURCE);
    if (logo.isEmpty()) throw new Error(`não consegui ler ${SOURCE}`);
    const { width, height } = logo.getSize();
    const b = symbolBounds(logo.toBitmap(), width, height);
    const side = Math.max(b.width, b.height);
    const crop = {
      x: Math.max(0, Math.round(b.x + b.width / 2 - side / 2)),
      y: Math.max(0, Math.round(b.y + b.height / 2 - side / 2)),
      width: side,
      height: side,
    };
    const png = compose(logo.crop(crop)).toPNG();
    OUTPUTS.forEach((file) => fs.writeFileSync(file, png));
    console.log(`símbolo em ${JSON.stringify(crop)}; ícone ${SIZE}x${SIZE} gravado em ${OUTPUTS.length} lugares`);
    app.exit(0);
  } catch (err) {
    console.error(err.message);
    app.exit(1);
  }
});
