// A separate plugin identity avoids the Hub 0.1.15 managed-desktop detector,
// which explicitly reports Windows process discovery as unsupported.
// Upstream CDP capability probes, native approvals and visibility checks remain.
process.env.PRISM_CODEX_PLUGIN_ID = 'codex-windows';
if (process.platform !== 'win32') throw new Error('Codex Windows connector requires Windows.');
// Hub-launched processes need not inherit an Android Studio terminal's PATH.
process.env.PRISM_SQLITE3_BIN = require('./windows-sqlite.cjs').resolveSqliteBinary();
const { createConnectionRefresher } = require('./windows-discovery.cjs');
const refreshConnection = createConnectionRefresher(process.env);
let previousDiagnostic = '';
async function updateConnection() {
  try {
    const connection = await refreshConnection();
    const diagnostic = connection.port ? '' : 'Codex is open without local CDP. Close it normally, then use the Codex + Prism shortcut.';
    if (diagnostic && diagnostic !== previousDiagnostic) console.error('[codex-windows] ' + diagnostic);
    previousDiagnostic = diagnostic;
    return connection;
  } catch (error) {
    if (error.message !== previousDiagnostic) console.error('[codex-windows] ' + error.message);
    previousDiagnostic = error.message;
    throw error;
  }
}
module.exports = { updateConnection };
