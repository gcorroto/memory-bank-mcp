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
4. **Work**: Perform your task (Route -> Search -> Implement -> Index).
5. **Release**: `action: "release_resource"` when done.

#### Rule 0.5: 🚨 ROUTE TASK BEFORE ANY IMPLEMENTATION (MANDATORY)

**BEFORE writing ANY code, you MUST call `memorybank_route_task`.** This is NON-NEGOTIABLE.

```json
// memorybank_route_task - MANDATORY before ANY code changes
{
  "projectId": "{{PROJECT_ID}}",
  "taskDescription": "Full description of what you're about to implement"
}
```

The orchestrator will analyze the task and tell you:
- **myResponsibilities**: What YOU should implement
- **delegations**: Tasks to delegate to other projects
- **suggestedImports**: Dependencies to use after delegations

**Why is this mandatory?**
- Prevents creating DTOs in an API when a `lib-dtos` exists
- Prevents duplicating services that belong to another project
- Ensures proper separation of responsibilities across the workspace

**If the orchestrator says to delegate:**
1. Use `memorybank_delegate_task` to send tasks to other projects
2. Wait for them to complete (or note the dependency)
3. Import from the external package instead of creating locally

**Example flow:**
```
User: "Create a user endpoint with DTO"
    ↓
You call: memorybank_route_task({ taskDescription: "Create user endpoint with UserDTO" })
    ↓
Orchestrator responds:
{
  "action": "mixed",
  "myResponsibilities": ["UserController", "User routes"],
  "delegations": [
    { "targetProject": "lib-dtos", "taskTitle": "Create UserDTO", ... }
  ],
  "suggestedImports": ["@company/lib-dtos"]
}
    ↓
You: delegate DTO creation, then implement only the controller
```

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

#### 🚨 Task Orchestration (MANDATORY)
| Tool | Description | When to Use |
|------|-------------|-------------|
| `memorybank_route_task` | Analyze task & distribute work | **BEFORE any implementation** |

#### Core Memory Bank (Semantic RAG - USE CONSTANTLY)
| Tool | Description | When to Use |
|------|-------------|-------------|
| `memorybank_search` | Semantic search in code | After routing, before implementing |
| `memorybank_index_code` | Index/reindex files | **AFTER any modification** |
| `memorybank_read_file` | Read file contents | When search results need more context |
| `memorybank_write_file` | Write with auto-reindex | Alternative to manual write+index |
| `memorybank_get_stats` | Index statistics | Check coverage |
| `memorybank_analyze_coverage` | Coverage analysis | Find unindexed areas |

#### Multi-Project & Coordination
| Tool | Description |
|------|-------------|
| `memorybank_manage_agents` | Coordination, locking & task management |
| `memorybank_discover_projects` | Find other projects in the ecosystem |
| `memorybank_delegate_task` | Create tasks for other project agents |

#### Agent Board Actions (`memorybank_manage_agents`)
| Action | Description | Required Params |
|--------|-------------|----------------|
| `register` | Register agent at session start | `agentId`, `workspacePath` |
| `get_board` | View agents, tasks, locks | - |
| `claim_task` | Claim a pending task | `taskId` |
| `complete_task` | Mark task as completed | `taskId` |
| `claim_resource` | Lock a file/resource | `agentId`, `resource` |
| `release_resource` | Unlock a file/resource | `agentId`, `resource` |
| `update_status` | Update agent status | `agentId`, `status`, `focus` |

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

### Workflow: The Orchestrated RAG Loop

```
┌─────────────────────────────────────────────────────────────┐
│              THE ORCHESTRATED RAG LOOP (ALWAYS)             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. USER REQUEST                                            │
│         ↓                                                   │
│  2. 🚨 ROUTE TASK (MANDATORY)                               │
│     - memorybank_route_task (analyze responsibilities)      │
│         ↓                                                   │
│  3. IF DELEGATIONS NEEDED:                                  │
│     - memorybank_delegate_task (for each delegation)        │
│         ↓                                                   │
│  4. SEARCH MEMORY BANK ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐               │
│     - memorybank_search (for YOUR responsibilities)  │      │
│     - memorybank_get_project_docs (if needed)        │      │
│         ↓                                            │      │
│  5. UNDERSTAND EXISTING CODE                         │      │
│     - Read search results                            │      │
│     - memorybank_read_file (if need more)            │      │
│         ↓                                            │      │
│  6. IMPLEMENT YOUR RESPONSIBILITIES ONLY             │      │
│     - Follow existing patterns found                 │      │
│     - Use suggestedImports from orchestrator         │      │
│         ↓                                            │      │
│  7. REINDEX IMMEDIATELY ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘      │
│     - memorybank_index_code (MANDATORY)                     │
│         ↓                                                   │
│  8. CONFIRM TO USER                                         │
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

**STOP. Did you route the task first?**

```json
// 🚨 MANDATORY: Route the task BEFORE any code
{
  "projectId": "{{PROJECT_ID}}",
  "taskDescription": "Full description of what you're about to implement"
}
```

The orchestrator will tell you:
- What YOU should implement (myResponsibilities)
- What to DELEGATE to other projects (delegations)
- What to IMPORT after delegations (suggestedImports)

**Then search for your responsibilities:**

```json
// Search for patterns related to YOUR responsibilities only
{
  "projectId": "{{PROJECT_ID}}",
  "query": "existing implementation of [your responsibility]"
}
```

**Checklist before coding:**
- ✅ Called `memorybank_route_task`?
- ✅ Delegated tasks if orchestrator said so?
- ✅ Searched for similar existing code?
- ✅ Searched for related patterns?
- ✅ Understand how it fits in the existing codebase?

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

### Task Management

Tasks are **project-centric** - they belong to a project, not to a specific agent. The active agent for a project handles its pending tasks.

#### Task Sources

| Prefix | Source | Description |
|--------|--------|-------------|
| `TASK-XXXXXX` | Internal | Created via `track_progress` when adding to `inProgress` |
| `EXT-XXXXXX` | External | Delegated from other projects via `delegate_task` |

#### Checking Pending Tasks

At session start (and periodically), check for pending tasks:
```json
{
  "projectId": "{{PROJECT_ID}}",
  "action": "get_board"
}
```

The response includes a **Pending Tasks** table with all tasks assigned to your project.

#### Claiming a Task

Before working on a task, **claim it** to signal you're handling it:
```json
{
  "projectId": "{{PROJECT_ID}}",
  "action": "claim_task",
  "taskId": "EXT-123456"
}
```

This changes the task status from `PENDING` → `IN_PROGRESS` and records who claimed it.

#### Completing a Task

After finishing a task, **mark it as completed**:
```json
{
  "projectId": "{{PROJECT_ID}}",
  "action": "complete_task",
  "taskId": "EXT-123456"
}
```

This changes the task status to `COMPLETED` and logs the completion with timestamp.

#### Task State Machine

```
┌──────────┐   claim_task   ┌─────────────┐   complete_task   ┌───────────┐
│ PENDING  │ ─────────────► │ IN_PROGRESS │ ────────────────► │ COMPLETED │
└──────────┘                └─────────────┘                   └───────────┘
```

#### Best Practices

1. **Always check for pending tasks** at session start
2. **Claim tasks before starting** to prevent duplicate work
3. **Complete tasks when done** - don't leave them hanging
4. **External tasks (`EXT-*`)** were delegated by other projects:
   - They expect you to handle them
   - Completing them signals the work is done
   - Check the task description for context from the requester

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

### The Critical Rules

| Rule | What | Tool | Mandatory |
|------|------|------|----------|
| 0 | Coordinate with agents | `memorybank_manage_agents` | ✅ Session start |
| **0.5** | **🚨 Route task before coding** | **`memorybank_route_task`** | **✅ ALWAYS** |
| 1 | Search before implementing | `memorybank_search` | ✅ ALWAYS |
| 2 | Reindex after modifying | `memorybank_index_code` | ✅ ALWAYS |
| 3 | Respect project boundaries | `memorybank_delegate_task` | When orchestrator says |
| 4 | Document everything | `memorybank_track_progress` | ✅ ALWAYS |

### Session Start Checklist

1. [ ] Register: `action: "register"` → get agentId with hash
2. [ ] Check tasks: `action: "get_board"` → look for PENDING tasks
3. [ ] Claim tasks: `action: "claim_task"` → claim any PENDING tasks you'll work on
4. [ ] Get context: `memorybank_get_project_docs` → load activeContext
5. [ ] Update session: `memorybank_update_context` → mark session active
6. [ ] Handle pending tasks FIRST before new work

### Before Every Implementation Checklist

- [ ] 🚨 Called `memorybank_route_task`? (MANDATORY)
- [ ] Delegated tasks to other projects if needed?
- [ ] Searched for existing patterns?
- [ ] Understand what is YOUR responsibility?

### After Every Action Checklist

- [ ] Modified file? → `memorybank_index_code`
- [ ] Completed task? → `action: "complete_task"` + `memorybank_track_progress`
- [ ] Made decision? → `memorybank_record_decision`
- [ ] Ending session? → `memorybank_update_context` with nextSteps

**Remember: The Memory Bank is your source of truth. The Orchestrator decides WHO does WHAT. Consult both constantly.**
