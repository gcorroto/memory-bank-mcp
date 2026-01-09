---
description: Memory Bank MCP integration instructions for semantic code understanding
name: Memory Bank Integration
applyTo: "**/*"
---

# Memory Bank MCP Integration

This workspace uses [Memory Bank MCP](https://github.com/grec0/memory-bank-mcp) for semantic code indexing and retrieval.

## Project Configuration

- **Project ID**: `{{PROJECT_ID}}`

## Available Tools

### Core Memory Bank Tools

| Tool | Description |
|------|-------------|
| `memorybank_search` | Semantic search for code - use BEFORE any action |
| `memorybank_index_code` | Index files for semantic search |
| `memorybank_read_file` | Read file contents |
| `memorybank_write_file` | Write files with auto-reindexing |
| `memorybank_get_stats` | Get Memory Bank statistics |
| `memorybank_analyze_coverage` | Analyze indexing coverage |

### Project Knowledge Tools

| Tool | Description |
|------|-------------|
| `memorybank_generate_project_docs` | Generate AI documentation |
| `memorybank_get_project_docs` | Read project documentation |

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
