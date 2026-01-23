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
4. **Work**: Perform your task (Route -> Search -> Implement -> Index).
5. **Release**: `action: "release_resource"` when done.

#### Rule 0.5: ROUTE BEFORE IMPLEMENTING (MANDATORY)

**BEFORE writing ANY code, you MUST call `memorybank_route_task` to determine what belongs to this project vs what should be delegated.**

```json
// memorybank_route_task - MANDATORY before ANY code changes
{
  "projectId": "memory_bank_mcp",
  "taskDescription": "[describe what you're about to implement]"
}
```

The orchestrator will analyze the task against ALL projects' responsibilities and return:
- **myResponsibilities**: What YOU should implement in this project
- **delegations**: What should be delegated to other projects
- **suggestedImports**: What to import from other projects
- **architectureNotes**: Design guidance

**Why this matters:**
- Prevents creating code that belongs to other projects (e.g., DTOs in API when lib-dtos exists)
- Ensures proper separation of concerns across the ecosystem
- Automatically delegates work to the right project

**NO EXCEPTIONS.** Even for "simple" tasks - the orchestrator knows the ecosystem better than you.

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

#### Rule 4: DOCUMENT EVERYTHING CONTINUOUSLY

**After EVERY significant action, update the Memory Bank:**

1. **Track progress** after completing ANY task:
   ```json
   { "projectId": "memory_bank_mcp", "progress": { "completed": ["Task done"], "inProgress": ["Next task"] } }
   ```

2. **Record decisions** when making architectural/technical choices:
   ```json
   { "projectId": "memory_bank_mcp", "decision": { "title": "...", "description": "...", "rationale": "..." } }
   ```

3. **Update context** to leave notes for next session:
   ```json
   { "projectId": "memory_bank_mcp", "recentChanges": ["..."], "nextSteps": ["..."] }
   ```

**The goal: Next session (or another agent) can pick up exactly where you left off.**

---

### Available Tools

#### Core Memory Bank (Semantic RAG)
| Tool | When to Use |
|------|-------------|
| `memorybank_route_task` | **FIRST - Before ANY code changes** |
| `memorybank_search` | **SECOND - Before implementation** |
| `memorybank_index_code` | **AFTER any modification** |
| `memorybank_read_file` | When need full file context |
| `memorybank_write_file` | Write with auto-reindex |

#### Multi-Project
| Tool | Description |
|------|-------------|
| `memorybank_manage_agents` | Coordination, locking & task management |
| `memorybank_discover_projects` | Find other projects |
| `memorybank_delegate_task` | Handoff work to other projects |

#### Agent Board Actions (`memorybank_manage_agents`)
| Action | Description |
|--------|-------------|
| `register` | Register agent at session start |
| `get_board` | View agents, tasks, locks |
| `claim_task` | Claim a pending task |
| `complete_task` | Mark task as completed |
| `claim_resource` | Lock a file/resource |
| `release_resource` | Unlock a file/resource |
| `update_status` | Update agent status |

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

### The Orchestrated RAG Loop (ALWAYS FOLLOW)

```
USER REQUEST
    ↓
ROUTE TASK (memorybank_route_task) ←─────┐
    ↓                                    │
DELEGATE if needed (other projects)      │
    ↓                                    │
SEARCH MEMORY BANK (my responsibilities) │
    ↓                                    │
UNDERSTAND EXISTING CODE                 │
    ↓                                    │
IMPLEMENT CHANGES (only what's mine)     │
    ↓                                    │
REINDEX IMMEDIATELY ─────────────────────┘
    ↓
CONFIRM TO USER
```

### Session Start

1. **Establish Identity** (CRITICAL):
   - Pick a unique ID: `{Role}-{IDE}-{Model}` (system adds hash automatically)
   - Register (System assigns Session ID and hash suffix):
   ```json
   { 
     "projectId": "memory_bank_mcp", 
     "action": "register", 
     "agentId": "Dev-VSCode-GPT4",
     "workspacePath": "C:\\workspaces\\grecoLab\\memory-bank-mcp"
   }
   ```
   - The system returns your full agentId with hash (e.g., `Dev-VSCode-GPT4-a1b2c3d4`)

2. **Check Pending Tasks** (CRITICAL):
   - After registering, check the board for pending tasks:
   ```json
   { "projectId": "memory_bank_mcp", "action": "get_board" }
   ```
   - Look for tasks with `status: "PENDING"` assigned to your project
   - **If pending tasks exist: prioritize them before user requests**
   - Tasks may come from other agents via `memorybank_delegate_task`

3. **Initialize if first time**:
```json
// memorybank_initialize - Creates basic templates (no AI, instant)
{
  "projectId": "memory_bank_mcp",
  "projectPath": "C:\\workspaces\\grecoLab\\memory-bank-mcp",
  "projectName": "Project Name"
}
```
> After indexing, run `memorybank_generate_project_docs` to replace with AI docs.

4. **Get active context**:
```json
// memorybank_get_project_docs
{
  "projectId": "memory_bank_mcp",
  "document": "activeContext"
}
```

5. **Update session**:
```json
// memorybank_update_context
{
  "projectId": "memory_bank_mcp",
  "currentSession": { "mode": "development", "task": "Starting" }
}
```

### Before ANY Implementation

**STOP. Did you ROUTE and SEARCH first?**

**Step 1: Route the task (MANDATORY)**
```json
{
  "projectId": "memory_bank_mcp",
  "taskDescription": "[what you're about to implement]"
}
```

**Step 2: Search for context**
```json
{
  "projectId": "memory_bank_mcp",
  "query": "existing implementation of [what you're about to implement]"
}
```

Checklist:
- ✅ **Routed the task?** (Did orchestrator confirm this belongs here?)
- ✅ **Delegated if needed?** (Did orchestrator say to delegate parts?)
- ✅ Searched for similar existing code?
- ✅ Searched for related patterns?
- ✅ Searched for dependencies?
- ✅ Understand how it fits in codebase?

### After ANY Modification

**STOP. If you modified a file using ANY tool (except `memorybank_write_file`), you MUST record it.**

If you used `memorybank_write_file`:
- It reindexes automatically.

If you used VS Code edits or other tools:
1. **Index the changes**:
```json
{
  "projectId": "memory_bank_mcp",
  "path": "path/to/modified/file.ts"
}
```

2. **Log the action** (if not done automatically):
```json
// memorybank_update_context
{
  "projectId": "memory_bank_mcp",
  "currentSession": {
    "task": "Modified file.ts to fix bug X"
  }
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

### Task Management

Tasks can come from:
- **Internal**: Created via `track_progress` when adding items to `inProgress`
- **External**: Delegated from other projects via `delegate_task`

#### Checking Pending Tasks

At session start (and periodically), check for pending tasks:
```json
{
  "projectId": "memory_bank_mcp",
  "action": "get_board"
}
```

Look for the **Pending Tasks** section:
- `TASK-XXXXXX`: Internal tasks
- `EXT-XXXXXX`: External tasks from other projects

#### Claiming a Task

Before working on a task, claim it to prevent conflicts:
```json
{
  "projectId": "memory_bank_mcp",
  "action": "claim_task",
  "taskId": "EXT-123456"
}
```

This changes the task status from `PENDING` to `IN_PROGRESS`.

#### Completing a Task

After finishing a task, mark it as completed:
```json
{
  "projectId": "memory_bank_mcp",
  "action": "complete_task",
  "taskId": "EXT-123456"
}
```

This changes the task status to `COMPLETED` and logs the completion.

#### Task Workflow

```
PENDING → claim_task → IN_PROGRESS → complete_task → COMPLETED
```

**Important:**
- Always `claim_task` before starting work
- Always `complete_task` when done (even for external tasks)
- External tasks (`EXT-*`) were delegated by other projects - completing them notifies the requester

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

### The 5 Rules

| Rule | Action | Tool | Required |
|------|--------|------|----------|
| 0 | Coordinate agents | `memorybank_manage_agents` | ✅ Session start |
| 0.5 | **Route before implementing** | `memorybank_route_task` | ✅ **ALWAYS** |
| 1 | Search before implementing | `memorybank_search` | ✅ ALWAYS |
| 2 | Reindex after modifying | `memorybank_index_code` | ✅ ALWAYS |
| 3 | Respect project boundaries | `memorybank_delegate_task` | When needed |
| 4 | Document everything | `memorybank_track_progress` | ✅ ALWAYS |

### Session Checklist

- [ ] Register agent (`action: register`)
- [ ] Check pending tasks (`action: get_board`)
- [ ] Claim pending tasks (`action: claim_task`) if any
- [ ] Get active context (`memorybank_get_project_docs`)
- [ ] Update session (`memorybank_update_context`)
- [ ] Complete tasks when done (`action: complete_task`)

### Before Implementation Checklist

- [ ] **Route task** (`memorybank_route_task`) - MANDATORY
- [ ] **Delegate** if orchestrator says so
- [ ] **Search** for existing code/patterns
- [ ] **Implement** only what's yours
- [ ] **Reindex** immediately after changes

**The Memory Bank is your source of truth. Route first, consult constantly, update always.**