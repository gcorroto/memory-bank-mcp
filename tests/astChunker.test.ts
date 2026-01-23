/**
 * @fileoverview Tests for AST Chunker functionality
 * Tests WASM path resolution and language parsing
 */

import { describe, test, expect, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import {
  chunkWithAST,
  isLanguageSupportedByAST,
  getSupportedLanguages,
  disposeASTChunker,
} from "../common/astChunker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

afterAll(() => {
  // Cleanup Tree-sitter resources after all tests
  disposeASTChunker();
});

describe("AST Chunker - WASM Path Resolution", () => {
  test("should find tree-sitter-wasms package via require.resolve", () => {
    // This tests the fix: using require.resolve to find WASM files
    let packagePath: string | null = null;
    
    try {
      packagePath = require.resolve("tree-sitter-wasms/package.json");
    } catch {
      // Package not found
    }
    
    expect(packagePath).not.toBeNull();
    expect(fs.existsSync(packagePath!)).toBe(true);
    
    const packageDir = path.dirname(packagePath!);
    const outDir = path.join(packageDir, "out");
    
    expect(fs.existsSync(outDir)).toBe(true);
  });

  test("should have TypeScript WASM file available", () => {
    const packagePath = require.resolve("tree-sitter-wasms/package.json");
    const packageDir = path.dirname(packagePath);
    const wasmPath = path.join(packageDir, "out", "tree-sitter-typescript.wasm");
    
    expect(fs.existsSync(wasmPath)).toBe(true);
  });

  test("should have CSS WASM file available", () => {
    const packagePath = require.resolve("tree-sitter-wasms/package.json");
    const packageDir = path.dirname(packagePath);
    const wasmPath = path.join(packageDir, "out", "tree-sitter-css.wasm");
    
    expect(fs.existsSync(wasmPath)).toBe(true);
  });

  test("should have HTML WASM file available", () => {
    const packagePath = require.resolve("tree-sitter-wasms/package.json");
    const packageDir = path.dirname(packagePath);
    const wasmPath = path.join(packageDir, "out", "tree-sitter-html.wasm");
    
    expect(fs.existsSync(wasmPath)).toBe(true);
  });

  test("should have JavaScript WASM file available", () => {
    const packagePath = require.resolve("tree-sitter-wasms/package.json");
    const packageDir = path.dirname(packagePath);
    const wasmPath = path.join(packageDir, "out", "tree-sitter-javascript.wasm");
    
    expect(fs.existsSync(wasmPath)).toBe(true);
  });

  test("should have Python WASM file available", () => {
    const packagePath = require.resolve("tree-sitter-wasms/package.json");
    const packageDir = path.dirname(packagePath);
    const wasmPath = path.join(packageDir, "out", "tree-sitter-python.wasm");
    
    expect(fs.existsSync(wasmPath)).toBe(true);
  });
});

describe("AST Chunker - Language Support", () => {
  test("should report TypeScript as supported", () => {
    expect(isLanguageSupportedByAST("typescript")).toBe(true);
    expect(isLanguageSupportedByAST("TypeScript")).toBe(true);
    expect(isLanguageSupportedByAST("TYPESCRIPT")).toBe(true);
  });

  test("should report JavaScript as supported", () => {
    expect(isLanguageSupportedByAST("javascript")).toBe(true);
  });

  test("should report CSS as supported", () => {
    expect(isLanguageSupportedByAST("css")).toBe(true);
  });

  test("should report HTML as supported", () => {
    expect(isLanguageSupportedByAST("html")).toBe(true);
  });

  test("should report Python as supported", () => {
    expect(isLanguageSupportedByAST("python")).toBe(true);
  });

  test("should return false for unsupported languages", () => {
    expect(isLanguageSupportedByAST("fortran")).toBe(false);
    expect(isLanguageSupportedByAST("cobol")).toBe(false);
    expect(isLanguageSupportedByAST("")).toBe(false);
  });

  test("should return list of supported languages", () => {
    const languages = getSupportedLanguages();
    
    expect(languages).toContain("typescript");
    expect(languages).toContain("javascript");
    expect(languages).toContain("python");
    expect(languages).toContain("css");
    expect(languages).toContain("html");
    expect(languages).toContain("java");
    expect(languages).toContain("go");
    expect(languages).toContain("rust");
    expect(languages.length).toBeGreaterThan(15);
  });
});

describe("AST Chunker - TypeScript Parsing", () => {
  test("should parse TypeScript class with methods", async () => {
    const code = `
export class UserService {
  private users: Map<string, User> = new Map();

  async findUser(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async createUser(data: CreateUserDto): Promise<User> {
    const user = new User(data);
    this.users.set(user.id, user);
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
}
`.trim();

    const chunks = await chunkWithAST({
      filePath: "test/user.service.ts",
      content: code,
      language: "typescript",
    });

    expect(chunks.length).toBeGreaterThan(0);
    
    // Should have extracted semantic units
    const classChunk = chunks.find(c => c.chunkType === "class" || c.name?.includes("UserService"));
    expect(classChunk).toBeDefined();
    
    // All chunks should have required properties
    for (const chunk of chunks) {
      expect(chunk).toHaveProperty("id");
      expect(chunk).toHaveProperty("filePath");
      expect(chunk).toHaveProperty("content");
      expect(chunk).toHaveProperty("startLine");
      expect(chunk).toHaveProperty("endLine");
      expect(chunk).toHaveProperty("chunkType");
      expect(chunk).toHaveProperty("language");
      expect(chunk.language).toBe("typescript");
    }
  }, 30000);

  test("should parse TypeScript functions", async () => {
    const code = `
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

export function processOrder(order: Order): ProcessedOrder {
  const total = calculateTotal(order.items);
  return {
    ...order,
    total,
    formattedTotal: formatCurrency(total)
  };
}
`.trim();

    const chunks = await chunkWithAST({
      filePath: "test/utils.ts",
      content: code,
      language: "typescript",
    });

    expect(chunks.length).toBeGreaterThan(0);
    
    // Should extract function names
    const hasCalculateTotal = chunks.some(c => c.name === "calculateTotal" || c.content.includes("calculateTotal"));
    const hasProcessOrder = chunks.some(c => c.name === "processOrder" || c.content.includes("processOrder"));
    
    expect(hasCalculateTotal).toBe(true);
    expect(hasProcessOrder).toBe(true);
  }, 30000);

  test("should parse TypeScript interface", async () => {
    const code = `
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
}
`.trim();

    const chunks = await chunkWithAST({
      filePath: "test/types.ts",
      content: code,
      language: "typescript",
    });

    expect(chunks.length).toBeGreaterThan(0);
    
    // Content should include interface definitions
    const allContent = chunks.map(c => c.content).join("\n");
    expect(allContent).toContain("interface User");
    expect(allContent).toContain("interface CreateUserDto");
  }, 30000);
});

describe("AST Chunker - JavaScript Parsing", () => {
  test("should parse JavaScript class", async () => {
    const code = `
class Calculator {
  constructor(initialValue = 0) {
    this.value = initialValue;
  }

  add(n) {
    this.value += n;
    return this;
  }

  subtract(n) {
    this.value -= n;
    return this;
  }

  getResult() {
    return this.value;
  }
}

module.exports = Calculator;
`.trim();

    const chunks = await chunkWithAST({
      filePath: "test/calculator.js",
      content: code,
      language: "javascript",
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(c => c.language === "javascript")).toBe(true);
  }, 30000);
});

describe("AST Chunker - Python Parsing", () => {
  test("should parse Python class with methods", async () => {
    const code = `
class DataProcessor:
    def __init__(self, data):
        self.data = data
        self.processed = False

    def process(self):
        if not self.data:
            raise ValueError("No data to process")
        
        result = []
        for item in self.data:
            result.append(self._transform(item))
        
        self.processed = True
        return result

    def _transform(self, item):
        return item.upper() if isinstance(item, str) else str(item)

def main():
    processor = DataProcessor(["hello", "world"])
    result = processor.process()
    print(result)

if __name__ == "__main__":
    main()
`.trim();

    const chunks = await chunkWithAST({
      filePath: "test/processor.py",
      content: code,
      language: "python",
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every(c => c.language === "python")).toBe(true);
    
    // Should contain class and function definitions
    const allContent = chunks.map(c => c.content).join("\n");
    expect(allContent).toContain("class DataProcessor");
    expect(allContent).toContain("def main()");
  }, 30000);
});

describe("AST Chunker - Edge Cases", () => {
  test("should handle empty content gracefully", async () => {
    const chunks = await chunkWithAST({
      filePath: "test/empty.ts",
      content: "",
      language: "typescript",
    });

    // Should return empty array or single empty file chunk
    expect(chunks.length).toBeLessThanOrEqual(1);
  }, 30000);

  test("should handle content with only comments", async () => {
    const code = `
// This is a comment
/* This is a
   multiline comment */
// Another comment
`.trim();

    const chunks = await chunkWithAST({
      filePath: "test/comments.ts",
      content: code,
      language: "typescript",
    });

    // Should handle without errors
    expect(Array.isArray(chunks)).toBe(true);
  }, 30000);

  test("should handle syntax errors gracefully", async () => {
    const code = `
function broken( {
  // Missing closing parenthesis and brace
  const x = 
`.trim();

    // Should not throw, might return empty array for fallback
    const chunks = await chunkWithAST({
      filePath: "test/broken.ts",
      content: code,
      language: "typescript",
    });

    expect(Array.isArray(chunks)).toBe(true);
  }, 30000);

  test("should set correct line numbers", async () => {
    const code = `
// Line 1: comment
// Line 2: comment
function test() {
  return true;
}
// Line 7: comment
`.trim();

    const chunks = await chunkWithAST({
      filePath: "test/lines.ts",
      content: code,
      language: "typescript",
    });

    if (chunks.length > 0) {
      // Line numbers should be positive integers
      for (const chunk of chunks) {
        expect(chunk.startLine).toBeGreaterThan(0);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      }
    }
  }, 30000);
});

describe("AST Chunker - Token Limits", () => {
  test("should respect max tokens limit", async () => {
    // Generate a large function
    const lines = ["function largeFunction() {"];
    for (let i = 0; i < 500; i++) {
      lines.push(`  const var${i} = "value${i}"; // Some comment to add length`);
    }
    lines.push("  return { /* large object */ };");
    lines.push("}");
    
    const code = lines.join("\n");
    
    const chunks = await chunkWithAST({
      filePath: "test/large.ts",
      content: code,
      language: "typescript",
      maxTokens: 500, // Force splitting
    });

    expect(chunks.length).toBeGreaterThan(0);
    
    // Each chunk should have tokenCount property
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeDefined();
      // Token count should be reasonable (not exceed limit by too much)
      expect(chunk.tokenCount!).toBeLessThan(8000); // Absolute max with some buffer
    }
  }, 30000);
});
