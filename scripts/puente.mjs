#!/usr/bin/env node
// Puente MCP stdio → HTTP hacia el servidor MCP de RemNote Desktop (http://127.0.0.1:7788/mcp).
// - El puente NUNCA abre RemNote: arranca en todas las sesiones (el plugin es de usuario) y Claude Code sondea cada
//   servidor con `server/discover` al iniciar, así que abrirlo aquí lo abría en cualquier proyecto (0.2.0). Solo la
//   skill lo abre, con `rsa abrir`.
// - Con RemNote cerrado, responde el descubrimiento desde la caché (o la lista incluida en el plugin) y rechaza el resto.
// La configuración (token incluido) se lee de ~/.remnote-study-ai/config.env; nunca va en los argumentos.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { leerConfig, archivo, dirDatos } from './lib/config.mjs';
import { puertoAbierto, enviar, ErrorHttp, noEntregado } from './lib/remnote.mjs';
import { anotar } from './lib/incidencias.mjs';

const cfg = leerConfig();
const CACHE = archivo('cache.json');
const INCLUIDA = path.join(import.meta.dirname, '..', 'schemas', 'herramientas-remnote.json');
// Se inyecta en todas las sesiones: breve, y frena las llamadas que el usuario no pidió.
const INSTRUCCIONES = 'Herramientas de RemNote (plugin remnote-study-ai). Úsalas solo si el usuario pide algo de RemNote, y antes carga la skill remnote: es la que abre RemNote. Usa search_docs para obtener los ids antes de leer o editar; las herramientas de escritura modifican la base del usuario.';
const CERRADO = 'RemNote está cerrado. Carga la skill remnote (ejecuta `rsa abrir`) y repite la llamada.';
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

function listaIncluida() {
  try {
    return JSON.parse(fs.readFileSync(INCLUIDA, 'utf8'));
  } catch {
    return { tools: [] };
  }
}

const conInstrucciones = (r) => ({ ...r, instructions: INSTRUCCIONES });

function error(msg, mensaje, code = -32000) {
  if (msg.id !== undefined) escribir({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message: mensaje } });
}

// Con RemNote cerrado se responde todo aquí, sin abrirlo.
function responderSinConexion(msg) {
  if (msg.id === undefined) return; // notificaciones: no esperan respuesta
  const c = leerCache();
  const r = (result) => escribir({ jsonrpc: '2.0', id: msg.id, result });
  switch (msg.method) {
    case 'initialize':
      return r(conInstrucciones(c.initializeResult || {
        protocolVersion: msg.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'remnote', title: 'RemNote', version: '1.0.0' },
      }));
    case 'tools/list': return r(c.toolsListResult?.tools?.length ? c.toolsListResult : listaIncluida());
    case 'resources/list': return r({ resources: [] });
    case 'resources/templates/list': return r({ resourceTemplates: [] });
    case 'prompts/list': return r({ prompts: [] });
    case 'ping': return r({});
    case 'tools/call':
      anotar('cerrado', `tools/call ${msg.params?.name || ''}: llamada con RemNote cerrado`);
      return error(msg, CERRADO);
    default: // server/discover y cualquier método nuevo: «no lo conozco», como un servidor anterior a 2026
      return error(msg, `Method not found: ${msg.method}`, -32601);
  }
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

  if (!(await puertoAbierto(cfg.host, cfg.port))) return responderSinConexion(msg);

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
      if (msg.method === 'initialize') {
        res.mensajes = res.mensajes.map((m) => {
          try {
            const o = JSON.parse(m);
            return o.id === msg.id && o.result ? JSON.stringify({ ...o, result: conInstrucciones(o.result) }) : m;
          } catch { return m; }
        });
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
      if (intento < 5) await new Promise((r) => setTimeout(r, 500)); // sin relanzar RemNote: eso es de `rsa abrir`
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
