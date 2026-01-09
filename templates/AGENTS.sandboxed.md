# AGENTS.md - Memory Bank Sandboxed Mode

## Project Configuration

- **Project ID**: `{{PROJECT_ID}}`
- **Workspace**: `{{WORKSPACE_PATH}}`

---

## Memory Bank MCP Instructions - SANDBOXED MODE

⚠️ **IMPORTANT**: In this mode, you do NOT have direct access to the file system.

You MUST use Memory Bank tools for ALL file operations:
- **Reading files**: `memorybank_read_file`
- **Writing files**: `memorybank_write_file`
- **Searching code**: `memorybank_search`

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

### Workflow

```mermaid
flowchart TD
    A[User Request] --> B[memorybank_search]
    B --> C{Need full file?}
    C -->|Yes| D[memorybank_read_file]
    C -->|No| E[Understand from chunks]
    D --> E
    E --> F{Need to modify?}
    F -->|Yes| G[memorybank_write_file]
    F -->|No| H[Answer User]
    G --> H
```

### Standard Workflow Steps

1. **Search**: `memorybank_search({ projectId: "{{PROJECT_ID}}", query: "..." })`
   - Understand what exists
   - Find relevant code

2. **Context** (if needed): `memorybank_get_project_docs({ projectId: "{{PROJECT_ID}}" })`
   - Get architecture overview
   - Understand patterns

3. **Read** (if needed): `memorybank_read_file({ path: "..." })`
   - Get complete file content
   - See full context

4. **Write** (if modifying): `memorybank_write_file({ projectId: "{{PROJECT_ID}}", path: "...", content: "..." })`
   - Provide complete file content
   - Auto-reindexes by default

### Session Start

At the beginning of each session:

1. Get current project status:
   ```json
   {
     "projectId": "{{PROJECT_ID}}",
     "document": "activeContext"
   }
   ```

2. Get project documentation:
   ```json
   {
     "projectId": "{{PROJECT_ID}}",
     "document": "summary"
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

- This is **Sandboxed Mode**: no direct file system access
- ALL file operations go through Memory Bank tools
- `memorybank_write_file` auto-reindexes changes
- All operations use `projectId: "{{PROJECT_ID}}"`
- This mode is ideal for restricted environments or remote development
