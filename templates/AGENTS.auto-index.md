# AGENTS.md - Memory Bank Auto-Index Mode

## Project Configuration

- **Project ID**: `{{PROJECT_ID}}`
- **Workspace**: `{{WORKSPACE_PATH}}`

---

## Memory Bank MCP Instructions

This project uses Memory Bank MCP with **automatic indexing**. The Memory Bank is a **RAG system** (Retrieval-Augmented Generation) that keeps your knowledge of the codebase accurate and prevents hallucinations.

### ⚠️ CRITICAL RULES - MUST FOLLOW

#### Rule 0: COORDINATE WITH OTHER AGENTS

**BEFORE starting any task, you MUST check the Agent Board.** This prevents multiple agents from modifying the same files simultaneously or duplicating work.

1. **Check Board**: Use `memorybank_manage_agents` with `action: "get_board"` to see active agents/locks.
2. **Register**: Identity yourself (e.g., `role-ide-model`). Call `action: "register"` with your `agentId`. The system will assign a **Session ID** for tracking context automatically.
3. **Claim Task**: `action: "claim_resource"` for the file/feature you are working on.
4. **Work**: Perform your task (Search -> Implement -> Index).
5. **Release**: `action: "release_resource"` when done.

#### Rule 1: ALWAYS SEARCH BEFORE IMPLEMENTING

**NEVER write code without first consulting the Memory Bank.** This prevents hallucinations and ensures you understand existing patterns.

```json
// memorybank_search - MANDATORY before ANY implementation
{
  "projectId": "{{PROJECT_ID}}",
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
  "projectId": "{{PROJECT_ID}}",
  "path": "path/to/modified/file.ts"
}
```

**No exceptions.** If you modify a file and don't reindex, the Memory Bank becomes stale and you risk hallucinations.

#### Rule 3: RESPECT PROJECT BOUNDARIES

**You are the expert for project `{{PROJECT_ID}}`.**

- **Do NOT modify files** outside your project's scope, even if you can access them.
- **Do NOT implement features** that belong to another component (backend vs frontend).
- **INSTEAD:**
  1. **Discover**: Use `memorybank_discover_projects` to find the owner.
  2. **Delegate**: Use `memorybank_delegate_task` to send them the work.

#### Rule 4: DOCUMENT EVERYTHING CONTINUOUSLY

**After EVERY significant action, update the Memory Bank. No exceptions.**

| After This | Do This |
|------------|---------|  
| Completing a task | `memorybank_track_progress` with completed/inProgress |
| Making a technical decision | `memorybank_record_decision` with rationale |
| Finishing a session | `memorybank_update_context` with recentChanges + nextSteps |
| Implementing a feature | `memorybank_track_progress` + update activeContext |

**Why?** The goal is that the next session (or another agent) can pick up exactly where you left off with ZERO context loss.

```json
// After EVERY significant action:
{
  "projectId": "{{PROJECT_ID}}",
  "progress": {
    "completed": ["What you just finished"],
    "inProgress": ["What's still pending"]
  }
}
```

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

#### Multi-Project & Coordination
| Tool | Description |
|------|-------------|
| `memorybank_manage_agents` | Coordination & locking |
| `memorybank_discover_projects` | Find other projects in the ecosystem |
| `memorybank_delegate_task` | Create tasks for other project agents |

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
| `memorybank_manage_agents` | Coordination & locking |

#### MCP Resources (Direct Access)
| Resource URI | Content |
|--------------|---------|
| `memory://{{PROJECT_ID}}/active` | Current session context |
| `memory://{{PROJECT_ID}}/progress` | Progress tracking |
| `memory://{{PROJECT_ID}}/decisions` | Decision log |
| `memory://{{PROJECT_ID}}/context` | Project context |
| `memory://{{PROJECT_ID}}/patterns` | System patterns |
| `memory://{{PROJECT_ID}}/brief` | Project brief |

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

1. **Establish Identity** (CRITICAL for Multi-Agent):
   - You MUST identify yourself uniquely to prevent conflicts.
   - Detect your environment (IDE and LLM) if possible.
   - Generate an **Agent ID**: `{Role}-{IDE}-{Model}` (system adds hash suffix automatically).
   - Register immediately (System assigns Session ID and hash):
     ```json
     {
       "projectId": "{{PROJECT_ID}}",
       "action": "register",
       "agentId": "Dev-VSCode-GPT4",
       "workspacePath": "{{WORKSPACE_PATH}}"
     }
     ```
   - The system returns your full agentId with hash (e.g., `Dev-VSCode-GPT4-a1b2c3d4`).
   - **IMPORTANT**: Use this full agentId in ALL subsequent tool calls.

2. **Check Pending Tasks** (CRITICAL):
   - After registering, ALWAYS check for pending tasks:
     ```json
     {
       "projectId": "{{PROJECT_ID}}",
       "action": "get_board"
     }
     ```
   - Look for tasks with `status: "PENDING"` assigned to your project.
   - **If pending tasks exist: you MUST prioritize them before new work.**
   - These tasks may come from other agents via cross-project delegation.
   - Complete pending tasks first, then attend to user requests.

3. **Initialize if first time** (only once per project):
   ```json
   // memorybank_initialize - Creates basic templates (no AI, instant)
   {
     "projectId": "{{PROJECT_ID}}",
     "projectPath": "{{WORKSPACE_PATH}}",
     "projectName": "Project Name"
   }
   ```
   > **Note**: After indexing code, run `memorybank_generate_project_docs` to replace basic templates with AI-generated documentation.

4. **Get active context**:
   ```json
   // memorybank_get_project_docs
   {
     "projectId": "{{PROJECT_ID}}",
     "document": "activeContext"
   }
   ```

5. **Update session**:
   ```json
   // memorybank_update_context
   {
     "projectId": "{{PROJECT_ID}}",
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
  "projectId": "{{PROJECT_ID}}",
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
  "projectId": "{{PROJECT_ID}}",
  "path": "path/to/modified/file.ts"
}
```

For multiple files (a directory):
```json
{
  "projectId": "{{PROJECT_ID}}",
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
  "projectId": "{{PROJECT_ID}}",
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
  "projectId": "{{PROJECT_ID}}",
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

### The 4 Critical Rules

| Rule | What | Tool | Mandatory |
|------|------|------|----------|
| 0 | Coordinate with agents | `memorybank_manage_agents` | ✅ Session start |
| 1 | Search before implementing | `memorybank_search` | ✅ ALWAYS |
| 2 | Reindex after modifying | `memorybank_index_code` | ✅ ALWAYS |
| 3 | Respect project boundaries | `memorybank_delegate_task` | When cross-project |
| 4 | Document everything | `memorybank_track_progress` | ✅ ALWAYS |

### Session Start Checklist

1. [ ] Register: `action: "register"` → get agentId with hash
2. [ ] Check tasks: `action: "get_board"` → look for PENDING tasks
3. [ ] Get context: `memorybank_get_project_docs` → load activeContext
4. [ ] Update session: `memorybank_update_context` → mark session active
5. [ ] Handle pending tasks FIRST before new work

### After Every Action Checklist

- [ ] Modified file? → `memorybank_index_code`
- [ ] Completed task? → `memorybank_track_progress`
- [ ] Made decision? → `memorybank_record_decision`
- [ ] Ending session? → `memorybank_update_context` with nextSteps

**Remember: The Memory Bank is your source of truth. Consult it constantly, keep it updated always.**
