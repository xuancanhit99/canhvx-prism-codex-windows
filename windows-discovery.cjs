const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execFileAsync = promisify(execFile);

// CIM is available on supported Windows releases even when WMIC is removed.
// Return process metadata only; never read account files or print command lines.
const PROCESS_QUERY = [
  '$ErrorActionPreference = "Stop";',
  'Get-CimInstance Win32_Process -Filter "Name=\'Codex.exe\' OR Name=\'ChatGPT.exe\'"',
  '| Select-Object ProcessId,ExecutablePath,CommandLine',
  '| ConvertTo-Json -Compress',
].join(' ');

function flag(command, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(command || '').match(new RegExp(`(?:^|\\s)--${escaped}(?:=|\\s+)(?:"([^"]*)"|([^\\s]+))`));
  return match ? (match[1] ?? match[2]) : '';
}

function isCodexDesktop(process) {
  const exe = String(process.ExecutablePath || '').replace(/\//g, '\\');
  const command = String(process.CommandLine || '');
  if (/--type(?:=|\s)/.test(command)) return false;
  if (!Number.isInteger(Number(process.ProcessId)) || Number(process.ProcessId) < 1) return false;
  return /\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(?:ChatGPT|Codex)\.exe$/i.test(exe)
    || /\\Programs\\(?:OpenAI\\)?Codex\\(?:app\\)?(?:ChatGPT|Codex)\.exe$/i.test(exe)
    || /\\Program Files(?: \(x86\))?\\Codex\\(?:app\\)?(?:ChatGPT|Codex)\.exe$/i.test(exe);
}

function selectDesktop(snapshot) {
  const rows = Array.isArray(snapshot) ? snapshot : snapshot ? [snapshot] : [];
  const candidates = rows.filter(isCodexDesktop);
  if (candidates.length !== 1) {
    throw new Error(candidates.length
      ? 'More than one Codex desktop instance is running; select an explicit connection.'
      : 'No running Codex desktop instance was found. Codex was not launched or restarted.');
  }
  const selected = candidates[0];
  const port = flag(selected.CommandLine, 'remote-debugging-port');
  return {
    pid: Number(selected.ProcessId),
    appPath: selected.ExecutablePath,
    port: /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 ? port : '',
    userDataDir: flag(selected.CommandLine, 'user-data-dir'),
  };
}

function selectConnection(snapshot) {
  const selected = selectDesktop(snapshot);
  if (!selected.port) throw new Error('No running Codex desktop instance exposes a fixed local CDP port. Open Codex using the Codex + Prism shortcut.');
  return selected;
}

function queryCommand(env) {
  return path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function decodeSnapshot(output) {
  const json = String(output).replace(/^\uFEFF/, '').trim();
  return json ? JSON.parse(json) : [];
}

async function querySnapshot(env = process.env) {
  const { stdout } = await execFileAsync(queryCommand(env), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROCESS_QUERY], {
    encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
  });
  return decodeSnapshot(stdout);
}

function discoverConnection(env = process.env) {
  const output = execFileSync(queryCommand(env), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROCESS_QUERY], {
    encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024,
  });
  return selectConnection(decodeSnapshot(output));
}

function applyConnection(env, connection) {
  env.PRISM_CODEX_APP_PATH ||= connection.appPath;
  if (!env.PRISM_CODEX_CDP_URL && !env.PRISM_CODEX_CDP_PORT && !env.PRISM_CODEX_DEVTOOLS_FILE) {
    env.PRISM_CODEX_CDP_PORT = String(connection.port);
  }
  if (connection.userDataDir) env.PRISM_CODEX_USER_DATA_DIR ||= connection.userDataDir;
}

function createConnectionRefresher(env, query = () => querySnapshot(env)) {
  const explicit = new Set(Object.keys(env).filter(key => env[key]));
  const explicitEndpoint = ['PRISM_CODEX_CDP_URL', 'PRISM_CODEX_CDP_PORT', 'PRISM_CODEX_DEVTOOLS_FILE'].some(key => explicit.has(key));
  const owned = new Map();
  let pending;

  function assign(key, value) {
    if (explicit.has(key)) return;
    if (owned.has(key) && env[key] !== owned.get(key)) {
      explicit.add(key);
      owned.delete(key);
      return;
    }
    if (value) {
      env[key] = String(value);
      owned.set(key, String(value));
    } else if (owned.has(key)) {
      delete env[key];
      owned.delete(key);
    }
  }

  async function update() {
    try {
      const connection = selectDesktop(await query());
      assign('PRISM_CODEX_APP_PATH', connection.appPath);
      if (!explicitEndpoint) assign('PRISM_CODEX_CDP_PORT', connection.port);
      assign('PRISM_CODEX_USER_DATA_DIR', connection.userDataDir);
      return connection;
    } catch (error) {
      // Never keep a stale port after the verified desktop exits or becomes ambiguous.
      for (const key of [...owned.keys()]) assign(key, '');
      throw error;
    }
  }

  return function refresh() {
    if (!pending) pending = update().finally(() => { pending = undefined; });
    return pending;
  };
}

module.exports = { flag, isCodexDesktop, selectDesktop, selectConnection, discoverConnection, applyConnection, createConnectionRefresher };
