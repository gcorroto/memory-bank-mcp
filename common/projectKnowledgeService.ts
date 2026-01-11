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
    promptTemplate: `Analyze the following recently modified code chunks and generate an Active Context document.

Document:
1. **Recent Changes**: What parts of the code were recently modified?
2. **Work in Progress**: Features or fixes that appear incomplete
3. **Hot Areas**: Parts of the code with high activity
4. **Potential Issues**: Code that might need attention (TODOs, FIXMEs)
5. **Current Focus**: What seems to be the current development focus?

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
  
  /**
   * Prepares chunks for inclusion in a prompt
   */
  private prepareChunksForPrompt(chunks: ChunkRecord[], maxChunks: number): string {
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
    return selected.map(chunk => {
      return `--- File: ${chunk.file_path} (${chunk.language}) [${chunk.chunk_type}${chunk.name ? `: ${chunk.name}` : ""}] ---
${chunk.content}
---`;
    }).join("\n\n");
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
  
  /**
   * Generates a single document for a specific project
   */
  async generateDocument(
    projectId: string,
    type: ProjectDocType,
    chunks: ChunkRecord[],
    force: boolean = false,
    previousProgress?: string
  ): Promise<ProjectDoc | null> {
    const definition = DOC_DEFINITIONS[type];
    const inputHash = this.hashChunks(chunks);
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
    
    // Prepare prompt
    const chunksText = this.prepareChunksForPrompt(chunks, this.options.maxChunksPerDoc);
    console.error(`  Chunks text length: ${chunksText.length} chars`);
    
    let prompt = definition.promptTemplate.replace("{chunks}", chunksText);
    
    if (type === "progress" && previousProgress) {
      prompt = prompt.replace("{previousProgress}", previousProgress);
    } else {
      prompt = prompt.replace("{previousProgress}", "No previous progress data available.");
    }
    
    // Call API
    const result = await this.callResponsesAPI(prompt);
    
    // Create document
    const doc: ProjectDoc = {
      type,
      content: `# ${definition.title}\n\n${result.content}`,
      metadata: {
        type,
        lastGenerated: Date.now(),
        lastInputHash: inputHash,
        reasoningTokens: result.reasoningTokens,
        outputTokens: result.outputTokens,
      },
    };
    
    // Save document
    const docPath = path.join(docsPath, definition.filename);
    fs.writeFileSync(docPath, doc.content);
    
    // Update metadata
    metadataCache.set(type, doc.metadata);
    this.saveProjectMetadata(projectId);
    
    console.error(`Generated ${definition.title} (${result.reasoningTokens} reasoning + ${result.outputTokens} output tokens)`);
    
    return doc;
  }
  
  /**
   * Generates all project documents (in parallel for speed)
   */
  async generateAllDocuments(
    projectId: string,
    chunks: ChunkRecord[],
    force: boolean = false
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
          docType === "progress" ? previousProgress : undefined
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
