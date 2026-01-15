# Memory Bank MCP - Auto-Index Mode

## Project Configuration

- **Project ID**: `memory_bank_mcp`
- **Mode**: Auto-Index (continuous RAG synchronization)

---

## Memory Bank Instructions

This project uses Memory Bank MCP as a **RAG system** (Retrieval-Augmented Generation). It keeps your knowledge accurate and **prevents hallucinations**.

### ⚠️ CRITICAL RULES - MUST FOLLOW

#### Rule 0: COORDINATE WITH OTHER AGENTS

**BEFORE starting any task, you MUST check the Agent Board.** This prevents multiple agents from modifying the same files simultaneously or duplicating work.

1. **Check Board**: Use `memorybank_manage_agents` with `action: "get_board"` to see active agents/locks.
2. **Register**: Identity yourself (e.g., `role-ide-model`). Call `action: "register"` with your `agentId`. The system will assign a **Session ID** for tracking context automatically.
3. **Claim Task**: `action: "claim_resource"` for the file/feature you are working on.
4. **Work**: Perform your task (Search -> Implement -> Index).
5. **Release**: `action: "release_resource"` when done.

#### Rule 1: ALWAYS SEARCH BEFORE IMPLEMENTING

**NEVER write code without first consulting the Memory Bank.**

```json
// memorybank_search - MANDATORY before ANY implementation
{
  "projectId": "memory_bank_mcp",
  "query": "how does [feature/component] work"
}
```

**When to search:**
- Before implementing anything → Search for similar patterns
- Before modifying code → Search for usages and dependencies  
- Before answering questions → Search for accurate info
- Before suggesting architecture → Search for existing patterns

#### Rule 2: ALWAYS REINDEX AFTER MODIFYING

**IMMEDIATELY after modifying ANY file, reindex it.**

```json
// memorybank_index_code - MANDATORY after ANY file change
{
  "projectId": "memory_bank_mcp",
  "path": "path/to/modified/file.ts"
}
```

**No exceptions.** Keeps the RAG updated and accurate.

#### Rule 3: RESPECT PROJECT BOUNDARIES

**You own `memory_bank_mcp`. Do NOT modify other projects.**
- **Discover**: `memorybank_discover_projects` to find other agents.
- **Delegate**: `memorybank_delegate_task` to hand off work.

---

### Available Tools

#### Core Memory Bank (Semantic RAG)
| Tool | When to Use |
|------|-------------|
| `memorybank_search` | **BEFORE any implementation** |
| `memorybank_index_code` | **AFTER any modification** |
| `memorybank_read_file` | When need full file context |
| `memorybank_write_file` | Write with auto-reindex |

#### Multi-Project
| Tool | Description |
|------|-------------|
| `memorybank_manage_agents` | Coordination & locking |
| `memorybank_discover_projects` | Find other projects |
| `memorybank_delegate_task` | Handoff work |

#### Project Knowledge Layer
| Tool | Description |
|------|-------------|
| `memorybank_generate_project_docs` | Generate AI docs (replaces templates) |
| `memorybank_get_project_docs` | Read project documentation |

#### Context Management
| Tool | Description |
|------|-------------|
| `memorybank_initialize` | Create basic templates (no AI, instant) |
| `memorybank_update_context` | Update session context |
| `memorybank_record_decision` | Record decisions |
| `memorybank_track_progress` | Track progress |
| `memorybank_manage_agents` | Coordination & locking |

#### MCP Resources
| Resource URI | Content |
|--------------|---------|
| `memory://memory_bank_mcp/active` | Session context |
| `memory://memory_bank_mcp/progress` | Progress |
| `memory://memory_bank_mcp/decisions` | Decisions |
| `memory://memory_bank_mcp/context` | Project context |

---

### The RAG Loop (ALWAYS FOLLOW)

```
USER REQUEST
    ↓
SEARCH MEMORY BANK ←──────────────┐
    ↓                             │
UNDERSTAND EXISTING CODE          │
    ↓                             │
IMPLEMENT CHANGES                 │
    ↓                             │
REINDEX IMMEDIATELY ──────────────┘
    ↓
CONFIRM TO USER
```

### Session Start

1. **Establish Identity** (CRITICAL):
   - Pick a unique ID: `{Role}-{IDE}-{Model}-{ShortHash}`
   - Register (System assigns Session ID automatically):
   ```json
   { "projectId": "memory_bank_mcp", "action": "register", "agentId": "Dev-VSCode-GPT4-8A2F" }
   ```
   - **Pass `agentId` in all future tool calls**.

2. **Initialize if first time**:
```json
// memorybank_initialize - Creates basic templates (no AI, instant)
{
  "projectId": "memory_bank_mcp",
  "projectPath": "C:\\workspaces\\grecoLab",
  "projectName": "Project Name"
}
```
> After indexing, run `memorybank_generate_project_docs` to replace with AI docs.

3. **Get active context**:
```json
// memorybank_get_project_docs
{
  "projectId": "memory_bank_mcp",
  "document": "activeContext"
}
```

4. **Update session**:
```json
// memorybank_update_context
{
  "projectId": "memory_bank_mcp",
  "currentSession": { "mode": "development", "task": "Starting" }
}
```

### Before ANY Implementation

**STOP. Did you search first?**

```json
{
  "projectId": "memory_bank_mcp",
  "query": "existing implementation of [what you're about to implement]"
}
```

Checklist:
- ✅ Searched for similar existing code?
- ✅ Searched for related patterns?
- ✅ Searched for dependencies?
- ✅ Understand how it fits in codebase?

### After ANY Modification

**STOP. Did you reindex?**

```json
{
  "projectId": "memory_bank_mcp",
  "path": "path/to/modified/file.ts"
}
```

For multiple files (a directory):
```json
{
  "projectId": "memory_bank_mcp",
  "path": "C:/workspaces/proyecto/src/"
}
```

Note: No need for `forceReindex` - changes are detected via hash automatically.

### Why This Matters

| Without RAG | With RAG |
|-------------|----------|
| ❌ Hallucinate non-existent APIs | ✅ Use actual APIs |
| ❌ Duplicate existing code | ✅ Reuse patterns |
| ❌ Break conventions | ✅ Follow standards |
| ❌ Outdated knowledge | ✅ Current state |

---

### Recording Decisions

```json
{
  "projectId": "memory_bank_mcp",
  "decision": {
    "title": "Decision title",
    "description": "What was decided",
    "rationale": "Why (based on search)"
  }
}
```

### Progress Tracking

```json
{
  "projectId": "memory_bank_mcp",
  "progress": {
    "completed": ["Task X"],
    "inProgress": ["Task Y"]
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
- Follow existing patterns
- TypeScript strict mode
- Functional patterns

### Important Directories
- `src/` - Source code
- `tests/` - Test files

---

## Summary

| Action | Tool | Required |
|--------|------|----------|
| Before implementing | `memorybank_search` | ✅ ALWAYS |
| After modifying | `memorybank_index_code` | ✅ ALWAYS |
| Session start | `memorybank_initialize` | Once |
| Track progress | `memorybank_track_progress` | Recommended |

**The Memory Bank is your source of truth. Consult constantly, update always.**