import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rsa-'));
process.env.REMNOTE_STUDY_AI_HOME = home;
process.env.RSA_HOME_OVERRIDE = home;

const { validar, limpiar, linea, procesar } = await import('../scripts/lib/tarjetas.mjs');

test.after(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

function crearFakeRemnote() {
  const docs = new Map();
  const llamadas = [];
  let seq = 0;
  let falloPasajero = false;

  async function llamar(nombre, args) {
    llamadas.push({ nombre, args });
    if (nombre === 'create_doc') {
      const doc_id = `doc${String(++seq).padStart(10, '0')}`;
      docs.set(doc_id, { id: doc_id, title: args.title, markdown: args.text || '' });
      return { doc_id };
    }
    if (nombre === 'append_doc') {
      const doc = docs.get(args.id);
      if (!doc) throw new Error(`Documento no encontrado: ${args.id}`);
      doc.markdown = doc.markdown ? `${doc.markdown}\n${args.text}` : args.text;
      return { ok: true };
    }
    if (nombre === 'read_docs') {
      const documents = args.ids.map((id) => {
        const doc = docs.get(id);
        // Formato real de RemNote (2026-11-25): document_id + content, y «Documents not found.» si no existe.
        if (!doc) throw new Error('read_docs: {"ok": false, "error": "Documents not found."}');
        if (falloPasajero) throw new Error('read_docs: fetch failed');
        return { document_id: doc.id, content: doc.markdown };
      });
      return { documents };
    }
    if (nombre === 'search_docs') {
      const q = (args.queries?.[0] || '').toLowerCase();
      const matches = [...docs.values()]
        .filter((d) => d.title.toLowerCase().includes(q))
        .map((d) => ({ doc_id: d.id, document: d.title }));
      return { matches };
    }
    throw new Error(`Herramienta desconocida: ${nombre}`);
  }

  return { docs, llamadas, llamar, fallar: (v) => { falloPasajero = v; } };
}

test('1. validar rechaza contratos inválidos y acepta uno válido', { timeout: 10_000 }, () => {
  const valido = {
    version: 1,
    origen: 'okt',
    errores: [{ tema: 'Cardiología', pregunta: '¿Qué es X?', respuesta: 'Y' }],
  };
  assert.deepEqual(validar(valido), []);

  assert.ok(validar({ ...valido, version: 2 }).length > 0);
  assert.ok(validar({ ...valido, origen: '   ' }).length > 0);
  assert.ok(validar({ ...valido, errores: [] }).length > 0);
  assert.ok(validar({ ...valido, errores: [{ tema: 'A', pregunta: '', respuesta: 'B' }] }).length > 0);
  assert.ok(validar({ ...valido, errores: [{ tema: 'A', pregunta: 'P', respuesta: 'R', tipo: 'raro' }] }).length > 0);
});

test('2. limpiar quita delimitadores y linea usa >>, :: y <>', { timeout: 10_000 }, () => {
  const limpio = limpiar('a >> b :: c');
  assert.ok(!limpio.includes('>>'));
  assert.ok(!limpio.includes('::'));

  assert.ok(linea({ pregunta: 'P', respuesta: 'R', tipo: 'basica' }).includes(' >> '));
  assert.ok(linea({ pregunta: 'P', respuesta: 'R', tipo: 'concepto' }).includes(' :: '));
  assert.ok(linea({ pregunta: 'P', respuesta: 'R', tipo: 'bidireccional' }).includes(' <> '));
});

test('3. aplicar:false no llama a create_doc ni append_doc y acción es crear', { timeout: 10_000 }, async () => {
  const { llamadas, llamar } = crearFakeRemnote();
  const datos = {
    version: 1,
    origen: 'okt',
    errores: [{ tema: 'Neurología', pregunta: 'Pregunta 1', respuesta: 'Resp 1' }],
  };
  const informe = await procesar(datos, { llamar, aplicar: false });
  assert.equal(informe.length, 1);
  assert.equal(informe[0].accion, 'crear');
  assert.equal(llamadas.some((c) => c.nombre === 'create_doc' || c.nombre === 'append_doc'), false);
});

test('4. aplicar:true crea, no duplica al repetir y agrega solo nuevas', { timeout: 10_000 }, async () => {
  const { docs, llamadas, llamar } = crearFakeRemnote();
  const datos = {
    version: 1,
    origen: 'okt',
    errores: [
      { tema: 'Cardiología', pregunta: '¿Causa más frecuente de IC?', respuesta: 'Cardiopatía isquémica' },
      { tema: 'Cardiología', pregunta: '¿Fármaco de primera línea en HTA?', respuesta: 'IECA/ARA-II' },
    ],
  };

  const inf1 = await procesar(datos, { llamar, aplicar: true });
  assert.equal(inf1[0].accion, 'crear');
  assert.equal(inf1[0].nuevas, 2);
  assert.equal(inf1[0].documento, 'Errores – Cardiología');
  assert.equal(docs.size, 1);

  const llamadasAntes = llamadas.length;
  const inf2 = await procesar(datos, { llamar, aplicar: true });
  assert.equal(inf2[0].accion, 'nada');
  assert.equal(inf2[0].nuevas, 0);
  assert.equal(
    llamadas.slice(llamadasAntes).some((c) => c.nombre === 'create_doc' || c.nombre === 'append_doc'),
    false
  );

  const datos3 = {
    version: 1,
    origen: 'okt',
    errores: [
      ...datos.errores,
      { tema: 'Cardiología', pregunta: '¿Qué indica el tercer ruido?', respuesta: 'Sobrecarga de volumen' },
    ],
  };
  const llamadasAntes3 = llamadas.length;
  const inf3 = await procesar(datos3, { llamar, aplicar: true });
  assert.equal(inf3[0].accion, 'agregar');
  assert.equal(inf3[0].nuevas, 1);
  const appends = llamadas.slice(llamadasAntes3).filter((c) => c.nombre === 'append_doc');
  assert.equal(appends.length, 1);
  assert.ok(appends[0].args.text.includes('tercer ruido'));
  assert.ok(!appends[0].args.text.includes('IC'));
});

test('5. preguntas duplicadas con distinta capitalización o tildes se crean una sola vez', { timeout: 10_000 }, async () => {
  const { docs, llamar } = crearFakeRemnote();
  const datos = {
    version: 1,
    origen: 'okt',
    errores: [
      { tema: 'Duplicados', pregunta: 'Ácido úrico elevado', respuesta: 'Gota' },
      { tema: 'Duplicados', pregunta: 'acido urico elevado', respuesta: 'Gota' },
    ],
  };
  const inf = await procesar(datos, { llamar, aplicar: true });
  assert.equal(inf[0].nuevas, 1);
  const doc = docs.get(inf[0].id);
  const lineas = doc.markdown.split('\n').filter(Boolean);
  assert.equal(lineas.length, 1);
});

test('6. si temas.json apunta a id inexistente, busca con search_docs y si no existe crea uno nuevo', { timeout: 10_000 }, async () => {
  const { llamadas, llamar } = crearFakeRemnote();
  fs.writeFileSync(
    path.join(home, 'temas.json'),
    JSON.stringify({ perdido: { id: 'doc_inexistente_999', titulo: 'Errores – Perdido' } }),
    'utf8'
  );

  const datos = {
    version: 1,
    origen: 'okt',
    errores: [{ tema: 'Perdido', pregunta: 'Pregunta recuperada', respuesta: 'Respuesta' }],
  };
  const inf = await procesar(datos, { llamar, aplicar: true });
  assert.ok(llamadas.some((c) => c.nombre === 'search_docs'));
  assert.equal(inf[0].accion, 'crear');
  assert.notEqual(inf[0].id, 'doc_inexistente_999');
});

test('7. procesar con contrato inválido lanza error con codigo === 2', { timeout: 10_000 }, async () => {
  const { llamar } = crearFakeRemnote();
  await assert.rejects(
    () => procesar({ version: 99 }, { llamar, aplicar: false }),
    (err) => err.codigo === 2
  );
});

// Regresiones de la revisión del 2026-11-25.
test('8. una pregunta con comillas o barras no se duplica al repetir', { timeout: 10_000 }, async () => {
  fs.rmSync(path.join(home, 'temas.json'), { force: true });
  const fake = crearFakeRemnote();
  const datos = { version: 1, origen: 'okt', errores: [{ tema: 'Comillas', pregunta: '¿Qué significa "QT largo" en C:\ECG?', respuesta: 'Repolarización prolongada' }] };
  await procesar(datos, { llamar: fake.llamar, aplicar: true });
  const [fila] = await procesar(datos, { llamar: fake.llamar, aplicar: true });
  assert.equal(fila.nuevas, 0);
});

test('9. una pregunta corta que aparece dentro de una respuesta no se toma por repetida', { timeout: 10_000 }, async () => {
  fs.rmSync(path.join(home, 'temas.json'), { force: true });
  const fake = crearFakeRemnote();
  await procesar({ version: 1, origen: 'okt', errores: [{ tema: 'Corta', pregunta: 'Causa de FA', respuesta: 'Hipertensión' }] }, { llamar: fake.llamar, aplicar: true });
  const [fila] = await procesar({ version: 1, origen: 'okt', errores: [{ tema: 'Corta', pregunta: 'Hipertensión', respuesta: 'PA ≥ 140/90' }] }, { llamar: fake.llamar, aplicar: false });
  assert.equal(fila.nuevas, 1);
});

test('10. un error pasajero de read_docs se propaga y no crea un documento duplicado', { timeout: 10_000 }, async () => {
  fs.rmSync(path.join(home, 'temas.json'), { force: true });
  const fake = crearFakeRemnote();
  const datos = (p) => ({ version: 1, origen: 'okt', errores: [{ tema: 'Pasajero', pregunta: p, respuesta: 'r' }] });
  await procesar(datos('p1'), { llamar: fake.llamar, aplicar: true });
  fake.fallar(true);
  await assert.rejects(procesar(datos('p2'), { llamar: fake.llamar, aplicar: true }), /fetch failed/);
  assert.equal(fake.docs.size, 1);
});
