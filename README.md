# Memory Bank MCP - Semantic Code Indexing

MCP (Model Context Protocol) server for semantic code indexing. Enables AI agents like Claude, Copilot, Cursor, and others to maintain a "persistent memory" of entire codebases through vector embeddings and semantic search.

## 🧠 What is Memory Bank?

**Memory Bank** is an external memory system for code agents that solves the fundamental problem of context loss in AIs. It works as the project's "external brain":

- **Indexes** all your code using OpenAI embeddings
- **Chunks** intelligently using AST parsing (functions, classes, methods)
- **Stores** vectors in LanceDB for ultra-fast searches
- **Searches** semantically: ask in natural language, get relevant code
- **Updates** incrementally: only reindexes modified files
- **Multi-project**: query code from any indexed project from any workspace

### Why do you need it?

Without Memory Bank, AIs:
- ❌ Forget everything between sessions
- ❌ Only see small code snippets
- ❌ Hallucinate non-existent implementations
- ❌ Give generic answers without context

With Memory Bank, AIs:
- ✅ Remember the entire codebase
- ✅ Understand architecture and patterns
- ✅ Respond with real project code
- ✅ Generate code consistent with your style
- ✅ **Query multiple indexed projects** simultaneously

## 🚀 Features

### Core Memory Bank (Precise Search)
- **🔍 Semantic Search**: Ask "how does authentication work?" and get relevant code
- **🧩 Intelligent Chunking**: AST parsing for TS/JS/Python with token limits (8192 max)
- **⚡ Incremental Updates**: Only reindexes modified files (hash-based detection)
- **💾 Embedding Cache**: Avoids regenerating embeddings unnecessarily
- **🎯 Advanced Filters**: By file, language, chunk type
- **📊 Detailed Statistics**: Know the state of your index at all times
- **🔒 Privacy**: Local vector store, respects .gitignore and .memoryignore
- **🔀 Multi-Project**: Query any indexed project using its `projectId`

### Project Knowledge Layer (Global Knowledge)
- **📄 Automatic Documentation**: Generates 6 structured markdown documents about the project
- **🧠 AI with Reasoning**: Uses OpenAI Responses API with reasoning models (gpt-5-mini)
- **🔄 Smart Updates**: Only regenerates documents affected by changes
- **📚 Global Context**: Complements precise search with high-level vision

### Context Management (Session Management) 🆕
- **🚀 Quick Initialization**: Creates Memory Bank structure with initial templates (no AI)
- **📝 Session Tracking**: Records active context, recent changes, and next steps
- **📋 Decision Log**: Documents technical decisions with rationale and alternatives
- **📊 Progress Tracking**: Manages tasks, milestones, and blockers
- **📡 MCP Resources**: Direct read-only access to documents via URIs

### Multi-Agent Coordination (Team Sync) 🤖
- **🚦 Traffic Control**: Prevents multiple agents from modifying the same files simultaneously
- **📌 Agent Board**: Centralized view of active agents, claimed tasks, and locked files
- **🆔 Identity Management**: Tracks who is doing what (GitHub Copilot, Cursor, etc.)
- **🔒 Atomic Locks**: File-system based locking safe across different processes/IDEs

## 📋 Requirements

- **Node.js** >= 18.0.0
- **OpenAI API Key**: [Get one here](https://platform.openai.com/api-keys)
- **Disk space**: ~10MB per 10,000 files (embeddings + metadata)

## 🛠️ Installation

### Option 1: NPX (Recommended)

The easiest way to use Memory Bank MCP without local installation:

```bash
npx @grec0/memory-bank-mcp@latest
```

### Option 2: Local Installation

For development or contribution:

```bash
# Clone repository
git clone https://github.com/gcorroto/memory-bank-mcp.git
cd memory-bank-mcp

# Install dependencies
npm install

# Build
npm run build

# Run
npm run start
```

## ⚙️ Complete Configuration

### Environment Variables

Memory Bank is configured through environment variables. You can set them in your MCP client or in a `.env` file:

#### Required Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | **REQUIRED**. Your OpenAI API key |

#### Indexing Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORYBANK_STORAGE_PATH` | `.memorybank` | Directory where the vector index is stored |
| `MEMORYBANK_WORKSPACE_ROOT` | `process.cwd()` | Workspace root (usually auto-detected) |
| `MEMORYBANK_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `MEMORYBANK_EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions (1536 or 512) |
| `MEMORYBANK_MAX_TOKENS` | `7500` | Maximum tokens per chunk (limit: 8192) |
| `MEMORYBANK_CHUNK_OVERLAP_TOKENS` | `200` | Overlap between chunks to maintain context |

#### Project Knowledge Layer Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORYBANK_REASONING_MODEL` | `gpt-5-mini` | Model for generating documentation (supports reasoning) |
| `MEMORYBANK_REASONING_EFFORT` | `medium` | Reasoning level: `low`, `medium`, `high` |
| `MEMORYBANK_AUTO_UPDATE_DOCS` | `false` | Auto-regenerate docs when indexing code |

#### Map-Reduce Auto-Summarization (v0.2.0+)

For large projects that exceed the LLM context window, Memory Bank automatically uses **Map-Reduce summarization**:

1. **Map Phase**: Splits chunks into batches (~100K chars each), summarizes each batch
2. **Reduce Phase**: Combines batch summaries into a coherent final summary
3. **Recursive**: If combined summaries still exceed threshold, recurses up to 3 levels

This happens automatically when content exceeds 400K characters. No configuration needed.

### Configuration in Cursor IDE

Edit your MCP configuration file:

**Windows**: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`

#### Minimal Configuration

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["@grec0/memory-bank-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

#### Complete Configuration (Recommended)

```json
{
  "mcpServers": {
    "memory-bank-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["@grec0/memory-bank-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here",
        "MEMORYBANK_REASONING_MODEL": "gpt-5-mini",
        "MEMORYBANK_REASONING_EFFORT": "medium",
        "MEMORYBANK_AUTO_UPDATE_DOCS": "false",
        "MEMORYBANK_MAX_TOKENS": "7500",
        "MEMORYBANK_CHUNK_OVERLAP_TOKENS": "200",
        "MEMORYBANK_EMBEDDING_MODEL": "text-embedding-3-small",
        "MEMORYBANK_EMBEDDING_DIMENSIONS": "1536"
      }
    }
  }
}
```

### Configuration in Claude Desktop

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Linux**: `~/.config/claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory-bank": {
      "command": "npx",
      "args": ["@grec0/memory-bank-mcp@latest"],
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here",
        "MEMORYBANK_REASONING_MODEL": "gpt-5-mini",
        "MEMORYBANK_REASONING_EFFORT": "medium"
      }
    }
  }
}
```

### Configuration with Local Installation

```json
{
  "mcpServers": {
    "memory-bank": {
      "command": "node",
      "args": ["/absolute/path/memory-bank-mcp/dist/index.js"],
      "cwd": "/absolute/path/memory-bank-mcp",
      "env": {
        "OPENAI_API_KEY": "sk-your-api-key-here"
      }
    }
  }
}
```

---

## 📄 Project Documentation System (Project Knowledge Layer)

Memory Bank includes an intelligent documentation system that generates and maintains structured knowledge about your project using AI with reasoning capabilities.

### How Does It Work?

1. **Code Analysis**: The system analyzes indexed code using semantic search
2. **AI Generation**: Uses reasoning models (gpt-5-mini) to generate structured documentation
3. **Incremental Updates**: Only regenerates documents affected by significant changes
4. **Persistent Storage**: Documents are saved in `.memorybank/projects/{projectId}/docs/`

### Generated Documents

The system generates **6 markdown documents** that provide different perspectives of the project:

| Document | Purpose | Content |
|----------|---------|---------|
| `projectBrief.md` | **General Description** | What the project is, its main purpose, key features |
| `productContext.md` | **Business Perspective** | Why it exists, problems it solves, target users, UX |
| `systemPatterns.md` | **Architecture and Patterns** | Code structure, design patterns, technical decisions |
| `techContext.md` | **Tech Stack** | Technologies, dependencies, configurations, integrations |
| `activeContext.md` | **Current State** | What's being worked on, recent changes, next steps |
| `progress.md` | **Tracking** | Change history, what works, what's missing, known issues |

### Documentation Tools

#### `memorybank_generate_project_docs`

Generates or regenerates project documentation.

```json
{
  "projectId": "my-project",
  "force": false
}
```

- `projectId` **(REQUIRED)**: Project ID
- `force` (optional): `true` to regenerate everything, `false` for incremental updates

#### `memorybank_get_project_docs`

Reads generated documentation.

```json
// Get summary of all documents
{
  "projectId": "my-project",
  "document": "summary"
}

// Get specific document
{
  "projectId": "my-project",
  "document": "systemPatterns"
}

// Get all complete documents
{
  "projectId": "my-project",
  "document": "all",
  "format": "full"
}
```

### Documentation Workflow

```
1. Index code
   memorybank_index_code({ projectId: "my-project" })

2. Generate documentation
   memorybank_generate_project_docs({ projectId: "my-project" })

3. Query documentation at the start of each session
   memorybank_get_project_docs({ projectId: "my-project", document: "activeContext" })

4. Search specific code
   memorybank_search({ projectId: "my-project", query: "..." })
```

### Auto-Update Documentation

If you configure `MEMORYBANK_AUTO_UPDATE_DOCS=true`, documents will be automatically regenerated after each indexing. This is useful for keeping documentation always up to date but consumes more API tokens.

---

## 🤖 Multi-Agent Coordination

Memory Bank includes a **Coordination Layer** to support multiple agents (e.g., in different IDEs, parallel sessions, or team members) working on the same project without conflicts.

### Why is this needed?
When you have multiple AI agents (e.g., one in VS Code, one in Cursor, one in Windsurf) or multiple developers working on the same codebase, they often collide:
- Modifying the same file simultaneously
- Duplicating work
- Halucinating that a task is "todo" when someone else is already doing it

### How It Works

1.  **Agent Board (`agentBoard.md`)**: A central "whiteboard" in the `.memorybank/` folder that tracks active agents and locks.
2.  **Protocol**: Agents follow a strict "Check -> Claim -> Work -> Release" protocol.
3.  **Atomic Locks**: Uses file-system based locking (`.lock` directories) to ensure safety even across different processes and machines accessing the same filesystem.

### Workflow

1.  **Check Board**: Agents consult the `Agent Board` before starting work.
2.  **Register Identity**: Agents identify themselves (e.g., `Dev-VSCode-GPT4-8A2F`).
3.  **Claim Resource**: Agents "lock" files or tasks they are working on.
4.  **Work & Release**: Agents work on the task and release the lock when finished (or when the lock expires/stales).

### New Tool: `memorybank_manage_agents`

This tool allows agents to interact with the board:

```json
// Register on the board
{
  "projectId": "my-project",
  "action": "register",
  "agentId": "Dev-VSCode-GPT4-8A2F"
}

// See what others are doing
{
  "projectId": "my-project",
  "action": "get_board"
}

// Claim a task/file
{
  "projectId": "my-project",
  "action": "claim_resource",
  "agentId": "Dev-VSCode-GPT4-8A2F",
  "resource": "src/auth/login.ts"
}
```

### Protocol for Cross-Project Delegation (Handoff) 🆕

Agents can also discover and delegate tasks to other projects in the ecosystem.

**1. Discovery**: Find other agents/projects.
```json
// Find backend projects
memorybank_discover_projects({ "query": "backend" })
// Returns: [{ projectId: "memory_bank_mcp", description: "Backend MCP Server..." }]
```

**2. Delegation**: Create a task in another project's board.
```json
memorybank_delegate_task({
  "projectId": "frontend-app",
  "targetProjectId": "memory_bank_mcp",
  "title": "Add API endpoint",
  "description": "Please add a new endpoint...",
  "context": "Frontend needs this for feature X"
})
```

---

## 🔀 Multi-Project: Cross-Project Queries

A powerful feature of Memory Bank is the ability to **query any indexed project from any workspace**.

### How Does It Work?

All indexed projects are stored in a shared vector store, identified by their `projectId`. This means:

1. **You can work on Project A** and query code from Project B
2. **Agents can learn** from similar already-indexed projects
3. **Reuse patterns** from other projects in your organization

### Usage Example

```
# You're working on "frontend-app" but need to see how something was done in "backend-api"

User: How was authentication implemented in the backend-api project?

Agent: [executes memorybank_search({ 
  projectId: "backend-api",  // Another project
  query: "JWT middleware authentication"
})]

Found the implementation in backend-api:
- The auth middleware is in src/middleware/auth.ts
- Uses JWT with refresh tokens
- Validation is done with jsonwebtoken...
```

### Requirements for Multi-Project

1. **The project must be previously indexed** with its `projectId`
2. **Use the correct projectId** when making queries
3. **Documentation is independent** per project

### Real Example: Two Related Projects

```json
// Project 1: a2a_gateway (already indexed)
memorybank_search({
  "projectId": "a2a_gateway",
  "query": "how agents are registered"
})

// Project 2: GREC0AI (current workspace)
memorybank_search({
  "projectId": "GREC0AI", 
  "query": "AgentEntity implementation"
})

// You can query both in the same session!
```

---

## 📚 Available Tools

> **⚠️ IMPORTANT**: All tools require mandatory `projectId`. This ID must match the one defined in your `AGENTS.md` file.

### `memorybank_index_code`

Indexes code semantically to enable searches.

**Parameters:**
- `projectId` **(REQUIRED)**: Unique project identifier
- `path` (optional): Relative or absolute path (default: workspace root)
- `recursive` (optional): Index subdirectories (default: true)
- `forceReindex` (optional): Force complete reindexing (default: false)

**Example:**
```json
{
  "projectId": "my-project",
  "path": "src/auth",
  "recursive": true
}
```

### `memorybank_search`

Searches code by semantic similarity.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier to search in
- `query` (required): Natural language query
- `topK` (optional): Number of results (default: 10)
- `minScore` (optional): Minimum score 0-1 (default: 0.4)
- `filterByFile` (optional): Filter by file pattern
- `filterByLanguage` (optional): Filter by language

**Example:**
```json
{
  "projectId": "my-project",
  "query": "function that authenticates users with JWT",
  "topK": 5,
  "minScore": 0.8
}
```

### `memorybank_read_file`

Reads file contents.

**Parameters:**
- `path` (required): File path
- `startLine` (optional): Start line
- `endLine` (optional): End line

### `memorybank_write_file`

Writes a file and automatically reindexes it.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier for reindexing
- `path` (required): File path
- `content` (required): File content
- `autoReindex` (optional): Auto-reindex (default: true)

### `memorybank_get_stats`

Gets Memory Bank statistics.

### `memorybank_analyze_coverage`

Analyzes project indexing coverage.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier to analyze
- `path` **(REQUIRED)**: Absolute workspace path to analyze

**Example:**
```json
{
  "projectId": "my-project",
  "path": "C:/workspaces/my-project"
}
```

### `memorybank_generate_project_docs`

Generates structured project documentation using AI with reasoning.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier
- `force` (optional): Force regeneration (default: false)

### `memorybank_get_project_docs`

Reads AI-generated project documentation.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier
- `document` (optional): `"summary"`, `"all"`, or specific name (`projectBrief`, `systemPatterns`, etc.)
- `format` (optional): `"full"` or `"summary"` (default: "full")

---

## 🔄 Context Management Tools (Cline-style)

These tools allow managing project context manually, complementing automatic AI generation.

### `memorybank_initialize`

Initializes Memory Bank for a new project. Creates directory structure and 7 markdown documents with initial templates. **Does not use AI**.

**Parameters:**
- `projectId` **(REQUIRED)**: Unique project identifier
- `projectPath` **(REQUIRED)**: Absolute project path
- `projectName` (optional): Human-readable project name
- `description` (optional): Initial project description

**Example:**
```json
{
  "projectId": "my-project",
  "projectPath": "C:/workspaces/my-project",
  "projectName": "My Awesome Project",
  "description": "A web application for..."
}
```

**Created documents:**
- `projectBrief.md` - General description
- `productContext.md` - Product context
- `systemPatterns.md` - Architecture patterns
- `techContext.md` - Tech stack
- `activeContext.md` - Session context
- `progress.md` - Progress tracking
- `decisionLog.md` - Decision log

### `memorybank_update_context`

Updates active context with current session information. Maintains history of the last 10 sessions. **Does not use AI**.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier
- `currentSession` (optional): Session information (date, mode, task)
- `recentChanges` (optional): List of recent changes
- `openQuestions` (optional): Pending questions
- `nextSteps` (optional): Planned next steps
- `notes` (optional): Additional notes

**Example:**
```json
{
  "projectId": "my-project",
  "currentSession": {
    "mode": "development",
    "task": "Implementing authentication"
  },
  "recentChanges": ["Added JWT middleware", "Created user model"],
  "nextSteps": ["Add refresh token", "Create login endpoint"]
}
```

### `memorybank_record_decision`

Records technical decisions with rationale in the decision log. **Does not use AI**.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier
- `decision` **(REQUIRED)**: Object with decision information
  - `title` **(REQUIRED)**: Decision title
  - `description` **(REQUIRED)**: What was decided
  - `rationale` **(REQUIRED)**: Why this decision was made
  - `alternatives` (optional): Considered alternatives
  - `impact` (optional): Expected impact
  - `category` (optional): architecture, technology, dependencies, etc.

**Example:**
```json
{
  "projectId": "my-project",
  "decision": {
    "title": "JWT Authentication",
    "description": "Use JWT tokens for API authentication",
    "rationale": "Stateless, scalable, works well with microservices",
    "alternatives": ["Session-based auth", "OAuth only"],
    "category": "architecture"
  }
}
```

### `memorybank_track_progress`

Updates progress tracking with tasks, milestones, and blockers. **Does not use AI**.

**Parameters:**
- `projectId` **(REQUIRED)**: Project identifier
- `progress` (optional): Tasks to update
  - `completed`: Completed tasks
  - `inProgress`: Tasks in progress
  - `blocked`: Blocked tasks
  - `upcoming`: Upcoming tasks
- `milestone` (optional): Milestone to add/update (name, status, targetDate, notes)
- `blockers` (optional): List of blockers with severity (low/medium/high)
- `phase` (optional): Current project phase
- `phaseStatus` (optional): Phase status

**Example:**
```json
{
  "projectId": "my-project",
  "progress": {
    "completed": ["Setup project structure", "Configure ESLint"],
    "inProgress": ["Implement user authentication"],
    "upcoming": ["Add unit tests"]
  },
  "milestone": {
    "name": "MVP",
    "status": "in_progress",
    "targetDate": "2026-02-01"
  }
}
```

---

## 📡 MCP Resources (Direct Access)

Memory Bank exposes MCP resources for direct read-only access to project documents.

| Resource URI | Content |
|--------------|---------|
| `memory://{projectId}/active` | Active session context |
| `memory://{projectId}/progress` | Progress tracking |
| `memory://{projectId}/decisions` | Technical decision log |
| `memory://{projectId}/context` | Project context (brief + tech) |
| `memory://{projectId}/patterns` | System patterns |
| `memory://{projectId}/brief` | Project description |

**Usage example:**
```
// Access active context for "my-project"
memory://my-project/active

// Access decision log
memory://my-project/decisions
```

Resources are read-only. To modify documents, use the corresponding tools (`memorybank_update_context`, `memorybank_record_decision`, etc.).

---

## 📋 Agent Instruction Templates

Memory Bank includes instruction templates in two formats to configure agent behavior:

- **AGENTS.md** - Standard [agents.md](https://agents.md/) (compatible with Claude, Cursor, multiple agents)
- **VSCode/Copilot** - `.github/copilot-instructions.md` format for GitHub Copilot in VS Code

### Available Modes

| Mode | File | Ideal Use |
|------|------|-----------|
| **Basic** | `AGENTS.basic.md` | Total control, manual indexing |
| **Auto-Index** | `AGENTS.auto-index.md` | Active development, automatic sync |
| **Sandboxed** | `AGENTS.sandboxed.md` | Environments without direct file access |

### 1. Basic Mode

**For projects where you want total control.**

- ✅ Agent ALWAYS consults Memory Bank before acting
- ✅ Only indexes when user explicitly requests
- ✅ Asks permission before modifying code
- ✅ Suggests reindexing after changes

**Ideal for**: Critical projects, code review, onboarding.

### 2. Auto-Index Mode

**For active development with automatic synchronization.**

- ✅ Agent consults Memory Bank automatically
- ✅ Reindexes EVERY file after modifying it
- ✅ Keeps Memory Bank always up to date
- ✅ Can read/write files directly

**Ideal for**: Active development, rapid iteration, teams.

### 3. Sandboxed Mode

**For environments without direct file system access.**

- ✅ Does NOT have direct file access
- ✅ MUST use `memorybank_read_file` to read
- ✅ MUST use `memorybank_write_file` to write
- ✅ Auto-reindexes automatically on each write

**Ideal for**: Restricted environments, remote development, security.

### Available Templates

All templates are available in the GitHub repository:

#### AGENTS.md Format (Cursor, Claude, Multi-agent)

| Mode | URL |
|------|-----|
| **Basic** | [AGENTS.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.basic.md) |
| **Auto-Index** | [AGENTS.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.auto-index.md) |
| **Sandboxed** | [AGENTS.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.sandboxed.md) |

**Installation:**

```bash
# Download template (choose one)
curl -o AGENTS.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/AGENTS.basic.md
# Or
curl -o AGENTS.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/AGENTS.auto-index.md
# Or
curl -o AGENTS.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/AGENTS.sandboxed.md

# Edit placeholders:
# - Replace {{PROJECT_ID}} with your unique project ID
# - Replace {{WORKSPACE_PATH}} with the absolute workspace path
```

#### VS Code / GitHub Copilot Format

| Mode | URL |
|------|-----|
| **Basic** | [copilot-instructions.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.basic.md) |
| **Auto-Index** | [copilot-instructions.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.auto-index.md) |
| **Sandboxed** | [copilot-instructions.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.sandboxed.md) |
| **Instructions** | [memory-bank.instructions.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/memory-bank.instructions.md) |

**Installation:**

```bash
# Create .github folder if it doesn't exist
mkdir -p .github

# Download template (choose one)
curl -o .github/copilot-instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/copilot-instructions.basic.md
# Or
curl -o .github/copilot-instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/copilot-instructions.auto-index.md
# Or
curl -o .github/copilot-instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/copilot-instructions.sandboxed.md

# Enable in VS Code settings.json:
# "github.copilot.chat.codeGeneration.useInstructionFiles": true
```

#### Instructions with Conditional Application (VS Code)

To use the `.instructions.md` file that applies only to certain files:

```bash
# Create instructions folder
mkdir -p .github/instructions

# Download base instructions
curl -o .github/instructions/memory-bank.instructions.md https://raw.githubusercontent.com/gcorroto/memory-bank-mcp/main/templates/vscode/memory-bank.instructions.md
```

This file includes `applyTo: "**/*"` which applies to all files, but you can modify it.

### Configured AGENTS.md Example

```markdown
# AGENTS.md

## Project Configuration
- **Project ID**: `my-awesome-app`
- **Workspace**: `C:/workspaces/my-awesome-app`

## Memory Bank Instructions

### CRITICAL: Always Consult Before Acting
Before any action, call `memorybank_search` with projectId="my-awesome-app"

### Auto-Indexing Policy
AFTER every file modification:
memorybank_index_code({ projectId: "my-awesome-app", path: "<modified_file>" })

### Session Start
At the beginning of each session, get context:
memorybank_get_project_docs({ projectId: "my-awesome-app", document: "activeContext" })
```

---

## 🎯 Use Cases

### 1. First Indexing

```
User: Hi, I want you to help me with my project. The projectId is "my-app"
Claude: [executes memorybank_get_stats]
        I see there's no code indexed yet. 
        Would you like me to index the project so I can help you better?

User: Yes
Claude: [executes memorybank_index_code({ projectId: "my-app" })]
        I've indexed 145 files (1,234 chunks) in 45 seconds.
        How can I help you?
```

### 2. Code Search

```
User: How does authentication work in this project?
Claude: [executes memorybank_search({ projectId: "my-app", query: "authentication login users" })]
        
        Authentication is implemented in src/auth/authService.ts (lines 23-87):
        
        [Found code]
        
        The system uses JWT tokens with refresh token rotation. 
        Validation is done in the middleware src/middleware/auth.ts.
```

### 3. Cross-Project Query

```
User: I'm working on "frontend-v2" but I want to see how pagination was done 
      in the "admin-dashboard" project

Claude: [executes memorybank_search({ 
          projectId: "admin-dashboard", 
          query: "pagination table listing" 
        })]
        
        In admin-dashboard, pagination was implemented like this...
        [Shows code from the other project]
        
        Would you like me to implement something similar in frontend-v2?
```

### 4. Documentation Generation

```
User: Generate project documentation for new developers
Claude: [executes memorybank_generate_project_docs({ projectId: "my-app" })]
        
        I've generated 6 project knowledge documents:
        - projectBrief.md: General description
        - systemPatterns.md: Architecture and patterns
        - techContext.md: Tech stack
        ...
        
        You can query them anytime with memorybank_get_project_docs
```

---

## 🔧 Configuration Files

### `.memoryignore`

Similar to `.gitignore`, specifies patterns to exclude from indexing:

```bash
# Dependencies
node_modules/
vendor/

# Build outputs
dist/
build/
*.min.js

# Memory Bank storage
.memorybank/

# Large data files
*.csv
*.log
*.db

# Binary and media
*.exe
*.pdf
*.jpg
*.png
*.mp4
```

### Respecting `.gitignore`

Memory Bank **automatically respects** `.gitignore` patterns in your project, in addition to `.memoryignore` patterns.

---

## 💰 OpenAI Costs

Memory Bank uses `text-embedding-3-small` which is very economical:

- **Embedding price**: ~$0.00002 per 1K tokens
- **Example**: 10,000 files × 1,000 average tokens = **~$0.20**
- **Cache**: Embeddings are cached, only regenerated if code changes
- **Incremental**: Only modified files are reindexed

**Searches are extremely cheap** (only 1 embedding per query).

**AI Documentation** uses reasoning models which are more expensive but only run when explicitly requested.

---

## 🧪 Testing

```bash
# Run tests
npm test

# Tests with coverage
npm test -- --coverage
```

---

## 🔐 Security and Privacy

- ✅ **Local vector store**: LanceDB runs on your machine
- ✅ **No telemetry**: We don't send data to external servers
- ✅ **Embeddings only**: OpenAI only sees code text, not sensitive metadata
- ✅ **Respects .gitignore**: Ignored files are not indexed
- ✅ **Secure API key**: Read from environment variables, never hardcoded

### Recommendations

1. **Don't push `.memorybank/` to git** (already in .gitignore)
2. **Use `.memoryignore`** to exclude sensitive files
3. **API keys in environment variables**, never in code
4. **Verify `.env` is in .gitignore**

---

## 🐛 Troubleshooting

### Error: "OPENAI_API_KEY is required"

**Solution**: Configure your API key in the MCP environment variables.

### Error: "No files found to index"

**Possible causes**:
1. Directory is empty
2. All files are in .gitignore/.memoryignore
3. No recognized code files

### Searches return irrelevant results

**Solutions**:
1. **Increase `minScore`**: Use 0.8 or 0.9 for more precise results
2. **Use filters**: `filterByFile` or `filterByLanguage`
3. **Rephrase query**: Be more specific and descriptive
4. **Reindex**: `memorybank_index_code({ path: "..." })` (automatically detects changes by hash)

### Error: "projectId is required"

**Solution**: All tools require `projectId`. Define `projectId` in your `AGENTS.md` file so the agent uses it consistently.

### Outdated Index

```json
memorybank_get_stats({})
```

If `pendingFiles` shows pending files, reindex the directory:

```json
{
  "projectId": "my-project",
  "path": "C:/workspaces/my-project/src"
}
```

The system automatically detects changes by hash. Only use `forceReindex: true` if you need to regenerate embeddings even without changes.

---

## 📖 Additional Documentation

### Instruction Templates

**AGENTS.md Format** (multi-agent standard):
- [AGENTS.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.basic.md) - Basic mode (manual indexing)
- [AGENTS.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.auto-index.md) - Auto-index mode
- [AGENTS.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/AGENTS.sandboxed.md) - Sandboxed mode (no direct file access)

**VS Code / Copilot Format**:
- [copilot-instructions.basic.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.basic.md) - Basic mode
- [copilot-instructions.auto-index.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.auto-index.md) - Auto-index mode
- [copilot-instructions.sandboxed.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/copilot-instructions.sandboxed.md) - Sandboxed mode
- [memory-bank.instructions.md](https://github.com/gcorroto/memory-bank-mcp/blob/main/templates/vscode/memory-bank.instructions.md) - Conditional instructions

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 🎓 Inspiration

This project combines the best concepts from two complementary approaches:

### Cursor IDE - Semantic Indexing

The vector indexing and semantic search system is inspired by how Cursor IDE handles code memory:

- [Advanced Cursor: Use the Memory Bank](https://medium.com/codetodeploy/advanced-cursor-use-the-memory-bank-to-eliminate-hallucination-affd3fbeefa3) - Eliminate hallucinations with persistent memory
- [How Cursor Indexes Codebases Fast](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast) - Efficient indexing techniques

### Cline - Structured Project Documentation

The **Project Knowledge Layer** system (structured markdown documents) is inspired by the Cline Memory Bank approach:

- [Cline MCP Memory Bank](https://github.com/dazeb/cline-mcp-memory-bank) - Reference Memory Bank implementation for Cline
- [Cline Memory Bank Custom Instructions](https://gist.github.com/zoharbabin/441e8e8b719a444f26b34bd0b189b283) - Custom instructions for using Memory Bank

**Documents from the Cline approach we adopted:**
| Document | Purpose |
|----------|---------|
| `projectBrief.md` | Project requirements and scope |
| `productContext.md` | Purpose, target users, problems solved |
| `activeContext.md` | Current tasks, recent changes, next steps |
| `systemPatterns.md` | Architectural decisions, patterns, relationships |
| `techContext.md` | Tech stack, dependencies, configurations |
| `progress.md` | Milestones, overall status, known issues |

### Our Contribution

Memory Bank MCP **merges both approaches**:

1. **Semantic Search** (Cursor-style): Vector embeddings + LanceDB to find relevant code instantly
2. **Structured Documentation** (Cline-style): 6 AI-generated markdown documents providing global context
3. **Multi-Project**: Unique capability to query multiple indexed projects from any workspace

This combination allows agents to have both **precision** (semantic search) and **global understanding** (structured documentation).

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/gcorroto/memory-bank-mcp/issues)
- **Documentation**: [Project Wiki](https://github.com/gcorroto/memory-bank-mcp/wiki)
- **OpenAI API**: [Official Documentation](https://platform.openai.com/docs)
- **LanceDB**: [Documentation](https://lancedb.github.io/lancedb/)

---

⭐ If you find this project useful, consider giving it a star!

**Made with ❤️ for the AI coding assistants community**
