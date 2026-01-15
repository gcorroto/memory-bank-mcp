# AGENTS.md - Memory Bank Auto-Index Mode

## Project Configuration

- **Project ID**: `memory_bank_mcp`
- **Workspace**: `C:\workspaces\grecoLab`
---

## Memory Bank MCP Instructions

This project uses Memory Bank MCP with **automatic indexing**. The Memory Bank is a **RAG system** (Retrieval-Augmented Generation) that keeps your knowledge of the codebase accurate and prevents hallucinations.

### ⚠️ CRITICAL RULES - MUST FOLLOW

#### Rule 1: ALWAYS SEARCH BEFORE IMPLEMENTING

**NEVER write code without first consulting the Memory Bank.** This prevents hallucinations and ensures you understand existing patterns.

```json
// memorybank_search - MANDATORY before ANY implementation
{
  "projectId": "memory_bank_mcp",
  "query": "how does [feature/component] work"
}
```

**Examples of when to search:**
- Before implementing a new feature → Search for similar patterns
- Before modifying existing code → Search for usages and dependencies
- Before answering questions → Search for accurate information
- Before suggesting architecture → Search for existing patterns

#### Rule 2: ALWAYS REINDEX AFTER MODIFYING

**IMMEDIATELY after modifying ANY file, you MUST reindex it.** This keeps the RAG updated and accurate.

```json
// memorybank_index_code - MANDATORY after ANY file change
{
  "projectId": "memory_bank_mcp",
  "path": "path/to/modified/file.ts"
}
```

**No exceptions.** If you modify a file and don't reindex, the Memory Bank becomes stale and you risk hallucinations.

---

### Available Tools

#### Core Memory Bank (Semantic RAG - USE CONSTANTLY)
| Tool | Description | When to Use |
|------|-------------|-------------|
| `memorybank_search` | Semantic search in code | **BEFORE any implementation** |
| `memorybank_index_code` | Index/reindex files | **AFTER any modification** |
| `memorybank_read_file` | Read file contents | When search results need more context |
| `memorybank_write_file` | Write with auto-reindex | Alternative to manual write+index |
| `memorybank_get_stats` | Index statistics | Check coverage |
| `memorybank_analyze_coverage` | Coverage analysis | Find unindexed areas |

#### Project Knowledge Layer (AI Documentation)
| Tool | Description |
|------|-------------|
| `memorybank_generate_project_docs` | Generate AI docs (replaces basic templates with rich content) |
| `memorybank_get_project_docs` | Read project documentation |

#### Context Management (Session Tracking)
| Tool | Description |
|------|-------------|
| `memorybank_initialize` | Create basic templates for new project (no AI, instant) |
| `memorybank_update_context` | Update session context |
| `memorybank_record_decision` | Record technical decisions |
| `memorybank_track_progress` | Track tasks and progress |

#### MCP Resources (Direct Access)
| Resource URI | Content |
|--------------|---------|
| `memory://memory_bank_mcp/active` | Current session context |
| `memory://memory_bank_mcp/progress` | Progress tracking |
| `memory://memory_bank_mcp/decisions` | Decision log |
| `memory://memory_bank_mcp/context` | Project context |
| `memory://memory_bank_mcp/patterns` | System patterns |
| `memory://memory_bank_mcp/brief` | Project brief |

---

### Workflow: The RAG Loop

```
┌─────────────────────────────────────────────────────────────┐
│                    THE RAG LOOP (ALWAYS)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. USER REQUEST                                            │
│         ↓                                                   │
│  2. SEARCH MEMORY BANK ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐               │
│     - memorybank_search (related code)      │               │
│     - memorybank_get_project_docs (if needed) │             │
│         ↓                                   │               │
│  3. UNDERSTAND EXISTING CODE                │               │
│     - Read search results                   │               │
│     - memorybank_read_file (if need more)   │               │
│         ↓                                   │               │
│  4. IMPLEMENT CHANGES                       │               │
│     - Follow existing patterns found        │               │
│         ↓                                   │               │
│  5. REINDEX IMMEDIATELY ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘               │
│     - memorybank_index_code (MANDATORY)                     │
│         ↓                                                   │
│  6. CONFIRM TO USER                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Session Start

At the beginning of each session:

1. **Initialize if first time** (only once per project):
   ```json
   // memorybank_initialize - Creates basic templates (no AI, instant)
   {
     "projectId": "memory_bank_mcp",
     "projectPath": "{{WORKSPACE_PATH}}",
     "projectName": "Project Name"
   }
   ```
   > **Note**: After indexing code, run `memorybank_generate_project_docs` to replace basic templates with AI-generated documentation.

2. **Get active context**:
   ```json
   // memorybank_get_project_docs
   {
     "projectId": "memory_bank_mcp",
     "document": "activeContext"
   }
   ```

3. **Update session**:
   ```json
   // memorybank_update_context
   {
     "projectId": "memory_bank_mcp",
     "currentSession": {
       "mode": "development",
       "task": "Starting session"
     }
   }
   ```

### Before ANY Implementation

**STOP. Did you search first?**

```json
// ALWAYS do this BEFORE writing any code
{
  "projectId": "memory_bank_mcp",
  "query": "existing implementation of [what you're about to implement]"
}
```

Ask yourself:
- ✅ Did I search for similar existing code?
- ✅ Did I search for related patterns?
- ✅ Did I search for potential dependencies?
- ✅ Do I understand how this fits in the existing codebase?

### After ANY Modification

**STOP. Did you reindex?**

```json
// ALWAYS do this AFTER modifying files
{
  "projectId": "memory_bank_mcp",
  "path": "path/to/modified/file.ts"
}
```

For multiple files (a directory):
```json
{
  "projectId": "memory_bank_mcp",
  "path": "C:/workspaces/proyecto/src/components/"
}
```

Note: No need for `forceReindex: true` - the system detects changes via hash automatically.

### Why This Matters

| Without RAG Loop | With RAG Loop |
|------------------|---------------|
| ❌ Hallucinate APIs that don't exist | ✅ Use actual existing APIs |
| ❌ Create duplicate code | ✅ Reuse existing patterns |
| ❌ Break existing conventions | ✅ Follow project standards |
| ❌ Outdated knowledge | ✅ Always current codebase state |

---

### Recording Decisions

When making significant technical decisions:
```json
{
  "projectId": "memory_bank_mcp",
  "decision": {
    "title": "Decision title",
    "description": "What was decided",
    "rationale": "Why (based on search results)",
    "category": "architecture"
  }
}
```

### Progress Tracking

After completing tasks:
```json
{
  "projectId": "memory_bank_mcp",
  "progress": {
    "completed": ["Implemented X", "Fixed Y"],
    "inProgress": ["Working on Z"]
  }
}
```

---

## Project-Specific Instructions

<!-- Add your project-specific instructions below -->

### Build Commands
- Install: `npm install`
- Build: `npm run build`
- Test: `npm test`

### Code Style
- Follow existing patterns in the codebase
- Use TypeScript strict mode
- Prefer functional patterns

### Important Directories
- `src/` - Source code
- `tests/` - Test files
- `docs/` - Documentation

---

## Summary

| Action | Tool | Mandatory |
|--------|------|-----------|
| Before implementing | `memorybank_search` | ✅ ALWAYS |
| After modifying | `memorybank_index_code` | ✅ ALWAYS |
| Session start | `memorybank_initialize` | Once per project |
| Track progress | `memorybank_track_progress` | Recommended |
| Record decisions | `memorybank_record_decision` | Recommended |

**Remember: The Memory Bank is your source of truth. Consult it constantly, keep it updated always.**