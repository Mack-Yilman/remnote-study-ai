import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { asegurarListo } from '../scripts/lib/remnote.mjs';

test('1. Puerto abierto pero la app no responde: no relanza RemNote y el fallo es «tiempo», no «sin-mcp»', { timeout: 15_000 }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rsa-'));
  process.env.REMNOTE_STUDY_AI_HOME = home;
  // Acepta la conexión y nunca responde: como RemNote cuando el puerto abrió y la app sigue cargando.
  const sockets = [];
  const srv = net.createServer((s) => sockets.push(s));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  let lanzado = 0;
  try {
    const cfg = { host: '127.0.0.1', port, url: `http://127.0.0.1:${port}/mcp`, auth: '', exe: path.join(home, 'no-existe.exe'), esperaMs: 1500 };
    const r = await asegurarListo(cfg, { lanzar: () => { lanzado++; }, sondeoMs: 100 });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'tiempo');
    assert.equal(lanzado, 0);
  } finally {
    sockets.forEach((s) => s.destroy());
    await new Promise((r) => srv.close(r));
    fs.rmSync(home, { recursive: true, force: true });
  }
});
