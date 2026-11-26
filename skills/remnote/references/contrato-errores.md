# Contrato «errores → tarjetas» (v1)

Cualquier plugin o skill (OKT, tesis-salud, gym-coach o uno futuro) que quiera convertir errores de estudio en tarjetas
de RemNote escribe este JSON y llama al CLI. No necesita conocer las herramientas MCP de RemNote. El esquema formal está
en `<raíz>/schemas/errores.schema.json`.

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

| Campo | Obligatorio | Qué es |
|---|---|---|
| `version` | sí | Siempre `1` |
| `origen` | sí | Quién envía: `okt`, `tesis-salud`, `manual`… |
| `errores[].tema` | sí | Define el documento: «Errores – <tema>» |
| `errores[].pregunta` | sí | Lo que se preguntará al repasar |
| `errores[].respuesta` | sí | La respuesta **correcta**, no la que dio el estudiante |
| `errores[].tipo` | no | `basica` (`>>`, por defecto), `concepto` (`::`) o `bidireccional` (`<>`) |
| `errores[].fuente`, `fecha` | no | Referencia para quien envía; la v1 no los escribe en RemNote |

## Uso

```bash
node "<raíz>/scripts/rsa.mjs" tarjetas errores.json            # en seco: dice qué crearía
node "<raíz>/scripts/rsa.mjs" tarjetas errores.json --aplicar  # crea o agrega
```

## Garantías

- **Sin duplicados.** Antes de escribir, lee el documento del tema y salta las preguntas que ya están, comparadas sin
  mayúsculas, tildes ni espacios extra. Los duplicados dentro del mismo JSON también se saltan. Reintentar es seguro.
- **Un documento por tema.** El id se guarda en `~/.remnote-study-ai/temas.json`. Si el documento se borró, lo busca por
  título y, si no lo encuentra, lo crea de nuevo.
- **Sin IA.** Es un script: no gasta tokens ni cambia el texto, salvo los delimitadores de tarjeta, que se reemplazan.
- **Salida:** una línea por tema con lo creado y lo que ya estaba. Si el JSON es inválido, sale con 2 y lista los
  problemas.
