# Sintaxis de tarjetas de RemNote

Va dentro del `text` de `create_doc`, `append_doc` o `edit_rem`, como Markdown con viñetas. Es la que documenta el
propio servidor MCP de RemNote en el esquema de esas herramientas.

| Tipo | Sintaxis | Se pregunta |
|---|---|---|
| Directa | `- Pregunta >> Respuesta` | La pregunta, y se responde con la respuesta |
| Inversa | `- Respuesta << Pregunta` | Al revés |
| Bidireccional | `- Término <> Definición` | En los dos sentidos |
| Concepto | `- Término :: Definición` | Concepto (en los dos sentidos, con formato de concepto) |
| Descriptor | `- Término ;; Descripción` | Descriptor de un concepto padre |

- **Una idea por tarjeta.** Si la respuesta tiene varias partes, mejor varias tarjetas o una lista hija.
- **Listas como respuesta:** la pregunta termina en `>>` y las respuestas van como viñetas hijas indentadas.
- **Contexto:** las tarjetas hijas de una viñeta muestran a su padre como contexto al repasar. Agrupa bajo un título
  corto, no bajo frases largas.
- **No uses los delimitadores dentro del texto** (`>>`, `<<`, `<>`, `::`, `;;`): parten la tarjeta. `rsa tarjetas` los
  cambia por `→ ← ↔ : ;`.
- Para referenciar otro Rem: `[[etiqueta]](/doc/ID_DEL_REM)`, con el id exacto que devolvió una herramienta.
