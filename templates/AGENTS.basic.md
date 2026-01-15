# AGENTS.md - Memory Bank Basic Mode

## Project Configuration

- **Project ID**: `{{PROJECT_ID}}`
- **Workspace**: `{{WORKSPACE_PATH}}`

---

## Memory Bank MCP Instructions

This project uses Memory Bank MCP for semantic code understanding. You MUST follow these rules.

### Available Tools

#### Connectivity (Multi-Project)
| Tool | Description |
|------|-------------|
| `memorybank_discover_projects` | Find other projects |
| `memorybank_delegate_task` | Handoff work |

#### Core Memory Bank (Semantic Search)
| Tool | Description |
|------|-------------|
| `memorybank_index_code` | Index code semantically for search |
| `memorybank_search` | Semantic search in indexed code |
| `memorybank_read_file` | Read file contents |
| `memorybank_write_file` | Write files with auto-reindexing |
| `memorybank_get_stats` | Get Memory Bank statistics |
| `memorybank_analyze_coverage` | Analyze indexing coverage |

#### Project Knowledge Layer (AI Documentation)
| Tool | Description |
|------|-------------|
| `memorybank_generate_project_docs` | Generate AI docs (replaces basic templates with rich content) |
| `memorybank_get_project_docs` | Read project documentation |

#### Context Management (Session Tracking)
| Tool | Description |
|------|-------------|
| `memorybank_initialize` | Create basic templates for new project (no AI, instant) |
| `memorybank_update_context` | Update active context with session info |
| `memorybank_record_decision` | Record technical decisions |
| `memorybank_track_progress` | Update progress tracking |

#### MCP Resources (Direct Access)
| Resource URI | Content |
|--------------|---------|
| `memory://{{PROJECT_ID}}/active` | Current session context |
| `memory://{{PROJECT_ID}}/progress` | Progress tracking |
| `memory://{{PROJECT_ID}}/decisions` | Decision log |
| `memory://{{PROJECT_ID}}/context` | Project context |
| `memory://{{PROJECT_ID}}/patterns` | System patterns |
| `memory://{{PROJECT_ID}}/brief` | Project brief |

### ⚠️ CRITICAL: Always Search Before Acting (RAG)

The Memory Bank is a **RAG system** that keeps your knowledge accurate and **prevents hallucinations**.

**NEVER implement anything without first consulting the Memory Bank.**

### Rule 3: RESPECT PROJECT BOUNDARIES

**You own `{{PROJECT_ID}}`. Do NOT modify other projects.**
- **Discover**: `memorybank_discover_projects` to find other agents.
- **Delegate**: `memorybank_delegate_task` to hand off work.

Before answering ANY question or making ANY code change, you MUST:

1. **SEARCH FIRST** (MANDATORY): Call `memorybank_search` with your question
   ```json
   {
     "projectId": "{{PROJECT_ID}}",
     "query": "your question in natural language"
   }
   ```

   Ask yourself:
   - ✅ Did I search for similar existing code?
   - ✅ Did I search for related patterns?
   - ✅ Did I search for potential dependencies?

2. **Get project context** (for architecture/overview questions):
   ```json
   {
     "projectId": "{{PROJECT_ID}}",
     "document": "summary"
   }
   ```

3. **Read full files** when search results need more context:
   ```json
   {
     "path": "path/to/file.ts"
   }
   ```

### First Time Setup

If this is the first time working with this project, initialize the Memory Bank:
```json
// memorybank_initialize - Creates basic templates (no AI, instant)
{
  "projectId": "{{PROJECT_ID}}",
  "projectPath": "{{WORKSPACE_PATH}}",
  "projectName": "Project Name"
}
```

This creates basic template documents. Skip if already initialized.

> **Tip**: After indexing code, run `memorybank_generate_project_docs` to replace templates with AI-generated documentation.

### Indexing Policy

**DO NOT index automatically.** Only index when the user explicitly requests it.

When the user asks to index:
```json
{
  "projectId": "{{PROJECT_ID}}",
  "path": "optional/specific/path",
  "recursive": true
}
```

### Code Modifications Policy

1. **Ask permission** before modifying any file
2. **After making changes**, suggest to the user:
   > "I've modified `file.ts`. Would you like me to reindex it to update the Memory Bank?"
3. If user agrees, index the specific file:
   ```json
   {
     "projectId": "{{PROJECT_ID}}",
     "path": "modified/file.ts"
   }
   ```

### Recording Decisions

When making significant technical decisions, record them:
```json
{
  "projectId": "{{PROJECT_ID}}",
  "decision": {
    "title": "Decision title",
    "description": "What was decided",
    "rationale": "Why this decision was made",
    "alternatives": ["Alternative 1", "Alternative 2"]
  }
}
```

### Workflow Summary

```
User Question → memorybank_search → Understand → Answer
User Request → memorybank_search → Ask Permission → Modify → Suggest Reindex
Technical Decision → memorybank_record_decision
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

## Notes

- This is the **Basic Mode**: manual indexing, permission-based modifications
- The agent will always search before acting
- Indexing only happens when explicitly requested
- All operations use `projectId: "{{PROJECT_ID}}"`
