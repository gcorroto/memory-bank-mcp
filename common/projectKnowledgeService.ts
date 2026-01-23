/**
 * @fileoverview Project Knowledge Service for Memory Bank
 * Generates and maintains structured project documentation using OpenAI Responses API
 * with reasoning models (gpt-5-mini) for intelligent analysis
 */

import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { ChunkRecord } from "./vectorStore.js";
import { countTokens } from "./chunker.js";

// ============================================
// Map-Reduce Configuration for Large Documents
// ============================================
// When content exceeds context window, use hierarchical summarization
// Uses tokens (via gpt-tokenizer) for accurate batching

/** 
 * Model context windows (tokens) - GPT-5.x family
 * Source: https://platform.openai.com/docs/models
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-5.2": 400000,      // 400K context
  "gpt-5-mini": 400000,   // 400K context  
  "gpt-5-nano": 400000,   // 400K context
  "gpt-5.1-codex": 400000,
  "gpt-5": 400000,
  "default": 128000,      // Fallback for unknown models
};

/** Maximum tokens per batch for map phase (safe margin under context window) */
const MAX_TOKENS_PER_BATCH = 80000;  // ~80K tokens per batch

/** Target summary length per batch in tokens */
const MAX_SUMMARY_TOKENS = 2000;

/** Threshold to trigger map-reduce summarization (tokens) */
const MAP_REDUCE_TOKEN_THRESHOLD = 100000;  // Trigger if input > 100K tokens

/** Maximum recursion depth for hierarchical summarization */
const MAX_RECURSION_DEPTH = 3;

/**
 * Gets the context window size for a model
 */
function getModelContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] || MODEL_CONTEXT_WINDOWS["default"];
}

/**
 * Prompt template for batch summarization (map phase)
 * Used to compress chunks before final document generation
 */
const BATCH_SUMMARY_PROMPT = `You are a code analysis assistant. Summarize the following code chunks concisely.

Focus on extracting:
1. **Main Components**: Classes, functions, modules and their purposes
2. **Patterns**: Design patterns, architectural decisions
3. **Dependencies**: Key imports and external dependencies
4. **Data Flow**: How data moves through the code

Be concise but comprehensive. Maximum 1000 words.

Code chunks to summarize:
{chunks}

Provide a structured summary in markdown format.`;

/**
 * Prompt for combining multiple batch summaries (reduce phase)
 */
const REDUCE_SUMMARY_PROMPT = `Combine the following code summaries into a single comprehensive summary.

Merge similar information, remove redundancies, and create a cohesive overview.
Maintain the structure: Components, Patterns, Dependencies, Data Flow.

Summaries to combine:
{summaries}

Provide a unified markdown summary.`;

/**
 * Types of project documents that can be generated
 */
export type ProjectDocType =
  | "projectBrief"
  | "productContext"
  | "systemPatterns"
  | "techContext"
  | "activeContext"
  | "progress";

/**
 * Document metadata
 */
export interface ProjectDocMetadata {
  type: ProjectDocType;
  lastGenerated: number;
  lastInputHash: string;
  reasoningTokens: number;
  outputTokens: number;
}

/**
 * Project configuration stored in metadata.json
 * Contains the source path and other project-level settings
 */
export interface ProjectConfig {
  sourcePath: string;         // Relative path to the project source (e.g., "../../workspaces/GRECOAI/Grec0AI_backend_py_langchain")
  lastIndexed?: number;       // Timestamp of last indexing
  projectName?: string;       // Optional human-readable project name
}

/**
 * Project document
 */
export interface ProjectDoc {
  type: ProjectDocType;
  content: string;
  metadata: ProjectDocMetadata;
}

/**
 * Result of document generation
 */
export interface GenerationResult {
  success: boolean;
  documentsGenerated: ProjectDocType[];
  documentsUpdated: ProjectDocType[];
  documentsSkipped: ProjectDocType[];
  totalReasoningTokens: number;
  totalOutputTokens: number;
  errors: string[];
}

/**
 * Options for the Project Knowledge Service
 */
export interface ProjectKnowledgeOptions {
  model?: string;              // Default: gpt-5-mini
  reasoningEffort?: "low" | "medium" | "high";  // Default: medium
  storagePath?: string;        // Default: .memorybank (base path, docs go to projects/{projectId}/docs/)
  enableSummary?: boolean;     // Default: true
  maxChunksPerDoc?: number;    // Default: 50
}

/**
 * Document definitions with prompts
 */
const DOC_DEFINITIONS: Record<ProjectDocType, {
  filename: string;
  title: string;
  description: string;
  promptTemplate: string;
}> = {
  projectBrief: {
    filename: "projectBrief.md",
    title: "Project Brief",
    description: "High-level description of the project, its purpose, and main goals",
    promptTemplate: `Analyze the following code chunks from a software project and generate a comprehensive Project Brief document.

The Project Brief should include:
1. **Project Name**: Infer from package.json, README, or main files
2. **Purpose**: What problem does this project solve?
3. **Main Features**: Key functionalities based on the code
4. **Target Audience**: Who would use this project?
5. **Project Type**: Library, CLI tool, web app, API, etc.

Code chunks to analyze:
{chunks}

Generate a well-structured markdown document. Be specific and base everything on the actual code provided.`,
  },
  
  productContext: {
    filename: "productContext.md",
    title: "Product Context",
    description: "Business perspective, user needs, and product requirements",
    promptTemplate: `Analyze the following code chunks and generate a Product Context document.

Focus on:
1. **User Stories**: What can users do with this product?
2. **Business Logic**: Key business rules implemented in the code
3. **User Interface**: If applicable, describe UI components and flows
4. **Integration Points**: External services, APIs, or systems it connects to
5. **Data Models**: Key entities and their relationships

Code chunks to analyze:
{chunks}

Generate a markdown document that would help a product manager understand this project.`,
  },
  
  systemPatterns: {
    filename: "systemPatterns.md",
    title: "System Patterns",
    description: "Architecture decisions, design patterns, and code organization",
    promptTemplate: `Analyze the following code chunks and document the System Patterns used.

Document:
1. **Architecture Style**: MVC, microservices, monolith, etc.
2. **Design Patterns**: Singleton, Factory, Observer, etc.
3. **Code Organization**: How files and modules are structured
4. **Naming Conventions**: Patterns in naming files, functions, classes
5. **Error Handling**: How errors are managed across the codebase
6. **State Management**: How state is handled (if applicable)

Code chunks to analyze:
{chunks}

Generate a technical markdown document for developers to understand the architectural decisions.`,
  },
  
  techContext: {
    filename: "techContext.md",
    title: "Technical Context",
    description: "Technology stack, dependencies, and development environment",
    promptTemplate: `Analyze the following code chunks and generate a Technical Context document.

Include:
1. **Programming Languages**: Languages used and their versions
2. **Frameworks**: Main frameworks (React, Express, etc.)
3. **Dependencies**: Key libraries and their purposes
4. **Development Tools**: Build tools, linters, formatters
5. **Runtime Requirements**: Node version, environment variables, etc.
6. **Database/Storage**: Data persistence solutions used
7. **Testing**: Testing frameworks and strategies

Code chunks to analyze:
{chunks}

Generate a markdown document useful for setting up the development environment.`,
  },
  
  activeContext: {
    filename: "activeContext.md",
    title: "Active Context",
    description: "Current development state, recent changes, and work in progress",
    promptTemplate: `Analyze the following recently modified code chunks and current session history to generate an Active Context document.

Document:
1. **Current Session Status**: Summary of actions performed in the current session (from history).
2. **Recent Changes**: What parts of the code were recently modified?
3. **Work in Progress**: Features or fixes that appear incomplete
4. **Hot Areas**: Parts of the code with high activity
5. **Potential Issues**: Code that might need attention (TODOs, FIXMEs)
6. **Current Focus**: What seems to be the current development focus?

Recent session history:
{sessionHistory}

Recent code chunks:
{chunks}

Generate a markdown document that helps developers understand the current state of development.`,
  },
  
  progress: {
    filename: "progress.md",
    title: "Progress Tracking",
    description: "Development progress, milestones, and change history",
    promptTemplate: `Based on the indexed code and previous progress data, generate a Progress document.

Include:
1. **Indexing Summary**: Files and chunks indexed
2. **Code Statistics**: Lines of code, languages breakdown
3. **Recent Activity**: Summary of recent indexing sessions
4. **Coverage**: What parts of the project are indexed
5. **Recommendations**: Suggestions for improving coverage

Current indexing data:
{chunks}

Previous progress data:
{previousProgress}

Generate a markdown document tracking project documentation progress.`,
  },
};

/**
 * Project Knowledge Service
 * Uses OpenAI Responses API with reasoning models to generate project documentation
 */
export class ProjectKnowledgeService {
  private client: OpenAI;
  private options: Required<ProjectKnowledgeOptions>;
  private metadataCacheByProject: Map<string, Map<ProjectDocType, ProjectDocMetadata>>;
  private projectConfigCache: Map<string, ProjectConfig>;
  
  constructor(apiKey: string, options?: ProjectKnowledgeOptions) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required for Project Knowledge Service");
    }
    
    this.client = new OpenAI({ apiKey });
    
    this.options = {
      model: options?.model || "gpt-5-mini",
      reasoningEffort: options?.reasoningEffort || "medium",
      storagePath: options?.storagePath || ".memorybank",
      enableSummary: options?.enableSummary !== undefined ? options.enableSummary : true,
      maxChunksPerDoc: options?.maxChunksPerDoc || 50,
    };
    
    this.metadataCacheByProject = new Map();
    this.projectConfigCache = new Map();
  }
  
  /**
   * Gets the docs path for a specific project
   */
  public getProjectDocsPath(projectId: string): string {
    return path.join(this.options.storagePath, "projects", projectId, "docs");
  }
  
  /**
   * Ensures the docs directory exists for a project
   */
  private ensureProjectDocsDirectory(projectId: string): string {
    const docsPath = this.getProjectDocsPath(projectId);
    if (!fs.existsSync(docsPath)) {
      fs.mkdirSync(docsPath, { recursive: true });
      console.error(`Created project docs directory: ${docsPath}`);
    }
    return docsPath;
  }
  
  /**
   * Loads metadata for a specific project
   */
  private loadProjectMetadata(projectId: string): Map<ProjectDocType, ProjectDocMetadata> {
    if (this.metadataCacheByProject.has(projectId)) {
      return this.metadataCacheByProject.get(projectId)!;
    }
    
    const docsPath = this.getProjectDocsPath(projectId);
    const metadataPath = path.join(docsPath, "metadata.json");
    const cache = new Map<ProjectDocType, ProjectDocMetadata>();
    
    try {
      if (fs.existsSync(metadataPath)) {
        const data = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        
        for (const [type, metadata] of Object.entries(data)) {
          // Skip special keys like _projectConfig
          if (type.startsWith('_')) {
            if (type === '_projectConfig') {
              this.projectConfigCache.set(projectId, metadata as ProjectConfig);
            }
            continue;
          }
          cache.set(type as ProjectDocType, metadata as ProjectDocMetadata);
        }
        
        console.error(`Loaded metadata for ${cache.size} documents (project: ${projectId})`);
      }
    } catch (error) {
      console.error(`Warning: Could not load project docs metadata for ${projectId}: ${error}`);
    }
    
    this.metadataCacheByProject.set(projectId, cache);
    return cache;
  }
  
  /**
   * Saves metadata for a specific project
   */
  private saveProjectMetadata(projectId: string): void {
    const docsPath = this.ensureProjectDocsDirectory(projectId);
    const metadataPath = path.join(docsPath, "metadata.json");
    const cache = this.metadataCacheByProject.get(projectId);
    
    if (!cache) return;
    
    try {
      const data: Record<string, ProjectDocMetadata | ProjectConfig> = {};
      
      // Save project config first if exists
      const projectConfig = this.projectConfigCache.get(projectId);
      if (projectConfig) {
        data['_projectConfig'] = projectConfig;
      }
      
      // Save document metadata
      for (const [type, metadata] of cache) {
        data[type] = metadata;
      }
      
      fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Warning: Could not save project docs metadata for ${projectId}: ${error}`);
    }
  }
  
  /**
   * Gets the project configuration (sourcePath, etc.)
   */
  public getProjectConfig(projectId: string): ProjectConfig | null {
    // Ensure metadata is loaded
    this.loadProjectMetadata(projectId);
    return this.projectConfigCache.get(projectId) || null;
  }
  
  /**
   * Updates the project configuration (sourcePath, etc.)
   */
  public updateProjectConfig(projectId: string, config: Partial<ProjectConfig>): void {
    // Ensure metadata is loaded
    this.loadProjectMetadata(projectId);
    
    const existingConfig = this.projectConfigCache.get(projectId) || { sourcePath: '' };
    const newConfig: ProjectConfig = {
      ...existingConfig,
      ...config,
    };
    
    this.projectConfigCache.set(projectId, newConfig);
    this.saveProjectMetadata(projectId);
    
    console.error(`Updated project config for ${projectId}: sourcePath=${newConfig.sourcePath}`);
  }
  
  /**
   * Generates a hash of input chunks for change detection
   */
  private hashChunks(chunks: ChunkRecord[]): string {
    const content = chunks
      .map(c => `${c.file_path}:${c.file_hash}`)
      .sort()
      .join("|");
    
    return crypto.createHash("md5").update(content).digest("hex");
  }

  private hashString(str: string): string {
    return crypto.createHash("md5").update(str).digest("hex");
  }
  
  /**
   * Prepares chunks for inclusion in a prompt
   * Uses Map-Reduce summarization if content exceeds context window threshold
   */
  private async prepareChunksForPrompt(
    chunks: ChunkRecord[], 
    maxChunks: number
  ): Promise<{ text: string; usedMapReduce: boolean; mapReduceTokens: number }> {
    // Sort by relevance (prioritize certain file types)
    const priorityFiles = ["package.json", "readme", "index", "main", "app"];
    
    const sorted = [...chunks].sort((a, b) => {
      const aName = path.basename(a.file_path).toLowerCase();
      const bName = path.basename(b.file_path).toLowerCase();
      
      const aPriority = priorityFiles.findIndex(p => aName.includes(p));
      const bPriority = priorityFiles.findIndex(p => bName.includes(p));
      
      if (aPriority !== -1 && bPriority === -1) return -1;
      if (aPriority === -1 && bPriority !== -1) return 1;
      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      
      return 0;
    });
    
    // Take top chunks
    const selected = sorted.slice(0, maxChunks);
    
    // Format for prompt
    const formatted = selected.map(chunk => {
      return `--- File: ${chunk.file_path} (${chunk.language}) [${chunk.chunk_type}${chunk.name ? `: ${chunk.name}` : ""}] ---
${chunk.content}
---`;
    }).join("\n\n");
    
    // Count tokens using gpt-tokenizer (accurate for GPT-5.x)
    const tokenCount = countTokens(formatted);
    
    // Check if content exceeds token threshold for map-reduce
    if (tokenCount > MAP_REDUCE_TOKEN_THRESHOLD) {
      console.error(`\n🔄 Content exceeds token threshold (${tokenCount.toLocaleString()} > ${MAP_REDUCE_TOKEN_THRESHOLD.toLocaleString()} tokens)`);
      console.error(`   Initiating Map-Reduce summarization for ${selected.length} chunks...`);
      
      const mapReduceResult = await this.summarizeChunksMapReduce(selected);
      
      const resultTokens = countTokens(mapReduceResult.content);
      console.error(`   Map-Reduce complete: ${resultTokens.toLocaleString()} tokens output, ${mapReduceResult.totalTokens.toLocaleString()} tokens used in processing\n`);
      
      return {
        text: mapReduceResult.content,
        usedMapReduce: true,
        mapReduceTokens: mapReduceResult.totalTokens,
      };
    }
    
    return {
      text: formatted,
      usedMapReduce: false,
      mapReduceTokens: 0,
    };
  }
  
  /**
   * Calls the OpenAI Responses API with reasoning
   */
  private async callResponsesAPI(prompt: string): Promise<{
    content: string;
    reasoningTokens: number;
    outputTokens: number;
    summary?: string;
  }> {
    try {
      // Use the Responses API with reasoning
      const response = await (this.client as any).responses.create({
        model: this.options.model,
        reasoning: {
          effort: this.options.reasoningEffort,
          summary: this.options.enableSummary ? "auto" : undefined,
        },
        input: [
          {
            role: "user",
            content: prompt,
          },
        ],
        max_output_tokens: 16000,
      });
      
      // Extract content and usage
      let content = "";
      let summary = "";
      
      for (const item of response.output || []) {
        if (item.type === "message" && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === "output_text") {
              content += contentItem.text;
            }
          }
        } else if (item.type === "reasoning" && item.summary) {
          for (const summaryItem of item.summary) {
            if (summaryItem.type === "summary_text") {
              summary += summaryItem.text;
            }
          }
        }
      }
      
      const reasoningTokens = response.usage?.output_tokens_details?.reasoning_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      
      return {
        content,
        reasoningTokens,
        outputTokens,
        summary: summary || undefined,
      };
    } catch (error: any) {
      // Fallback to Chat Completions API if Responses API is not available
      if (error?.status === 404 || error?.code === "model_not_found") {
        console.error("Responses API not available, falling back to Chat Completions API");
        return this.callChatCompletionsAPI(prompt);
      }
      throw error;
    }
  }
  
  /**
   * Fallback to Chat Completions API
   */
  private async callChatCompletionsAPI(prompt: string): Promise<{
    content: string;
    reasoningTokens: number;
    outputTokens: number;
    summary?: string;
  }> {
    // Use a standard model as fallback
    const fallbackModel = "gpt-4o";
    
    const response = await this.client.chat.completions.create({
      model: fallbackModel,
      messages: [
        {
          role: "system",
          content: "You are a technical documentation expert. Generate well-structured markdown documentation based on code analysis.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 8000,
    });
    
    return {
      content: response.choices[0]?.message?.content || "",
      reasoningTokens: 0, // Chat API doesn't have reasoning tokens
      outputTokens: response.usage?.completion_tokens || 0,
    };
  }
  
  // ============================================
  // Map-Reduce Summarization Methods
  // ============================================
  
  /**
   * Summarizes a single batch of chunks (map phase)
   * @param chunks Chunks to summarize
   * @param batchIndex Batch number for logging
   * @param totalBatches Total number of batches
   * @returns Summary text and token usage
   */
  private async summarizeBatch(
    chunks: ChunkRecord[],
    batchIndex: number,
    totalBatches: number
  ): Promise<{ summary: string; tokens: number }> {
    // Format chunks for the prompt
    const chunksText = chunks.map(chunk => {
      return `--- ${chunk.file_path} (${chunk.language}) ---\n${chunk.content}\n---`;
    }).join("\n\n");
    
    const inputTokens = countTokens(chunksText);
    const prompt = BATCH_SUMMARY_PROMPT.replace("{chunks}", chunksText);
    
    console.error(`  [Map ${batchIndex + 1}/${totalBatches}] Summarizing ${chunks.length} chunks (${inputTokens.toLocaleString()} tokens)...`);
    
    try {
      const result = await this.callResponsesAPI(prompt);
      console.error(`  [Map ${batchIndex + 1}/${totalBatches}] Done (${result.outputTokens.toLocaleString()} output tokens)`);
      
      return {
        summary: result.content,
        tokens: result.outputTokens + result.reasoningTokens,
      };
    } catch (error: any) {
      console.error(`  [Map ${batchIndex + 1}/${totalBatches}] Error: ${error.message}`);
      // Return a minimal summary on error
      return {
        summary: `[Batch ${batchIndex + 1} summary failed: ${error.message}]`,
        tokens: 0,
      };
    }
  }
  
  /**
   * Combines multiple summaries into one (reduce phase)
   * @param summaries Array of batch summaries
   * @returns Combined summary
   */
  private async combineSummaries(summaries: string[]): Promise<{ summary: string; tokens: number }> {
    const summariesText = summaries.map((s, i) => `### Batch ${i + 1} Summary\n${s}`).join("\n\n");
    const inputTokens = countTokens(summariesText);
    const prompt = REDUCE_SUMMARY_PROMPT.replace("{summaries}", summariesText);
    
    console.error(`  [Reduce] Combining ${summaries.length} summaries (${inputTokens.toLocaleString()} tokens)...`);
    
    try {
      const result = await this.callResponsesAPI(prompt);
      console.error(`  [Reduce] Done (${result.outputTokens.toLocaleString()} output tokens)`);
      
      return {
        summary: result.content,
        tokens: result.outputTokens + result.reasoningTokens,
      };
    } catch (error: any) {
      console.error(`  [Reduce] Error: ${error.message}`);
      // Fallback: just concatenate summaries
      return {
        summary: summaries.join("\n\n---\n\n"),
        tokens: 0,
      };
    }
  }
  
  /**
   * Map-Reduce summarization for large chunk sets
   * Recursively summarizes chunks in batches until content fits context window
   * Uses token counting (via gpt-tokenizer) for accurate batching
   * 
   * @param chunks All chunks to process
   * @param depth Current recursion depth
   * @returns Summarized content that fits within context limits
   */
  private async summarizeChunksMapReduce(
    chunks: ChunkRecord[],
    depth: number = 0
  ): Promise<{ content: string; totalTokens: number }> {
    const indent = "  ".repeat(depth);
    const totalInputTokens = chunks.reduce((sum, c) => sum + countTokens(c.content), 0);
    console.error(`${indent}[Map-Reduce Depth ${depth}] Processing ${chunks.length} chunks (${totalInputTokens.toLocaleString()} tokens)...`);
    
    // Safety check for recursion depth
    if (depth >= MAX_RECURSION_DEPTH) {
      console.error(`${indent}[Map-Reduce] Max recursion depth reached, truncating...`);
      // Take first N chunks that fit within token limit
      let truncatedTokens = 0;
      const truncated: ChunkRecord[] = [];
      for (const chunk of chunks) {
        const chunkTokens = countTokens(chunk.content);
        if (truncatedTokens + chunkTokens > MAX_TOKENS_PER_BATCH) break;
        truncated.push(chunk);
        truncatedTokens += chunkTokens;
      }
      const content = truncated.map(c => `${c.file_path}: ${c.content.slice(0, 500)}...`).join("\n");
      return { content, totalTokens: 0 };
    }
    
    // Split chunks into batches based on TOKEN count (not characters)
    const batches: ChunkRecord[][] = [];
    let currentBatch: ChunkRecord[] = [];
    let currentTokens = 0;
    
    for (const chunk of chunks) {
      const chunkTokens = countTokens(chunk.content) + countTokens(chunk.file_path) + 20; // overhead for formatting
      
      if (currentTokens + chunkTokens > MAX_TOKENS_PER_BATCH && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokens = 0;
      }
      
      currentBatch.push(chunk);
      currentTokens += chunkTokens;
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    console.error(`${indent}[Map-Reduce Depth ${depth}] Split into ${batches.length} batches (max ${MAX_TOKENS_PER_BATCH.toLocaleString()} tokens/batch)`);
    
    // Map phase: summarize each batch in parallel
    let totalTokens = 0;
    const summaryPromises = batches.map((batch, index) => 
      this.summarizeBatch(batch, index, batches.length)
    );
    
    const summaryResults = await Promise.all(summaryPromises);
    const summaries = summaryResults.map(r => r.summary);
    totalTokens += summaryResults.reduce((sum, r) => sum + r.tokens, 0);
    
    // Check if combined summaries still exceed token threshold
    const combinedText = summaries.join("\n\n");
    const combinedTokens = countTokens(combinedText);
    console.error(`${indent}[Map-Reduce Depth ${depth}] Combined summaries: ${combinedTokens.toLocaleString()} tokens`);
    
    if (combinedTokens > MAP_REDUCE_TOKEN_THRESHOLD && depth < MAX_RECURSION_DEPTH - 1) {
      // Recursively summarize the summaries
      console.error(`${indent}[Map-Reduce Depth ${depth}] Still exceeds ${MAP_REDUCE_TOKEN_THRESHOLD.toLocaleString()} tokens, recursing...`);
      
      // Convert summaries to pseudo-chunks for recursive processing
      const summaryChunks: ChunkRecord[] = summaries.map((summary, i) => ({
        id: `summary-${depth}-${i}`,
        vector: [], // Empty vector - not used for map-reduce
        file_path: `batch-${i}-summary`,
        file_hash: "",
        content: summary,
        language: "markdown",
        chunk_type: "summary",
        start_line: 0,
        end_line: 0,
        timestamp: Date.now(),
        project_id: "",
      }));
      
      const recursiveResult = await this.summarizeChunksMapReduce(summaryChunks, depth + 1);
      totalTokens += recursiveResult.totalTokens;
      
      return { content: recursiveResult.content, totalTokens };
    }
    
    // Reduce phase: combine all summaries
    if (summaries.length > 1) {
      const reduceResult = await this.combineSummaries(summaries);
      totalTokens += reduceResult.tokens;
      return { content: reduceResult.summary, totalTokens };
    }
    
    return { content: summaries[0] || "", totalTokens };
  }
  
  /**
   * Generates a single document for a specific project
   */
  async generateDocument(
    projectId: string,
    type: ProjectDocType,
    chunks: ChunkRecord[],
    force: boolean = false,
    previousProgress?: string,
    sessionHistory?: string
  ): Promise<ProjectDoc | null> {
    const definition = DOC_DEFINITIONS[type];
    const inputHash = this.hashChunks(chunks) + (sessionHistory ? this.hashString(sessionHistory) : 0);
    const docsPath = this.ensureProjectDocsDirectory(projectId);
    const metadataCache = this.loadProjectMetadata(projectId);
    
    // Check if regeneration is needed
    const existingMetadata = metadataCache.get(type);
    
    if (!force && existingMetadata && existingMetadata.lastInputHash === inputHash) {
      console.error(`Skipping ${type}: No changes detected`);
      return null;
    }
    
    console.error(`Generating document: ${definition.title} (project: ${projectId})`);
    console.error(`  Input chunks: ${chunks.length}`);
    
    // Prepare prompt (may trigger Map-Reduce if content too large)
    const preparedChunks = await this.prepareChunksForPrompt(chunks, this.options.maxChunksPerDoc);
    console.error(`  Chunks text length: ${preparedChunks.text.length} chars${preparedChunks.usedMapReduce ? ' (after Map-Reduce)' : ''}`);
    
    let prompt = definition.promptTemplate.replace("{chunks}", preparedChunks.text);
    
    if (sessionHistory) {
      prompt = prompt.replace("{sessionHistory}", sessionHistory);
    } else {
      prompt = prompt.replace("{sessionHistory}", "No recent session history available.");
    }

    if (type === "progress" && previousProgress) {
      prompt = prompt.replace("{previousProgress}", previousProgress);
    } else {
      prompt = prompt.replace("{previousProgress}", "No previous progress data available.");
    }
    
    // Call API
    const result = await this.callResponsesAPI(prompt);
    
    // Include map-reduce tokens in the total
    const totalReasoningTokens = result.reasoningTokens + (preparedChunks.usedMapReduce ? preparedChunks.mapReduceTokens : 0);
    
    // Create document
    const doc: ProjectDoc = {
      type,
      content: `# ${definition.title}\n\n${result.content}`,
      metadata: {
        type,
        lastGenerated: Date.now(),
        lastInputHash: inputHash,
        reasoningTokens: totalReasoningTokens,
        outputTokens: result.outputTokens,
      },
    };
    
    // Save document
    const docPath = path.join(docsPath, definition.filename);
    fs.writeFileSync(docPath, doc.content);
    
    // Update metadata
    metadataCache.set(type, doc.metadata);
    this.saveProjectMetadata(projectId);
    
    const mapReduceNote = preparedChunks.usedMapReduce ? ` [Map-Reduce: ${preparedChunks.mapReduceTokens} tokens]` : '';
    console.error(`Generated ${definition.title} (${result.reasoningTokens} reasoning + ${result.outputTokens} output tokens)${mapReduceNote}`);
    
    return doc;
  }
  
  /**
   * Generates all project documents (in parallel for speed)
   */
  async generateAllDocuments(
    projectId: string,
    chunks: ChunkRecord[],
    force: boolean = false,
    sessionHistory?: string
  ): Promise<GenerationResult> {
    const result: GenerationResult = {
      success: true,
      documentsGenerated: [],
      documentsUpdated: [],
      documentsSkipped: [],
      totalReasoningTokens: 0,
      totalOutputTokens: 0,
      errors: [],
    };
    
    const docsPath = this.ensureProjectDocsDirectory(projectId);
    const metadataCache = this.loadProjectMetadata(projectId);
    
    // Get previous progress if exists (read before parallel generation)
    let previousProgress: string | undefined;
    const progressPath = path.join(docsPath, "progress.md");
    if (fs.existsSync(progressPath)) {
      previousProgress = fs.readFileSync(progressPath, "utf-8");
    }
    
    // Prepare chunks for activeContext (recent only)
    const recentChunks = [...chunks]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.min(30, chunks.length));
    
    // All document types to generate
    const docTypes: ProjectDocType[] = [
      "techContext",
      "projectBrief",
      "systemPatterns",
      "productContext",
      "activeContext",
      "progress",
    ];
    
    console.error(`\n🚀 Generating ${docTypes.length} documents in PARALLEL for project: ${projectId}...`);
    
    // Generate all documents in parallel
    const generationPromises = docTypes.map(async (docType) => {
      try {
        // For activeContext, use only recent chunks
        const docChunks = docType === "activeContext" ? recentChunks : chunks;
        
        const existingMetadata = metadataCache.get(docType);
        const isNew = !existingMetadata;
        
        const doc = await this.generateDocument(
          projectId,
          docType,
          docChunks,
          force,
          docType === "progress" ? previousProgress : undefined,
          sessionHistory
        );
        
        return { docType, doc, isNew, error: null };
      } catch (error) {
        return { docType, doc: null, isNew: false, error: error as Error };
      }
    });
    
    // Wait for all documents to complete
    const results = await Promise.all(generationPromises);
    
    // Process results
    for (const { docType, doc, isNew, error } of results) {
      if (error) {
        console.error(`Error generating ${docType}: ${error.message}`);
        result.errors.push(`${docType}: ${error.message}`);
        result.success = false;
        continue;
      }
      
      if (doc) {
        result.totalReasoningTokens += doc.metadata.reasoningTokens;
        result.totalOutputTokens += doc.metadata.outputTokens;
        
        if (isNew) {
          result.documentsGenerated.push(docType);
        } else {
          result.documentsUpdated.push(docType);
        }
      } else {
        result.documentsSkipped.push(docType);
      }
    }
    
    console.error(`\n✅ Parallel generation complete: ${result.documentsGenerated.length + result.documentsUpdated.length} docs, ${result.totalReasoningTokens} reasoning + ${result.totalOutputTokens} output tokens`);
    
    return result;
  }
  
  /**
   * Updates only documents affected by changes
   */
  async updateDocuments(
    projectId: string,
    chunks: ChunkRecord[],
    changedFiles: string[]
  ): Promise<GenerationResult> {
    console.error(`updateDocuments called for project ${projectId} with ${chunks.length} chunks and ${changedFiles.length} changed files`);
    
    // Debug: show first chunk if exists
    if (chunks.length > 0) {
      const firstChunk = chunks[0];
      console.error(`First chunk: ${firstChunk.file_path}, content length: ${firstChunk.content?.length || 0}`);
    }
    
    const docsPath = this.ensureProjectDocsDirectory(projectId);
    const metadataCache = this.loadProjectMetadata(projectId);
    
    // Determine which documents need updating based on changed files
    const docsToUpdate: ProjectDocType[] = [];
    
    // Always update activeContext and progress when there are changes
    docsToUpdate.push("activeContext", "progress");
    
    // Check if config/package files changed -> update techContext
    const configPatterns = ["package.json", "tsconfig", ".env", "config"];
    if (changedFiles.some(f => configPatterns.some(p => f.toLowerCase().includes(p)))) {
      docsToUpdate.push("techContext");
    }
    
    // Check if main entry files changed -> update projectBrief
    const entryPatterns = ["index", "main", "app", "readme"];
    if (changedFiles.some(f => entryPatterns.some(p => f.toLowerCase().includes(p)))) {
      docsToUpdate.push("projectBrief");
    }
    
    // If significant code changes, update systemPatterns and productContext
    if (changedFiles.length > 5) {
      docsToUpdate.push("systemPatterns", "productContext");
    }
    
    // Generate only the docs that need updating
    const result: GenerationResult = {
      success: true,
      documentsGenerated: [],
      documentsUpdated: [],
      documentsSkipped: [],
      totalReasoningTokens: 0,
      totalOutputTokens: 0,
      errors: [],
    };
    
    // Get previous progress (read before parallel generation)
    let previousProgress: string | undefined;
    const progressPath = path.join(docsPath, "progress.md");
    if (fs.existsSync(progressPath)) {
      previousProgress = fs.readFileSync(progressPath, "utf-8");
    }
    
    // Prepare recent chunks for activeContext
    const recentChunks = [...chunks]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.min(30, chunks.length));
    
    console.error(`\n🚀 Updating ${docsToUpdate.length} documents in PARALLEL for project: ${projectId}...`);
    
    // Generate docs in parallel
    const updatePromises = docsToUpdate.map(async (docType) => {
      try {
        const docChunks = docType === "activeContext" ? recentChunks : chunks;
        
        const existingMetadata = metadataCache.get(docType);
        const isNew = !existingMetadata;
        
        const doc = await this.generateDocument(
          projectId,
          docType,
          docChunks,
          true, // Force update for changed docs
          docType === "progress" ? previousProgress : undefined
        );
        
        return { docType, doc, isNew, error: null };
      } catch (error) {
        return { docType, doc: null, isNew: false, error: error as Error };
      }
    });
    
    // Wait for all
    const updateResults = await Promise.all(updatePromises);
    
    // Process results
    for (const { docType, doc, isNew, error } of updateResults) {
      if (error) {
        console.error(`Error updating ${docType}: ${error.message}`);
        result.errors.push(`${docType}: ${error.message}`);
        result.success = false;
        continue;
      }
      
      if (doc) {
        result.totalReasoningTokens += doc.metadata.reasoningTokens;
        result.totalOutputTokens += doc.metadata.outputTokens;
        
        if (isNew) {
          result.documentsGenerated.push(docType);
        } else {
          result.documentsUpdated.push(docType);
        }
      } else {
        result.documentsSkipped.push(docType);
      }
    }
    
    // Mark docs we didn't update as skipped
    const allDocTypes: ProjectDocType[] = [
      "projectBrief", "productContext", "systemPatterns",
      "techContext", "activeContext", "progress"
    ];
    
    for (const docType of allDocTypes) {
      if (!docsToUpdate.includes(docType)) {
        result.documentsSkipped.push(docType);
      }
    }
    
    return result;
  }
  
  /**
   * Reads a project document for a specific project
   */
  getDocument(projectId: string, type: ProjectDocType): ProjectDoc | null {
    const definition = DOC_DEFINITIONS[type];
    const docsPath = this.getProjectDocsPath(projectId);
    const docPath = path.join(docsPath, definition.filename);
    
    if (!fs.existsSync(docPath)) {
      return null;
    }
    
    const content = fs.readFileSync(docPath, "utf-8");
    const metadataCache = this.loadProjectMetadata(projectId);
    const metadata = metadataCache.get(type);
    
    return {
      type,
      content,
      metadata: metadata || {
        type,
        lastGenerated: 0,
        lastInputHash: "",
        reasoningTokens: 0,
        outputTokens: 0,
      },
    };
  }
  
  /**
   * Reads all project documents for a specific project
   */
  getAllDocuments(projectId: string): ProjectDoc[] {
    const docs: ProjectDoc[] = [];
    
    for (const type of Object.keys(DOC_DEFINITIONS) as ProjectDocType[]) {
      const doc = this.getDocument(projectId, type);
      if (doc) {
        docs.push(doc);
      }
    }
    
    return docs;
  }
  
  /**
   * Gets a summary of all documents (useful for context loading)
   */
  getDocumentsSummary(projectId: string): string {
    const docs = this.getAllDocuments(projectId);
    
    if (docs.length === 0) {
      return "No project documentation has been generated yet. Use memorybank_generate_project_docs to generate documentation.";
    }
    
    let summary = "# Project Documentation Summary\n\n";
    
    for (const doc of docs) {
      const definition = DOC_DEFINITIONS[doc.type];
      const lastGenerated = doc.metadata.lastGenerated
        ? new Date(doc.metadata.lastGenerated).toISOString()
        : "Unknown";
      
      summary += `## ${definition.title}\n`;
      summary += `*Last generated: ${lastGenerated}*\n\n`;
      
      // Extract first few paragraphs as preview
      const lines = doc.content.split("\n").filter(l => l.trim());
      const preview = lines.slice(1, 6).join("\n"); // Skip title, take 5 lines
      summary += preview + "\n\n---\n\n";
    }
    
    return summary;
  }
  
  /**
   * Checks if documents exist for a project
   */
  hasDocuments(projectId: string): boolean {
    const metadataCache = this.loadProjectMetadata(projectId);
    return metadataCache.size > 0;
  }
  
  /**
   * Gets statistics about generated documents for a project
   */
  getStats(projectId: string): {
    documentCount: number;
    totalReasoningTokens: number;
    totalOutputTokens: number;
    lastGenerated?: Date;
    documents: Record<ProjectDocType, { exists: boolean; lastGenerated?: Date }>;
  } {
    const metadataCache = this.loadProjectMetadata(projectId);
    let totalReasoningTokens = 0;
    let totalOutputTokens = 0;
    let lastGenerated = 0;
    
    const documents: Record<string, { exists: boolean; lastGenerated?: Date }> = {};
    
    for (const type of Object.keys(DOC_DEFINITIONS) as ProjectDocType[]) {
      const metadata = metadataCache.get(type);
      
      documents[type] = {
        exists: !!metadata,
        lastGenerated: metadata ? new Date(metadata.lastGenerated) : undefined,
      };
      
      if (metadata) {
        totalReasoningTokens += metadata.reasoningTokens;
        totalOutputTokens += metadata.outputTokens;
        
        if (metadata.lastGenerated > lastGenerated) {
          lastGenerated = metadata.lastGenerated;
        }
      }
    }
    
    return {
      documentCount: metadataCache.size,
      totalReasoningTokens,
      totalOutputTokens,
      lastGenerated: lastGenerated > 0 ? new Date(lastGenerated) : undefined,
      documents: documents as Record<ProjectDocType, { exists: boolean; lastGenerated?: Date }>,
    };
  }
  
  // ==========================================
  // Project-specific document methods (for MCP Resources)
  // ==========================================
  
  /**
   * Checks if a project's Memory Bank is initialized
   */
  isProjectInitialized(projectId: string): boolean {
    const docsPath = this.getProjectDocsPath(projectId);
    return fs.existsSync(docsPath);
  }
  
  /**
   * Reads a specific document for a project (for MCP Resources)
   */
  getProjectDocument(projectId: string, docName: string): string | null {
    const docsPath = this.getProjectDocsPath(projectId);
    
    // Map document names to filenames
    const docMap: Record<string, string> = {
      "projectBrief": "projectBrief.md",
      "productContext": "productContext.md",
      "systemPatterns": "systemPatterns.md",
      "techContext": "techContext.md",
      "activeContext": "activeContext.md",
      "progress": "progress.md",
      "decisionLog": "decisionLog.md",
      "decisions": "decisionLog.md", // Alias
      "active": "activeContext.md", // Alias
      "context": "projectBrief.md", // Alias - returns project brief
      "patterns": "systemPatterns.md", // Alias
      "brief": "projectBrief.md", // Alias
      "tech": "techContext.md", // Alias
      "product": "productContext.md", // Alias
    };
    
    const filename = docMap[docName] || `${docName}.md`;
    const filePath = path.join(docsPath, filename);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    return fs.readFileSync(filePath, "utf-8");
  }
  
  /**
   * Gets combined project context (projectBrief + techContext)
   */
  getProjectContext(projectId: string): string | null {
    const brief = this.getProjectDocument(projectId, "projectBrief");
    const tech = this.getProjectDocument(projectId, "techContext");
    
    if (!brief && !tech) return null;
    
    let content = "# Project Context\n\n";
    
    if (brief) {
      content += brief + "\n\n---\n\n";
    }
    
    if (tech) {
      content += tech;
    }
    
    return content;
  }
  
  /**
   * Lists all available documents for a project
   */
  listProjectDocuments(projectId: string): string[] {
    const docsPath = this.getProjectDocsPath(projectId);
    
    if (!fs.existsSync(docsPath)) {
      return [];
    }
    
    const files = fs.readdirSync(docsPath);
    return files.filter(f => f.endsWith(".md"));
  }

  // ==========================================
  // Project Summary Generation (for Registry)
  // ==========================================

  /**
   * Generates a structured summary of the project for the global registry.
   * Extracts responsibilities, ownership patterns, and project type from projectBrief.
   * This is called automatically after generateAllDocuments.
   */
  async generateProjectSummary(projectId: string): Promise<{
    description: string;
    responsibilities: string[];
    owns: string[];
    projectType: string;
    exports?: string;
    keywords: string[];
  } | null> {
    const projectBrief = this.getDocument(projectId, "projectBrief");
    const techContext = this.getDocument(projectId, "techContext");
    
    if (!projectBrief) {
      console.error(`Cannot generate project summary: projectBrief not found for ${projectId}`);
      return null;
    }
    
    console.error(`Generating project summary for registry: ${projectId}`);
    
    const prompt = `Analyze the following project documentation and extract a structured summary.

PROJECT BRIEF:
${projectBrief.content}

${techContext ? `TECHNICAL CONTEXT:\n${techContext.content}` : ''}

Extract the following information in JSON format:
{
  "description": "A concise 1-2 sentence description of what this project does",
  "responsibilities": ["COMPLETE list of ALL things this project is responsible for - do NOT limit, include everything"],
  "owns": ["ALL file patterns or directories this project owns, e.g., '*DTO.ts', 'services/', 'controllers/'"],
  "projectType": "One of: api, library, frontend, backend, cli, service, monorepo, fullstack",
  "exports": "Package name if it's a library (e.g., '@company/lib-dtos'), or null if not applicable",
  "keywords": ["Relevant keywords describing this project"]
}

IMPORTANT:
- responsibilities MUST be COMPLETE - list ALL responsibilities, not just 3-5. Missing responsibilities will cause the orchestrator to fail at delegating tasks correctly.
- For "owns", include ALL file patterns and directories that ONLY this project should create/modify
- If it's a library, identify what it exports/provides to other projects
- Be thorough - incomplete information leads to incorrect task routing

Respond ONLY with the JSON object, no markdown or explanation.`;

    try {
      const result = await this.callResponsesAPI(prompt);
      
      // Parse JSON response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`Failed to parse project summary JSON for ${projectId}`);
        return null;
      }
      
      const summary = JSON.parse(jsonMatch[0]);
      
      console.error(`Project summary generated for ${projectId}:`);
      console.error(`  - Type: ${summary.projectType}`);
      console.error(`  - Responsibilities: ${summary.responsibilities?.length || 0}`);
      console.error(`  - Owns: ${summary.owns?.length || 0}`);
      
      return {
        description: summary.description || '',
        responsibilities: summary.responsibilities || [],
        owns: summary.owns || [],
        projectType: summary.projectType || 'unknown',
        exports: summary.exports || undefined,
        keywords: summary.keywords || [],
      };
    } catch (error) {
      console.error(`Error generating project summary: ${error}`);
      return null;
    }
  }
}

/**
 * Creates a Project Knowledge Service from environment variables
 */
export function createProjectKnowledgeService(): ProjectKnowledgeService {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required. Get your API key from https://platform.openai.com/api-keys"
    );
  }
  
  const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
  
  const options: ProjectKnowledgeOptions = {
    model: process.env.MEMORYBANK_REASONING_MODEL || "gpt-5-mini",
    reasoningEffort: (process.env.MEMORYBANK_REASONING_EFFORT as "low" | "medium" | "high") || "medium",
    storagePath: storagePath,
    enableSummary: true,
  };
  
  return new ProjectKnowledgeService(apiKey, options);
}
