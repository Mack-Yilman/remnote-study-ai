#!/usr/bin/env node
// Puente MCP stdio → HTTP hacia el servidor MCP de RemNote Desktop (http://127.0.0.1:7788/mcp).
// - Con RemNote cerrado, responde el descubrimiento (initialize, tools/list…) desde la caché, sin abrirlo.
// - Ante una llamada real (tools/call), abre RemNote minimizado y espera a que el servidor responda.
// La configuración (token incluido) se lee de ~/.remnote-study-ai/config.env; nunca va en los argumentos.
import fs from 'node:fs';
import readline from 'node:readline';
import { leerConfig, archivo, dirDatos } from './lib/config.mjs';
import { puertoAbierto, asegurarListo, enviar, ErrorHttp, noEntregado } from './lib/remnote.mjs';
import { anotar } from './lib/incidencias.mjs';

const cfg = leerConfig();
const CACHE = archivo('cache.json');
const INSTRUCCIONES = 'Use search_docs to find document IDs before reading or updating documents. Write tools modify the active RemNote knowledge base.';
let sesion = null;

const log = (m) => process.stderr.write(`[remnote-study-ai] ${m}\n`);
const escribir = (obj) => process.stdout.write((typeof obj === 'string' ? obj : JSON.stringify(obj)) + '\n');

function leerCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch {
    return {};
  }
}

function guardarCache(clave, valor) {
  try {
    fs.mkdirSync(dirDatos(), { recursive: true });
    const c = leerCache();
    c[clave] = valor;
    fs.writeFileSync(CACHE, JSON.stringify(c), 'utf8');
  } catch {
    // La caché es un atajo; si no se puede escribir, el puente sigue funcionando.
  }
}

// Respuestas de descubrimiento sin RemNote. Devuelve false si hay que ir al servidor real.
function responderSinConexion(msg) {
  if (msg.id === undefined) return true; // notificaciones: no esperan respuesta
  const c = leerCache();
  const r = (result) => { escribir({ jsonrpc: '2.0', id: msg.id, result }); return true; };
  switch (msg.method) {
    case 'initialize':
      return r(c.initializeResult || {
        protocolVersion: msg.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'remnote', title: 'RemNote', version: '1.0.0' },
        instructions: INSTRUCCIONES,
      });
    case 'tools/list':
      return c.toolsListResult?.tools?.length ? r(c.toolsListResult) : false; // sin caché: se abre RemNote una vez
    case 'resources/list': return r({ resources: [] });
    case 'resources/templates/list': return r({ resourceTemplates: [] });
    case 'prompts/list': return r({ prompts: [] });
    case 'ping': return r({});
    default: return false;
  }
}

function error(msg, mensaje) {
  if (msg.id !== undefined) escribir({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32000, message: mensaje } });
}

async function procesar(linea) {
  const texto = linea.trim();
  if (!texto) return;
  let msg;
  try {
    msg = JSON.parse(texto);
  } catch (e) {
    log(`JSON inválido en stdin: ${e.message}`);
    return;
  }

  const abierto = await puertoAbierto(cfg.host, cfg.port);
  if (!abierto && msg.method !== 'tools/call' && responderSinConexion(msg)) return;

  if (!abierto) {
    const listo = await asegurarListo(cfg);
    if (!listo.ok) return error(msg, listo.mensaje);
  }

  let ultimo = null;
  for (let intento = 1; intento <= 5; intento++) {
    try {
      const res = await enviar(cfg, texto, sesion);
      sesion = res.sesion;
      if (msg.method === 'initialize' || msg.method === 'tools/list') {
        try {
          const r = JSON.parse(res.mensajes.at(-1)).result;
          if (r) guardarCache(msg.method === 'initialize' ? 'initializeResult' : 'toolsListResult', r);
        } catch { /* respuesta no JSON: no se cachea */ }
      }
      res.mensajes.forEach((m) => escribir(m));
      // Una petición con id que recibe 202 o un cuerpo vacío dejaría al cliente esperando para siempre.
      if (msg.id !== undefined && !res.mensajes.some((m) => { try { return JSON.parse(m).id === msg.id; } catch { return false; } })) {
        error(msg, 'RemNote no devolvió respuesta a esta petición.');
      }
      return;
    } catch (e) {
      ultimo = e;
      if (e instanceof ErrorHttp && !e.reintentable) break; // 401, 400…: reintentar no lo arregla
      // Una herramienta puede escribir: solo se reintenta si la petición no llegó a RemNote.
      if (msg.method === 'tools/call' && !noEntregado(e)) break;
      log(`Intento ${intento}/5 fallido: ${e.cause?.code || e.message}`);
      if (intento < 5) {
        await new Promise((r) => setTimeout(r, 500));
        await asegurarListo(cfg);
      }
    }
  }
  const mensaje = ultimo instanceof ErrorHttp ? ultimo.message : `Error comunicando con RemNote (${cfg.url}): ${ultimo?.cause?.code || ultimo?.message}`;
  anotar(ultimo instanceof ErrorHttp ? `http-${ultimo.status}` : 'red', `${msg.method} ${msg.params?.name || ''}: ${mensaje}`);
  error(msg, mensaje);
}

let cola = Promise.resolve();
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (l) => { cola = cola.then(() => procesar(l)).catch((e) => log(`Error inesperado: ${e.message}`)); });
rl.on('close', () => cola.then(() => process.exit(0)));
