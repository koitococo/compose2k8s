import { resolve } from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { parseComposeFile } from '../parser/compose.js';
import { analyzeProject } from '../analyzer/index.js';
import { generateManifests } from '../generator/index.js';
import { writeOutput } from '../output/index.js';
import { runWizard } from '../interactive/wizard.js';
import { generateDefaults } from '../interactive/defaults.js';
import { findComposeFile } from '../utils/detect.js';

export interface ConvertOptions {
  file?: string;
  envFile?: string;
  output?: string;
  nonInteractive?: boolean;
  format?: 'plain' | 'single-file';
  namespace?: string;
}

export async function convert(options: ConvertOptions): Promise<void> {
  // Resolve compose file
  let composeFile = options.file
    ? resolve(options.file)
    : findComposeFile(process.cwd());

  if (!composeFile) {
    p.log.error('No compose file found. Use -f to specify one.');
    process.exit(1);
  }

  const s = p.spinner();

  // Phase 1: Parse
  s.start('Parsing compose file...');
  let parseResult;
  try {
    parseResult = await parseComposeFile({
      file: composeFile,
      envFile: options.envFile,
    });
  } catch (err) {
    s.stop('Parse failed');
    p.log.error(`Failed to parse compose file: ${(err as Error).message}`);
    process.exit(1);
  }
  s.stop(`Parsed ${Object.keys(parseResult.project.services).length} services`);

  if (parseResult.warnings.length > 0) {
    for (const w of parseResult.warnings) {
      p.log.warn(w);
    }
  }

  // Phase 2: Analyze
  s.start('Analyzing services...');
  const analysis = analyzeProject(parseResult.project);
  s.stop('Analysis complete');

  if (analysis.warnings.length > 0) {
    for (const w of analysis.warnings) {
      p.log.warn(w);
    }
  }

  // Phase 3: Interactive or defaults
  let config;
  if (options.nonInteractive) {
    config = generateDefaults(analysis, {
      outputDir: options.output,
      namespace: options.namespace,
      outputFormat: options.format,
    });
  } else {
    config = await runWizard(analysis);
    if (!config) return; // User cancelled
  }

  // Override output dir/format from CLI flags
  if (options.output) config.deploy.outputDir = options.output;
  if (options.format) config.deploy.outputFormat = options.format;
  if (options.namespace) config.deploy.namespace = options.namespace;

  // Phase 4: Generate
  s.start('Generating Kubernetes manifests...');
  const output = generateManifests({
    analysis,
    config,
    composeFile,
  });
  s.stop(`Generated ${output.manifests.length} manifests`);

  if (output.warnings.length > 0) {
    for (const w of output.warnings) {
      p.log.warn(w);
    }
  }

  // Phase 5: Write
  s.start('Writing files...');
  const writtenFiles = await writeOutput(output, config);
  s.stop(`Wrote ${writtenFiles.length} files to ${config.deploy.outputDir}/`);

  // Summary
  console.log('');
  console.log(chalk.green('Conversion complete!'));
  console.log('');
  console.log('Generated files:');
  for (const f of writtenFiles) {
    console.log(`  ${chalk.cyan(f)}`);
  }

  const secrets = output.manifests.filter((m) => m.manifest.kind === 'Secret');
  if (secrets.length > 0) {
    console.log('');
    console.log(chalk.yellow('Remember to replace REPLACE_ME placeholders in Secret files.'));
  }

  console.log('');
  console.log(`Apply with: ${chalk.bold(`kubectl apply -f ${config.deploy.outputDir}/`)}`);
}
