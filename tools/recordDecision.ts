/**
 * @fileoverview Record Decision tool for Memory Bank
 * Records technical decisions with rationale in the decision log
 */

import * as fs from "fs";
import * as path from "path";

export interface Decision {
  title: string;
  description: string;
  rationale: string;
  alternatives?: string[];
  impact?: string;
  category?: string;
  date?: string;
}

export interface RecordDecisionParams {
  projectId: string;
  decision: Decision;
}

export interface RecordDecisionResult {
  success: boolean;
  message: string;
  projectId: string;
  decisionTitle: string;
  totalDecisions: number;
}

/**
 * Category emojis for visual identification
 */
const CATEGORY_EMOJIS: Record<string, string> = {
  architecture: "🏗️",
  technology: "💻",
  dependencies: "📦",
  configuration: "🔧",
  process: "📋",
  security: "🔒",
  performance: "⚡",
  testing: "🧪",
  documentation: "📝",
  default: "📌",
};

/**
 * Counts existing decisions in the log
 */
function countDecisions(content: string): number {
  const matches = content.match(/^### \d{4}-\d{2}-\d{2}/gm);
  return matches ? matches.length : 0;
}

/**
 * Formats a decision entry for the log
 */
function formatDecisionEntry(decision: Decision): string {
  const date = decision.date || new Date().toISOString().split("T")[0];
  const category = decision.category || "default";
  const emoji = CATEGORY_EMOJIS[category.toLowerCase()] || CATEGORY_EMOJIS.default;
  
  let entry = `### ${date} - ${emoji} ${decision.title}

**Decision**: ${decision.description}

**Rationale**: ${decision.rationale}
`;

  if (decision.alternatives && decision.alternatives.length > 0) {
    entry += `
**Alternatives Considered**:
${decision.alternatives.map(alt => `- ${alt}`).join("\n")}
`;
  }

  if (decision.impact) {
    entry += `
**Impact**: ${decision.impact}
`;
  }

  if (decision.category) {
    entry += `
**Category**: ${emoji} ${decision.category}
`;
  }

  entry += "\n---\n";
  
  return entry;
}

/**
 * Records a technical decision in the decision log
 */
export async function recordDecision(
  params: RecordDecisionParams,
  storagePath: string = ".memorybank"
): Promise<RecordDecisionResult> {
  const { projectId, decision } = params;
  
  console.error(`\n=== Recording Decision ===`);
  console.error(`Project ID: ${projectId}`);
  console.error(`Decision: ${decision.title}`);
  
  const docsPath = path.join(storagePath, "projects", projectId, "docs");
  const decisionLogPath = path.join(docsPath, "decisionLog.md");
  
  // Check if Memory Bank exists
  if (!fs.existsSync(docsPath)) {
    return {
      success: false,
      message: `Memory Bank not initialized for project "${projectId}". Run \`memorybank_initialize\` first.`,
      projectId,
      decisionTitle: decision.title,
      totalDecisions: 0,
    };
  }
  
  // Read existing decision log or create new one
  let existingContent = "";
  let totalDecisions = 0;
  
  if (fs.existsSync(decisionLogPath)) {
    existingContent = fs.readFileSync(decisionLogPath, "utf-8");
    totalDecisions = countDecisions(existingContent);
    console.error(`  Found ${totalDecisions} existing decisions`);
  }
  
  // Format the new decision entry
  const newEntry = formatDecisionEntry(decision);
  
  // Insert the new decision after the "## Recent Decisions" header
  let newContent: string;
  
  if (existingContent.includes("## Recent Decisions")) {
    // Insert after the header
    newContent = existingContent.replace(
      "## Recent Decisions\n",
      `## Recent Decisions\n\n${newEntry}`
    );
  } else if (existingContent) {
    // Prepend to existing content with header
    newContent = `# Decision Log\n\n## Recent Decisions\n\n${newEntry}\n${existingContent}`;
  } else {
    // Create new file
    const date = new Date().toISOString().split("T")[0];
    newContent = `# Decision Log

This document tracks technical decisions made during the development of the project.

## Recent Decisions

${newEntry}

## Pending Decisions
_Add pending decisions that need to be made_

## Decision Categories
- 🏗️ Architecture
- 💻 Technology
- 📦 Dependencies
- 🔧 Configuration
- 📋 Process
- 🔒 Security
- ⚡ Performance
- 🧪 Testing
- 📝 Documentation

---
*Record new decisions with \`memorybank_record_decision\` to maintain decision history.*
*Last updated: ${date}*
`;
  }
  
  // Write to file
  fs.writeFileSync(decisionLogPath, newContent, "utf-8");
  
  totalDecisions += 1;
  
  console.error(`  Decision recorded: ${decision.title}`);
  console.error(`  Total decisions: ${totalDecisions}`);
  console.error(`\n=== Decision Recorded ===`);
  
  return {
    success: true,
    message: `Decision "${decision.title}" recorded for project "${projectId}". Total decisions: ${totalDecisions}.`,
    projectId,
    decisionTitle: decision.title,
    totalDecisions,
  };
}

/**
 * Tool definition for MCP
 */
export const recordDecisionToolDefinition = {
  name: "memorybank_record_decision",
  description: `Registra una decisión técnica en el log de decisiones del proyecto.

Cada decisión incluye:
- Título descriptivo
- Descripción de lo que se decidió
- Rationale (por qué se tomó la decisión)
- Alternativas consideradas (opcional)
- Impacto esperado (opcional)
- Categoría (opcional): architecture, technology, dependencies, configuration, process, security, performance, testing, documentation

Útil para mantener un historial de decisiones arquitectónicas y técnicas para referencia futura.
No usa IA - registro directo en el documento.`,

  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Identificador único del proyecto (OBLIGATORIO)",
      },
      decision: {
        type: "object",
        description: "Información de la decisión a registrar",
        properties: {
          title: {
            type: "string",
            description: "Título corto y descriptivo de la decisión",
          },
          description: {
            type: "string",
            description: "Descripción detallada de lo que se decidió",
          },
          rationale: {
            type: "string",
            description: "Por qué se tomó esta decisión",
          },
          alternatives: {
            type: "array",
            items: { type: "string" },
            description: "Alternativas que se consideraron",
          },
          impact: {
            type: "string",
            description: "Impacto esperado de la decisión",
          },
          category: {
            type: "string",
            description: "Categoría: architecture, technology, dependencies, configuration, process, security, performance, testing, documentation",
          },
          date: {
            type: "string",
            description: "Fecha de la decisión (YYYY-MM-DD). Auto-genera si no se especifica",
          },
        },
        required: ["title", "description", "rationale"],
      },
    },
    required: ["projectId", "decision"],
  },
};
