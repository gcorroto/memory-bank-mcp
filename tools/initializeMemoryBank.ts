/**
 * @fileoverview Initialize Memory Bank tool
 * Creates the Memory Bank structure for a new project with initial templates
 */

import * as fs from "fs";
import * as path from "path";
import { RegistryManager } from "../common/registryManager.js";

export interface InitializeMemoryBankParams {
  projectId: string;
  projectPath: string;
  projectName?: string;
  description?: string;
}

export interface InitializeMemoryBankResult {
  success: boolean;
  message: string;
  projectId: string;
  docsPath: string;
  documentsCreated: string[];
  alreadyExists: boolean;
}

/**
 * Document templates for initialization
 */
const DOCUMENT_TEMPLATES = {
  agentBoard: () => `# Multi-Agent Board

## Active Agents
| Agent ID | Status | Current Focus | Session ID | Last Heartbeat |
|---|---|---|---|---|

## Pending Tasks
| ID | Title | Assigned To | From | Status | Created At |
|---|---|---|---|---|---|

## External Requests
| ID | Title | From Project | Context | Status | Received At |
|---|---|---|---|---|---|

## File Locks
| File Pattern | Claimed By | Since |
|---|---|---|

## Agent Messages
- [System]: Board initialized
`,
  projectBrief: (projectName: string, description: string, date: string) => `# Project Brief

## Project Overview
- **Project Name**: ${projectName}
- **Initialized**: ${date}
- **Status**: Active

## Description
${description || "Project description pending. Update this section with the main purpose and goals of the project."}

## Main Goals
- [ ] Define project requirements
- [ ] Establish architecture
- [ ] Implement core features
- [ ] Testing and deployment

## Target Audience
_Define who will use this project_

## Project Type
_Library / CLI Tool / Web App / API / Other_

---
*This document was auto-generated. Use \`memorybank_generate_project_docs\` with AI to create detailed documentation based on actual code analysis.*
`,

  productContext: (projectName: string, date: string) => `# Product Context

## Purpose
_Why does this project exist? What problem does it solve?_

## User Stories
- As a user, I want to...
- As a developer, I want to...

## Key Features
1. Feature 1 - Description
2. Feature 2 - Description
3. Feature 3 - Description

## Business Logic
_Key business rules and workflows_

## Integration Points
- External APIs
- Services
- Databases

## Data Models
_Key entities and their relationships_

---
*Last updated: ${date}*
*Use \`memorybank_generate_project_docs\` to generate detailed product context from code analysis.*
`,

  systemPatterns: (projectName: string, date: string) => `# System Patterns

## Architecture Style
_MVC / Microservices / Monolith / Serverless / Other_

## Design Patterns Used
- Pattern 1: Description and usage
- Pattern 2: Description and usage

## Code Organization
\`\`\`
src/
├── components/    # Description
├── services/      # Description
├── utils/         # Description
└── ...
\`\`\`

## Naming Conventions
- Files: kebab-case / camelCase / PascalCase
- Functions: camelCase
- Classes: PascalCase
- Constants: UPPER_SNAKE_CASE

## Error Handling Strategy
_How errors are managed across the codebase_

## State Management
_How state is handled (if applicable)_

---
*Last updated: ${date}*
*Use \`memorybank_generate_project_docs\` to auto-detect patterns from code analysis.*
`,

  techContext: (projectName: string, date: string) => `# Technical Context

## Technology Stack

### Languages
- Language 1 (version)

### Frameworks
- Framework 1 (version)

### Key Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| package1 | x.x.x | Description |

## Development Environment

### Prerequisites
- Node.js >= 18.0.0
- Other requirements

### Setup Commands
\`\`\`bash
npm install
npm run build
npm run dev
\`\`\`

### Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| VAR_NAME | Yes/No | Description |

## Database / Storage
_Data persistence solutions_

## Testing
- Framework: Jest / Mocha / Other
- Coverage target: X%

---
*Last updated: ${date}*
*Use \`memorybank_generate_project_docs\` to auto-detect tech stack from code analysis.*
`,

  activeContext: (projectName: string, date: string) => `# Active Context

## Current Session
- **Date**: ${date}
- **Mode**: development
- **Current Task**: Project initialization

## Session History
| Date | Mode | Task | Notes |
|------|------|------|-------|
| ${date} | development | Initialization | Memory Bank created |

## Recent Changes
- Memory Bank initialized for project "${projectName}"

## Open Questions
- What are the main goals for this project?
- What is the target architecture?
- Who is the target audience?

## Next Steps
- [ ] Index the codebase with \`memorybank_index_code\`
- [ ] Generate detailed docs with \`memorybank_generate_project_docs\`
- [ ] Define project requirements
- [ ] Set up development environment

## Active Considerations
_Current technical considerations and trade-offs_

---
*Update this document with \`memorybank_update_context\` to track session progress.*
`,

  progress: (projectName: string, date: string) => `# Progress Tracking

## Current Phase
**Phase**: Initialization
**Status**: In Progress
**Started**: ${date}

## Completed
- [x] Repository setup
- [x] Memory Bank initialization

## In Progress
- [ ] Environment configuration
- [ ] Initial documentation
- [ ] Code indexing

## Upcoming
- [ ] Core feature development
- [ ] Testing setup
- [ ] Documentation completion

## Blockers
_No blockers currently_

## Milestones
| Milestone | Status | Target Date | Notes |
|-----------|--------|-------------|-------|
| Project Setup | In Progress | - | Initial setup phase |
| MVP | Pending | - | Minimum viable product |
| v1.0 | Pending | - | First stable release |

## Statistics
- Files indexed: 0
- Code chunks: 0
- Last indexing: Never

---
*Update this document with \`memorybank_track_progress\` to track tasks and milestones.*
`,

  decisionLog: (projectName: string, date: string) => `# Decision Log

This document tracks technical decisions made during the development of ${projectName}.

## Recent Decisions

### ${date} - Memory Bank Initialization
**Decision**: Initialize Memory Bank for persistent project context

**Rationale**: 
- Enable AI agents to maintain context across sessions
- Track technical decisions and their rationale
- Monitor project progress systematically

**Alternatives Considered**:
- Manual documentation only
- No persistent context tracking
- External documentation tools

**Impact**: Foundation for AI-assisted development with full project context

---

## Pending Decisions
- Architecture style to adopt
- Technology stack selection
- Testing strategy

## Decision Categories
- 🏗️ Architecture
- 💻 Technology
- 📦 Dependencies
- 🔧 Configuration
- 📋 Process

---
*Record new decisions with \`memorybank_record_decision\` to maintain decision history.*
`,
};

/**
 * Initializes the Memory Bank structure for a project
 */
export async function initializeMemoryBank(
  params: InitializeMemoryBankParams,
  storagePath: string = ".memorybank"
): Promise<InitializeMemoryBankResult> {
  const { projectId, projectPath, projectName, description } = params;
  
  console.error(`\n=== Initializing Memory Bank ===`);
  console.error(`Project ID: ${projectId}`);
  console.error(`Project Path: ${projectPath}`);
  
  const date = new Date().toISOString().split("T")[0];
  const name = projectName || projectId;
  const desc = description || "";
  
  // Define docs path
  const docsPath = path.join(storagePath, "projects", projectId, "docs");
  
  // Check if already exists
  const alreadyExists = fs.existsSync(docsPath);
  
  if (alreadyExists) {
    console.error(`Memory Bank already exists at: ${docsPath}`);
    
    // Check which docs exist
    const existingDocs: string[] = [];
    const docFiles = [
      "projectBrief.md",
      "productContext.md", 
      "systemPatterns.md",
      "techContext.md",
      "activeContext.md",
      "progress.md",
      "decisionLog.md",
    ];
    
    for (const doc of docFiles) {
      if (fs.existsSync(path.join(docsPath, doc))) {
        existingDocs.push(doc);
      }
    }
    
    return {
      success: true,
      message: `Memory Bank already initialized for project "${projectId}". ${existingDocs.length} documents exist.`,
      projectId,
      docsPath,
      documentsCreated: [],
      alreadyExists: true,
    };
  }
  
  // Create directory structure
  console.error(`Creating directory: ${docsPath}`);
  fs.mkdirSync(docsPath, { recursive: true });
  
  // Register project globally
  try {
      const registry = new RegistryManager();
      await registry.registerProject(
          projectId, 
          projectPath, 
          description,
          projectName ? [projectName] : []
      );
      console.error(`  Global registry updated.`);
  } catch (regErr) {
      console.error(`  Failed to update global registry: ${regErr}`);
  }

  // Create all template documents
  const documentsCreated: string[] = [];
  
  const documents: Record<string, string> = {
    "projectBrief.md": DOCUMENT_TEMPLATES.projectBrief(name, desc, date),
    "productContext.md": DOCUMENT_TEMPLATES.productContext(name, date),
    "systemPatterns.md": DOCUMENT_TEMPLATES.systemPatterns(name, date),
    "techContext.md": DOCUMENT_TEMPLATES.techContext(name, date),
    "activeContext.md": DOCUMENT_TEMPLATES.activeContext(name, date),
    "progress.md": DOCUMENT_TEMPLATES.progress(name, date),
    "decisionLog.md": DOCUMENT_TEMPLATES.decisionLog(name, date),
    "agentBoard.md": DOCUMENT_TEMPLATES.agentBoard(),
  };
  
  for (const [filename, content] of Object.entries(documents)) {
    const filePath = path.join(docsPath, filename);
    fs.writeFileSync(filePath, content, "utf-8");
    documentsCreated.push(filename);
    console.error(`  Created: ${filename}`);
  }
  
  console.error(`\n=== Memory Bank Initialized ===`);
  console.error(`Documents created: ${documentsCreated.length}`);
  
  return {
    success: true,
    message: `Memory Bank initialized for project "${projectId}" with ${documentsCreated.length} template documents. Use \`memorybank_index_code\` to index your code and \`memorybank_generate_project_docs\` to generate detailed AI documentation.`,
    projectId,
    docsPath,
    documentsCreated,
    alreadyExists: false,
  };
}

/**
 * Tool definition for MCP
 */
export const initializeMemoryBankToolDefinition = {
  name: "memorybank_initialize",
  description: `Inicializa el Memory Bank para un proyecto nuevo. Crea la estructura de directorios y 7 documentos markdown con plantillas iniciales:

- projectBrief.md: Descripción general del proyecto
- productContext.md: Contexto de producto y usuarios
- systemPatterns.md: Patrones de arquitectura
- techContext.md: Stack tecnológico
- activeContext.md: Contexto de sesión actual
- progress.md: Seguimiento de progreso
- decisionLog.md: Log de decisiones técnicas

Esta herramienta NO usa IA - crea plantillas estáticas. Para documentación detallada basada en análisis de código, usa \`memorybank_generate_project_docs\` después de indexar.`,

  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Identificador único del proyecto (OBLIGATORIO)",
      },
      projectPath: {
        type: "string",
        description: "Ruta absoluta del proyecto",
      },
      projectName: {
        type: "string",
        description: "Nombre legible del proyecto (opcional, usa projectId si no se especifica)",
      },
      description: {
        type: "string",
        description: "Descripción inicial del proyecto (opcional)",
      },
    },
    required: ["projectId", "projectPath"],
  },
};
