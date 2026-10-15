const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function resolveSqliteBinary(env = process.env, { home = os.homedir(), exists = fs.existsSync } = {}) {
  const configured = String(env.PRISM_SQLITE3_BIN || '').trim();
  if (configured && !/^sqlite3(?:\.exe)?$/i.test(configured)) return configured;
  // Hub may omit LOCALAPPDATA and the user's SDK directory from its child PATH.
  const localRoots = [env.LOCALAPPDATA, path.win32.join(home, 'AppData', 'Local')].filter(Boolean);
  for (const root of new Set(localRoots)) {
    const candidate = path.win32.join(root, 'Android', 'Sdk', 'platform-tools', 'sqlite3.exe');
    if (exists(candidate)) return candidate;
  }
  return configured || 'sqlite3';
}

module.exports = { resolveSqliteBinary };
