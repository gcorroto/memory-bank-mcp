# Memory Bank MCP - Semantic Code Indexing

Servidor MCP (Model Context Protocol) para indexación semántica de código. Permite a agentes de IA como Claude, Copilot, Cursor y otros mantener una "memoria persistente" de bases de código completas mediante embeddings vectoriales y búsqueda semántica.

## 🧠 ¿Qué es Memory Bank?

**Memory Bank** es un sistema de memoria externa para agentes de código que resuelve el problema fundamental de la pérdida de contexto en IAs. Funciona como el "cerebro externo" del proyecto:

- **Indexa** todo tu código usando embeddings de OpenAI
- **Fragmenta** inteligentemente usando parsing AST (funciones, clases, métodos)
- **Almacena** vectores en LanceDB para búsquedas ultrarrápidas
- **Busca** semánticamente: pregunta en lenguaje natural, obtén código relevante
- **Actualiza** incrementalmente: solo reindexa archivos modificados
- **Multi-proyecto**: consulta código de cualquier proyecto indexado desde cualquier workspace

### ¿Por qué lo necesitas?

Sin Memory Bank, las IAs:
- ❌ Olvidan todo entre sesiones
- ❌ Solo ven fragmentos pequeños de código
- ❌ Alucinan implementaciones inexistentes  
- ❌ Dan respuestas genéricas sin contexto

Con Memory Bank, las IAs:
- ✅ Recuerdan toda la base de código
- ✅ Entienden arquitectura y patrones
- ✅ Responden con código real del proyecto
- ✅ Generan código consistente con tu estilo
- ✅ **Consultan múltiples proyectos** indexados simultáneamente

## 🚀 Características

### Core Memory Bank (Búsqueda Precisa)
- **🔍 Búsqueda Semántica**: Pregunta "¿cómo funciona la autenticación?" y obtén código relevante
- **🧩 Chunking Inteligente**: AST parsing para TS/JS/Python con límites de tokens (8192 máx)
- **⚡ Actualización Incremental**: Solo reindexa archivos modificados (detección por hash)
- **💾 Cache de Embeddings**: Evita regenerar embeddings innecesariamente
- **🎯 Filtros Avanzados**: Por archivo, lenguaje, tipo de chunk
- **📊 Estadísticas Detalladas**: Conoce el estado de tu índice en todo momento
- **🔒 Privacidad**: Vector store local, respeta .gitignore y .memoryignore
- **🔀 Multi-Proyecto**: Consulta cualquier proyecto indexado usando su `projectId`

### Project Knowledge Layer (Conocimiento Global) 🆕
- **📄 Documentación Automática**: Genera 6 documentos markdown estructurados del proyecto
- **🧠 IA con Razonamiento**: Usa OpenAI Responses API con modelos de razonamiento (gpt-5-mini)
- **🔄 Actualización Inteligente**: Solo regenera documentos afectados por cambios
- **📚 Contexto Global**: Complementa búsqueda precisa con visión de alto nivel

## 📋 Requisitos

- **Node.js** >= 18.0.0
- **OpenAI API Key**: [Obtener aquí](https://platform.openai.com/api-keys)
- **Espacio en disco**: ~10MB por cada 10,000 archivos (embeddings + metadata)

## 🛠️ Instalación

### Opción 1: NPX (Recomendado)

La forma más fácil de usar Memory Bank MCP sin instalación local:

```bash
npx @grec0/memory-bank-mcp@latest
```

### Opción 2: Instalación Local

Para desarrollo o contribución:

```bash
# Clonar repositorio
git clone https://github.com/gcorroto/memory-bank-mcp.git
cd memory-bank-mcp

# Instalar dependencias
npm install

# Compilar
npm run build

# Ejecutar
npm run start
```

## ⚙️ Configuración Completa

### Variables de Entorno

Memory Bank se configura mediante variables de entorno. Puedes configurarlas en tu cliente MCP o en un archivo `.env`:

#### Variables Requeridas

| Variable | Descripción |
|----------|-------------|
| `OPENAI_API_KEY` | **REQUERIDO**. Tu API key de OpenAI |

#### Variables de Indexación

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MEMORYBANK_STORAGE_PATH` | `.memorybank` | Directorio donde se almacena el índice vectorial |
| `MEMORYBANK_WORKSPACE_ROOT` | `process.cwd()` | Raíz del workspace (se auto-detecta normalmente) |
| `MEMORYBANK_EMBEDDING_MODEL` | `text-embedding-3-small` | Modelo de embeddings de OpenAI |
| `MEMORYBANK_EMBEDDING_DIMENSIONS` | `1536` | Dimensiones del vector (1536 o 512) |
| `MEMORYBANK_MAX_TOKENS` | `7500` | Tokens máximos por chunk (límite: 8192) |
| `MEMORYBANK_CHUNK_OVERLAP_TOKENS` | `200` | Solapamiento entre chunks para mantener contexto |

#### Variables del Project Knowledge Layer

| Variable | Default | Descripción |
|----------|---------|-------------|
| `MEMORYBANK_REASONING_MODEL` | `gpt-5-mini` | Modelo para generar documentación (soporta reasoning) |
| `MEMORYBANK_REASONING_EFFORT` | `medium` | Nivel de razonamiento: `low`, `medium`, `high` |
| `MEMORYBANK_AUTO_UPDATE_DOCS` | `false` | Auto-regenerar docs cuando se indexa código |

### Configuración en Cursor IDE

Edita tu archivo de configuración de MCP:

**Windows**: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

#### Configuración Mínima

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["@grec0/memory-bank-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

#### Configuración Completa (Recomendada)

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["@grec0/memory-bank-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here",
        "MEMORYBANK_REASONING_MODEL": "gpt-5-mini",
        "MEMORYBANK_REASONING_EFFORT": "medium",
        "MEMORYBANK_AUTO_UPDATE_DOCS": "false",
        "MEMORYBANK_MAX_TOKENS": "7500",
        "MEMORYBANK_CHUNK_OVERLAP_TOKENS": "200",
        "MEMORYBANK_EMBEDDING_MODEL": "text-embedding-3-small",
        "MEMORYBANK_EMBEDDING_DIMENSIONS": "1536"
      }
    }
  }
}
```

### Configuración en Claude Desktop

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory-bank": {
      "command": "npx",
      "args": ["@grec0/memory-bank-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here",
        "MEMORYBANK_REASONING_MODEL": "gpt-5-mini",
        "MEMORYBANK_REASONING_EFFORT": "medium"
      }
    }
  }
}
```

### Configuración con Instalación Local

```json
{
  "mcpServers": {
    "memory-bank": {
      "command": "node",
      "args": ["/ruta/absoluta/memory-bank-mcp/dist/index.js"],
      "cwd": "/ruta/absoluta/memory-bank-mcp",
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

---

## 📄 Sistema de Documentación del Proyecto (Project Knowledge Layer)

Memory Bank incluye un sistema inteligente de documentación que genera y mantiene conocimiento estructurado sobre tu proyecto usando IA con capacidades de razonamiento.

### ¿Cómo Funciona?

1. **Análisis del Código**: El sistema analiza el código indexado usando búsqueda semántica
2. **Generación con IA**: Usa modelos con razonamiento (gpt-5-mini) para generar documentación estructurada
3. **Actualización Incremental**: Solo regenera documentos afectados cuando hay cambios significativos
4. **Almacenamiento Persistente**: Los documentos se guardan en `.memorybank/projects/{projectId}/docs/`

### Documentos Generados

El sistema genera **6 documentos markdown** que proporcionan diferentes perspectivas del proyecto:

| Documento | Propósito | Contenido |
|-----------|-----------|-----------|
| `projectBrief.md` | **Descripción General** | Qué es el proyecto, su propósito principal, funcionalidades clave |
| `productContext.md` | **Perspectiva de Negocio** | Por qué existe, problemas que resuelve, usuarios objetivo, UX |
| `systemPatterns.md` | **Arquitectura y Patrones** | Estructura del código, patrones de diseño, decisiones técnicas |
| `techContext.md` | **Stack Tecnológico** | Tecnologías, dependencias, configuraciones, integraciones |
| `activeContext.md` | **Estado Actual** | En qué se está trabajando, cambios recientes, próximos pasos |
| `progress.md` | **Seguimiento** | Historial de cambios, qué funciona, qué falta, problemas conocidos |

### Herramientas de Documentación

#### `memorybank_generate_project_docs`

Genera o regenera la documentación del proyecto.

```json
{
  "projectId": "my-project",
  "force": false
}
```

- `projectId` **(REQUERIDO)**: ID del proyecto
- `force` (opcional): `true` para regenerar todo, `false` para actualizar incrementalmente

#### `memorybank_get_project_docs`

Lee la documentación generada.

```json
// Obtener resumen de todos los documentos
{
  "projectId": "my-project",
  "document": "summary"
}

// Obtener documento específico
{
  "projectId": "my-project",
  "document": "systemPatterns"
}

// Obtener todos los documentos completos
{
  "projectId": "my-project",
  "document": "all",
  "format": "full"
}
```

### Flujo de Trabajo con Documentación

```
1. Indexar código
   memorybank_index_code({ projectId: "my-project" })

2. Generar documentación
   memorybank_generate_project_docs({ projectId: "my-project" })

3. Consultar documentación al inicio de cada sesión
   memorybank_get_project_docs({ projectId: "my-project", document: "activeContext" })

4. Buscar código específico
   memorybank_search({ projectId: "my-project", query: "..." })
```

### Auto-Actualización de Documentación

Si configuras `MEMORYBANK_AUTO_UPDATE_DOCS=true`, los documentos se regenerarán automáticamente después de cada indexación. Esto es útil para mantener la documentación siempre actualizada pero consume más tokens de API.

---

## 🔀 Multi-Proyecto: Consultas Entre Proyectos

Una característica poderosa de Memory Bank es la capacidad de **consultar cualquier proyecto indexado desde cualquier workspace**.

### ¿Cómo Funciona?

Todos los proyectos indexados se almacenan en un vector store compartido, identificados por su `projectId`. Esto significa que:

1. **Puedes trabajar en el Proyecto A** y consultar código del Proyecto B
2. **Los agentes pueden aprender** de proyectos similares ya indexados
3. **Reutiliza patrones** de otros proyectos de tu organización

### Ejemplo de Uso

```
# Estás trabajando en "frontend-app" pero necesitas ver cómo se hizo algo en "backend-api"

Usuario: ¿Cómo se implementó la autenticación en el proyecto backend-api?

Agente: [ejecuta memorybank_search({ 
  projectId: "backend-api",  // Otro proyecto
  query: "autenticación JWT middleware"
})]

Encontré la implementación en backend-api:
- El middleware de auth está en src/middleware/auth.ts
- Usa JWT con refresh tokens
- La validación se hace con jsonwebtoken...
```

### Requisitos para Multi-Proyecto

1. **El proyecto debe estar indexado** previamente con su `projectId`
2. **Usa el projectId correcto** al hacer consultas
3. **La documentación es independiente** por proyecto

### Ejemplo Real: Dos Proyectos Relacionados

```json
// Proyecto 1: a2a_gateway (ya indexado)
memorybank_search({
  "projectId": "a2a_gateway",
  "query": "cómo se registran los agentes"
})

// Proyecto 2: GREC0AI (workspace actual)
memorybank_search({
  "projectId": "GREC0AI", 
  "query": "implementación de AgentEntity"
})

// Puedes consultar ambos en la misma sesión!
```

---

## 📚 Herramientas Disponibles

> **⚠️ IMPORTANTE**: Todas las herramientas requieren `projectId` obligatorio. Este ID debe coincidir con el definido en tu archivo `AGENTS.md`.

### `memorybank_index_code`

Indexa código semánticamente para permitir búsquedas.

**Parámetros:**
- `projectId` **(REQUERIDO)**: Identificador único del proyecto
- `path` (opcional): Ruta relativa o absoluta (default: raíz del workspace)
- `recursive` (opcional): Indexar subdirectorios (default: true)
- `forceReindex` (opcional): Forzar reindexación completa (default: false)

**Ejemplo:**
```json
{
  "projectId": "my-project",
  "path": "src/auth",
  "recursive": true
}
```

### `memorybank_search`

Busca código por similitud semántica.

**Parámetros:**
- `projectId` **(REQUERIDO)**: Identificador del proyecto donde buscar
- `query` (requerido): Consulta en lenguaje natural
- `topK` (opcional): Número de resultados (default: 10)
- `minScore` (opcional): Score mínimo 0-1 (default: 0.4)
- `filterByFile` (opcional): Filtrar por patrón de archivo
- `filterByLanguage` (opcional): Filtrar por lenguaje

**Ejemplo:**
```json
{
  "projectId": "my-project",
  "query": "función que autentica usuarios con JWT",
  "topK": 5,
  "minScore": 0.8
}
```

### `memorybank_read_file`

Lee contenido de un archivo.

**Parámetros:**
- `path` (requerido): Ruta del archivo
- `startLine` (opcional): Línea inicial
- `endLine` (opcional): Línea final

### `memorybank_write_file`

Escribe un archivo y lo reindexa automáticamente.

**Parámetros:**
- `projectId` **(REQUERIDO)**: Identificador del proyecto para reindexación
- `path` (requerido): Ruta del archivo
- `content` (requerido): Contenido del archivo
- `autoReindex` (opcional): Auto-reindexar (default: true)

### `memorybank_get_stats`

Obtiene estadísticas del Memory Bank.

### `memorybank_analyze_coverage`

Analiza la cobertura de indexación del proyecto.

**Parámetros:**
- `projectId` **(REQUERIDO)**: Identificador del proyecto a analizar
- `path` **(REQUERIDO)**: Ruta absoluta del workspace a analizar

**Ejemplo:**
```json
{
  "projectId": "my-project",
  "path": "C:/workspaces/my-project"
}
```

### `memorybank_generate_project_docs`

Genera documentación estructurada del proyecto usando IA con razonamiento.

**Parámetros:**
- `projectId` **(REQUERIDO)**: Identificador del proyecto
- `force` (opcional): Forzar regeneración (default: false)

### `memorybank_get_project_docs`

Lee la documentación del proyecto generada por IA.

**Parámetros:**
- `projectId` **(REQUERIDO)**: Identificador del proyecto
- `document` (opcional): `"summary"`, `"all"`, o nombre específico (`projectBrief`, `systemPatterns`, etc.)
- `format` (opcional): `"full"` o `"summary"` (default: "full")

---

## 📋 Plantillas de Instrucciones para Agentes

Memory Bank incluye plantillas de instrucciones en dos formatos para configurar el comportamiento del agente:

- **AGENTS.md** - Estándar [agents.md](https://agents.md/) (compatible con Claude, Cursor, múltiples agentes)
- **VSCode/Copilot** - Formato `.github/copilot-instructions.md` para GitHub Copilot en VS Code

### Modos Disponibles

| Modo | Archivo | Uso Ideal |
|------|---------|-----------|
| **Basic** | `AGENTS.basic.md` | Control total, indexación manual |
| **Auto-Index** | `AGENTS.auto-index.md` | Desarrollo activo, sincronización automática |
| **Sandboxed** | `AGENTS.sandboxed.md` | Entornos sin acceso directo a archivos |

### 1. Basic Mode

**Para proyectos donde quieres control total.**

- ✅ El agente SIEMPRE consulta el Memory Bank antes de actuar
- ✅ Solo indexa cuando el usuario lo solicita explícitamente
- ✅ Pide permiso antes de modificar código
- ✅ Sugiere reindexar después de cambios

**Ideal para**: Proyectos críticos, revisión de código, onboarding.

### 2. Auto-Index Mode

**Para desarrollo activo con sincronización automática.**

- ✅ El agente consulta el Memory Bank automáticamente
- ✅ Reindexa CADA archivo después de modificarlo
- ✅ Mantiene el Memory Bank siempre actualizado
- ✅ Puede leer/escribir archivos directamente

**Ideal para**: Desarrollo activo, iteración rápida, equipos.

### 3. Sandboxed Mode

**Para entornos sin acceso directo al sistema de archivos.**

- ✅ NO tiene acceso directo a archivos
- ✅ DEBE usar `memorybank_read_file` para leer
- ✅ DEBE usar `memorybank_write_file` para escribir
- ✅ Auto-reindexa automáticamente en cada escritura

**Ideal para**: Entornos restringidos, desarrollo remoto, seguridad.

### Plantillas Disponibles

Todas las plantillas están disponibles en el repositorio de GitHub:

#### Formato AGENTS.md (Cursor, Claude, Multi-agente)

| Modo | URL |
|------|-----|
| **Basic** | [AGENTS.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.basic.md) |
| **Auto-Index** | [AGENTS.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.auto-index.md) |
| **Sandboxed** | [AGENTS.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.sandboxed.md) |

**Instalación:**

```bash
# Descargar plantilla (elige una)
curl -o AGENTS.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/AGENTS.basic.md
# O
curl -o AGENTS.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/AGENTS.auto-index.md
# O
curl -o AGENTS.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/AGENTS.sandboxed.md

# Editar los placeholders:
# - Reemplaza {{PROJECT_ID}} con tu ID de proyecto único
# - Reemplaza {{WORKSPACE_PATH}} con la ruta absoluta del workspace
```

#### Formato VS Code / GitHub Copilot

| Modo | URL |
|------|-----|
| **Basic** | [copilot-instructions.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.basic.md) |
| **Auto-Index** | [copilot-instructions.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.auto-index.md) |
| **Sandboxed** | [copilot-instructions.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.sandboxed.md) |
| **Instructions** | [memory-bank.instructions.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/memory-bank.instructions.md) |

**Instalación:**

```bash
# Crear carpeta .github si no existe
mkdir -p .github

# Descargar plantilla (elige una)
curl -o .github/copilot-instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/copilot-instructions.basic.md
# O
curl -o .github/copilot-instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/copilot-instructions.auto-index.md
# O
curl -o .github/copilot-instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/copilot-instructions.sandboxed.md

# Habilitar en VS Code settings.json:
# "github.copilot.chat.codeGeneration.useInstructionFiles": true
```

#### Instrucciones con Aplicación Condicional (VS Code)

Para usar el archivo `.instructions.md` que aplica solo a ciertos archivos:

```bash
# Crear carpeta de instrucciones
mkdir -p .github/instructions

# Descargar instrucciones base
curl -o .github/instructions/memory-bank.instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/memory-bank.instructions.md
```

Este archivo incluye `applyTo: "**/*"` que aplica a todos los archivos, pero puedes modificarlo.

### Ejemplo de AGENTS.md Configurado

```markdown
# AGENTS.md

## Project Configuration
- **Project ID**: `my-awesome-app`
- **Workspace**: `C:/workspaces/my-awesome-app`

## Memory Bank Instructions

### CRITICAL: Always Consult Before Acting
Before any action, call `memorybank_search` with projectId="my-awesome-app"

### Auto-Indexing Policy
AFTER every file modification:
memorybank_index_code({ projectId: "my-awesome-app", path: "<modified_file>" })

### Session Start
At the beginning of each session, get context:
memorybank_get_project_docs({ projectId: "my-awesome-app", document: "activeContext" })
```

---

## 🎯 Casos de Uso

### 1. Primera Indexación

```
Usuario: Hola, quiero que me ayudes con mi proyecto. El projectId es "my-app"
Claude: [ejecuta memorybank_get_stats]
        Veo que no hay código indexado aún. 
        ¿Deseas que indexe el proyecto para poder ayudarte mejor?

Usuario: Sí
Claude: [ejecuta memorybank_index_code({ projectId: "my-app" })]
        He indexado 145 archivos (1,234 chunks) en 45 segundos.
        ¿En qué puedo ayudarte?
```

### 2. Búsqueda de Código

```
Usuario: ¿Cómo funciona la autenticación en este proyecto?
Claude: [ejecuta memorybank_search({ projectId: "my-app", query: "autenticación login usuarios" })]
        
        La autenticación se implementa en src/auth/authService.ts (líneas 23-87):
        
        [Código encontrado]
        
        El sistema usa JWT tokens con refresh token rotation. 
        La validación se hace en el middleware src/middleware/auth.ts.
```

### 3. Consulta Entre Proyectos

```
Usuario: Estoy trabajando en "frontend-v2" pero quiero ver cómo se hizo la 
         paginación en el proyecto "admin-dashboard"

Claude: [ejecuta memorybank_search({ 
          projectId: "admin-dashboard", 
          query: "paginación tabla listado" 
        })]
        
        En admin-dashboard, la paginación se implementó así...
        [Muestra código del otro proyecto]
        
        ¿Quieres que implemente algo similar en frontend-v2?
```

### 4. Generación de Documentación

```
Usuario: Genera documentación del proyecto para nuevos desarrolladores
Claude: [ejecuta memorybank_generate_project_docs({ projectId: "my-app" })]
        
        He generado 6 documentos de conocimiento del proyecto:
        - projectBrief.md: Descripción general
        - systemPatterns.md: Arquitectura y patrones
        - techContext.md: Stack tecnológico
        ...
        
        Puedes consultarlos en cualquier momento con memorybank_get_project_docs
```

---

## 🔧 Archivos de Configuración

### `.memoryignore`

Similar a `.gitignore`, especifica patrones a excluir de indexación:

```bash
# Dependencias
node_modules/
vendor/

# Build outputs
dist/
build/
*.min.js

# Memory Bank storage
.memorybank/

# Large data files
*.csv
*.log
*.db

# Binary and media
*.exe
*.pdf
*.jpg
*.png
*.mp4
```

### Respeto de `.gitignore`

Memory Bank **respeta automáticamente** los patrones de `.gitignore` en tu proyecto, además de los de `.memoryignore`.

---

## 💰 Costos de OpenAI

Memory Bank usa `text-embedding-3-small` que es muy económico:

- **Precio embeddings**: ~$0.00002 por 1K tokens
- **Ejemplo**: 10,000 archivos × 1,000 tokens promedio = **~$0.20**
- **Cache**: Los embeddings se cachean, solo se regeneran si el código cambia
- **Incremental**: Solo se reindexan archivos modificados

**Búsquedas son extremadamente baratas** (solo 1 embedding por query).

**Documentación con IA** usa modelos de razonamiento que son más costosos pero se ejecutan solo cuando se solicita explícitamente.

---

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Tests con cobertura
npm test -- --coverage
```

---

## 🔐 Seguridad y Privacidad

- ✅ **Vector store local**: LanceDB corre en tu máquina
- ✅ **Sin telemetría**: No enviamos datos a servidores externos
- ✅ **Solo embeddings**: OpenAI solo ve el texto del código, no metadata sensible
- ✅ **Respeta .gitignore**: Archivos ignorados no se indexan
- ✅ **API key segura**: Se lee de variables de entorno, nunca se hardcodea

### Recomendaciones

1. **No subas `.memorybank/` a git** (ya está en .gitignore)
2. **Usa `.memoryignore`** para excluir archivos sensibles
3. **API keys en variables de entorno**, nunca en código
4. **Revisa que `.env` esté en .gitignore**

---

## 🐛 Solución de Problemas

### Error: "OPENAI_API_KEY is required"

**Solución**: Configura tu API key en las variables de entorno del MCP.

### Error: "No files found to index"

**Causas posibles**:
1. El directorio está vacío
2. Todos los archivos están en .gitignore/.memoryignore
3. No hay archivos de código reconocidos

### Búsquedas retornan resultados irrelevantes

**Soluciones**:
1. **Aumenta `minScore`**: Usa 0.8 o 0.9 para resultados más precisos
2. **Usa filtros**: `filterByFile` o `filterByLanguage`
3. **Reformula la query**: Sé más específico y descriptivo
4. **Reindexa**: `memorybank_index_code({ forceReindex: true })`

### Error: "projectId is required"

**Solución**: Todas las herramientas requieren `projectId`. Define el `projectId` en tu archivo `AGENTS.md` para que el agente lo use consistentemente.

### Índice desactualizado

```json
memorybank_get_stats({})
```

Si `pendingFiles` muestra archivos pendientes:

```json
{
  "projectId": "my-project",
  "forceReindex": true
}
```

---

## 📖 Documentación Adicional

### Plantillas de Instrucciones

**Formato AGENTS.md** (estándar multi-agente):
- [AGENTS.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.basic.md) - Modo básico (indexación manual)
- [AGENTS.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.auto-index.md) - Modo auto-indexación
- [AGENTS.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.sandboxed.md) - Modo sin acceso directo a archivos

**Formato VS Code / Copilot**:
- [copilot-instructions.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.basic.md) - Modo básico
- [copilot-instructions.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.auto-index.md) - Modo auto-indexación
- [copilot-instructions.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.sandboxed.md) - Modo sandboxed
- [memory-bank.instructions.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/memory-bank.instructions.md) - Instrucciones condicionales

---

## 🤝 Contribución

¡Contribuciones son bienvenidas!

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 🎓 Inspiración

Este proyecto combina los mejores conceptos de dos enfoques complementarios:

### Cursor IDE - Indexación Semántica

El sistema de indexación vectorial y búsqueda semántica está inspirado en cómo Cursor IDE maneja la memoria de código:

- [Advanced Cursor: Use the Memory Bank](https://medium.com/codetodeploy/advanced-cursor-use-the-memory-bank-to-eliminate-hallucination-affd3fbeefa3) - Eliminar alucinaciones con memoria persistente
- [How Cursor Indexes Codebases Fast](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast) - Técnicas de indexación eficiente

### Cline - Documentación Estructurada del Proyecto

El sistema de **Project Knowledge Layer** (documentos markdown estructurados) está inspirado en el enfoque de Cline Memory Bank:

- [Cline MCP Memory Bank](https://github.com/dazeb/cline-mcp-memory-bank) - Implementación de referencia del Memory Bank para Cline
- [Cline Memory Bank Custom Instructions](https://gist.github.com/zoharbabin/441e8e8b719a444f26b34bd0b189b283) - Instrucciones personalizadas para usar el Memory Bank

**Documentos del enfoque Cline que adoptamos:**
| Documento | Propósito |
|-----------|-----------|
| `projectBrief.md` | Requisitos y alcance del proyecto |
| `productContext.md` | Propósito, usuarios objetivo, problemas que resuelve |
| `activeContext.md` | Tareas actuales, cambios recientes, próximos pasos |
| `systemPatterns.md` | Decisiones arquitectónicas, patrones, relaciones |
| `techContext.md` | Stack tecnológico, dependencias, configuraciones |
| `progress.md` | Hitos, estado general, problemas conocidos |

### Nuestra Contribución

Memory Bank MCP **fusiona ambos enfoques**:

1. **Búsqueda Semántica** (estilo Cursor): Embeddings vectoriales + LanceDB para encontrar código relevante instantáneamente
2. **Documentación Estructurada** (estilo Cline): 6 documentos markdown generados con IA que proporcionan contexto global
3. **Multi-Proyecto**: Capacidad única de consultar múltiples proyectos indexados desde cualquier workspace

Esta combinación permite que los agentes tengan tanto **precisión** (búsqueda semántica) como **comprensión global** (documentación estructurada)

---

## 📜 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

---

## 🆘 Soporte

- **Issues**: [GitHub Issues](https://github.com/gcorroto/memory-bank-mcp/issues)
- **Documentación**: [Wiki del Proyecto](https://github.com/gcorroto/memory-bank-mcp/wiki)
- **OpenAI API**: [Documentación Oficial](https://platform.openai.com/docs)
- **LanceDB**: [Documentación](https://lancedb.github.io/lancedb/)

---

⭐ Si este proyecto te resulta útil, ¡considera darle una estrella!

**Hecho con ❤️ para la comunidad de AI coding assistants**
