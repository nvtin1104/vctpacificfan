import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Loader } from 'astro/loaders';

/** Every season is a folder named by its year: src/data/seasons/2027/, src/data/seasons/2028/, … */
export const SEASONS_DIR = path.resolve('src/data/seasons');

export async function seasonYears(): Promise<number[]> {
  const dirs = await readdir(SEASONS_DIR, { withFileTypes: true });
  return dirs
    .filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map(d => Number(d.name))
    .sort((a, b) => a - b);
}

async function seasonTableFiles(year: number, file: string): Promise<string[]> {
  const base = file.replace(/\.json$/, '');
  const single = path.join(SEASONS_DIR, String(year), file);
  const dir = path.join(SEASONS_DIR, String(year), base);
  const files: string[] = [];
  try {
    await readFile(single, 'utf8');
    files.push(single);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.json')) files.push(path.join(dir, e.name));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return files.sort();
}

/**
 * Content-layer loader that reads `<file>` (or `<name>/*.json` shards) from every season folder and stamps each entry with `season`.
 * Ids must be unique across all seasons (tournament slugs and match ids already carry the year).
 * A season folder may omit a file (e.g. no statistics yet).
 */
export function seasonFile(file: string): Loader {
  const base = file.replace(/\.json$/, '');
  return {
    name: `season:${file}`,
    load: async ({ store, parseData, generateDigest, watcher, logger }) => {
      // Parse everything first, then swap the store contents synchronously: a request that arrives while a
      // reload is in progress must never see a half-empty (or empty) collection.
      const sync = async () => {
        const next: { id: string; data: Record<string, unknown>; filePath: string }[] = [];
        const seen = new Set<string>();
        for (const year of await seasonYears()) {
          for (const full of await seasonTableFiles(year, file)) {
            let entries: Record<string, unknown>[];
            try {
              entries = JSON.parse(await readFile(full, 'utf8'));
            } catch (error) {
              throw new Error(`Could not read ${full}: ${(error as Error).message}`);
            }
            if (!Array.isArray(entries)) throw new Error(`${full} must contain a JSON array`);
            for (const raw of entries) {
              const id = String(raw.id);
              if (seen.has(id)) throw new Error(`Duplicate id "${id}" in ${full} (ids must be unique across seasons)`);
              seen.add(id);
              const data = await parseData({ id, data: { ...raw, season: year }, filePath: full });
              next.push({ id, data, filePath: path.relative(process.cwd(), full) });
            }
          }
        }
        store.clear();
        for (const entry of next) store.set({ ...entry, digest: generateDigest(entry.data) });
      };
      await sync();

      if (watcher) {
        watcher.add(SEASONS_DIR);
        const onChange = async (changed: string) => {
          const resolved = path.resolve(changed);
          if (!resolved.startsWith(SEASONS_DIR)) return;
          const isSingle = path.basename(resolved) === file;
          const isShard = path.basename(path.dirname(resolved)) === base && resolved.endsWith('.json');
          if (!isSingle && !isShard) return;
          logger.info(`Reloading ${file} after a change in ${path.relative(process.cwd(), changed)}`);
          try {
            await sync();
          } catch (error) {
            // Keep serving the previous data (e.g. JSON is invalid half-way through a save).
            logger.error(`${file} not reloaded: ${(error as Error).message}`);
          }
        };
        watcher.on('change', onChange);
        watcher.on('add', onChange);
        watcher.on('unlink', onChange);
      }
    },
  };
}
