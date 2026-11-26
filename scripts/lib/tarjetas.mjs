// Contrato «errores → tarjetas» v1: cualquier plugin o skill escribe un JSON y este módulo crea en RemNote las
// tarjetas que faltan, una por error, en el documento «Errores – <tema>». Sin IA: lo mecánico no gasta tokens.
import fs from 'node:fs';
import { archivo, dirDatos } from './config.mjs';

export const PREFIJO = 'Errores – ';
const TIPOS = { basica: '>>', concepto: '::', bidireccional: '<>' };

export const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

// Los delimitadores de RemNote dentro del texto romperían la tarjeta: se cambian por símbolos equivalentes.
export function limpiar(s) {
  return String(s).replace(/\s+/g, ' ').trim()
    .replace(/>>/g, '→').replace(/<</g, '←').replace(/<>/g, '↔').replace(/::/g, ':').replace(/;;/g, ';');
}

export function validar(datos) {
  const errores = [];
  if (!datos || typeof datos !== 'object') return ['El archivo no es un objeto JSON.'];
  if (datos.version !== 1) errores.push('«version» debe ser 1.');
  if (typeof datos.origen !== 'string' || !datos.origen.trim()) errores.push('Falta «origen» (p. ej. "okt").');
  if (!Array.isArray(datos.errores) || !datos.errores.length) errores.push('«errores» debe ser una lista con al menos un elemento.');
  (datos.errores || []).forEach((e, i) => {
    for (const k of ['tema', 'pregunta', 'respuesta']) {
      if (typeof e?.[k] !== 'string' || !e[k].trim()) errores.push(`errores[${i}].${k} falta o está vacío.`);
    }
    if (e?.tipo !== undefined && !TIPOS[e.tipo]) errores.push(`errores[${i}].tipo debe ser ${Object.keys(TIPOS).join(', ')}.`);
  });
  return errores;
}

export const linea = (e) => `- ${limpiar(e.pregunta)} ${TIPOS[e.tipo || 'basica']} ${limpiar(e.respuesta)}`;

function leerTemas() {
  try { return JSON.parse(fs.readFileSync(archivo('temas.json'), 'utf8')); } catch { return {}; }
}
function guardarTemas(t) {
  fs.mkdirSync(dirDatos(), { recursive: true });
  fs.writeFileSync(archivo('temas.json'), JSON.stringify(t, null, 2), 'utf8');
}

const idDe = (r) => r?.doc_id || r?.id || r?.rem_id || r?.document_id
  || JSON.stringify(r ?? '').match(/"(?:doc_id|id|rem_id)"\s*:\s*"([A-Za-z0-9]{10,})"/)?.[1] || null;

// Preguntas que ya tiene el documento (normalizadas), o null si ya no existe. Un error pasajero se propaga:
// tomarlo por «no existe» crearía un documento duplicado.
// shortcut: si RemNote trunca un documento enorme (truncated_documents), las tarjetas omitidas no se ven; basta con
// documentos de errores de tamaño normal.
async function preguntasDoc(llamar, id) {
  let r;
  try {
    r = await llamar('read_docs', { ids: [id] });
  } catch (e) {
    if (/not found|no encontrad/i.test(e.message)) return null;
    throw e;
  }
  const doc = (r?.documents || []).find((d) => (d.document_id || d.id) === id);
  if (!doc) return null;
  // Cada tarjeta es una línea «- pregunta→respuesta» (también ↔ o ←); se guarda la línea entera normalizada.
  return String(doc.content ?? doc.markdown ?? '').split(/\r?\n/).map((l) => normalizar(l.replace(/^\s*[-*]\s*/, '')));
}

const yaEsta = (lineas, pregunta) => {
  const q = normalizar(limpiar(pregunta));
  return lineas.some((l) => l === q || (l.startsWith(q) && /^\s*(→|←|↔|>>|<<|<>|::|;;)/.test(l.slice(q.length))));
};

async function buscarDoc(llamar, titulo) {
  const r = await llamar('search_docs', { queries: [titulo] });
  return (r?.matches || []).find((m) => normalizar(m.document) === normalizar(titulo))?.doc_id || null;
}

// llamar(nombre, args) → resultado de la herramienta. aplicar=false solo planifica.
export async function procesar(datos, { llamar, aplicar = false }) {
  const problemas = validar(datos);
  if (problemas.length) throw Object.assign(new Error(`Contrato inválido:\n- ${problemas.join('\n- ')}`), { codigo: 2 });

  const porTema = new Map();
  for (const e of datos.errores) {
    const clave = normalizar(e.tema);
    if (!porTema.has(clave)) porTema.set(clave, { tema: e.tema.trim(), items: [] });
    const g = porTema.get(clave);
    if (!g.items.some((x) => normalizar(x.pregunta) === normalizar(e.pregunta))) g.items.push(e);
  }

  const temas = leerTemas();
  const informe = [];
  for (const [clave, g] of porTema) {
    const titulo = PREFIJO + g.tema;
    let id = temas[clave]?.id || null;
    let lineas = id ? await preguntasDoc(llamar, id) : null;
    if (!lineas) {
      id = await buscarDoc(llamar, titulo);
      lineas = id ? await preguntasDoc(llamar, id) : null;
      if (!lineas) id = null;
    }
    const nuevas = g.items.filter((e) => !yaEsta(lineas || [], e.pregunta));
    const fila = { tema: g.tema, documento: titulo, id, nuevas: nuevas.length, repetidas: g.items.length - nuevas.length, accion: 'nada' };

    if (nuevas.length) {
      fila.accion = id ? 'agregar' : 'crear';
      if (aplicar) {
        const md = nuevas.map(linea).join('\n');
        if (id) {
          await llamar('append_doc', { id, text: md, pos: 'bottom' });
        } else {
          id = idDe(await llamar('create_doc', { title: titulo, text: md }));
          fila.id = id;
        }
      }
    }
    if (aplicar && id) temas[clave] = { id, titulo };
    informe.push(fila);
  }
  if (aplicar) guardarTemas(temas);
  return informe;
}
