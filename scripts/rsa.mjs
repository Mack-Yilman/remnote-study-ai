#!/usr/bin/env node
// rsa: CLI de remnote-study-ai, sin dependencias. Ejecútalo con su ruta completa desde cualquier carpeta.
import fs from 'node:fs';
import { leerConfig } from './lib/config.mjs';
import { asegurarListo, llamarHerramienta } from './lib/remnote.mjs';
import { procesar } from './lib/tarjetas.mjs';
import { instalar } from './lib/instalar.mjs';
import { doctor } from './lib/doctor.mjs';
import { anotar } from './lib/incidencias.mjs';

const AYUDA = `rsa — remnote-study-ai

  abrir                              Abre RemNote minimizado y espera a que su servidor MCP responda
  doctor                             Revisa configuración, RemNote, plugins y restos del puente viejo
  instalar [--aplicar] [--solo claude|agy] [--fuente <owner/repo|ruta>]
                                     Instala o actualiza en Claude Code y Antigravity y retira lo viejo (en seco sin --aplicar)
  tarjetas <archivo.json> [--aplicar]
                                     Convierte errores de estudio (contrato v1) en tarjetas de RemNote, sin duplicar
  guardia                            Hook PreToolUse: pide confirmación antes de borrar o editar en RemNote
`;

const [, , orden, ...resto] = process.argv;
const flag = (n) => resto.includes(n);
const valor = (n) => { const i = resto.indexOf(n); return i >= 0 ? resto[i + 1] : undefined; };

function leerStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

async function main() {
  switch (orden) {
    case 'abrir': {
      const r = await asegurarListo(leerConfig(), { origen: 'rsa abrir' });
      console.log(r.ok ? 'RemNote está listo.' : r.mensaje);
      return r.ok ? 0 : 1;
    }
    case 'doctor': {
      const r = await doctor();
      console.log(r.texto);
      return r.ok ? 0 : 1;
    }
    case 'instalar':
      console.log(instalar({ aplicar: flag('--aplicar'), solo: valor('--solo'), fuente: valor('--fuente') }));
      return 0;
    case 'tarjetas': {
      const ruta = resto.find((a) => !a.startsWith('--'));
      if (!ruta) { console.error('Uso: rsa tarjetas <archivo.json> [--aplicar]'); return 2; }
      const datos = JSON.parse(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, ''));
      const cfg = leerConfig();
      const aplicar = flag('--aplicar');
      const informe = await procesar(datos, { aplicar, llamar: (n, a) => llamarHerramienta(cfg, n, a) });
      for (const f of informe) {
        const que = { crear: 'crear el documento con', agregar: 'agregar', nada: 'nada nuevo;' }[f.accion];
        console.log(`${aplicar ? '✔' : '•'} ${f.documento}: ${que} ${f.nuevas ? `${f.nuevas} tarjeta(s)` : ''} (ya estaban: ${f.repetidas})${f.id ? ` [${f.id}]` : ''}`);
      }
      if (!aplicar) console.log('\nModo en seco: nada cambió. Repite con --aplicar para crearlas.');
      return 0;
    }
    case 'guardia': {
      // Pide confirmación aunque el usuario haya permitido todas las herramientas de RemNote.
      let e = {};
      try { e = JSON.parse(leerStdin() || '{}'); } catch { /* sin datos: igual se pregunta */ }
      const herramienta = String(e.tool_name || '').split('__').pop();
      const id = e.tool_input?.id ? ` (id ${e.tool_input.id})` : '';
      const motivo = herramienta === 'edit_rem'
        ? `remnote-study-ai: edit_rem reemplaza el contenido de un Rem${id}. Confirma que el usuario lo pidió.`
        : `remnote-study-ai: ${herramienta || 'esta herramienta'} envía contenido de RemNote a la papelera${id}. Confirma que el usuario lo pidió.`;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: motivo } }));
      return 0;
    }
    default:
      console.log(AYUDA);
      return orden && orden !== '--help' && orden !== 'ayuda' ? 2 : 0;
  }
}

main().then((c) => { process.exitCode = c; }).catch((e) => {
  if (orden !== 'guardia') anotar('cli', `${orden}: ${e.message}`, 'rsa');
  console.error(e.message);
  process.exitCode = e.codigo || 1;
});
