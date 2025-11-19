import path from 'path';
import fs from 'fs';

/**
 * DSL entry metadata - single source of truth
 */
export interface DslEntry {
  name: string;           // 'chat-responsive'
  dirPath: string;        // absolute path to directory
  indexPath: string;      // absolute path to index.html
  baseHref: string;       // '/fixtures/dsl/chat-responsive/'
  basePath: string;       // for dslToComposition (same as dirPath)
}

const DSL_ROOT = path.join(process.cwd(), 'fixtures', 'dsl');

/**
 * Load DSL entry by name - eliminates all endsWith('.html') branches
 */
export function loadDslEntry(name: string): DslEntry {
  const dirPath = path.join(DSL_ROOT, name);
  const indexPath = path.join(dirPath, 'index.html');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`DSL entry not found: ${name} (expected ${indexPath})`);
  }

  return {
    name,
    dirPath,
    indexPath,
    baseHref: `/fixtures/dsl/${name}/`,
    basePath: dirPath
  };
}

/**
 * List all DSL entries
 */
export function listDslEntries(): Array<{ name: string }> {
  if (!fs.existsSync(DSL_ROOT)) return [];

  const entries = fs.readdirSync(DSL_ROOT, { withFileTypes: true });
  const result: Array<{ name: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const indexPath = path.join(DSL_ROOT, entry.name, 'index.html');
    if (fs.existsSync(indexPath)) {
      result.push({ name: entry.name });
    }
  }

  return result;
}

/**
 * Read DSL HTML content
 */
export function readDslHtml(entry: DslEntry): string {
  return fs.readFileSync(entry.indexPath, 'utf8');
}
