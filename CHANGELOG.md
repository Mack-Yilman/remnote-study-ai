# Cambios

## 0.1.0 — 2026-11-25

Primera versión. Reemplaza al puente suelto `remnote-mcp-bridge.mjs`, que vivía en dos copias, una para Claude Code y
otra para Antigravity.

- **Plugin para Claude Code y Antigravity**, con el servidor MCP `remnote` y la skill `remnote`.
- **Puente MCP stdio → HTTP** hacia el servidor oficial de RemNote Desktop:
  - responde el descubrimiento desde la caché sin abrir RemNote;
  - abre RemNote minimizado ante una llamada real;
  - no reintenta los errores 4xx;
  - sus mensajes de error dicen cómo arreglar cada caso: RemNote no instalado, MCP desactivado o token rechazado.
- **Configuración fuera del plugin**, en `~/.remnote-study-ai/config.env`: el token ya no va en `mcp_config.json` ni
  en `~/.claude.json`.
- **CLI `rsa`** con cinco órdenes:
  - `abrir`;
  - `doctor`;
  - `instalar` (instala en los dos agentes y retira el puente viejo; en seco por defecto);
  - `tarjetas`;
  - `guardia`.
- **Contrato «errores → tarjetas» v1:** cualquier plugin convierte sus errores de estudio en tarjetas de RemNote, sin
  duplicados y sin gastar tokens.
- **Guardia de borrado:** un hook `PreToolUse` pide confirmación antes de `delete_doc`, `delete_rem` y `edit_rem` en
  Claude Code.
- **Registro de fallos técnicos** en `~/.remnote-study-ai/incidencias.jsonl`, sin el token.
- **Robustez:**
  - el puente no reintenta un `tools/call` que pudo llegar a RemNote, para no duplicar escrituras;
  - cada petición tiene un tope de tiempo (`REMNOTE_TIMEOUT_MS`, 5 min);
  - cada mensaje se compacta a una línea y se agrupan los eventos SSE;
  - responde con error si una petición recibe un 202 vacío.
- **El instalador:** escribe `mcp_config.json` de forma atómica y deja el respaldo sin el token de RemNote.
