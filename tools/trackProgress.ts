/**
 * @fileoverview Track Progress tool for Memory Bank
 * Updates the progress tracking document with tasks, milestones, and blockers
 */

import * as fs from "fs";
import * as path from "path";

export interface ProgressTasks {
  completed?: string[];
  inProgress?: string[];
  blocked?: string[];
  upcoming?: string[];
}

export interface Milestone {
  name: string;
  status: "pending" | "in_progress" | "completed";
  targetDate?: string;
  notes?: string;
}

export interface Blocker {
  description: string;
  severity: "low" | "medium" | "high";
  createdAt?: string;
}

export interface TrackProgressParams {
  projectId: string;
  progress?: ProgressTasks;
  milestone?: Milestone;
  blockers?: Blocker[];
  phase?: string;
  phaseStatus?: string;
}

export interface TrackProgressResult {
  success: boolean;
  message: string;
  projectId: string;
  updatedSections: string[];
  stats: {
    completed: number;
    inProgress: number;
    blocked: number;
    upcoming: number;
    milestones: number;
    blockers: number;
  };
}

/**
 * Parses existing progress data from the markdown content
 */
function parseExistingProgress(content: string): {
  completed: string[];
  inProgress: string[];
  blocked: string[];
  upcoming: string[];
  milestones: Array<{name: string; status: string; targetDate: string; notes: string}>;
  blockers: string[];
  phase: string;
  phaseStatus: string;
} {
  const result = {
    completed: [] as string[],
    inProgress: [] as string[],
    blocked: [] as string[],
    upcoming: [] as string[],
    milestones: [] as Array<{name: string; status: string; targetDate: string; notes: string}>,
    blockers: [] as string[],
    phase: "Development",
    phaseStatus: "In Progress",
  };
  
  // Parse completed tasks
  const completedMatch = content.match(/## Completed\n([\s\S]*?)(?=\n##|$)/);
  if (completedMatch) {
    const items = completedMatch[1].match(/- \[x\] .+/g) || [];
    result.completed = items.map(i => i.replace(/- \[x\] /, ""));
  }
  
  // Parse in progress tasks
  const inProgressMatch = content.match(/## In Progress\n([\s\S]*?)(?=\n##|$)/);
  if (inProgressMatch) {
    const items = inProgressMatch[1].match(/- \[ \] .+/g) || [];
    result.inProgress = items.map(i => i.replace(/- \[ \] /, ""));
  }
  
  // Parse upcoming tasks
  const upcomingMatch = content.match(/## Upcoming\n([\s\S]*?)(?=\n##|$)/);
  if (upcomingMatch) {
    const items = upcomingMatch[1].match(/- \[ \] .+/g) || [];
    result.upcoming = items.map(i => i.replace(/- \[ \] /, ""));
  }
  
  // Parse phase
  const phaseMatch = content.match(/\*\*Phase\*\*: (.+)/);
  if (phaseMatch) result.phase = phaseMatch[1];
  
  const statusMatch = content.match(/\*\*Status\*\*: (.+)/);
  if (statusMatch) result.phaseStatus = statusMatch[1];
  
  // Parse milestones from table
  const tableMatch = content.match(/\| Milestone \| Status \| Target Date \| Notes \|[\s\S]*?(?=\n\n|\n##|$)/);
  if (tableMatch) {
    const lines = tableMatch[0].split("\n").slice(2);
    for (const line of lines) {
      const cells = line.split("|").map(c => c.trim()).filter(c => c);
      if (cells.length >= 4) {
        result.milestones.push({
          name: cells[0],
          status: cells[1],
          targetDate: cells[2],
          notes: cells[3],
        });
      }
    }
  }
  
  // Parse blockers
  const blockersMatch = content.match(/## Blockers\n([\s\S]*?)(?=\n##|$)/);
  if (blockersMatch && !blockersMatch[1].includes("No blockers")) {
    const items = blockersMatch[1].match(/- .+/g) || [];
    result.blockers = items.map(i => i.replace(/- /, ""));
  }
  
  return result;
}

/**
 * Generates the updated progress.md content
 */
function generateProgressContent(
  projectId: string,
  completed: string[],
  inProgress: string[],
  blocked: string[],
  upcoming: string[],
  milestones: Array<{name: string; status: string; targetDate: string; notes: string}>,
  blockers: Blocker[],
  phase: string,
  phaseStatus: string
): string {
  const date = new Date().toISOString().split("T")[0];
  
  // Format task lists
  const completedList = completed.length > 0
    ? completed.map(t => `- [x] ${t}`).join("\n")
    : "- [x] Project initialization";
    
  const inProgressList = inProgress.length > 0
    ? inProgress.map(t => `- [ ] ${t}`).join("\n")
    : "_No tasks in progress_";
    
  const blockedList = blocked.length > 0
    ? blocked.map(t => `- [ ] ⚠️ ${t}`).join("\n")
    : "";
    
  const upcomingList = upcoming.length > 0
    ? upcoming.map(t => `- [ ] ${t}`).join("\n")
    : "_No upcoming tasks defined_";
  
  // Format milestones table
  const milestonesRows = milestones.length > 0
    ? milestones.map(m => `| ${m.name} | ${m.status} | ${m.targetDate || "-"} | ${m.notes || "-"} |`).join("\n")
    : "| Initial Setup | In Progress | - | Getting started |";
  
  // Format blockers
  const severityEmoji: Record<string, string> = {
    low: "🟡",
    medium: "🟠", 
    high: "🔴",
  };
  
  const blockersContent = blockers.length > 0
    ? blockers.map(b => `- ${severityEmoji[b.severity] || "🟡"} **${b.severity.toUpperCase()}**: ${b.description}`).join("\n")
    : "_No blockers currently_";
  
  return `# Progress Tracking

## Current Phase
**Phase**: ${phase}
**Status**: ${phaseStatus}
**Last Updated**: ${date}

## Completed
${completedList}

## In Progress
${inProgressList}
${blockedList ? `\n### Blocked\n${blockedList}` : ""}

## Upcoming
${upcomingList}

## Blockers
${blockersContent}

## Milestones
| Milestone | Status | Target Date | Notes |
|-----------|--------|-------------|-------|
${milestonesRows}

## Statistics
- **Completed**: ${completed.length} tasks
- **In Progress**: ${inProgress.length} tasks
- **Blocked**: ${blocked.length} tasks
- **Upcoming**: ${upcoming.length} tasks

---
*Update with \`memorybank_track_progress\` to track tasks and milestones.*
*Last updated: ${new Date().toISOString()}*
`;
}

/**
 * Merges task arrays, avoiding duplicates
 */
function mergeTasks(existing: string[], incoming: string[] | undefined): string[] {
  if (!incoming || incoming.length === 0) return existing;
  
  const merged = [...existing];
  for (const task of incoming) {
    if (!merged.some(t => t.toLowerCase() === task.toLowerCase())) {
      merged.push(task);
    }
  }
  return merged;
}

/**
 * Updates the progress tracking document
 */
export async function trackProgress(
  params: TrackProgressParams,
  storagePath: string = ".memorybank"
): Promise<TrackProgressResult> {
  const {
    projectId,
    progress = {},
    milestone,
    blockers = [],
    phase,
    phaseStatus,
  } = params;
  
  console.error(`\n=== Tracking Progress ===`);
  console.error(`Project ID: ${projectId}`);
  
  const docsPath = path.join(storagePath, "projects", projectId, "docs");
  const progressPath = path.join(docsPath, "progress.md");
  
  // Check if Memory Bank exists
  if (!fs.existsSync(docsPath)) {
    return {
      success: false,
      message: `Memory Bank not initialized for project "${projectId}". Run \`memorybank_initialize\` first.`,
      projectId,
      updatedSections: [],
      stats: { completed: 0, inProgress: 0, blocked: 0, upcoming: 0, milestones: 0, blockers: 0 },
    };
  }
  
  // Parse existing progress if file exists
  let existing = {
    completed: [] as string[],
    inProgress: [] as string[],
    blocked: [] as string[],
    upcoming: [] as string[],
    milestones: [] as Array<{name: string; status: string; targetDate: string; notes: string}>,
    blockers: [] as string[],
    phase: "Development",
    phaseStatus: "In Progress",
  };
  
  if (fs.existsSync(progressPath)) {
    const content = fs.readFileSync(progressPath, "utf-8");
    existing = parseExistingProgress(content);
    console.error(`  Found existing progress data`);
  }
  
  // Track updated sections
  const updatedSections: string[] = [];
  
  // Merge tasks
  const completed = mergeTasks(existing.completed, progress.completed);
  if (progress.completed?.length) updatedSections.push("Completed");
  
  // Move completed tasks from inProgress to completed
  let inProgress = existing.inProgress.filter(t => 
    !progress.completed?.some(c => c.toLowerCase() === t.toLowerCase())
  );
  inProgress = mergeTasks(inProgress, progress.inProgress);
  if (progress.inProgress?.length) updatedSections.push("In Progress");
  
  const blocked = mergeTasks(existing.blocked, progress.blocked);
  if (progress.blocked?.length) updatedSections.push("Blocked");
  
  const upcoming = mergeTasks(existing.upcoming, progress.upcoming);
  if (progress.upcoming?.length) updatedSections.push("Upcoming");
  
  // Update or add milestone
  let milestones = [...existing.milestones];
  if (milestone) {
    const existingIndex = milestones.findIndex(m => m.name.toLowerCase() === milestone.name.toLowerCase());
    const newMilestone = {
      name: milestone.name,
      status: milestone.status,
      targetDate: milestone.targetDate || "-",
      notes: milestone.notes || "-",
    };
    
    if (existingIndex >= 0) {
      milestones[existingIndex] = newMilestone;
    } else {
      milestones.push(newMilestone);
    }
    updatedSections.push("Milestones");
  }
  
  // Update phase if provided
  const finalPhase = phase || existing.phase;
  const finalPhaseStatus = phaseStatus || existing.phaseStatus;
  if (phase || phaseStatus) updatedSections.push("Phase");
  
  // Convert blockers
  const finalBlockers = blockers.length > 0 ? blockers : [];
  if (blockers.length > 0) updatedSections.push("Blockers");
  
  // Generate new content
  const newContent = generateProgressContent(
    projectId,
    completed,
    inProgress,
    blocked,
    upcoming,
    milestones,
    finalBlockers,
    finalPhase,
    finalPhaseStatus
  );
  
  // Write to file
  fs.writeFileSync(progressPath, newContent, "utf-8");
  
  const stats = {
    completed: completed.length,
    inProgress: inProgress.length,
    blocked: blocked.length,
    upcoming: upcoming.length,
    milestones: milestones.length,
    blockers: finalBlockers.length,
  };
  
  console.error(`  Updated sections: ${updatedSections.join(", ") || "None"}`);
  console.error(`  Stats: ${JSON.stringify(stats)}`);
  console.error(`\n=== Progress Updated ===`);
  
  return {
    success: true,
    message: `Progress updated for project "${projectId}". ${updatedSections.length > 0 ? `Updated: ${updatedSections.join(", ")}` : "No changes"}. Stats: ${stats.completed} completed, ${stats.inProgress} in progress, ${stats.upcoming} upcoming.`,
    projectId,
    updatedSections,
    stats,
  };
}

/**
 * Tool definition for MCP
 */
export const trackProgressToolDefinition = {
  name: "memorybank_track_progress",
  description: `Actualiza el seguimiento de progreso del proyecto con tareas, milestones y blockers.

Permite:
- Marcar tareas como completadas, en progreso, bloqueadas o próximas
- Añadir/actualizar milestones con estado y fecha objetivo
- Registrar blockers con severidad (low/medium/high)
- Actualizar fase y estado del proyecto

Las tareas se fusionan inteligentemente evitando duplicados.
No usa IA - actualización directa del documento.`,

  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Identificador único del proyecto (OBLIGATORIO)",
      },
      progress: {
        type: "object",
        description: "Tareas a actualizar",
        properties: {
          completed: {
            type: "array",
            items: { type: "string" },
            description: "Tareas completadas",
          },
          inProgress: {
            type: "array",
            items: { type: "string" },
            description: "Tareas en progreso",
          },
          blocked: {
            type: "array",
            items: { type: "string" },
            description: "Tareas bloqueadas",
          },
          upcoming: {
            type: "array",
            items: { type: "string" },
            description: "Próximas tareas",
          },
        },
      },
      milestone: {
        type: "object",
        description: "Milestone a añadir o actualizar",
        properties: {
          name: {
            type: "string",
            description: "Nombre del milestone",
          },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "completed"],
            description: "Estado del milestone",
          },
          targetDate: {
            type: "string",
            description: "Fecha objetivo (opcional)",
          },
          notes: {
            type: "string",
            description: "Notas adicionales (opcional)",
          },
        },
        required: ["name", "status"],
      },
      blockers: {
        type: "array",
        description: "Blockers a registrar",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "Descripción del blocker",
            },
            severity: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Severidad del blocker",
            },
          },
          required: ["description", "severity"],
        },
      },
      phase: {
        type: "string",
        description: "Fase actual del proyecto (ej: Planning, Development, Testing, Deployment)",
      },
      phaseStatus: {
        type: "string",
        description: "Estado de la fase (ej: Not Started, In Progress, Completed)",
      },
    },
    required: ["projectId"],
  },
};
