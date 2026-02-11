import type { GeneratorOutput } from '../types/k8s.js';
import type { WizardConfig } from '../types/config.js';
import { writePlainOutput } from './plain.js';
import { writeSingleFileOutput } from './single-file.js';

/**
 * Write generator output to disk based on config format.
 */
export async function writeOutput(
  output: GeneratorOutput,
  config: WizardConfig,
): Promise<string[]> {
  const outputDir = config.deploy.outputDir;

  if (config.deploy.outputFormat === 'single-file') {
    return writeSingleFileOutput(output, outputDir);
  }
  return writePlainOutput(output, outputDir);
}
