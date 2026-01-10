---
description: Memory Bank MCP integration instructions for semantic code understanding
name: Memory Bank Integration
applyTo: "**/*"
---

# Memory Bank MCP Integration

This workspace uses [Memory Bank MCP](https://github.com/gcorroto/memory-bank-mcp) for semantic code indexing and retrieval.

## Project Configuration

- **Project ID**: `{{PROJECT_ID}}`

## Available Tools

### Core Memory Bank (Semantic Search)

| Tool | Description |
|------|-------------|
| `memorybank_search` | Semantic search for code - use BEFORE any action |
| `memorybank_index_code` | Index files for semantic search |
| `memorybank_read_file` | Read file contents |
| `memorybank_write_file` | Write files with auto-reindexing |
| `memorybank_get_stats` | Get Memory Bank statistics |
| `memorybank_analyze_coverage` | Analyze indexing coverage |

### Project Knowledge Layer (AI Documentation)

| Tool | Description |
|------|-------------|
| `memorybank_generate_project_docs` | Generate AI documentation |
| `memorybank_get_project_docs` | Read project documentation |

### Context Management (Session Tracking)

| Tool | Description |
|------|-------------|
| `memorybank_initialize` | Initialize Memory Bank for a new project |
| `memorybank_update_context` | Update active context with session info |
| `memorybank_record_decision` | Record technical decisions |
| `memorybank_track_progress` | Update progress tracking |

### MCP Resources (Direct Access)

| Resource URI | Content |
|--------------|---------|
| `memory://{{PROJECT_ID}}/active` | Current session context |
| `memory://{{PROJECT_ID}}/progress` | Progress tracking |
| `memory://{{PROJECT_ID}}/decisions` | Decision log |
| `memory://{{PROJECT_ID}}/context` | Project context |
| `memory://{{PROJECT_ID}}/patterns` | System patterns |
| `memory://{{PROJECT_ID}}/brief` | Project brief |

## Critical Rule

**ALWAYS include `projectId: "{{PROJECT_ID}}"` in every Memory Bank tool call.**

## Quick Reference

### Search Code
```json
{ "projectId": "{{PROJECT_ID}}", "query": "your search" }
```

### Index File
```json
{ "projectId": "{{PROJECT_ID}}", "path": "path/to/file" }
```

### Write File
```json
{ "projectId": "{{PROJECT_ID}}", "path": "file.ts", "content": "..." }
```

### Get Docs
```json
{ "projectId": "{{PROJECT_ID}}", "document": "summary" }
```

### Update Context
```json
{ "projectId": "{{PROJECT_ID}}", "currentSession": { "mode": "development", "task": "..." } }
```

### Record Decision
```json
{ "projectId": "{{PROJECT_ID}}", "decision": { "title": "...", "description": "...", "rationale": "..." } }
```

### Track Progress
```json
{ "projectId": "{{PROJECT_ID}}", "progress": { "completed": ["..."], "inProgress": ["..."] } }
```
