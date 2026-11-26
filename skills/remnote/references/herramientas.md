# Herramientas del servidor MCP de RemNote

Generado a partir de la lista que devuelve RemNote Desktop (`tools/list`, 2026-11-25). Si RemNote agrega herramientas,
la lista viva es la que muestra el cliente MCP; esta tabla sirve para elegir sin cargar todos los esquemas.

| Herramienta | Qué hace | Parámetros (* = obligatorio) |
|---|---|---|
| `load_skill` | Carga las instrucciones de un flujo oficial de RemNote (ver la tabla del SKILL.md). | `names`* (lista de string) |
| `search_docs` | Search the knowledge base and return grouped matches. | `queries`* (lista de string), `sort_by` (created_at/updated_at/ranking) |
| `tag_rems` | Add a tag to one or more Rems or documents. | `ids`* (lista de string), `tag`* (string) |
| `see_text_around_rem` | Load surrounding text for one search-result rem. | `id`* (string) |
| `read_docs` | Read markdown or file text for one or more documents. Results include document_sources; use those source document ids to inspect linked sources even when they are not open. | `ids`* (lista de string) |
| `find_quotes` | Find direct quotes from one document or file. Matches on meaning, not wording, so pass whole topics rather than keyword variants. | `id`* (string), `queries`* (lista de string) |
| `read_docs_raw` | Read one or more documents in raw Rem-tree format. Results include document_sources; use those source document ids to inspect linked sources even when they are not open. | `ids`* (lista de string) |
| `read_folders_raw` | Read one or more folders in raw Rem-tree format. | `ids`* (lista de string) |
| `read_open_documents` | Read all currently open documents. Results include document_sources; use those source document ids to inspect linked sources even when they are not open. | — |
| `open_doc` | Open a document in the RemNote editor. | `id`* (string) |
| `find_edited_docs` | List documents edited in a date range. | `from`* (string), `to`* (string) |
| `get_daily_doc` | Get or create the daily document for a date. | `date` (string) |
| `read_daily_docs` | Read recent daily documents in an optional date range. | `n`* (integer), `from` (string), `to` (string) |
| `get_user_info` | Get basic account info. | — |
| `set_user_name` | Save the user's preferred real name. | `name`* (string) |
| `see_context` | Inspect the current user context. Document contexts include document_sources; use those source document ids to inspect linked sources even when they are not open. | — |
| `create_doc` | Create a document from a title and RemNote-flavored markdown. | `title`* (string), `text`* (string) |
| `append_doc` | Append RemNote-flavored markdown to the top or bottom of an existing document. | `id`* (string), `text`* (string), `pos` (top/bottom) |
| `edit_rem` | Replace the content of an existing bullet or Rem with RemNote-flavored Markdown by exact Rem ID without recreating it. | `id`* (string), `text`* (string) |
| `insert_simple_table` | Insert a simple table (plain text columns and rows). | `id` (string), `title` (string), `columns`* (lista de object), `rows`* (lista de objetos) |
| `insert_advanced_table` | Insert an advanced table/database (supports select columns, AI autofill, text-to-speech, and flashcards). | `id` (string), `title` (string), `columns`* (lista de object), `rows`* (lista de objetos) |
| `delete_doc` | Move a document to the RemNote trash. | `id`* (string) |
| `delete_rem` | Move an existing bullet or Rem and its descendants to the RemNote trash by exact Rem ID. Supports documents, non-document bullets, and root Rems. | `id`* (string) |
| `list_commands` | List available omnibar commands. | — |

Escriben en la base: `create_doc`, `append_doc`, `edit_rem`, `insert_simple_table`, `insert_advanced_table`,
`tag_rems`, `get_daily_doc` (puede crear el daily), `set_user_name`, `delete_doc` y `delete_rem` (envían a la papelera).
