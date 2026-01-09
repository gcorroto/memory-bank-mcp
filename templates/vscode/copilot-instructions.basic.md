# Memory Bank MCP - Basic Mode

## Project Configuration

- **Project ID**: `{{PROJECT_ID}}`
- **Mode**: Basic (manual indexing, consultation-first)

---

## Memory Bank Instructions

This project uses [Memory Bank MCP](https://github.com/grec0/memory-bank-mcp) for semantic code understanding.

### CRITICAL: Always Consult Before Acting

Before answering ANY question or making ANY code change, you MUST:

1. **Search first**: Call `memorybank_search` with your question
```json
{
  "projectId": "{{PROJECT_ID}}",
  "query": "your question in natural language"
}
```

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

### Workflow Summary

```
User Question → memorybank_search → Understand → Answer
User Request  → memorybank_search → Ask Permission → Modify → Suggest Reindex
```

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

- This is **Basic Mode**: manual indexing, permission-based modifications
- The agent will always search Memory Bank before acting
- Indexing only happens when explicitly requested
- All Memory Bank operations use `projectId: "{{PROJECT_ID}}"`
