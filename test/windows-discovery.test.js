const test = require('node:test');
const assert = require('node:assert/strict');
const { flag, selectDesktop, selectConnection, applyConnection, createConnectionRefresher } = require('../windows-discovery.cjs');

const main = {
  ProcessId: 1234,
  ExecutablePath: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1_x64__abc\\app\\ChatGPT.exe',
  CommandLine: '"C:\\Program Files\\WindowsApps\\OpenAI.Codex_1_x64__abc\\app\\ChatGPT.exe" --remote-debugging-port=53145',
};

test('discovers Store Codex under ChatGPT.exe while excluding renderer and CLI processes', () => {
  const renderer = { ...main, ProcessId: 1235, CommandLine: main.CommandLine + ' --type=renderer' };
  const cli = { ...main, ProcessId: 1236, ExecutablePath: 'C:\\Tools\\codex.exe' };
  assert.deepEqual(selectConnection([renderer, cli, main]), {
    pid: 1234, appPath: main.ExecutablePath, port: '53145', userDataDir: '',
  });
});

test('handles PowerShell singleton JSON and a quoted profile with spaces', () => {
  const singleton = { ...main, CommandLine: main.CommandLine + ' --user-data-dir="C:\\Users\\test\\App Data"' };
  assert.equal(selectConnection(singleton).userDataDir, 'C:\\Users\\test\\App Data');
  assert.equal(flag('--remote-debugging-port 53145', 'remote-debugging-port'), '53145');
});

test('fails closed for unrelated ChatGPT, ambiguous instances and missing CDP', () => {
  assert.throws(() => selectConnection({ ...main, ExecutablePath: 'C:\\Apps\\ChatGPT.exe' }), /No running/);
  assert.throws(() => selectConnection([main, { ...main, ProcessId: 5678 }]), /More than one/);
  for (const value of ['', '0', '65536', 'abc']) {
    assert.throws(() => selectConnection({ ...main, CommandLine: '--remote-debugging-port=' + value }), /No running/);
  }
});

test('discovered settings preserve explicit endpoint and app overrides', () => {
  const env = { PRISM_CODEX_APP_PATH: 'explicit.exe', PRISM_CODEX_CDP_URL: 'http://127.0.0.1:9000' };
  applyConnection(env, { appPath: main.ExecutablePath, port: '53145', userDataDir: '' });
  assert.equal(env.PRISM_CODEX_APP_PATH, 'explicit.exe');
  assert.equal(env.PRISM_CODEX_CDP_URL, 'http://127.0.0.1:9000');
  assert.equal(env.PRISM_CODEX_CDP_PORT, undefined);
});

test('a desktop without CDP remains recognizable but unavailable for control', () => {
  assert.equal(selectDesktop({ ...main, CommandLine: 'ChatGPT.exe' }).port, '');
  assert.throws(() => selectConnection({ ...main, CommandLine: 'ChatGPT.exe' }), /shortcut/);
});

test('refresh follows port changes and clears stale connection after desktop exit', async () => {
  let snapshot = main;
  const env = {};
  const refresh = createConnectionRefresher(env, async () => snapshot);
  await refresh();
  assert.equal(env.PRISM_CODEX_CDP_PORT, '53145');
  snapshot = { ...main, CommandLine: '--remote-debugging-port=54146' };
  await refresh();
  assert.equal(env.PRISM_CODEX_CDP_PORT, '54146');
  snapshot = { ...main, CommandLine: 'ChatGPT.exe' };
  await refresh();
  assert.equal(env.PRISM_CODEX_CDP_PORT, undefined);
  assert.equal(env.PRISM_CODEX_APP_PATH, main.ExecutablePath);
  snapshot = [];
  await assert.rejects(refresh(), /No running/);
  assert.equal(env.PRISM_CODEX_APP_PATH, undefined);
});

test('concurrent refreshes share process discovery and preserve an explicit endpoint', async () => {
  let calls = 0;
  const env = { PRISM_CODEX_CDP_URL: 'http://127.0.0.1:9229' };
  const refresh = createConnectionRefresher(env, async () => { calls++; return main; });
  await Promise.all([refresh(), refresh(), refresh()]);
  assert.equal(calls, 1);
  assert.equal(env.PRISM_CODEX_CDP_PORT, undefined);
  assert.equal(env.PRISM_CODEX_CDP_URL, 'http://127.0.0.1:9229');
});
