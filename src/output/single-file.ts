import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GeneratorOutput } from '../types/k8s.js';
import { manifestsToMultiDoc } from '../utils/yaml.js';

/**
 * Write all manifests into a single multi-document YAML file.
 */
export async function writeSingleFileOutput(
  output: GeneratorOutput,
  outputDir: string,
): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const writtenFiles: string[] = [];

  const allManifests = output.manifests.map((gm) => gm.manifest);
  const yaml = manifestsToMultiDoc(allManifests);

  const filePath = join(outputDir, 'all-resources.yaml');
  await writeFile(filePath, yaml, 'utf-8');
  writtenFiles.push(filePath);

  // Write README
  const readmePath = join(outputDir, 'README.md');
  await writeFile(readmePath, output.readme, 'utf-8');
  writtenFiles.push(readmePath);

  return writtenFiles;
}
