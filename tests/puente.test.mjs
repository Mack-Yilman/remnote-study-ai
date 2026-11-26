import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { iniciar } from './fakes/servidor-mcp.mjs';

const PUENTE = path.resolve(import.meta.dirname, '..', 'scripts', 'puente.mjs');

function crearHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rsa-'));
}

async function puertoLibre() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}

function lanzarPuente(home, url) {
  const env = {
    ...process.env,
    REMNOTE_STUDY_AI_HOME: home,
    RSA_HOME_OVERRIDE: home,
    REMNOTE_EXE_PATH: path.join(home, 'no-existe-RemNote.exe'),
    REMNOTE_MCP_URL: url,
    REMNOTE_MCP_AUTH: 'Bearer rn_mcp_PRUEBA123',
    REMNOTE_WAIT_MS: '1500',
  };

  const proc = spawn(process.execPath, [PUENTE], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d.toString('utf8');
  });

  const mensajes = [];
  const waiters = new Map();

  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && waiters.has(msg.id)) {
      const resolve = waiters.get(msg.id);
      waiters.delete(msg.id);
      resolve(msg);
    } else {
      mensajes.push(msg);
    }
  });

  function enviar(obj) {
    proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  function esperarId(id) {
    const idx = mensajes.findIndex((m) => m.id === id);
    if (idx >= 0) {
      return Promise.resolve(mensajes.splice(idx, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(id);
        reject(new Error(`Timeout esperando respuesta id=${id}`));
      }, 5000);
      waiters.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  async function cerrar() {
    rl.close();
    if (proc.exitCode === null && proc.signalCode === null) {
      proc.stdin.end();
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          proc.kill();
          resolve();
        }, 2000);
        proc.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  return {
    enviar,
    esperarId,
    cerrar,
    getStderr: () => stderr,
    getMensajesExtra: () => mensajes,
  };
}

test('1. Cerrado y sin caché: initialize, ping y notificación', { timeout: 10_000 }, async () => {
  const home = crearHome();
  const port = await puertoLibre();
  const p = lanzarPuente(home, `http://127.0.0.1:${port}/mcp`);
  try {
    p.enviar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const init = await p.esperarId(1);
    assert.equal(init.result.serverInfo.name, 'remnote');

    p.enviar({ jsonrpc: '2.0', id: 2, method: 'ping' });
    const ping = await p.esperarId(2);
    assert.deepEqual(ping.result, {});

    p.enviar({ jsonrpc: '2.0', method: 'notifications/initialized' });
    p.enviar({ jsonrpc: '2.0', id: 3, method: 'ping' });
    const ping2 = await p.esperarId(3);
    assert.deepEqual(ping2.result, {});
    assert.equal(p.getMensajesExtra().length, 0);
  } finally {
    await p.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('2. Cerrado y con cache.json: tools/list devuelve la herramienta cacheada', { timeout: 10_000 }, async () => {
  const home = crearHome();
  fs.writeFileSync(
    path.join(home, 'cache.json'),
    JSON.stringify({ toolsListResult: { tools: [{ name: 'x', inputSchema: { type: 'object' } }] } }),
    'utf8'
  );
  const port = await puertoLibre();
  const p = lanzarPuente(home, `http://127.0.0.1:${port}/mcp`);
  try {
    p.enviar({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const res = await p.esperarId(1);
    assert.equal(res.result.tools.length, 1);
    assert.equal(res.result.tools[0].name, 'x');
  } finally {
    await p.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('3. Cerrado: tools/call devuelve error con REMNOTE_EXE_PATH y no filtra token en incidencias', { timeout: 10_000 }, async () => {
  const home = crearHome();
  const port = await puertoLibre();
  const p = lanzarPuente(home, `http://127.0.0.1:${port}/mcp`);
  try {
    p.enviar({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_docs', arguments: {} } });
    const res = await p.esperarId(1);
    assert.ok(res.error);
    assert.match(res.error.message, /REMNOTE_EXE_PATH/);

    const incPath = path.join(home, 'incidencias.jsonl');
    assert.ok(fs.existsSync(incPath));
    const inc = fs.readFileSync(incPath, 'utf8');
    assert.ok(!inc.includes('rn_mcp_PRUEBA123'));
  } finally {
    await p.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('4. Abierto (modo json): tools/call envía authorization y tools/list actualiza cache.json', { timeout: 10_000 }, async () => {
  const home = crearHome();
  const srv = await iniciar({ modo: 'json' });
  const p = lanzarPuente(home, srv.url);
  try {
    p.enviar({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_docs', arguments: {} } });
    const callRes = await p.esperarId(1);
    assert.equal(callRes.result.structuredContent.ok, true);
    assert.equal(srv.peticiones.length, 1);
    assert.equal(srv.peticiones[0].headers.authorization, 'Bearer rn_mcp_PRUEBA123');

    p.enviar({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    await p.esperarId(2);
    const cache = JSON.parse(fs.readFileSync(path.join(home, 'cache.json'), 'utf8'));
    assert.ok(cache.toolsListResult.tools.some((t) => t.name === 'search_docs'));
  } finally {
    await p.cerrar();
    await srv.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('5. Abierto (modo sse): tools/call devuelve el resultado', { timeout: 10_000 }, async () => {
  const home = crearHome();
  const srv = await iniciar({ modo: 'sse' });
  const p = lanzarPuente(home, srv.url);
  try {
    p.enviar({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_docs', arguments: {} } });
    const res = await p.esperarId(1);
    assert.equal(res.result.structuredContent.ok, true);
  } finally {
    await p.cerrar();
    await srv.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('6. Abierto (modo 401): tools/call falla mencionando token, no reintenta y oculta token', { timeout: 10_000 }, async () => {
  const home = crearHome();
  const srv = await iniciar({ modo: '401' });
  const p = lanzarPuente(home, srv.url);
  try {
    p.enviar({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_docs', arguments: {} } });
    const res = await p.esperarId(1);
    assert.ok(res.error);
    assert.match(res.error.message, /token/i);
    assert.equal(srv.peticiones.length, 1);

    const incPath = path.join(home, 'incidencias.jsonl');
    const inc = fs.existsSync(incPath) ? fs.readFileSync(incPath, 'utf8') : '';
    assert.ok(!inc.includes('rn_mcp_PRUEBA123'));
    assert.ok(!p.getStderr().includes('rn_mcp_PRUEBA123'));
  } finally {
    await p.cerrar();
    await srv.cerrar();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
