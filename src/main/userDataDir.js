const fs = require('node:fs');
const path = require('node:path');

// O app se chamava "Apresentador": biblioteca, temas, layout e importações ficavam em %APPDATA%\Apresentador.
// Na primeira abertura com o nome novo, a pasta antiga é renomeada. Se não der (pasta em uso), o app
// continua usando a antiga, para nunca abrir "vazio".
const LEGACY_NAMES = ['Apresentador'];

function resolveUserDataDir(current, legacyNames = LEGACY_NAMES) {
  if (fs.existsSync(current)) return current;
  const legacy = legacyNames
    .map((name) => path.join(path.dirname(current), name))
    .find((dir) => dir.toLowerCase() !== current.toLowerCase() && fs.existsSync(dir));
  if (!legacy) return current;
  try {
    fs.renameSync(legacy, current);
    return current;
  } catch (err) {
    console.error(`[dados] não consegui renomear ${legacy}: ${err.message}`);
    return legacy;
  }
}

module.exports = { resolveUserDataDir, LEGACY_NAMES };
