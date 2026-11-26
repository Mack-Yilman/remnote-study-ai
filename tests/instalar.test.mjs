import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rsa-'));
process.env.REMNOTE_STUDY_AI_HOME = home;
process.env.RSA_HOME_OVERRIDE = home;

const { copiarAAgy, entradaViejaAgy, RAIZ } = await import('../scripts/lib/instalar.mjs');
const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));

test.after(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

test(
  '1. copiarAAgy crea plugin.json, mcp_config.json y copia carpetas',
  { timeout: 10_000 },
  () => {
    const destino = path.join(home, 'agy-plugin');
    copiarAAgy(destino);

    const pluginJson = JSON.parse(fs.readFileSync(path.join(destino, 'plugin.json'), 'utf8'));
    assert.equal(pluginJson.version, pkg.version);

    const mcpConfig = JSON.parse(fs.readFileSync(path.join(destino, 'mcp_config.json'), 'utf8'));
    const arg0 = mcpConfig.mcpServers.remnote.args[0];
    assert.ok(arg0.endsWith(path.join('scripts', 'puente.mjs')));
    assert.ok(fs.existsSync(arg0));

    assert.ok(fs.existsSync(path.join(destino, 'scripts')));
    assert.ok(fs.existsSync(path.join(destino, 'schemas')));
    assert.ok(fs.existsSync(path.join(destino, 'skills', 'remnote', 'SKILL.md')));
  }
);

test('3. las rutas que cita el SKILL.md existen', () => {
  const dir = path.join(RAIZ, 'skills', 'remnote');
  const md = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');
  const citadas = [...md.matchAll(/\]\((references\/[^)]+)\)/g)].map((m) => m[1]);
  assert.ok(citadas.length >= 3);
  for (const r of citadas) assert.ok(fs.existsSync(path.join(dir, r)), r);
  for (const r of ['scripts/rsa.mjs', 'schemas/errores.schema.json']) assert.ok(fs.existsSync(path.join(RAIZ, r)), r);
});

test('2. entradaViejaAgy detecta puente viejo y devuelve null si apunta a otra cosa', { timeout: 10_000 }, () => {
  const agyConfigDir = path.join(home, '.gemini', 'config');
  const mcpPath = path.join(agyConfigDir, 'mcp_config.json');
  fs.mkdirSync(agyConfigDir, { recursive: true });

  fs.writeFileSync(
    mcpPath,
    JSON.stringify({
      mcpServers: {
        remnote: { command: 'node', args: ['C:/viejo/remnote-mcp-bridge.mjs'] },
      },
    }),
    'utf8'
  );
  const vieja = entradaViejaAgy();
  assert.ok(vieja);
  assert.ok(vieja.entrada.args[0].includes('remnote-mcp-bridge'));

  fs.writeFileSync(
    mcpPath,
    JSON.stringify({
      mcpServers: {
        remnote: { command: 'node', args: ['C:/nuevo/scripts/puente.mjs'] },
      },
    }),
    'utf8'
  );
  assert.equal(entradaViejaAgy(), null);
});
