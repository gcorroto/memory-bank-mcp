
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import * as path from "path";

export interface ProjectRecord {
  id: string;          // Project ID
  vector: number[];    // Embedding of description+tags
  name: string;
  description: string;
  tags: string[];
  path: string;        // Workspace path
  lastActive: number;
}

export interface ProjectSearchResult {
  project: ProjectRecord;
  score: number;
}

export class ProjectVectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private dbPath: string;
  private tableName: string;

  constructor(dbPath: string = ".memorybank", tableName: string = "projects") {
    this.dbPath = dbPath;
    this.tableName = tableName;
  }

  async initialize(): Promise<void> {
    try {
      if (!fs.existsSync(this.dbPath)) {
        fs.mkdirSync(this.dbPath, { recursive: true });
      }
      this.db = await lancedb.connect(this.dbPath);
      
      const tableNames = await this.db.tableNames();
      if (tableNames.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
      }
    } catch (error) {
      console.error(`Error initializing project vector store: ${error}`);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  async upsertProject(record: ProjectRecord): Promise<void> {
    await this.ensureInitialized();

    try {
      if (!this.table) {
        this.table = await this.db!.createTable(this.tableName, [record as any]);
      } else {
        // Delete existing if any (LanceDB update/merge is tricky, delete+insert is safer for single records)
        try {
            await this.table.delete(`id = '${record.id}'`);
        } catch (e) {
            // Ignore if not found or delete fails
        }
        await this.table.add([record as any]);
      }
    } catch (error) {
      console.error(`Error upserting project: ${error}`);
      throw error;
    }
  }

  async search(queryVector: number[], limit: number = 10): Promise<ProjectSearchResult[]> {
    await this.ensureInitialized();
    if (!this.table) return [];

    try {
      const results = await this.table.search(queryVector).limit(limit).toArray();
      
      return results.map((r: any) => ({
        project: {
            id: r.id,
            vector: r.vector,
            name: r.name,
            description: r.description,
            tags: r.tags,
            path: r.path,
            lastActive: r.lastActive
        },
        score: 1 - (r._distance || 0) // Convert distance to score if needed
      }));
    } catch (error) {
      console.error(`Error searching projects: ${error}`);
      return [];
    }
  }
}
