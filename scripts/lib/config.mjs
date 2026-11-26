// Configuración del usuario: vive fuera del plugin (las actualizaciones reemplazan su carpeta) y fuera del repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';

export function dirDatos() {
  return process.env.REMNOTE_STUDY_AI_HOME || path.join(os.homedir(), '.remnote-study-ai');
}

export const archivo = (nombre) => path.join(dirDatos(), nombre);

export function leerArchivoEnv() {
  try {
    return parseEnv(fs.readFileSync(archivo('config.env'), 'utf8'));
  } catch {
    return {};
  }
}

// Las variables de entorno ganan al archivo, para pruebas o configuraciones puntuales.
export function leerConfig() {
  const f = leerArchivoEnv();
  const v = (k, def) => process.env[k] || f[k] || def;
  const url = new URL(v('REMNOTE_MCP_URL', 'http://127.0.0.1:7788/mcp'));
  return {
    url: url.href,
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    auth: v('REMNOTE_MCP_AUTH', ''),
    exe: v('REMNOTE_EXE_PATH', 'C:\\Program Files\\RemNote\\RemNote.exe'),
    esperaMs: Number(v('REMNOTE_WAIT_MS', 60000)),
  };
}

export function escribirConfig(valores) {
  fs.mkdirSync(dirDatos(), { recursive: true });
  const lineas = Object.entries(valores)
    .filter(([, val]) => val !== undefined && val !== '')
    .map(([k, val]) => `${k}=${val}`);
  fs.writeFileSync(archivo('config.env'), lineas.join('\n') + '\n', 'utf8');
}

// Nunca dejar el token en logs, incidencias ni salidas.
export function ocultar(texto) {
  return String(texto).replace(/rn_mcp_[\w-]+/g, 'rn_mcp_***').replace(/(Bearer\s+)[\w.~+/=-]{8,}/gi, '$1***');
}
