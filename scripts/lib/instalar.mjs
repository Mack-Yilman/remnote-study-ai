// rsa instalar [--aplicar] [--fuente <owner/repo|ruta>] [--solo claude|agy]
// Instala o actualiza el plugin en Claude Code y en Antigravity y retira por completo el puente viejo.
// Sin --aplicar solo muestra los pasos.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { archivo, dirDatos, escribirConfig } from './config.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NOMBRE = 'remnote-study-ai';
const casa = () => process.env.RSA_HOME_OVERRIDE || os.homedir();
export const rutas = () => ({
  agyConfig: path.join(casa(), '.gemini', 'config'),
  agyPlugin: path.join(casa(), '.gemini', 'config', 'plugins', NOMBRE),
  agyMcp: path.join(casa(), '.gemini', 'config', 'mcp_config.json'),
  viejos: [
    path.join(casa(), '.gemini', 'antigravity', 'remnote-mcp-bridge.mjs'),
    path.join(casa(), '.gemini', 'antigravity', 'remnote-mcp-cache.json'),
  ],
  // Ubicación del puente anterior a 0.1.0 en la PC del autor; solo se lee para migrar el token.
  envViejo: path.join(casa(), 'Desktop', 'CLAUDE', 'Proyectos', 'remnote-mcp-bridge', '.env'),
});

const version = () => JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version;

export function cmd(bin, args) {
  try {
    return { ok: true, out: execFileSync(bin, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` || e.message };
  }
}
export const agyBin = () => {
  const p = path.join(process.env.LOCALAPPDATA || '', 'agy', 'bin', 'agy.exe');
  return fs.existsSync(p) ? p : 'agy';
};

// Entrada «remnote» del mcp_config.json global de agy que apunta al puente viejo.
export function entradaViejaAgy() {
  try {
    const c = JSON.parse(fs.readFileSync(rutas().agyMcp, 'utf8'));
    const e = c.mcpServers?.remnote;
    return e && JSON.stringify(e).includes('remnote-mcp-bridge') ? { config: c, entrada: e } : null;
  } catch {
    return null;
  }
}

export const mcpViejoClaude = () => {
  const r = cmd('claude', ['mcp', 'get', 'remnote']);
  return r.ok && /remnote-mcp-bridge/.test(r.out);
};

function pasosConfig() {
  if (fs.existsSync(archivo('config.env'))) return [];
  const r = rutas();
  let origen = null;
  let valores = null;
  if (fs.existsSync(r.envViejo)) {
    origen = r.envViejo;
    valores = parseEnv(fs.readFileSync(r.envViejo, 'utf8'));
  } else if (entradaViejaAgy()) {
    origen = 'la entrada remnote de ~/.gemini/config/mcp_config.json';
    valores = entradaViejaAgy().entrada.env || {};
  }
  return [{
    desc: origen ? `Crear ${archivo('config.env')} con el token de ${origen}` : `Crear ${archivo('config.env')} vacío (pega tu token en REMNOTE_MCP_AUTH)`,
    hacer: () => escribirConfig({
      REMNOTE_MCP_AUTH: valores?.REMNOTE_MCP_AUTH || '',
      REMNOTE_MCP_URL: valores?.REMNOTE_MCP_URL || 'http://127.0.0.1:7788/mcp',
      REMNOTE_EXE_PATH: valores?.REMNOTE_EXE_PATH || 'C:\\Program Files\\RemNote\\RemNote.exe',
      REMNOTE_WAIT_MS: valores?.REMNOTE_WAIT_MS || '60000',
    }),
  }, ...(valores?.REMNOTE_MCP_AUTH ? [] : [{ desc: 'AVISO: falta el token; cópialo de RemNote (Settings → Developer → MCP)', hacer: () => {} }])];
}

function pasosClaude(fuente) {
  if (!cmd('claude', ['--version']).ok) return [{ desc: 'Claude Code no está instalado: se omite', hacer: () => {} }];
  const pasos = [];
  if (mcpViejoClaude()) pasos.push({ desc: 'Quitar el MCP viejo de Claude Code (claude mcp remove remnote -s user)', hacer: () => must(cmd('claude', ['mcp', 'remove', 'remnote', '-s', 'user'])) });
  const mkt = cmd('claude', ['plugin', 'marketplace', 'list']).out;
  pasos.push(mkt.includes(NOMBRE)
    ? { desc: `Actualizar el marketplace ${NOMBRE}`, hacer: () => must(cmd('claude', ['plugin', 'marketplace', 'update', NOMBRE])) }
    : { desc: `Agregar el marketplace ${fuente}`, hacer: () => must(cmd('claude', ['plugin', 'marketplace', 'add', fuente])) });
  const instalado = cmd('claude', ['plugin', 'list']).out.includes(`${NOMBRE}@${NOMBRE}`);
  pasos.push(instalado
    ? { desc: `Actualizar el plugin ${NOMBRE}@${NOMBRE}`, hacer: () => must(cmd('claude', ['plugin', 'update', `${NOMBRE}@${NOMBRE}`])) }
    : { desc: `Instalar el plugin ${NOMBRE}@${NOMBRE} (alcance de usuario)`, hacer: () => must(cmd('claude', ['plugin', 'install', `${NOMBRE}@${NOMBRE}`, '--scope', 'user'])) });
  return pasos;
}

// Copia autocontenida para agy: agy no da la ruta del plugin a sus MCP, así que se escriben rutas absolutas.
export function copiarAAgy(destino) {
  // Se sobrescribe en el lugar: con Antigravity abierto, su puente usa la carpeta y Windows no deja borrarla (EPERM).
  // shortcut: un archivo que una versión futura elimine quedaría en la copia; si pasa, borrar la carpeta con agy cerrado.
  fs.mkdirSync(destino, { recursive: true });
  for (const d of ['skills', 'scripts', 'schemas']) fs.cpSync(path.join(RAIZ, d), path.join(destino, d), { recursive: true, force: true });
  const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'agy', 'plugin.json'), 'utf8'));
  manifiesto.version = version();
  fs.writeFileSync(path.join(destino, 'plugin.json'), JSON.stringify(manifiesto, null, 2) + '\n');
  fs.writeFileSync(path.join(destino, 'mcp_config.json'), JSON.stringify({
    mcpServers: { remnote: { command: process.execPath, args: [path.join(destino, 'scripts', 'puente.mjs')] } },
  }, null, 2) + '\n');
}

function pasosAgy() {
  const r = rutas();
  if (!fs.existsSync(r.agyConfig)) return [{ desc: 'Antigravity no está instalado (~/.gemini/config): se omite', hacer: () => {} }];
  const pasos = [];
  const vieja = entradaViejaAgy();
  if (vieja) {
    pasos.push({
      desc: `Quitar la entrada remnote vieja de ${r.agyMcp} (respaldo sin el token en ${path.basename(r.agyMcp)}.bak-${hoy()})`,
      hacer: () => {
        // Se relee aquí (otro proceso pudo cambiarlo) y se escribe de forma atómica: temporal + rename.
        const original = fs.readFileSync(r.agyMcp, 'utf8');
        const actual = JSON.parse(original);
        let bak = `${r.agyMcp}.bak-${hoy()}`;
        for (let n = 2; fs.existsSync(bak); n++) bak = `${r.agyMcp}.bak-${hoy()}_${n}`;
        // Solo se tapa el token de RemNote: los de otros servidores deben quedar intactos para poder restaurar.
        fs.writeFileSync(bak, original.replace(/rn_mcp_[\w-]+/g, 'rn_mcp_***'));
        delete actual.mcpServers.remnote;
        const tmp = `${r.agyMcp}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, JSON.stringify(actual, null, 2) + '\n');
        fs.renameSync(tmp, r.agyMcp);
      },
    });
  }
  for (const f of r.viejos.filter((f) => fs.existsSync(f))) pasos.push({ desc: `Borrar ${f}`, hacer: () => fs.rmSync(f) });
  pasos.push({ desc: `${fs.existsSync(r.agyPlugin) ? 'Actualizar' : 'Instalar'} el plugin en ${r.agyPlugin}`, hacer: () => copiarAAgy(r.agyPlugin) });
  pasos.push({ desc: 'Validar con agy plugin validate', hacer: () => must(cmd(agyBin(), ['plugin', 'validate', r.agyPlugin])) });
  return pasos;
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function must(r) {
  if (!r.ok) throw new Error(r.out.trim());
  return r.out;
}

export function instalar({ aplicar = false, fuente = `Mack-Yilman/${NOMBRE}`, solo = null } = {}) {
  fs.mkdirSync(dirDatos(), { recursive: true });
  const pasos = [
    ...pasosConfig(),
    ...(solo === 'agy' ? [] : pasosClaude(fuente)),
    ...(solo === 'claude' ? [] : pasosAgy()),
  ];
  const lineas = [];
  for (const p of pasos) {
    if (!aplicar) { lineas.push(`• ${p.desc}`); continue; }
    try {
      p.hacer();
      lineas.push(`✔ ${p.desc}`);
    } catch (e) {
      lineas.push(`✘ ${p.desc}: ${e.message}`);
    }
  }
  if (!aplicar) lineas.push('', 'Modo en seco: nada cambió. Repite con --aplicar para hacerlo.');
  else lineas.push('', 'Reinicia Claude Code y Antigravity para que carguen el plugin.');
  return lineas.join('\n');
}
