// Arranque de RemNote Desktop y cliente HTTP de su servidor MCP (compartidos por el puente y el CLI).
import fs from 'node:fs';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { anotar } from './incidencias.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => process.stderr.write(`[remnote-study-ai] ${m}\n`);

export function puertoAbierto(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const fin = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs);
    s.once('connect', () => fin(true));
    s.once('timeout', () => fin(false));
    s.once('error', () => fin(false));
    s.connect(port, host);
  });
}

export function procesoAbierto() {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq RemNote.exe', '/NH'], { encoding: 'utf8', windowsHide: true });
    return /RemNote\.exe/i.test(out);
  } catch {
    return null;
  }
}

export function lanzarRemNote(exe) {
  // Minimizada para no robar el foco; si PowerShell falla, se lanza directo.
  try {
    const ps = `Start-Process -FilePath '${exe.replace(/'/g, "''")}' -WindowStyle Minimized`;
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
      { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  }
}

let enCurso = null;
let ultimoLanzamiento = 0;

// Devuelve { ok: true } o { ok: false, motivo: 'no-instalado' | 'sin-mcp' | 'tiempo', mensaje }.
export function asegurarListo(cfg, { lanzar = lanzarRemNote, sondeoMs = 500 } = {}) {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    if (await puertoAbierto(cfg.host, cfg.port)) return { ok: true };
    if (!fs.existsSync(cfg.exe)) {
      const r = { ok: false, motivo: 'no-instalado', mensaje: `No se encontró RemNote en ${cfg.exe}. Corrige REMNOTE_EXE_PATH en ~/.remnote-study-ai/config.env.` };
      anotar(r.motivo, r.mensaje);
      return r;
    }
    if (Date.now() - ultimoLanzamiento > 30000) {
      ultimoLanzamiento = Date.now();
      log(`Abriendo RemNote minimizado (${cfg.exe})…`);
      lanzar(cfg.exe);
    }
    const limite = Date.now() + cfg.esperaMs;
    while (Date.now() < limite) {
      await sleep(sondeoMs);
      if (await puertoAbierto(cfg.host, cfg.port)) return { ok: true };
    }
    const abierto = procesoAbierto();
    const r = abierto
      ? { ok: false, motivo: 'sin-mcp', mensaje: `RemNote está abierto pero su servidor MCP no responde en ${cfg.host}:${cfg.port}. Actívalo en RemNote: Settings → Developer → MCP server.` }
      : { ok: false, motivo: 'tiempo', mensaje: `RemNote no respondió en ${cfg.esperaMs / 1000} s en ${cfg.host}:${cfg.port}. Ábrelo a mano o sube REMNOTE_WAIT_MS.` };
    anotar(r.motivo, r.mensaje);
    return r;
  })().finally(() => { enCurso = null; });
  return enCurso;
}

export class ErrorHttp extends Error {
  constructor(status, cuerpo) {
    const token = status === 401 || status === 403;
    super(token
      ? `RemNote rechazó el token (HTTP ${status}). Copia el token vigente de RemNote (Settings → Developer → MCP) en REMNOTE_MCP_AUTH de ~/.remnote-study-ai/config.env, con el prefijo «Bearer ».`
      : `HTTP ${status}: ${String(cuerpo).slice(0, 300)}`);
    this.status = status;
    this.reintentable = status >= 500;
  }
}

// Envía un cuerpo JSON-RPC (texto) y devuelve los mensajes JSON-RPC de la respuesta, como texto.
export async function enviar(cfg, cuerpo, sesion = null) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (cfg.auth) headers.Authorization = cfg.auth;
  if (sesion) headers['mcp-session-id'] = sesion;
  const r = await fetch(cfg.url, { method: 'POST', headers, body: cuerpo });
  const nuevaSesion = r.headers.get('mcp-session-id') || sesion;
  const texto = await r.text();
  if (!r.ok && r.status !== 202) throw new ErrorHttp(r.status, texto);
  let mensajes = [];
  if (texto.trim()) {
    mensajes = (r.headers.get('content-type') || '').includes('text/event-stream')
      ? texto.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean)
      : [texto.trim()];
  }
  return { sesion: nuevaSesion, mensajes };
}

let idCliente = 0;

// Cliente directo para el CLI: el servidor de RemNote no exige sesión ni initialize (probado el 2026-11-25).
export async function llamarHerramienta(cfg, nombre, args = {}) {
  const listo = await asegurarListo(cfg);
  if (!listo.ok) throw new Error(listo.mensaje);
  const cuerpo = JSON.stringify({ jsonrpc: '2.0', id: `rsa-${++idCliente}`, method: 'tools/call', params: { name: nombre, arguments: args } });
  const { mensajes } = await enviar(cfg, cuerpo);
  const resp = JSON.parse(mensajes.at(-1) || '{}');
  if (resp.error) throw new Error(`${nombre}: ${resp.error.message}`);
  const res = resp.result || {};
  const texto = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (res.isError) throw new Error(`${nombre}: ${texto}`);
  let datos = res.structuredContent;
  if (datos === undefined) { try { datos = JSON.parse(texto); } catch { datos = texto; } }
  return datos;
}
