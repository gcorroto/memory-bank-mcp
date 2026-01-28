# get_task_details - Guía para el LLM

## ¿Qué es?

`get_task_details` es una **acción crítica** del sistema de coordinación de agentes que permite obtener la descripción completa y el contexto técnico de una tarea específica.

## ¿Por qué existe?

Cuando un agente consulta el tablero de tareas con `get_board`, solo ve información resumida:

```markdown
| ID         | Title                    | From        | Status  | Created At |
|------------|--------------------------|-------------|---------|------------|
| EXT-123456 | Implement authentication | api-gateway | PENDING | 2024-01-28 |
```

**NO puede ver:**
- ❌ La descripción detallada de QUÉ hacer
- ❌ El contexto técnico de CÓMO hacerlo
- ❌ Los requisitos específicos
- ❌ Información crítica para implementar correctamente

`get_task_details` resuelve esto devolviendo **TODA** la información de la tarea.

## ¿Cuándo DEBE usarse?

### OBLIGATORIO en estos casos:

1. **Después de ver tareas pendientes en `get_board`**
   - Si el board muestra tareas PENDING o IN_PROGRESS
   - ANTES de reclamar cualquier tarea
   - Para entender QUÉ se necesita hacer

2. **Antes de reclamar una tarea (`claim_task`)**
   - NUNCA reclamar sin leer los detalles primero
   - Evita malentendidos y trabajo incorrecto
   - Permite validar si tienes las capacidades necesarias

3. **Para delegar correctamente**
   - Si necesitas re-delegar una tarea a otro proyecto
   - Para copiar el contexto completo en la nueva delegación

4. **Para reportar estado**
   - Cuando el usuario pregunta "¿qué tareas hay pendientes?"
   - Para dar respuestas completas, no solo títulos

## ¿Cómo usarse?

### Sintaxis

```json
{
  "projectId": "my-project",
  "action": "get_task_details",
  "taskId": "EXT-123456"
}
```

### Respuesta esperada

```json
{
  "success": true,
  "task": {
    "id": "EXT-123456",
    "projectId": "my-project",
    "title": "Implement authentication",
    "description": "Create JWT-based authentication for the API.\n\nContext:\n- Use bcrypt for password hashing\n- JWT tokens with 1h expiration\n- Refresh token mechanism\n- Store implementation in lib-auth project\n- Export AuthService, TokenManager from index.ts",
    "fromProject": "api-gateway",
    "fromAgent": null,
    "status": "PENDING",
    "claimedBy": null,
    "createdAt": "2024-01-28T10:30:00.000Z",
    "claimedAt": null,
    "completedAt": null
  }
}
```

## Flujo de trabajo correcto

### ✅ CORRECTO

```
1. get_board (ver lista de tareas)
   ↓
2. get_task_details (leer descripción completa de cada tarea)
   ↓
3. claim_task (reclamar SOLO después de entender)
   ↓
4. Implementar basándose en description + context
   ↓
5. complete_task (marcar como completada)
```

### ❌ INCORRECTO

```
1. get_board
   ↓
2. claim_task (SIN leer detalles - MAL!)
   ↓
3. get_task_details (tarde - ya reclamaste sin saber qué hacer)
   ↓
4. Implementar (posiblemente mal porque no tenías contexto completo)
```

## Campos importantes de la respuesta

| Campo | Descripción | Uso |
|-------|-------------|-----|
| `description` | Descripción detallada + contexto técnico | **LEER COMPLETO** antes de implementar |
| `fromProject` | Proyecto que delegó la tarea | Saber quién necesita esto |
| `status` | Estado actual | Verificar si sigue PENDING |
| `claimedBy` | Quién la reclamó | Si no es null, otro agente ya está trabajando |
| `createdAt` | Cuándo se creó | Priorizar tareas más antiguas |

## Ejemplos de uso

### Ejemplo 1: Ver tarea pendiente al iniciar sesión

```typescript
// 1. Registrar agente
{
  projectId: "lib-auth",
  action: "register",
  agentId: "Dev-IDE-Model"
}

// 2. Ver tablero
{
  projectId: "lib-auth",
  action: "get_board"
}

// Respuesta muestra: EXT-123456 | Implement auth | api-gateway | PENDING

// 3. Obtener detalles (CRÍTICO!)
{
  projectId: "lib-auth",
  action: "get_task_details",
  taskId: "EXT-123456"
}

// 4. Leer la description completa, entender requisitos

// 5. Reclamar solo si entiendes y puedes hacerlo
{
  projectId: "lib-auth",
  action: "claim_task",
  taskId: "EXT-123456"
}
```

### Ejemplo 2: Usuario pregunta "¿qué tareas hay?"

```typescript
// 1. Ver tablero
const board = await get_board();

// 2. Para CADA tarea, obtener detalles
for (const task of pendingTasks) {
  const details = await get_task_details(task.id);
  
  // 3. Mostrar al usuario con descripción completa
  console.log(`
    Tarea: ${details.title}
    De: ${details.fromProject}
    Descripción: ${details.description}
  `);
}
```

### Ejemplo 3: Validar antes de reclamar

```typescript
// Ver tarea
const board = await get_board();
// Board muestra: EXT-789012 | Migrate to PostgreSQL | backend | PENDING

// Obtener detalles
const details = await get_task_details("EXT-789012");

// Leer description
if (details.description.includes("PostgreSQL")) {
  // Esta tarea requiere conocimiento de PostgreSQL
  // Si este proyecto es lib-auth (solo maneja autenticación)
  // NO debería reclamarla - posible error de delegación
  
  console.log("Esta tarea no corresponde a lib-auth, requiere backend");
  // Opcionalmente re-delegar al proyecto correcto
}
```

## Errores comunes a evitar

### ❌ Error 1: Reclamar sin leer

```typescript
// MAL - Reclama sin saber qué hacer
claim_task("EXT-123456");
```

```typescript
// BIEN - Lee primero, decide después
const details = get_task_details("EXT-123456");
// Leer details.description completamente
// Validar que corresponde a este proyecto
claim_task("EXT-123456");
```

### ❌ Error 2: Solo mostrar título al usuario

```typescript
// MAL - Usuario no tiene información
console.log(`Tarea pendiente: ${task.title}`);
```

```typescript
// BIEN - Usuario ve descripción completa
const details = get_task_details(task.id);
console.log(`
Tarea: ${details.title}
Descripción: ${details.description}
Origen: ${details.fromProject}
`);
```

### ❌ Error 3: No verificar estado antes de reclamar

```typescript
// MAL - Puede estar reclamada por otro
claim_task("EXT-123456");
```

```typescript
// BIEN - Verificar que esté disponible
const details = get_task_details("EXT-123456");
if (details.status === "PENDING" && !details.claimedBy) {
  claim_task("EXT-123456");
} else {
  console.log(`Tarea ya reclamada por ${details.claimedBy}`);
}
```

## Integración con otros comandos

### Con `claim_task`

**Siempre en este orden:**
1. `get_task_details` - Leer y entender
2. `claim_task` - Reclamar si corresponde

### Con `route_task`

Si después de leer los detalles determinas que la tarea NO corresponde a tu proyecto:

```typescript
const details = get_task_details("EXT-123456");

if (!perteneceAMiProyecto(details.description)) {
  // Re-rutar para determinar el proyecto correcto
  const routing = route_task(details.description);
  
  // Delegar al proyecto correcto
  delegate_task({
    targetProject: routing.correctProject,
    title: details.title,
    description: details.description  // Copiar descripción completa
  });
  
  // Marcar como completada (porque la re-delegaste)
  complete_task("EXT-123456");
}
```

### Con `complete_task`

Antes de completar, puedes verificar los detalles para asegurar que cumpliste todo:

```typescript
const details = get_task_details("EXT-123456");
// Verificar requirements en details.description
// Confirmar que todo está implementado
complete_task("EXT-123456");
```

## Resumen

| Acción | Propósito | Cuándo usar |
|--------|-----------|-------------|
| `get_board` | Ver lista de tareas | Al inicio de sesión |
| `get_task_details` | **Leer descripción completa** | **ANTES de reclamar** |
| `claim_task` | Reclamar para trabajar | Después de leer y entender |
| `complete_task` | Marcar como hecha | Cuando terminaste |

**Regla de oro:** NUNCA uses `claim_task` sin antes usar `get_task_details`.
