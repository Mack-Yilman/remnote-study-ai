// rsa doctor: revisa todo lo que necesita el plugin y dice cómo arreglar lo que falte.
import fs from 'node:fs';
import path from 'node:path';
import { archivo, leerConfig } from './config.mjs';
import { puertoAbierto, procesoAbierto, enviar } from './remnote.mjs';
import { leer as leerIncidencias } from './incidencias.mjs';
import { NOMBRE, RAIZ, rutas, cmd, entradaViejaAgy, mcpViejoClaude } from './instalar.mjs';

export async function doctor() {
  const filas = [];
  const add = (ok, que, detalle, arreglo = '') => filas.push({ ok, que, detalle, arreglo });
  const cfg = leerConfig();

  add(fs.existsSync(archivo('config.env')), 'Configuración', archivo('config.env'), 'node scripts/rsa.mjs instalar --aplicar');
  const conPrefijo = /^Bearer\s+\S/.test(cfg.auth);
  add(conPrefijo, 'Token', !cfg.auth ? 'vacío' : conPrefijo ? 'configurado (Bearer …)' : 'configurado sin el prefijo «Bearer »',
    'Pega en REMNOTE_MCP_AUTH el token de RemNote (Settings → Developer → MCP) como «Bearer <token>»');
  add(fs.existsSync(cfg.exe), 'RemNote instalado', cfg.exe, 'Corrige REMNOTE_EXE_PATH en config.env');

  const abierto = await puertoAbierto(cfg.host, cfg.port);
  if (abierto) {
    try {
      const { mensajes } = await enviar(cfg, JSON.stringify({ jsonrpc: '2.0', id: 'doctor', method: 'tools/list' }));
      const n = JSON.parse(mensajes.at(-1)).result?.tools?.length || 0;
      add(n > 0, 'Servidor MCP de RemNote', `${cfg.url} responde con ${n} herramientas`);
    } catch (e) {
      add(false, 'Servidor MCP de RemNote', e.message);
    }
  } else {
    const proc = procesoAbierto();
    add(null, 'Servidor MCP de RemNote', proc ? 'RemNote está abierto pero el puerto no responde' : 'RemNote cerrado (se abre solo al usarlo)',
      proc ? 'Activa el servidor MCP en RemNote: Settings → Developer' : '');
  }

  let herramientas = 0;
  try { herramientas = JSON.parse(fs.readFileSync(archivo('cache.json'), 'utf8')).toolsListResult?.tools?.length || 0; } catch { /* sin caché */ }
  add(herramientas > 0 || null, 'Caché de herramientas', herramientas ? `${herramientas} herramientas` : 'vacía: se llena la primera vez que RemNote esté abierto');

  if (cmd('claude', ['--version']).ok) {
    add(cmd('claude', ['plugin', 'list']).out.includes(`${NOMBRE}@${NOMBRE}`), 'Plugin en Claude Code', `${NOMBRE}@${NOMBRE}`, 'node scripts/rsa.mjs instalar --aplicar');
    add(!mcpViejoClaude(), 'Sin MCP viejo en Claude Code', 'claude mcp get remnote', 'claude mcp remove remnote -s user');
  }
  const r = rutas();
  if (fs.existsSync(r.agyConfig)) {
    let v = null;
    try { v = JSON.parse(fs.readFileSync(path.join(r.agyPlugin, 'plugin.json'), 'utf8')).version; } catch { /* no instalado */ }
    const actual = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version;
    add(v === actual, 'Plugin en Antigravity', v ? `${v}${v === actual ? '' : ` (este repo es ${actual})`}` : 'no instalado', 'node scripts/rsa.mjs instalar --aplicar --solo agy');
    add(!entradaViejaAgy(), 'Sin MCP viejo en Antigravity', r.agyMcp, 'node scripts/rsa.mjs instalar --aplicar');
    const restos = r.viejos.filter((f) => fs.existsSync(f));
    add(!restos.length, 'Sin archivos del puente viejo', restos.length ? restos.join(', ') : 'limpio', 'node scripts/rsa.mjs instalar --aplicar');
  }

  const inc = leerIncidencias(5);
  const lineas = filas.map((f) => `${f.ok === true ? '✔' : f.ok === null ? '·' : '✘'} ${f.que}: ${f.detalle}${f.ok === false && f.arreglo ? `\n    → ${f.arreglo}` : ''}`);
  if (inc.length) lineas.push('', 'Últimas incidencias (~/.remnote-study-ai/incidencias.jsonl):', ...inc.map((i) => `  ${i.fecha} [${i.tipo}] ${i.detalle}`));
  return { ok: filas.every((f) => f.ok !== false), texto: lineas.join('\n') };
}
