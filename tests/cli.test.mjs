import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RSA = path.resolve(import.meta.dirname, '..', 'scripts', 'rsa.mjs');

function correrCli(args, stdin = '') {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rsa-'));
  try {
    return spawnSync(process.execPath, [RSA, ...args], {
      input: stdin,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        REMNOTE_STUDY_AI_HOME: home,
        RSA_HOME_OVERRIDE: home,
        REMNOTE_EXE_PATH: path.join(home, 'no-existe-RemNote.exe'),
      },
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('1. guardia con delete_rem pide confirmación e incluye el id', { timeout: 10_000 }, () => {
  const entrada = JSON.stringify({
    tool_name: 'mcp__plugin_remnote-study-ai_remnote__delete_rem',
    tool_input: { id: 'abc' },
  });
  const res = correrCli(['guardia'], entrada);
  assert.equal(res.status, 0);
  const salida = JSON.parse(res.stdout);
  assert.equal(salida.hookSpecificOutput.permissionDecision, 'ask');
  assert.ok(salida.hookSpecificOutput.permissionDecisionReason.includes('abc'));
});

test('2. sin argumentos imprime ayuda (exit 0) y orden desconocida sale con 2', { timeout: 10_000 }, () => {
  const sinArgs = correrCli([]);
  assert.equal(sinArgs.status, 0);
  assert.match(sinArgs.stdout, /rsa — remnote-study-ai/);

  const desconocida = correrCli(['orden-inexistente']);
  assert.equal(desconocida.status, 2);
});

test('3. tarjetas sin archivo sale con 2', { timeout: 10_000 }, () => {
  const res = correrCli(['tarjetas']);
  assert.equal(res.status, 2);
});
