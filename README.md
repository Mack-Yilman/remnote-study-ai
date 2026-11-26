# remnote-study-ai

Plugin para **Claude Code** y **Antigravity (`agy`)** que conecta ambos agentes con **RemNote Desktop** a través de su servidor MCP oficial.

## Qué hace

- **Abre RemNote solo cuando hace falta:** si RemNote está cerrado, lo lanza minimizado al invocar la skill (`rsa abrir`) o, como respaldo, ante la primera llamada real a una herramienta (`tools/call`), y espera a que el puerto responda. Al arrancar el agente no lo abre.
- **Caché sin conexión:** responde las peticiones de descubrimiento (`initialize`, `tools/list`, `resources/list`, `prompts/list`, `ping`) desde caché local sin abrir RemNote.
- **Flujos oficiales mediante skill:** la skill `remnote` abre RemNote si hace falta y carga las guías oficiales del servidor (`load_skill`: `flashcards`, `search`, `practice_exams_or_quizzes`, entre otros).
- **Protección contra borrados y ediciones destructivas:** pide confirmación explícita antes de `delete_doc`, `delete_rem` o `edit_rem`.
- **Contrato «errores → tarjetas» (v1):** convierte errores de estudio de cualquier plugin o skill en tarjetas de RemNote sin duplicarlas y sin gastar tokens de IA.
- **Configuración segura fuera del plugin:** guarda el token en `~/.remnote-study-ai/config.env` (nunca en `mcp_config.json` ni en `~/.claude.json`) y registra fallos técnicos en `incidencias.jsonl` sin exponer credenciales.

---

## Cómo funciona

```text
Claude Code / Antigravity (agy)
        │  MCP stdio
        ▼
scripts/puente.mjs ──(si está cerrado: caché local para descubrimiento;
        │             si hay tools/call: abre RemNote.exe minimizado)
        │
        ▼  HTTP POST (Authorization: Bearer ...)
RemNote Desktop (http://127.0.0.1:7788/mcp)
        ▲  HTTP POST directo (sin sesión previa)
        │
scripts/rsa.mjs (CLI: abrir, tarjetas, doctor)
```

- **Caché sin conexión:** cuando RemNote está cerrado y el agente solicita `initialize` o `tools/list`, `scripts/puente.mjs` responde usando `~/.remnote-study-ai/cache.json` sin iniciar la aplicación. La primera vez que la caché de herramientas está vacía, abre RemNote una sola vez para obtenerla y guardarla.
- **Apertura automática:** ante una llamada `tools/call` (o al ejecutar `rsa abrir`), si el puerto `7788` no responde, el puente lanza `RemNote.exe` minimizado mediante PowerShell para no robar el foco y sondea el puerto hasta que el servidor esté listo.
- **Sin sesiones obligatorias:** el servidor MCP oficial de RemNote acepta `tools/call` sin requerir `initialize` previo, lo que permite que el CLI `rsa` se comunique directamente por HTTP.
- **Nombres en cada agente:** en Claude Code las herramientas se exponen como `mcp__plugin_remnote-study-ai_remnote__<herramienta>`; en Antigravity (`agy`), el servidor del plugin se llama `remnote-study-ai_remnote`.

---

## Requisitos

- **RemNote Desktop** con el servidor MCP activado en `Settings → Developer → MCP server` y su token Bearer.
- **Node.js 22 o superior** (`node >= 22`).
- **Windows** (probado en Windows; la apertura minimizada usa PowerShell y la detección del proceso usa `tasklist`).

---

## Instalación

### 1. Configurar `~/.remnote-study-ai/config.env`

El archivo de configuración vive fuera de la carpeta del plugin y del repositorio, en `~/.remnote-study-ai/config.env` (puedes cambiar esa carpeta con la variable de entorno `REMNOTE_STUDY_AI_HOME`). Las variables de entorno del sistema tienen prioridad sobre este archivo.

Variables y valores por defecto:

```env
REMNOTE_MCP_AUTH=Bearer rn_mcp_TU_TOKEN
REMNOTE_MCP_URL=http://127.0.0.1:7788/mcp
REMNOTE_EXE_PATH=C:\Program Files\RemNote\RemNote.exe
REMNOTE_WAIT_MS=60000
```

| Variable | Por defecto | Descripción |
|---|---|---|
| `REMNOTE_MCP_AUTH` | *(vacío)* | Token Bearer de RemNote (`Settings → Developer → MCP`), con el prefijo `Bearer `. |
| `REMNOTE_MCP_URL` | `http://127.0.0.1:7788/mcp` | URL del servidor MCP local de RemNote Desktop. |
| `REMNOTE_EXE_PATH` | `C:\Program Files\RemNote\RemNote.exe` | Ruta al ejecutable de RemNote Desktop. |
| `REMNOTE_WAIT_MS` | `60000` | Tiempo máximo de espera (en ms) al abrir RemNote automáticamente. |
| `REMNOTE_TIMEOUT_MS` | `300000` | Opcional. Tope (en ms) de cada petición a RemNote; evita que una petición colgada bloquee el puente. |

### 2. Instalar en Claude Code (desde el marketplace)

```bash
claude plugin marketplace add Mack-Yilman/remnote-study-ai
claude plugin install remnote-study-ai@remnote-study-ai
```

### 3. Instalar en Antigravity (`agy`), o en ambos a la vez

Clona el repositorio y ejecuta el instalador integrado (`scripts/rsa.mjs instalar`). Sin `--aplicar` se ejecuta en modo en seco y solo muestra los pasos que haría:

```bash
git clone https://github.com/Mack-Yilman/remnote-study-ai.git
cd remnote-study-ai

# Vista previa (modo en seco)
node scripts/rsa.mjs instalar

# Aplicar la instalación en Claude Code y Antigravity
node scripts/rsa.mjs instalar --aplicar
```

Si quieres instalar en un solo agente, usa `--solo claude` o `--solo agy`:

```bash
node scripts/rsa.mjs instalar --aplicar --solo agy
```

En Antigravity, el instalador crea una copia autocontenida en `~/.gemini/config/plugins/remnote-study-ai` (con rutas absolutas en su `mcp_config.json`) y la valida con `agy plugin validate`. Al terminar, reinicia Claude Code y Antigravity para que carguen el plugin.

### 4. Retiro automático del puente anterior (`remnote-mcp-bridge`)

Si vienes de una instalación previa con `remnote-mcp-bridge`, `rsa instalar --aplicar` la limpia automáticamente:

- **En Claude Code:** ejecuta `claude mcp remove remnote -s user` si detecta `remnote-mcp-bridge`.
- **En Antigravity:** crea un respaldo de `~/.gemini/config/mcp_config.json` (`.bak-AAAAMMDD`), retira la entrada `remnote` vieja y borra `~/.gemini/antigravity/remnote-mcp-bridge.mjs` y `~/.gemini/antigravity/remnote-mcp-cache.json`.
- **Configuración:** si `~/.remnote-study-ai/config.env` aún no existe, intenta migrar el token desde el entorno anterior.

---

## Uso

Una vez instalado, puedes pedirle al agente tareas sobre tu base de conocimiento con frases naturales, por ejemplo:

- *«¿Qué tengo en RemNote sobre arritmias?»*
- *«Busca en RemNote mis apuntes de farmacología»*
- *«Crea flashcards de este tema en RemNote»*
- *«¿Ya tengo tarjetas de insuficiencia cardíaca?»*
- *«Hazme un quiz o examen de anatomía»*
- *«Pasa mis errores de estudio a RemNote»*

Al activarse la skill `remnote`, el agente sigue este flujo:

1. Ejecuta `node "<raíz>/scripts/rsa.mjs" abrir` para asegurarse de que RemNote esté abierto y escuchando en el puerto `7788`.
2. Llama a `load_skill` con el flujo oficial correspondiente (`search`, `flashcards`, `practice_exams_or_quizzes`, `explain`, `adding_notes`, `create_tables`, `read_or_look_through_pdf`, `find_edited_documents`, `set_exam_dates` o `explain_remnote`).
3. Aplica las reglas del plugin: busca antes de crear para no duplicar documentos, trabaja en modo lectura por defecto y pide confirmación antes de borrar o reemplazar.

---

## CLI `rsa`

Puedes ejecutar `node scripts/rsa.mjs <orden>` (o `rsa <orden>` si lo enlazas como binario):

| Orden | Qué hace | Ejemplo |
|---|---|---|
| `abrir` | Abre RemNote minimizado y espera a que su servidor MCP responda | `node scripts/rsa.mjs abrir` |
| `doctor` | Revisa configuración, token, RemNote, caché, plugins y restos viejos | `node scripts/rsa.mjs doctor` |
| `instalar` | Instala o actualiza en Claude Code y Antigravity (en seco sin `--aplicar`) | `node scripts/rsa.mjs instalar --aplicar --solo agy` |
| `tarjetas` | Convierte un JSON de errores (contrato v1) en tarjetas sin duplicar | `node scripts/rsa.mjs tarjetas errores.json --aplicar` |
| `guardia` | Hook `PreToolUse` para Claude Code: pide confirmación antes de borrar o editar | *(lo invoca Claude Code automáticamente)* |

Flags de `instalar`: `--aplicar`, `--solo claude|agy`, `--fuente <owner/repo|ruta>`.  
Flags de `tarjetas`: `--aplicar` (sin él, solo muestra qué documentos y cuántas tarjetas crearía o agregaría).

---

## Contrato «errores → tarjetas» para otros plugins

Cualquier plugin o skill (por ejemplo, de estudio o simulacros) puede convertir una lista de fallos en tarjetas de RemNote sin conocer las herramientas MCP ni gastar tokens de IA: solo escribe un JSON válido según [`schemas/errores.schema.json`](schemas/errores.schema.json) y llama a `rsa tarjetas`.

### Ejemplo de JSON

```json
{
  "version": 1,
  "origen": "okt",
  "errores": [
    {
      "tema": "Cardiología",
      "pregunta": "¿Primera línea en la FA con respuesta ventricular rápida y hemodinamia estable?",
      "respuesta": "Control de frecuencia con betabloqueador o calcioantagonista no dihidropiridínico",
      "tipo": "basica",
      "fuente": "Simulacro 3, pregunta 14",
      "fecha": "2026-11-25"
    }
  ]
}
```

### Campos

| Campo | Obligatorio | Qué es |
|---|---|---|
| `version` | sí | Siempre `1`. |
| `origen` | sí | Quién envía los errores (`okt`, `tesis-salud`, `gym-coach`, `manual`, etc.). |
| `errores[].tema` | sí | Define el documento destino: `Errores – <tema>`. |
| `errores[].pregunta` | sí | Lo que se preguntará al repasar. |
| `errores[].respuesta` | sí | La respuesta **correcta**, no la que dio el estudiante. |
| `errores[].tipo` | no | `basica` (`>>`, por defecto), `concepto` (`::`) o `bidireccional` (`<>`). |
| `errores[].fuente`, `fecha` | no | Referencia para quien envía (`AAAA-MM-DD`); la v1 no los escribe en RemNote. |

### Garantías

- **Sin duplicados:** antes de escribir, lee el documento del tema y omite preguntas que ya existen (comparando sin mayúsculas, tildes ni espacios extra). También filtra duplicados dentro del mismo JSON; reintentar es seguro.
- **Un documento por tema:** guarda el ID de cada documento en `~/.remnote-study-ai/temas.json`. Si el documento fue borrado, lo busca por título y, si no existe, lo crea de nuevo.
- **Sin IA:** es un script determinista que no gasta tokens y reemplaza delimitadores de RemNote dentro del texto (`>>`, `<<`, `<>`, `::`, `;;` → `→`, `←`, `↔`, `:`, `;`) para evitar que rompan la tarjeta.
- **Validación estricta:** si el JSON incumple el contrato, sale con código `2` y detalla los errores encontrados.

---

## Seguridad

- **Ubicación del token:** `REMNOTE_MCP_AUTH` se guarda únicamente en `~/.remnote-study-ai/config.env`, fuera del plugin y del repositorio. No se pasa por línea de comandos ni se escribe en `mcp_config.json`.
- **Guardia de borrado y reemplazo:**
  - En **Claude Code**, `hooks/hooks.json` define un hook `PreToolUse` sobre `mcp__.*remnote.*__(delete_doc|delete_rem|edit_rem)` que ejecuta `rsa guardia` y fuerza confirmación (`permissionDecision: "ask"`), incluso si el usuario aprobó previamente todas las herramientas de RemNote.
  - En **Antigravity (`agy`)**, los hooks de plugins no se ejecutan; la protección se aplica mediante la regla explícita de [`skills/remnote/SKILL.md`](skills/remnote/SKILL.md), que exige indicar título e `id` y esperar el sí del usuario antes de usar esas herramientas.
- **Sin tokens en logs ni incidencias:** los mensajes y registros pasan por `ocultar()`, que enmascara tokens (`rn_mcp_***` y `Bearer ***`).
- **Registro de incidencias:** los fallos técnicos de red, HTTP o CLI se anotan en `~/.remnote-study-ai/incidencias.jsonl` para facilitar el diagnóstico sin exponer credenciales.

---

## Solución de problemas

Ejecuta primero el diagnóstico completo:

```bash
node scripts/rsa.mjs doctor
```

Revisa configuración, token, ruta de RemNote, estado del servidor MCP, caché de herramientas, estado del plugin en Claude Code y Antigravity, restos del puente viejo y las últimas 5 incidencias.

Errores frecuentes y cómo resolverlos:

| Mensaje en consola / agente | Causa | Cómo arreglarlo |
|---|---|---|
| `No se encontró RemNote en <ruta>. Corrige REMNOTE_EXE_PATH en ~/.remnote-study-ai/config.env.` | El ejecutable no está en la ruta configurada. | Busca dónde está instalado `RemNote.exe` y actualiza `REMNOTE_EXE_PATH` en `~/.remnote-study-ai/config.env`. |
| `RemNote está abierto pero su servidor MCP no responde en 127.0.0.1:7788. Actívalo en RemNote: Settings → Developer → MCP server.` | RemNote está corriendo pero el servidor MCP está apagado. | En RemNote Desktop, abre `Settings → Developer → MCP server` y actívalo. |
| `RemNote no respondió en 60 s en 127.0.0.1:7788. Ábrelo a mano o sube REMNOTE_WAIT_MS.` | RemNote tardó más del tiempo configurado en abrir o levantar el puerto. | Ábrelo manualmente o sube `REMNOTE_WAIT_MS` en `~/.remnote-study-ai/config.env`. |
| `RemNote rechazó el token (HTTP 401). Copia el token vigente de RemNote (Settings → Developer → MCP) en REMNOTE_MCP_AUTH de ~/.remnote-study-ai/config.env, con el prefijo «Bearer ».` | El token falta, caducó o no lleva el prefijo `Bearer ` (el servidor responde `401 {"error":"Unauthorized"}`). | Copia el token actual desde `Settings → Developer → MCP` en RemNote y guárdalo como `REMNOTE_MCP_AUTH=Bearer rn_mcp_TU_TOKEN`. |

---

## Límites

- **Sin estadísticas de repaso:** el servidor MCP oficial de RemNote no expone historial de aciertos, intervalos ni próxima fecha de repaso.
- **Solo RemNote Desktop local:** requiere la aplicación de escritorio ejecutándose en la misma máquina (`127.0.0.1:7788`); no funciona contra RemNote Web.
- **Probado en Windows:** la apertura minimizada y la detección de procesos están pensadas para Windows (`powershell.exe` y `tasklist`).
- **Antigravity en modo headless (`agy -p`):** sin una regla, las herramientas MCP se deniegan. Agrega a `permissions.allow` de `~/.gemini/antigravity-cli/settings.json` las de solo lectura que quieras usar, por ejemplo `mcp(remnote-study-ai_remnote/search_docs)` y `mcp(remnote-study-ai_remnote/load_skill)`, y la regla para `rsa abrir`. En la app y el IDE de Antigravity, el agente las pide al usarlas.

---

## Desarrollo

Ejecutar la suite de pruebas:

```bash
npm test
```

Probar el plugin localmente en Claude Code sin instalarlo desde GitHub:

```bash
claude --plugin-dir .
```

### Estructura del proyecto

```text
.
├── .claude-plugin/       # Manifiestos del plugin y marketplace para Claude Code
├── .mcp.json             # Definición del servidor MCP stdio (scripts/puente.mjs)
├── agy/                  # Manifiesto base del plugin para Antigravity
├── hooks/                # Hook PreToolUse de guardia para Claude Code
├── schemas/              # Esquema JSON del contrato errores → tarjetas (v1)
├── scripts/              # puente.mjs, rsa.mjs y módulos en scripts/lib/
├── skills/remnote/       # Skill remnote y sus referencias (contrato, flashcards)
├── tests/                # Pruebas unitarias (*.test.mjs)
├── CHANGELOG.md
└── package.json
```

---

## Créditos y licencia

- **Inspiración y alternativa:** [robert7/remnote-mcp-server](https://github.com/robert7/remnote-mcp-server) (MIT), que utiliza su propio plugin dentro de RemNote y un daemon separado. `remnote-study-ai` no lo usa y se conecta directamente al servidor MCP oficial de RemNote Desktop.
- **Licencia:** MIT © 2026 Mack Chirinos.
