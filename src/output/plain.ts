import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import type { GeneratorOutput } from '../types/k8s.js';
import { manifestToYaml } from '../utils/yaml.js';

/**
 * Sanitize a filename to prevent path traversal.
 */
function sanitizeFilename(filename: string): string {
  return basename(filename).replace(/[^a-zA-Z0-9._-]/g, '-');
}

/**
 * Write each manifest as a separate YAML file.
 */
export async function writePlainOutput(
  output: GeneratorOutput,
  outputDir: string,
): Promise<string[]> {
  const resolvedDir = resolve(outputDir);
  await mkdir(resolvedDir, { recursive: true });
  const writtenFiles: string[] = [];

  for (const gm of output.manifests) {
    const filePath = join(resolvedDir, sanitizeFilename(gm.filename));
    const yaml = manifestToYaml(gm.manifest);
    await writeFile(filePath, yaml, 'utf-8');
    writtenFiles.push(filePath);
  }

  // Write migration scripts
  if (output.migrationScripts.length > 0) {
    const scriptsDir = join(resolvedDir, 'scripts');
    await mkdir(scriptsDir, { recursive: true });
    for (const script of output.migrationScripts) {
      const scriptPath = join(scriptsDir, sanitizeFilename(script.filename));
      await writeFile(scriptPath, script.content, { mode: 0o755 });
      writtenFiles.push(scriptPath);
    }
  }

  // Write README
  const readmePath = join(outputDir, 'README.md');
  await writeFile(readmePath, output.readme, 'utf-8');
  writtenFiles.push(readmePath);

  return writtenFiles;
}
