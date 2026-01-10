/**
 * @fileoverview Update Context tool for Memory Bank
 * Updates the active context document with current session information
 */

import * as fs from "fs";
import * as path from "path";

export interface CurrentSession {
  date?: string;
  mode?: string;
  task?: string;
}

export interface UpdateContextParams {
  projectId: string;
  currentSession?: CurrentSession;
  recentChanges?: string[];
  openQuestions?: string[];
  nextSteps?: string[];
  notes?: string;
}

export interface UpdateContextResult {
  success: boolean;
  message: string;
  projectId: string;
  updatedSections: string[];
  sessionHistory: number;
}

/**
 * Parses the existing activeContext.md to extract session history
 */
function parseSessionHistory(content: string): Array<{date: string; mode: string; task: string; notes: string}> {
  const history: Array<{date: string; mode: string; task: string; notes: string}> = [];
  
  // Find the Session History table
  const tableMatch = content.match(/\| Date \| Mode \| Task \| Notes \|[\s\S]*?(?=\n\n|\n##|$)/);
  if (!tableMatch) return history;
  
  const lines = tableMatch[0].split("\n").slice(2); // Skip header and separator
  
  for (const line of lines) {
    const cells = line.split("|").map(c => c.trim()).filter(c => c);
    if (cells.length >= 4) {
      history.push({
        date: cells[0],
        mode: cells[1],
        task: cells[2],
        notes: cells[3],
      });
    }
  }
  
  return history;
}

/**
 * Generates the updated activeContext.md content
 */
function generateActiveContextContent(
  projectId: string,
  currentSession: CurrentSession,
  recentChanges: string[],
  openQuestions: string[],
  nextSteps: string[],
  notes: string,
  sessionHistory: Array<{date: string; mode: string; task: string; notes: string}>
): string {
  const date = currentSession.date || new Date().toISOString().split("T")[0];
  const mode = currentSession.mode || "development";
  const task = currentSession.task || "Working on project";
  
  // Add current session to history (limit to last 10)
  const newHistory = [
    { date, mode, task, notes: notes || "Session updated" },
    ...sessionHistory,
  ].slice(0, 10);
  
  // Build session history table
  const historyRows = newHistory
    .map(h => `| ${h.date} | ${h.mode} | ${h.task} | ${h.notes} |`)
    .join("\n");
  
  // Build recent changes list
  const changesContent = recentChanges.length > 0
    ? recentChanges.map(c => `- ${c}`).join("\n")
    : "- No recent changes recorded";
  
  // Build open questions list
  const questionsContent = openQuestions.length > 0
    ? openQuestions.map(q => `- ${q}`).join("\n")
    : "- No open questions";
  
  // Build next steps list
  const stepsContent = nextSteps.length > 0
    ? nextSteps.map(s => `- [ ] ${s}`).join("\n")
    : "- [ ] Continue development";
  
  return `# Active Context

## Current Session
- **Date**: ${date}
- **Mode**: ${mode}
- **Current Task**: ${task}

## Session History
| Date | Mode | Task | Notes |
|------|------|------|-------|
${historyRows}

## Recent Changes
${changesContent}

## Open Questions
${questionsContent}

## Next Steps
${stepsContent}

## Active Considerations
${notes || "_No additional considerations_"}

---
*Last updated: ${new Date().toISOString()}*
*Update with \`memorybank_update_context\` to track session progress.*
`;
}

/**
 * Updates the active context document
 */
export async function updateContext(
  params: UpdateContextParams,
  storagePath: string = ".memorybank"
): Promise<UpdateContextResult> {
  const {
    projectId,
    currentSession = {},
    recentChanges = [],
    openQuestions = [],
    nextSteps = [],
    notes = "",
  } = params;
  
  console.error(`\n=== Updating Active Context ===`);
  console.error(`Project ID: ${projectId}`);
  
  const docsPath = path.join(storagePath, "projects", projectId, "docs");
  const activeContextPath = path.join(docsPath, "activeContext.md");
  
  // Check if Memory Bank exists
  if (!fs.existsSync(docsPath)) {
    return {
      success: false,
      message: `Memory Bank not initialized for project "${projectId}". Run \`memorybank_initialize\` first.`,
      projectId,
      updatedSections: [],
      sessionHistory: 0,
    };
  }
  
  // Parse existing session history if file exists
  let sessionHistory: Array<{date: string; mode: string; task: string; notes: string}> = [];
  
  if (fs.existsSync(activeContextPath)) {
    const existingContent = fs.readFileSync(activeContextPath, "utf-8");
    sessionHistory = parseSessionHistory(existingContent);
    console.error(`  Found ${sessionHistory.length} previous sessions`);
  }
  
  // Track which sections were updated
  const updatedSections: string[] = ["Current Session"];
  
  if (recentChanges.length > 0) updatedSections.push("Recent Changes");
  if (openQuestions.length > 0) updatedSections.push("Open Questions");
  if (nextSteps.length > 0) updatedSections.push("Next Steps");
  if (notes) updatedSections.push("Active Considerations");
  
  // Generate new content
  const newContent = generateActiveContextContent(
    projectId,
    currentSession,
    recentChanges,
    openQuestions,
    nextSteps,
    notes,
    sessionHistory
  );
  
  // Write to file
  fs.writeFileSync(activeContextPath, newContent, "utf-8");
  
  console.error(`  Updated sections: ${updatedSections.join(", ")}`);
  console.error(`  Session history: ${sessionHistory.length + 1} entries`);
  console.error(`\n=== Context Updated ===`);
  
  return {
    success: true,
    message: `Active context updated for project "${projectId}". Updated: ${updatedSections.join(", ")}. Session history: ${sessionHistory.length + 1} entries.`,
    projectId,
    updatedSections,
    sessionHistory: sessionHistory.length + 1,
  };
}

/**
 * Tool definition for MCP
 */
export const updateContextToolDefinition = {
  name: "memorybank_update_context",
  description: `Actualiza el contexto activo del proyecto con información de la sesión actual. 
  
Permite registrar:
- Sesión actual (fecha, modo de trabajo, tarea)
- Cambios recientes realizados
- Preguntas abiertas pendientes
- Próximos pasos planificados
- Notas y consideraciones

Mantiene un historial de las últimas 10 sesiones para tracking de progreso.
No usa IA - actualización directa del documento.`,

  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Identificador único del proyecto (OBLIGATORIO)",
      },
      currentSession: {
        type: "object",
        description: "Información de la sesión actual",
        properties: {
          date: {
            type: "string",
            description: "Fecha de la sesión (YYYY-MM-DD). Auto-genera si no se especifica",
          },
          mode: {
            type: "string",
            description: "Modo de trabajo: development, debugging, refactoring, review, planning, etc.",
          },
          task: {
            type: "string",
            description: "Descripción de la tarea actual",
          },
        },
      },
      recentChanges: {
        type: "array",
        items: { type: "string" },
        description: "Lista de cambios recientes realizados",
      },
      openQuestions: {
        type: "array",
        items: { type: "string" },
        description: "Preguntas o dudas pendientes de resolver",
      },
      nextSteps: {
        type: "array",
        items: { type: "string" },
        description: "Próximos pasos planificados",
      },
      notes: {
        type: "string",
        description: "Notas adicionales o consideraciones activas",
      },
    },
    required: ["projectId"],
  },
};
