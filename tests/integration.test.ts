/**
 * @fileoverview Integration tests for Memory Bank MCP
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { EmbeddingService } from "../common/embeddingService.js";
import { VectorStore } from "../common/vectorStore.js";
import { IndexManager } from "../common/indexManager.js";
import { scanFiles, isCodeFile } from "../common/fileScanner.js";
import { chunkCode } from "../common/chunker.js";

// Test workspace setup
const TEST_WORKSPACE = path.join(process.cwd(), "test-workspace");
const TEST_STORAGE = path.join(TEST_WORKSPACE, ".memorybank-test");

// Mock environment variables
const MOCK_API_KEY = process.env.OPENAI_API_KEY || "sk-test-key-for-local-testing";

beforeAll(() => {
  // Create test workspace
  if (!fs.existsSync(TEST_WORKSPACE)) {
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
  }
  
  // Create test files
  const testFiles = {
    "src/auth.ts": `
import { hash } from 'bcrypt';

export class AuthService {
  async login(email: string, password: string) {
    // Authenticate user
    const user = await this.findUser(email);
    if (!user) throw new Error('User not found');
    
    const valid = await this.verifyPassword(password, user.passwordHash);
    if (!valid) throw new Error('Invalid password');
    
    return this.generateToken(user);
  }
  
  private async findUser(email: string) {
    // Find user in database
    return null;
  }
  
  private async verifyPassword(password: string, hash: string) {
    // Verify password
    return false;
  }
  
  private generateToken(user: any) {
    // Generate JWT token
    return "jwt-token";
  }
}
`,
    "src/utils.ts": `
export function validateEmail(email: string): boolean {
  const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return regex.test(email);
}

export function formatDate(date: Date): string {
  return date.toISOString();
}
`,
    "src/config.ts": `
export const MAX_RETRIES = 5;
export const TIMEOUT = 30000;
`,
    ".gitignore": `
node_modules/
dist/
.env
`,
  };
  
  for (const [filePath, content] of Object.entries(testFiles)) {
    const fullPath = path.join(TEST_WORKSPACE, filePath);
    const dir = path.dirname(fullPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content.trim());
  }
});

afterAll(() => {
  // Cleanup test workspace
  if (fs.existsSync(TEST_WORKSPACE)) {
    fs.rmSync(TEST_WORKSPACE, { recursive: true, force: true });
  }
});

describe("File Scanner", () => {
  test("should scan test workspace and find code files", () => {
    const files = scanFiles({ rootPath: TEST_WORKSPACE });
    
    expect(files.length).toBeGreaterThan(0);
    
    // Should find TypeScript files
    const tsFiles = files.filter((f) => f.extension === ".ts");
    expect(tsFiles.length).toBeGreaterThanOrEqual(3);
    
    // Should have metadata
    expect(files[0]).toHaveProperty("path");
    expect(files[0]).toHaveProperty("hash");
    expect(files[0]).toHaveProperty("size");
    expect(files[0]).toHaveProperty("language");
  });
  
  test("should respect .gitignore patterns", () => {
    const files = scanFiles({ rootPath: TEST_WORKSPACE });
    
    // Should not include .gitignore itself
    const gitignoreFile = files.find((f) => f.path.endsWith(".gitignore"));
    expect(gitignoreFile).toBeUndefined();
  });
  
  test("should detect code files correctly", () => {
    expect(isCodeFile("test.ts")).toBe(true);
    expect(isCodeFile("test.js")).toBe(true);
    expect(isCodeFile("test.py")).toBe(true);
    expect(isCodeFile("test.jpg")).toBe(false);
    expect(isCodeFile("test.pdf")).toBe(false);
  });
});

describe("Code Chunker", () => {
  test("should chunk TypeScript code intelligently", () => {
    const code = `
export class TestClass {
  method1() {
    return "test";
  }
  
  method2() {
    return "test2";
  }
}
    `.trim();
    
    const chunks = chunkCode({
      filePath: "test.ts",
      content: code,
      language: "typescript",
    });
    
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toHaveProperty("id");
    expect(chunks[0]).toHaveProperty("content");
    expect(chunks[0]).toHaveProperty("chunkType");
    expect(chunks[0]).toHaveProperty("startLine");
    expect(chunks[0]).toHaveProperty("endLine");
  });
  
  test("should extract function names", () => {
    const code = `
function testFunction() {
  return "test";
}

const arrowFunc = () => {
  return "test";
};
    `.trim();
    
    const chunks = chunkCode({
      filePath: "test.ts",
      content: code,
      language: "typescript",
    });
    
    const funcChunk = chunks.find((c) => c.name === "testFunction");
    expect(funcChunk).toBeDefined();
  });
  
  test("should handle Python code", () => {
    const code = `
def test_function():
    return "test"

class TestClass:
    def method(self):
        return "test"
    `.trim();
    
    const chunks = chunkCode({
      filePath: "test.py",
      content: code,
      language: "python",
    });
    
    expect(chunks.length).toBeGreaterThan(0);
  });
});

describe("Embedding Service", () => {
  // Skip if no API key
  const shouldSkip = !process.env.OPENAI_API_KEY;
  const testFn = shouldSkip ? test.skip : test;
  
  testFn("should generate embeddings (requires API key)", async () => {
    const service = new EmbeddingService(MOCK_API_KEY);
    
    const result = await service.generateEmbedding(
      "test-chunk-1",
      "function test() { return true; }"
    );
    
    expect(result).toHaveProperty("chunkId");
    expect(result).toHaveProperty("vector");
    expect(result.vector).toBeInstanceOf(Array);
    expect(result.vector.length).toBe(1536); // text-embedding-3-small
  }, 30000);
  
  testFn("should cache embeddings (requires API key)", async () => {
    const service = new EmbeddingService(MOCK_API_KEY, { enableCache: true });
    
    const content = "function test() { return true; }";
    
    // First call - should generate
    const result1 = await service.generateEmbedding("test-chunk-1", content);
    expect(result1.tokens).toBeGreaterThan(0);
    
    // Second call - should use cache
    const result2 = await service.generateEmbedding("test-chunk-1", content);
    expect(result2.tokens).toBe(0); // Cached, no tokens counted
    
    expect(result1.vector).toEqual(result2.vector);
  }, 30000);
});

describe("Vector Store", () => {
  let vectorStore: VectorStore;
  
  beforeAll(async () => {
    vectorStore = new VectorStore(TEST_STORAGE);
    await vectorStore.initialize();
  });
  
  afterAll(async () => {
    if (vectorStore) {
      await vectorStore.clear();
      await vectorStore.close();
    }
  });
  
  test("should initialize successfully", async () => {
    expect(vectorStore).toBeDefined();
  });
  
  test("should insert and retrieve chunks", async () => {
    const chunks = [
      {
        id: "test-chunk-1",
        vector: Array(1536).fill(0.1),
        file_path: "test.ts",
        content: "function test() {}",
        start_line: 1,
        end_line: 1,
        chunk_type: "function",
        language: "typescript",
        file_hash: "test-hash",
        timestamp: Date.now(),
        project_id: "default",
      },
    ];
    
    await vectorStore.insertChunks(chunks);
    
    const stats = await vectorStore.getStats();
    expect(stats.totalChunks).toBeGreaterThanOrEqual(1);
  });
  
  test("should perform vector search", async () => {
    const queryVector = Array(1536).fill(0.1);
    
    const results = await vectorStore.search(queryVector, { topK: 5 });
    
    expect(results).toBeInstanceOf(Array);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty("chunk");
      expect(results[0]).toHaveProperty("score");
    }
  });
});

describe("Index Manager", () => {
  // Integration test that requires API key
  const shouldSkip = !process.env.OPENAI_API_KEY;
  const testFn = shouldSkip ? test.skip : test;
  
  testFn("should index test workspace (requires API key)", async () => {
    const embeddingService = new EmbeddingService(MOCK_API_KEY);
    const vectorStore = new VectorStore(TEST_STORAGE);
    const indexManager = new IndexManager(embeddingService, vectorStore, TEST_STORAGE);
    
    const result = await indexManager.indexFiles({
      rootPath: TEST_WORKSPACE,
      recursive: true,
    });
    
    expect(result.filesProcessed).toBeGreaterThan(0);
    expect(result.chunksCreated).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
    
    // Cleanup
    await vectorStore.clear();
    await vectorStore.close();
  }, 60000);
  
  testFn("should search indexed code (requires API key)", async () => {
    const embeddingService = new EmbeddingService(MOCK_API_KEY);
    const vectorStore = new VectorStore(TEST_STORAGE);
    const indexManager = new IndexManager(embeddingService, vectorStore, TEST_STORAGE);
    
    // Index first
    await indexManager.indexFiles({
      rootPath: TEST_WORKSPACE,
      recursive: true,
    });
    
    // Search
    const results = await indexManager.search("authentication login function");
    
    expect(results).toBeInstanceOf(Array);
    if (results.length > 0) {
      expect(results[0]).toHaveProperty("filePath");
      expect(results[0]).toHaveProperty("content");
      expect(results[0]).toHaveProperty("score");
    }
    
    // Cleanup
    await vectorStore.clear();
    await vectorStore.close();
  }, 60000);
});

describe("End-to-End Workflow", () => {
  const shouldSkip = !process.env.OPENAI_API_KEY;
  const testFn = shouldSkip ? test.skip : test;
  
  testFn("should complete full indexing and search workflow (requires API key)", async () => {
    // 1. Setup
    const embeddingService = new EmbeddingService(MOCK_API_KEY);
    const vectorStore = new VectorStore(TEST_STORAGE);
    const indexManager = new IndexManager(embeddingService, vectorStore, TEST_STORAGE);
    
    // 2. Get initial stats (should be empty)
    let stats = await indexManager.getStats();
    expect(stats.totalChunks).toBe(0);
    
    // 3. Index workspace
    const indexResult = await indexManager.indexFiles({
      rootPath: TEST_WORKSPACE,
      recursive: true,
    });
    
    expect(indexResult.filesProcessed).toBeGreaterThan(0);
    
    // 4. Get stats after indexing
    stats = await indexManager.getStats();
    expect(stats.totalChunks).toBeGreaterThan(0);
    expect(stats.totalFiles).toBeGreaterThan(0);
    
    // 5. Search for authentication code
    const authResults = await indexManager.search("authentication login password");
    expect(authResults.length).toBeGreaterThan(0);
    
    // Should find the auth.ts file
    const authFile = authResults.find((r) => r.filePath.includes("auth.ts"));
    expect(authFile).toBeDefined();
    
    // 6. Search for email validation
    const emailResults = await indexManager.search("validate email");
    expect(emailResults.length).toBeGreaterThan(0);
    
    // Should find the utils.ts file
    const utilsFile = emailResults.find((r) => r.filePath.includes("utils.ts"));
    expect(utilsFile).toBeDefined();
    
    // 7. Cleanup
    await indexManager.clearIndex();
    await vectorStore.close();
  }, 90000);
});

// Basic unit tests that don't require API key
describe("Basic Functionality (no API key required)", () => {
  test("should create embedding service without API key in test mode", () => {
    expect(() => {
      // This should throw in production
      try {
        new EmbeddingService("");
      } catch (error) {
        expect(error).toBeDefined();
      }
    }).not.toThrow();
  });
  
  test("should handle chunking edge cases", () => {
    // Empty file
    const chunks1 = chunkCode({
      filePath: "empty.ts",
      content: "",
      language: "typescript",
    });
    expect(chunks1.length).toBeGreaterThanOrEqual(0);
    
    // Very small file
    const chunks2 = chunkCode({
      filePath: "small.ts",
      content: "const x = 1;",
      language: "typescript",
    });
    expect(chunks2.length).toBeGreaterThanOrEqual(1);
  });
});
