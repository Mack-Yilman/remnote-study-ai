// Registro de fallos técnicos (RemNote no abrió, token rechazado…) en ~/.remnote-study-ai/incidencias.jsonl.
import fs from 'node:fs';
import { archivo, dirDatos, ocultar } from './config.mjs';

const MAX_BYTES = 512 * 1024;

export function anotar(tipo, detalle, origen = 'puente') {
  try {
    fs.mkdirSync(dirDatos(), { recursive: true });
    const ruta = archivo('incidencias.jsonl');
    // shortcut: al pasar de 512 KB se descarta la mitad antigua; suficiente para depurar.
    if (fs.existsSync(ruta) && fs.statSync(ruta).size > MAX_BYTES) {
      const lineas = fs.readFileSync(ruta, 'utf8').trim().split('\n');
      fs.writeFileSync(ruta, lineas.slice(Math.floor(lineas.length / 2)).join('\n') + '\n');
    }
    const fila = { fecha: new Date().toISOString(), origen, tipo, detalle: ocultar(detalle) };
    fs.appendFileSync(ruta, JSON.stringify(fila) + '\n', 'utf8');
  } catch {
    // Registrar nunca debe romper el puente.
  }
}

export function leer(n = 10) {
  try {
    return fs.readFileSync(archivo('incidencias.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
      .slice(-n).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
