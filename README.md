# Memory Bank MCP - Semantic Code Indexing

Servidor MCP (Model Context Protocol) para indexación semántica de código. Permite a agentes de IA como Claude mantener un "memoria persistente" de bases de código completas mediante embeddings vectoriales y búsqueda semántica.

## 🧠 ¿Qué es Memory Bank?

**Memory Bank** es un sistema de memoria externa para agentes de código que resuelve el problema fundamental de la pérdida de contexto en IAs. Funciona como el "cerebro externo" del proyecto:

- **Indexa** todo tu código usando embeddings de OpenAI
- **Fragmenta** inteligentemente usando parsing AST (funciones, clases, métodos)
- **Almacena** vectores en LanceDB para búsquedas ultrarrápidas
- **Busca** semánticamente: pregunta en lenguaje natural, obtén código relevante
- **Actualiza** incrementalmente: solo reindexa archivos modificados

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

## 🚀 Características

- **🔍 Búsqueda Semántica**: Pregunta "¿cómo funciona la autenticación?" y obtén código relevante
- **🧩 Chunking Inteligente**: AST parsing para TypeScript/JavaScript/Python
- **⚡ Actualización Incremental**: Solo reindexa archivos modificados (detección por hash)
- **💾 Cache de Embeddings**: Evita regenerar embeddings innecesariamente
- **🎯 Filtros Avanzados**: Por archivo, lenguaje, tipo de chunk
- **📊 Estadísticas Detalladas**: Conoce el estado de tu índice en todo momento
- **🔒 Privacidad**: Vector store local, respeta .gitignore y .memoryignore

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
git clone https://github.com/grec0/memory-bank-mcp.git
cd memory-bank-mcp

# Instalar dependencias
npm install

# Compilar
npm run build

# Ejecutar
npm run start
```

## ⚙️ Configuración

### Variables de Entorno

Crea un archivo `.env` en la raíz de tu workspace (o configúralas en tu cliente MCP):

```bash
# REQUERIDO: Tu API key de OpenAI
OPENAI_API_KEY=sk-your-api-key-here

# OPCIONAL: Configuración avanzada
MEMORYBANK_STORAGE_PATH=.memorybank              # Dónde almacenar el índice
MEMORYBANK_EMBEDDING_MODEL=text-embedding-3-small # Modelo de OpenAI
MEMORYBANK_EMBEDDING_DIMENSIONS=1536             # Dimensiones (1536 o 512)
MEMORYBANK_CHUNK_SIZE=1000                       # Tamaño máximo de chunks
MEMORYBANK_CHUNK_OVERLAP=200                     # Overlap entre chunks
MEMORYBANK_WORKSPACE_ROOT=/path/to/project       # Raíz del workspace
```

### Configuración en Claude Desktop

Edita tu archivo de configuración de Claude Desktop:

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
        "OPENAI_API_KEY": "sk-your-api-key-here"
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

## 📚 Herramientas Disponibles

### `memorybank_index_code`

Indexa código semánticamente para permitir búsquedas.

**Parámetros:**
- `path` (opcional): Ruta relativa o absoluta (default: raíz del workspace)
- `recursive` (opcional): Indexar subdirectorios (default: true)
- `forceReindex` (opcional): Forzar reindexación completa (default: false)

**Ejemplo:**
```
memorybank_index_code({ path: "src/auth", recursive: true })
```

### `memorybank_search`

Busca código por similitud semántica.

**Parámetros:**
- `query` (requerido): Consulta en lenguaje natural
- `topK` (opcional): Número de resultados (default: 10)
- `minScore` (opcional): Score mínimo 0-1 (default: 0.7)
- `filterByFile` (opcional): Filtrar por patrón de archivo
- `filterByLanguage` (opcional): Filtrar por lenguaje

**Ejemplo:**
```
memorybank_search({ 
  query: "función que autentica usuarios con JWT",
  topK: 5,
  minScore: 0.8
})
```

### `memorybank_read_file`

Lee contenido de un archivo.

**Parámetros:**
- `path` (requerido): Ruta del archivo
- `startLine` (opcional): Línea inicial
- `endLine` (opcional): Línea final

**Ejemplo:**
```
memorybank_read_file({ path: "src/auth/service.ts", startLine: 50, endLine: 100 })
```

### `memorybank_write_file`

Escribe un archivo y lo reindexa automáticamente.

**Parámetros:**
- `path` (requerido): Ruta del archivo
- `content` (requerido): Contenido del archivo
- `autoReindex` (opcional): Auto-reindexar (default: true)

**Ejemplo:**
```
memorybank_write_file({
  path: "src/utils/validator.ts",
  content: "export function validateEmail(email: string) { ... }"
})
```

### `memorybank_get_stats`

Obtiene estadísticas del Memory Bank.

**Ejemplo:**
```
memorybank_get_stats({})
```

## 🎯 Casos de Uso

### 1. Primera Indexación

```
Usuario: Hola, quiero que me ayudes con mi proyecto
Claude: [ejecuta memorybank_get_stats]
        Veo que no hay código indexado aún. 
        ¿Deseas que indexe el proyecto para poder ayudarte mejor?

Usuario: Sí
Claude: [ejecuta memorybank_index_code({})]
        He indexado 145 archivos (1,234 chunks) en 45 segundos.
        ¿En qué puedo ayudarte?
```

### 2. Búsqueda de Código

```
Usuario: ¿Cómo funciona la autenticación en este proyecto?
Claude: [ejecuta memorybank_search({ query: "autenticación login usuarios" })]
        
        La autenticación se implementa en src/auth/authService.ts (líneas 23-87):
        
        [Código encontrado]
        
        El sistema usa JWT tokens con refresh token rotation. 
        La validación se hace en el middleware src/middleware/auth.ts.
```

### 3. Modificación de Código

```
Usuario: Añade validación de email al formulario de registro
Claude: [busca formulario de registro]
        [busca validadores existentes]
        [lee archivo actual]
        [genera código respetando estilo del proyecto]
        [escribe archivo con memorybank_write_file]
        
        He añadido la validación de email en src/forms/RegisterForm.tsx línea 45.
        Usa el validador existente de emailValidator.ts para mantener consistencia.
        El archivo ha sido reindexado automáticamente.
```

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

**Copia el ejemplo**:
```bash
cp .memoryignore.example .memoryignore
```

### Respeto de `.gitignore`

Memory Bank **respeta automáticamente** los patrones de `.gitignore` en tu proyecto, además de los de `.memoryignore`.

## 💰 Costos de OpenAI

Memory Bank usa `text-embedding-3-small` que es muy económico:

- **Precio**: ~$0.00002 por 1K tokens
- **Ejemplo**: 10,000 archivos × 1,000 tokens promedio = **~$0.20**
- **Cache**: Los embeddings se cachean, solo se regeneran si el código cambia
- **Incremental**: Solo se reindexan archivos modificados

**Búsquedas son extremadamente baratas** (solo 1 embedding por query).

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Tests con cobertura
npm test -- --coverage
```

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

## 🐛 Solución de Problemas

### Error: "OPENAI_API_KEY is required"

**Solución**: Configura tu API key en las variables de entorno.

```bash
# En .env
OPENAI_API_KEY=sk-your-key-here

# O en la configuración de Claude Desktop (ver arriba)
```

### Error: "No files found to index"

**Causas posibles**:
1. El directorio está vacío
2. Todos los archivos están en .gitignore/.memoryignore
3. No hay archivos de código reconocidos

**Solución**: Verifica que haya archivos .ts, .js, .py, etc. en el directorio.

### Búsquedas retornan resultados irrelevantes

**Soluciones**:
1. **Aumenta `minScore`**: Usa 0.8 o 0.9 para resultados más precisos
2. **Usa filtros**: `filterByFile` o `filterByLanguage`
3. **Reformula la query**: Sé más específico y descriptivo
4. **Reindexa**: Puede que el índice esté desactualizado

```
memorybank_index_code({ forceReindex: true })
```

### Rate limit de OpenAI

El sistema maneja automáticamente rate limits con exponential backoff, pero si tienes proyectos muy grandes:

1. **Indexa en partes**: Indexa directorios individuales
2. **Aumenta límites**: Usa una API key con tier más alto
3. **Reduce batch size**: Ajusta en código (default: 100)

### Índice desactualizado

```
memorybank_get_stats({})
```

Si `pendingFiles` muestra archivos pendientes:

```
memorybank_index_code({ forceReindex: true })
```

## 🤝 Contribución

¡Contribuciones son bienvenidas!

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📖 Documentación Adicional

- [AGENT_INSTRUCTIONS.md](AGENT_INSTRUCTIONS.md): Guía completa para agentes de IA
- [wiki/Developer-Guide.md](wiki/Developer-Guide.md): Guía para desarrolladores
- [wiki/API-Reference.md](wiki/API-Reference.md): Referencia completa de API

## 🎓 Inspiración

Este proyecto está inspirado en el sistema de Memory Bank de Cursor IDE, tal como se describe en:

- [Advanced Cursor: Use the Memory Bank](https://medium.com/codetodeploy/advanced-cursor-use-the-memory-bank-to-eliminate-hallucination-affd3fbeefa3)
- [How Cursor Indexes Codebases Fast](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast)
- [Cursor Security](https://simonwillison.net/2025/May/11/cursor-security/)

## 📜 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🆘 Soporte

- **Issues**: [GitHub Issues](https://github.com/grec0/memory-bank-mcp/issues)
- **Documentación**: [Wiki del Proyecto](https://github.com/grec0/memory-bank-mcp/wiki)
- **OpenAI API**: [Documentación Oficial](https://platform.openai.com/docs)
- **LanceDB**: [Documentación](https://lancedb.github.io/lancedb/)

## ⭐ Star History

Si este proyecto te resulta útil, ¡considera darle una estrella! ⭐

---

**Hecho con ❤️ para la comunidad de AI coding assistants**
