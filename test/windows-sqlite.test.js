const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSqliteBinary } = require('../windows-sqlite.cjs');

const sdkSqlite = 'C:\\Users\\tester\\AppData\\Local\\Android\\Sdk\\platform-tools\\sqlite3.exe';
const options = { home: 'C:\\Users\\tester', exists: value => value === sdkSqlite };

test('finds SDK SQLite with LOCALAPPDATA and SDK PATH missing in Hub child environment', () => {
  assert.equal(resolveSqliteBinary({}, options), sdkSqlite);
  assert.equal(resolveSqliteBinary({ PRISM_SQLITE3_BIN: 'sqlite3' }, options), sdkSqlite);
});

test('preserves an explicitly configured executable', () => {
  assert.equal(resolveSqliteBinary({ PRISM_SQLITE3_BIN: 'D:\\Tools\\SQLite\\sqlite3.exe' }, options), 'D:\\Tools\\SQLite\\sqlite3.exe');
});

test('keeps PATH fallback if no SDK SQLite exists', () => {
  assert.equal(resolveSqliteBinary({}, { ...options, exists: () => false }), 'sqlite3');
});
