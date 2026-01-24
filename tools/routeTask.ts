/**
 * @fileoverview Task Routing Orchestrator
 * Uses AI reasoning to analyze tasks and distribute work across projects
 * based on their responsibilities. MANDATORY before any implementation.
 * 
 * The orchestrator has access to semantic search tools to verify where
 * code actually exists, not just rely on declared responsibilities.
 */

import OpenAI from "openai";
import { RegistryManager, ProjectCard } from "../common/registryManager.js";
import { IndexManager } from "../common/indexManager.js";
import { searchMemory } from "./searchMemory.js";
import { saveOrchestratorLog } from "../common/agentBoardSqlite.js";

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
 * Tools available to the orchestrator for verification
 */
const ORCHESTRATOR_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "semantic_search",
      description: "Search for code semantically in a specific project. Use this to verify if code already exists, where implementations are located, or to understand project structure before routing decisions.",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "The project ID to search in",
          },
          query: {
            type: "string", 
            description: "Natural language query describing what you're looking for (e.g., 'UserDTO class', 'authentication service', 'database connection')",
          },
        },
        required: ["projectId", "query"],
      },
    },
  },
];

/**
 * Executes a tool call from the orchestrator
 */
async function executeToolCall(
  toolName: string, 
  args: Record<string, any>,
  allProjects: ProjectCard[],
  indexManager: IndexManager
): Promise<string> {
  if (toolName === "semantic_search") {
    const { projectId, query } = args;
    
    // Verify project exists
    const projectExists = allProjects.some(p => p.projectId === projectId);
    if (!projectExists) {
      return JSON.stringify({ 
        error: `Project '${projectId}' not found. Available: ${allProjects.map(p => p.projectId).join(', ')}` 
      });
    }
    
    try {
      console.error(`  [Tool] Searching in ${projectId}: "${query}"`);
      
      const result = await searchMemory({
        projectId,
        query,
        topK: 5,
        minScore: 0.5,
      }, indexManager);
      
      if (!result.success || result.results.length === 0) {
        return JSON.stringify({ 
          found: false, 
          message: `No results found for "${query}" in project ${projectId}` 
        });
      }
      
      // Return summarized results (not full code, just locations and snippets)
      const summary = result.results.map(r => ({
        file: r.filePath,
        type: r.chunkType,
        name: r.name,
        score: r.score.toFixed(2),
        preview: r.content.slice(0, 200) + (r.content.length > 200 ? '...' : ''),
      }));
      
      return JSON.stringify({ 
        found: true, 
        count: result.results.length,
        results: summary 
      });
    } catch (error: any) {
      return JSON.stringify({ error: error.message });
    }
  }
  
  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

/**
 * The main routing prompt for the AI orchestrator
 */
const ROUTING_PROMPT = `You are a Task Routing Orchestrator for a multi-project workspace. Your job is to analyze a task and determine which parts belong to which project based on their responsibilities.

You have access to a semantic_search tool that allows you to search for code in any project. USE IT when:
- You need to verify if something already exists
- A task could belong to multiple projects and you need to check where the related code is
- You want to confirm where implementations are located before making routing decisions

{projectsContext}

## Task to Analyze
**From Project**: {currentProject}
**Task Description**: {taskDescription}

## Your Analysis Process

1. First, identify what components/code need to be created or modified
2. Check the declared responsibilities of each project
3. If there's ambiguity (task could match multiple projects), USE semantic_search to verify:
   - Search for related existing code
   - Check which project actually has the relevant implementations
4. Make your routing decision based on BOTH responsibilities AND actual code location

## Rules
- If a project is responsible for DTOs, ALL DTOs must be created there, not in the API
- If a project is responsible for services, shared services go there
- If a project is responsible for utils/common code, shared utilities go there
- The requesting project can ONLY implement what falls within its responsibilities
- When in doubt, USE semantic_search to verify where similar code exists
- If code exists in a project, new related code should likely go there too

## Response Format (after your analysis and any tool calls)
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
  "warning": "Optional warning if something seems off",
  "searchesPerformed": ["List of searches you performed to verify the decision"]
}

IMPORTANT:
- "action" is "proceed" if everything can be done by the requesting project
- "action" is "delegate" if everything needs to go to other projects  
- "action" is "mixed" if some work is local and some needs delegation
- Use semantic_search when responsibilities are ambiguous or could match multiple projects
- Document what searches you performed in "searchesPerformed"
- Responde siempre en ESPAÑOL

Respond ONLY with the JSON object after completing your analysis.`;

/**
 * Routes a task to the appropriate project(s) based on responsibilities
 * Uses function calling to allow the AI to perform semantic searches when needed
 */
export async function routeTaskTool(
  params: RouteTaskParams,
  indexManager: IndexManager
): Promise<RouteTaskResult> {
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
  
  // Model used for routing (needed for logging both success and error cases)
  const model = process.env.MEMORYBANK_ROUTING_MODEL || "gpt-4o";
  
  try {
    const client = new OpenAI({ apiKey });
    
    const prompt = ROUTING_PROMPT
      .replace('{projectsContext}', projectsContext)
      .replace('{currentProject}', projectId)
      .replace('{taskDescription}', taskDescription);
    
    console.error(`Calling AI orchestrator with tool access (${model})...`);
    
    // Initialize conversation
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "You are a Task Routing Orchestrator. Analyze tasks and route them to appropriate projects. You can use semantic_search to verify where code exists before making decisions. Always respond with JSON after your analysis.",
      },
      {
        role: "user",
        content: prompt,
      },
    ];
    
    // Tool calling loop (max 5 iterations to prevent infinite loops)
    let iterations = 0;
    const maxIterations = 5;
    let finalResponse: string | null = null;
    
    while (iterations < maxIterations) {
      iterations++;
      console.error(`  Iteration ${iterations}/${maxIterations}`);
      
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: ORCHESTRATOR_TOOLS,
        tool_choice: "auto",
        max_tokens: 4000,
      });
      
      const message = response.choices[0]?.message;
      
      if (!message) {
        console.error(`  No message in response`);
        break;
      }
      
      // Check if there are tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.error(`  Model requested ${message.tool_calls.length} tool call(s)`);
        
        // Add assistant message with tool calls
        messages.push(message);
        
        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          const toolResult = await executeToolCall(toolName, toolArgs, allProjects, indexManager);
          
          // Add tool result to messages
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      } else {
        // No tool calls, this is the final response
        finalResponse = message.content;
        console.error(`  Final response received`);
        break;
      }
    }
    
    if (!finalResponse) {
      console.error(`  No final response after ${iterations} iterations`);
      return {
        success: false,
        action: 'proceed',
        myResponsibilities: [],
        delegations: [],
        suggestedImports: [],
        architectureNotes: 'Orchestrator did not produce a final response.',
        warning: 'Analysis incomplete. Review task manually.',
      };
    }
    
    // Parse JSON response
    const jsonMatch = finalResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`Failed to parse orchestrator response`);
      
      const parseErrorResult: RouteTaskResult = {
        success: false,
        action: 'proceed',
        myResponsibilities: [],
        delegations: [],
        suggestedImports: [],
        architectureNotes: 'Failed to parse AI response.',
        warning: 'Orchestrator analysis failed. Review task manually.',
      };
      
      // Persist parse failure
      try {
        saveOrchestratorLog({
          projectId: params.projectId,
          taskDescription: params.taskDescription,
          action: 'proceed',
          myResponsibilities: [],
          delegations: [],
          suggestedImports: [],
          architectureNotes: parseErrorResult.architectureNotes,
          searchesPerformed: [],
          warning: parseErrorResult.warning,
          success: false,
          modelUsed: model,
        });
      } catch (persistError: any) {
        console.error(`Warning: Failed to persist parse error log: ${persistError.message}`);
      }
      
      return parseErrorResult;
    }
    
    const result = JSON.parse(jsonMatch[0]);
    
    console.error(`\nOrchestrator Decision:`);
    console.error(`  Action: ${result.action}`);
    console.error(`  My responsibilities: ${result.myResponsibilities?.length || 0}`);
    console.error(`  Delegations: ${result.delegations?.length || 0}`);
    if (result.searchesPerformed?.length > 0) {
      console.error(`  Searches performed: ${result.searchesPerformed.length}`);
    }
    
    if (result.delegations && result.delegations.length > 0) {
      console.error(`\n  Delegations:`);
      for (const d of result.delegations) {
        console.error(`    → ${d.targetProject}: ${d.taskTitle}`);
      }
    }
    
    const routeResult: RouteTaskResult = {
      success: true,
      action: result.action || 'proceed',
      myResponsibilities: result.myResponsibilities || [],
      delegations: result.delegations || [],
      suggestedImports: result.suggestedImports || [],
      architectureNotes: result.architectureNotes || '',
      warning: result.warning,
    };
    
    // Persist to SQLite for extension visualization
    try {
      saveOrchestratorLog({
        projectId: params.projectId,
        taskDescription: params.taskDescription,
        action: routeResult.action,
        myResponsibilities: routeResult.myResponsibilities,
        delegations: routeResult.delegations,
        suggestedImports: routeResult.suggestedImports,
        architectureNotes: routeResult.architectureNotes,
        searchesPerformed: result.searchesPerformed || [],
        warning: routeResult.warning,
        success: true,
        modelUsed: model,
      });
    } catch (persistError: any) {
      console.error(`Warning: Failed to persist orchestrator log: ${persistError.message}`);
    }
    
    return routeResult;
    
  } catch (error: any) {
    console.error(`Error in task routing: ${error.message}`);
    
    const errorResult: RouteTaskResult = {
      success: false,
      action: 'proceed',
      myResponsibilities: [],
      delegations: [],
      suggestedImports: [],
      architectureNotes: `Error analyzing task: ${error.message}`,
      warning: 'Orchestrator failed. Review task distribution manually.',
    };
    
    // Persist failed attempts too
    try {
      saveOrchestratorLog({
        projectId: params.projectId,
        taskDescription: params.taskDescription,
        action: 'proceed',
        myResponsibilities: [],
        delegations: [],
        suggestedImports: [],
        architectureNotes: errorResult.architectureNotes,
        searchesPerformed: [],
        warning: errorResult.warning,
        success: false,
        modelUsed: model,
      });
    } catch (persistError: any) {
      console.error(`Warning: Failed to persist error log: ${persistError.message}`);
    }
    
    return errorResult;
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
