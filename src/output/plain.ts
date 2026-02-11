import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GeneratorOutput } from '../types/k8s.js';
import { manifestToYaml } from '../utils/yaml.js';

/**
 * Write each manifest as a separate YAML file.
 */
export async function writePlainOutput(
  output: GeneratorOutput,
  outputDir: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const writtenFiles: string[] = [];

  for (const gm of output.manifests) {
    const filePath = join(outputDir, gm.filename);
    const yaml = manifestToYaml(gm.manifest);
    await writeFile(filePath, yaml, 'utf-8');
    writtenFiles.push(filePath);
  }

  // Write README
  const readmePath = join(outputDir, 'README.md');
  await writeFile(readmePath, output.readme, 'utf-8');
  writtenFiles.push(readmePath);

  return writtenFiles;
}
