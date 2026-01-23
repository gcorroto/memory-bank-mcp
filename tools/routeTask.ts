/**
 * @fileoverview Task Routing Orchestrator
 * Uses AI reasoning to analyze tasks and distribute work across projects
 * based on their responsibilities. MANDATORY before any implementation.
 */

import OpenAI from "openai";
import { RegistryManager, ProjectCard } from "../common/registryManager.js";

export interface RouteTaskParams {
  projectId: string;        // Current project making the request
  taskDescription: string;  // What the user wants to do
}

export interface TaskDelegation {
  targetProject: string;
  taskTitle: string;
  taskDescription: string;
  reasoning: string;
}

export interface RouteTaskResult {
  success: boolean;
  action: 'proceed' | 'delegate' | 'mixed';
  myResponsibilities: string[];      // What the calling agent should implement
  delegations: TaskDelegation[];     // Tasks to delegate to other projects
  suggestedImports: string[];        // Dependencies to use after delegation
  architectureNotes: string;         // Explanation from the orchestrator
  warning?: string;                  // Any warnings about the task
}

/**
 * Builds a context string describing all projects and their responsibilities
 */
function buildProjectsContext(projects: ProjectCard[], currentProjectId: string): string {
  if (projects.length === 0) {
    return "No other projects registered in the workspace.";
  }
  
  let context = "## Registered Projects in Workspace\n\n";
  
  for (const project of projects) {
    const isCurrent = project.projectId === currentProjectId;
    context += `### ${project.projectId}${isCurrent ? ' (CURRENT - requesting agent)' : ''}\n`;
    context += `- **Path**: ${project.path}\n`;
    context += `- **Type**: ${project.projectType || 'unknown'}\n`;
    context += `- **Description**: ${project.description || 'No description'}\n`;
    
    if (project.responsibilities && project.responsibilities.length > 0) {
      context += `- **Responsibilities**:\n`;
      for (const resp of project.responsibilities) {
        context += `  - ${resp}\n`;
      }
    }
    
    if (project.owns && project.owns.length > 0) {
      context += `- **Owns (file patterns)**: ${project.owns.join(', ')}\n`;
    }
    
    if (project.exports) {
      context += `- **Exports**: ${project.exports}\n`;
    }
    
    context += '\n';
  }
  
  return context;
}

/**
 * The main routing prompt for the AI orchestrator
 */
const ROUTING_PROMPT = `You are a Task Routing Orchestrator for a multi-project workspace. Your job is to analyze a task and determine which parts belong to which project based on their responsibilities.

{projectsContext}

## Task to Analyze
**From Project**: {currentProject}
**Task Description**: {taskDescription}

## Your Analysis

Analyze the task and determine:
1. What components/code need to be created or modified?
2. Which project is responsible for each component based on their declared responsibilities?
3. If something doesn't exist in any project, it can be created by the requesting project
4. If something SHOULD exist in another project (based on responsibilities), it must be delegated

## Rules
- If a project is responsible for DTOs, ALL DTOs must be created there, not in the API
- If a project is responsible for services, shared services go there
- If a project is responsible for utils/common code, shared utilities go there
- The requesting project can ONLY implement what falls within its responsibilities
- When in doubt, check the "owns" patterns to see what file types belong where

## Response Format
Respond with a JSON object:
{
  "action": "proceed" | "delegate" | "mixed",
  "myResponsibilities": ["List of things the requesting project should implement"],
  "delegations": [
    {
      "targetProject": "project-id",
      "taskTitle": "Short title for the task",
      "taskDescription": "Detailed description of what to create",
      "reasoning": "Why this belongs to this project"
    }
  ],
  "suggestedImports": ["packages or modules to import after delegations complete"],
  "architectureNotes": "Explanation of the distribution decision",
  "warning": "Optional warning if something seems off"
}

IMPORTANT:
- "action" is "proceed" if everything can be done by the requesting project
- "action" is "delegate" if everything needs to go to other projects
- "action" is "mixed" if some work is local and some needs delegation
- Be specific in taskDescription so the receiving project knows exactly what to create
- Always explain the reasoning based on project responsibilities

Respond ONLY with the JSON object.`;

/**
 * Routes a task to the appropriate project(s) based on responsibilities
 */
export async function routeTaskTool(params: RouteTaskParams): Promise<RouteTaskResult> {
  const { projectId, taskDescription } = params;
  
  if (!taskDescription || taskDescription.trim() === '') {
    return {
      success: false,
      action: 'proceed',
      myResponsibilities: [],
      delegations: [],
      suggestedImports: [],
      architectureNotes: 'No task description provided.',
      warning: 'Please provide a task description to analyze.',
    };
  }
  
  console.error(`\n=== Task Routing Orchestrator ===`);
  console.error(`Project: ${projectId}`);
  console.error(`Task: ${taskDescription.slice(0, 100)}...`);
  
  // Get all projects with their responsibilities
  const registryManager = new RegistryManager();
  const allProjects = await registryManager.getAllProjects();
  
  console.error(`Found ${allProjects.length} projects in registry`);
  
  // Check if we have any projects with responsibilities defined
  const projectsWithResponsibilities = allProjects.filter(p => 
    p.responsibilities && p.responsibilities.length > 0
  );
  
  if (projectsWithResponsibilities.length === 0) {
    console.error(`Warning: No projects have responsibilities defined`);
    return {
      success: true,
      action: 'proceed',
      myResponsibilities: ['All components (no other project responsibilities defined)'],
      delegations: [],
      suggestedImports: [],
      architectureNotes: 'No other projects have responsibilities defined. You can proceed with the full implementation. Consider running memorybank_generate_project_docs on other projects to define their responsibilities.',
      warning: 'No project responsibilities found in workspace. Run generate_project_docs on all projects first.',
    };
  }
  
  // Build context for the AI
  const projectsContext = buildProjectsContext(allProjects, projectId);
  
  // Call AI to analyze and route
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      action: 'proceed',
      myResponsibilities: [],
      delegations: [],
      suggestedImports: [],
      architectureNotes: 'OPENAI_API_KEY not configured. Cannot analyze task routing.',
      warning: 'AI routing unavailable. Proceeding without validation.',
    };
  }
  
  try {
    const client = new OpenAI({ apiKey });
    
    const prompt = ROUTING_PROMPT
      .replace('{projectsContext}', projectsContext)
      .replace('{currentProject}', projectId)
      .replace('{taskDescription}', taskDescription);
    
    console.error(`Calling AI orchestrator...`);
    
    // Use reasoning model for better analysis
    const model = process.env.MEMORYBANK_REASONING_MODEL || "gpt-5-mini";
    
    const response = await (client as any).responses.create({
      model,
      reasoning: {
        effort: "medium",
      },
      input: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_output_tokens: 4000,
    });
    
    // Extract content from response
    let content = "";
    for (const item of response.output || []) {
      if (item.type === "message" && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === "output_text") {
            content += contentItem.text;
          }
        }
      }
    }
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`Failed to parse orchestrator response`);
      return {
        success: false,
        action: 'proceed',
        myResponsibilities: [],
        delegations: [],
        suggestedImports: [],
        architectureNotes: 'Failed to parse AI response.',
        warning: 'Orchestrator analysis failed. Review task manually.',
      };
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    console.error(`\nOrchestrator Decision:`);
    console.error(`  Action: ${result.action}`);
    console.error(`  My responsibilities: ${result.myResponsibilities?.length || 0}`);
    console.error(`  Delegations: ${result.delegations?.length || 0}`);
    
    if (result.delegations && result.delegations.length > 0) {
      console.error(`\n  Delegations:`);
      for (const d of result.delegations) {
        console.error(`    → ${d.targetProject}: ${d.taskTitle}`);
      }
    }
    
    return {
      success: true,
      action: result.action || 'proceed',
      myResponsibilities: result.myResponsibilities || [],
      delegations: result.delegations || [],
      suggestedImports: result.suggestedImports || [],
      architectureNotes: result.architectureNotes || '',
      warning: result.warning,
    };
    
  } catch (error: any) {
    console.error(`Error in task routing: ${error.message}`);
    
    // Fallback to chat completions if responses API fails
    if (error?.status === 404 || error?.code === "model_not_found") {
      try {
        const client = new OpenAI({ apiKey });
        const prompt = ROUTING_PROMPT
          .replace('{projectsContext}', projectsContext)
          .replace('{currentProject}', projectId)
          .replace('{taskDescription}', taskDescription);
        
        const response = await client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a Task Routing Orchestrator. Analyze tasks and route them to the appropriate projects based on responsibilities. Respond with JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 4000,
        });
        
        const content = response.choices[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          return {
            success: true,
            action: result.action || 'proceed',
            myResponsibilities: result.myResponsibilities || [],
            delegations: result.delegations || [],
            suggestedImports: result.suggestedImports || [],
            architectureNotes: result.architectureNotes || '',
            warning: result.warning,
          };
        }
      } catch (fallbackError) {
        console.error(`Fallback also failed: ${fallbackError}`);
      }
    }
    
    return {
      success: false,
      action: 'proceed',
      myResponsibilities: [],
      delegations: [],
      suggestedImports: [],
      architectureNotes: `Error analyzing task: ${error.message}`,
      warning: 'Orchestrator failed. Review task distribution manually.',
    };
  }
}

/**
 * Tool definition for MCP
 */
export const routeTaskToolDefinition = {
  name: "memorybank_route_task",
  description: `🚨 OBLIGATORIO antes de implementar cualquier código.

Analiza una tarea y determina qué partes corresponden a qué proyecto según sus responsabilidades.

El orquestador:
1. Lee las responsabilidades de TODOS los proyectos del workspace
2. Analiza qué componentes necesita la tarea (DTOs, services, controllers, etc.)
3. Asigna cada componente al proyecto responsable
4. Devuelve un plan de acción con delegaciones

DEBES llamar esta herramienta ANTES de escribir código para evitar:
- Crear DTOs en un API cuando existe una lib-dtos
- Duplicar services que ya existen en otro proyecto
- Violar la separación de responsabilidades

La respuesta incluye:
- myResponsibilities: Lo que TÚ debes implementar
- delegations: Tareas a delegar a otros proyectos
- suggestedImports: Dependencias a usar tras las delegaciones`,
  
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "ID del proyecto que solicita el análisis (tu proyecto actual)",
      },
      taskDescription: {
        type: "string",
        description: "Descripción completa de la tarea a realizar",
      },
    },
    required: ["projectId", "taskDescription"],
  },
};
