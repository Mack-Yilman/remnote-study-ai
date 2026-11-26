# Cambios

## 0.2.0 — 2026-11-26

- **Error que corrige:** RemNote se abría solo al iniciar sesiones de Claude Code en cualquier proyecto. Causa: Claude
  Code 2.1.310 sondea cada servidor MCP con el método `server/discover` al iniciar, y el puente lo trataba como una
  llamada real y abría RemNote.
- **Ahora el puente nunca abre RemNote.** Solo lo abre la skill `remnote`, con `rsa abrir`. Con RemNote cerrado, el
  puente responde el descubrimiento desde la caché; una llamada a una herramienta devuelve «RemNote está cerrado. Carga
  la skill remnote (ejecuta `rsa abrir`) y repite la llamada.»; y cualquier método desconocido devuelve el error
  JSON-RPC `-32601`.
- **Lista de herramientas incluida** en `schemas/herramientas-remnote.json`: el puente ya no necesita RemNote abierto
  para listarlas, ni siquiera en una instalación nueva.
- **Instrucciones MCP propias:** el texto que el servidor inyecta en todas las sesiones ahora dice que las herramientas
  se usan solo si el usuario pide algo de RemNote y tras cargar la skill.
- **La skill solo se activa si el pedido menciona RemNote** («hazme un quiz de X» ya no la activa).
- **Incidencias:** registran el origen (`rsa abrir`, `puente`) y la llamada con RemNote cerrado (`cerrado`).
- **Casos de eval** de activación en `evals/`.

## 0.1.2 — 2026-11-26

- **`rsa instalar` con Antigravity abierto:** antes borraba la copia del plugin y fallaba con EPERM, porque el puente
  en uso retiene la carpeta. Ahora sobrescribe los archivos en su lugar.

## 0.1.1 — 2026-11-26

Corrige la apertura automática de RemNote, probada con la app cerrada.

- **RemNote no se abría:** con `detached` y la ruta en una variable de entorno, PowerShell terminaba bien pero RemNote
  nunca arrancaba. Ahora se lanza sin `detached`.
- **La primera llamada fallaba a los 60 s:** el puerto 7788 abre unos 3 s después del arranque, pero la app tarda más en
  cargar (unos 19 s minimizada). Las peticiones que llegaban antes quedaban colgadas hasta un
  `400 Timed out waiting for the RemNote desktop app`. Ahora `rsa abrir` y el puente esperan a que la app responda a una
  llamada corta de solo lectura antes de enviar la petición real. Desde cero, la primera respuesta llega en unos 7 s.

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
