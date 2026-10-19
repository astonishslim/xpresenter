const { ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const { toCsv, isValidDate } = require('../core/usageLog');

const MAX_LIST = 500;

// Período vindo do operador: só datas válidas AAAA-MM-DD (o resto fica aberto).
const periodOf = (raw) => {
  const p = raw && typeof raw === 'object' ? raw : {};
  return { from: isValidDate(p.from) ? p.from : undefined, to: isValidDate(p.to) ? p.to : undefined };
};

function registerUsageIpc({ log, getWindow }) {
  ipcMain.handle('usage:list', (_e, period) => {
    const entries = log.list(periodOf(period));
    return { total: entries.length, entries: entries.slice(-MAX_LIST).reverse() };
  });

  ipcMain.handle('usage:export', async (_e, period) => {
    const { from, to } = periodOf(period);
    const entries = log.list({ from, to });
    if (!entries.length) return { ok: false, reason: 'Nenhuma música registrada neste período.' };
    const suffix = [from, to].filter(Boolean).join('_a_') || 'completo';
    const { canceled, filePath } = await dialog.showSaveDialog(getWindow(), {
      title: 'Salvar relatório de uso',
      defaultPath: `uso-de-musicas-${suffix}.csv`,
      filters: [{ name: 'Planilha CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false, reason: '' };
    fs.writeFileSync(filePath, toCsv(entries), 'utf8');
    return { ok: true, count: entries.length, path: filePath };
  });
}

module.exports = { registerUsageIpc };
