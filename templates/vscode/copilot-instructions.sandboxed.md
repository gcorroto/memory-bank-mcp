# Memory Bank MCP - Sandboxed Mode

## Project Configuration

- **Project ID**: `{{PROJECT_ID}}`
- **Mode**: Sandboxed (no direct file access)

---

## Memory Bank Instructions - SANDBOXED MODE

⚠️ **IMPORTANT**: In this mode, you do NOT have direct access to the file system.

The Memory Bank is your **RAG system** - it keeps your knowledge accurate and **prevents hallucinations**.

### ⚠️ CRITICAL RULE: ALWAYS SEARCH BEFORE IMPLEMENTING

#### Rule 3: RESPECT PROJECT BOUNDARIES

**You own `{{PROJECT_ID}}`. Do NOT modify other projects.**
- **Discover**: `memorybank_discover_projects` to find other agents.
- **Delegate**: `memorybank_delegate_task` to hand off work.

**NEVER write code without first consulting the Memory Bank.**

```json
// memorybank_search - MANDATORY before ANY implementation
{
  "projectId": "{{PROJECT_ID}}",
  "query": "how does [feature/component] work"
}
```

You MUST use Memory Bank tools for ALL operations:
- **Searching code**: `memorybank_search` ← **DO THIS FIRST, ALWAYS**
- **Reading files**: `memorybank_read_file`
- **Writing files**: `memorybank_write_file` (auto-reindexes)

### Available Tools

#### Connectivity (Multi-Project)
| Tool | Description |
|------|-------------|
| `memorybank_discover_projects` | Find other projects |
| `memorybank_delegate_task` | Handoff work |

#### Core Memory Bank (Semantic Search)
| Tool | Description |
|------|-------------|
| `memorybank_search` | Semantic search - use BEFORE any action |
| `memorybank_index_code` | Index files for semantic search |
| `memorybank_read_file` | Read file contents |
| `memorybank_write_file` | Write files with auto-reindexing |

#### Project Knowledge Layer (AI Documentation)
| Tool | Description |
|------|-------------|
| `memorybank_generate_project_docs` | Generate AI docs (replaces templates) |
| `memorybank_get_project_docs` | Read project documentation |

#### Context Management (Session Tracking)
| Tool | Description |
|------|-------------|
| `memorybank_initialize` | Create basic templates (no AI, instant) |
| `memorybank_update_context` | Update active context with session info |
| `memorybank_record_decision` | Record technical decisions |
| `memorybank_track_progress` | Update progress tracking |
| `memorybank_manage_agents` | Agent registration and coordination |

#### MCP Resources (Direct Access)
| Resource URI | Content |
|--------------|---------|
| `memory://{{PROJECT_ID}}/active` | Current session context |
| `memory://{{PROJECT_ID}}/progress` | Progress tracking |
| `memory://{{PROJECT_ID}}/decisions` | Decision log |
| `memory://{{PROJECT_ID}}/context` | Project context |

### File Operations

#### Reading Files

You CANNOT read files directly. Always use:

```json
{
  "path": "path/to/file.ts",
  "startLine": 1,
  "endLine": 100
}
```

#### Writing Files

You CANNOT write files directly. Always use:

```json
{
  "projectId": "{{PROJECT_ID}}",
  "path": "path/to/file.ts",
  "content": "complete file content here",
  "autoReindex": true
}
```

Note: `memorybank_write_file` automatically reindexes the file when `autoReindex: true`.

#### Searching Code

```json
{
  "projectId": "{{PROJECT_ID}}",
  "query": "describe what you're looking for",
  "topK": 10,
  "minScore": 0.4
}
```

### Session Start

At the beginning of each session:

1. **Register** (CRITICAL for tracking):
```json
{
  "projectId": "{{PROJECT_ID}}",
  "action": "register",
  "agentId": "Dev-VSCode-GPT4",
  "workspacePath": "{{WORKSPACE_PATH}}"
}
```
   - The system returns your full agentId with hash suffix

2. **Check Pending Tasks**:
```json
{ "projectId": "{{PROJECT_ID}}", "action": "get_board" }
```
   - If tasks with `status: "PENDING"` exist, prioritize them

3. **Initialize if first time** (only once per project):
```json
// memorybank_initialize - Creates basic templates (no AI, instant)
{
  "projectId": "{{PROJECT_ID}}",
  "projectPath": "{{WORKSPACE_PATH}}",
  "projectName": "Project Name"
}
```
> After indexing, run `memorybank_generate_project_docs` to replace with AI docs.

4. **Get current project status**:
```json
// memorybank_get_project_docs
{
  "projectId": "{{PROJECT_ID}}",
  "document": "activeContext"
}
```

5. **Update session context**:
```json
// memorybank_update_context
{
  "projectId": "{{PROJECT_ID}}",
  "currentSession": {
    "mode": "development",
    "task": "Session start"
  }
}
```

6. **Get project documentation** (for context):
```json
// memorybank_get_project_docs
{
  "projectId": "{{PROJECT_ID}}",
  "document": "summary"
}
```

### Standard Workflow

### Before ANY Implementation

**STOP. Did you search first?**

Checklist:
- ✅ Searched for similar existing code?
- ✅ Searched for related patterns?
- ✅ Understand how it fits in codebase?

1. **SEARCH FIRST** (MANDATORY): `memorybank_search({ projectId: "{{PROJECT_ID}}", query: "..." })`
   - Understand what exists
   - Find relevant code
   - **Prevents hallucinations**

2. **Context** (if needed): `memorybank_get_project_docs({ projectId: "{{PROJECT_ID}}" })`
   - Get architecture overview
   - Understand patterns

3. **Read** (if needed): `memorybank_read_file({ path: "..." })`
   - Get complete file content
   - See full context

4. **Write** (if modifying): `memorybank_write_file({ projectId: "{{PROJECT_ID}}", path: "...", content: "..." })`
   - Provide complete file content
   - **Auto-reindexes** to keep RAG updated

5. **Track**: `memorybank_track_progress({ projectId: "{{PROJECT_ID}}", progress: {...} })`
   - Update completed tasks

### Recording Decisions

When making significant technical decisions:
```json
{
  "projectId": "{{PROJECT_ID}}",
  "decision": {
    "title": "Decision title",
    "description": "What was decided",
    "rationale": "Why this decision was made"
  }
}
```

### Important Rules

1. **Never assume file contents** - always read first
2. **Always provide complete file content** when writing
3. **Use the projectId** "{{PROJECT_ID}}" for all operations
4. **Search before reading** - the search may have all info you need
5. **Let autoReindex handle indexing** - no manual index calls needed after writes

### Error Handling

If a tool returns an error:
1. Check the path is correct
2. Verify the projectId matches
3. For writes, ensure content is complete
4. Report the error to the user

---

## Project-Specific Instructions

<!-- Add your project-specific instructions below -->

### Build Commands

- Install: `npm install`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`

### Code Style

- Follow existing patterns in the codebase
- Use TypeScript strict mode
- Prefer functional patterns
- Use meaningful variable and function names

### Important Directories

- `src/` - Source code
- `tests/` - Test files
- `docs/` - Documentation

---

## Notes

- This is **Sandboxed Mode**: no direct file system access
- ALL file operations go through Memory Bank tools
- `memorybank_write_file` auto-reindexes changes
- Progress and decisions are tracked
- All Memory Bank operations use `projectId: "{{PROJECT_ID}}"`
- This mode is ideal for restricted environments or remote development
