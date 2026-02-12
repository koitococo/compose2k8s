import { resolve, dirname } from 'node:path';
import { access, readdir, rm } from 'node:fs/promises';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { parseComposeFile } from '../parser/compose.js';
import { analyzeProject } from '../analyzer/index.js';
import { generateManifests } from '../generator/index.js';
import { writeOutput } from '../output/index.js';
import { runWizard } from '../interactive/wizard.js';
import { generateDefaults } from '../interactive/defaults.js';
import { findComposeFile } from '../utils/detect.js';
import { loadConfigFile } from '../config/loader.js';

export type AutoCleanMode = 'force' | 'never' | 'interactive';

export interface ConvertOptions {
  file?: string;
  envFile?: string;
  output?: string;
  config?: string;
  nonInteractive?: boolean;
  format?: 'plain' | 'single-file';
  namespace?: string;
  autoClean?: AutoCleanMode;
  imagePullSecret?: string;
  chdir?: string;
}

export async function convert(options: ConvertOptions): Promise<void> {
  // Resolve working directory and compose file using the 4-case matrix:
  //   -f | --chdir | compose file           | working dir
  //   no | no      | auto-detect in ./       | ./
  //  yes | no      | specified               | dirname(file)
  //   no | yes     | auto-detect in chdir/   | chdir/
  //  yes | yes     | specified               | chdir/
  const workingDir = options.chdir ? resolve(options.chdir) : null;

  let composeFile: string;
  if (options.file) {
    composeFile = resolve(options.file);
  } else {
    const searchDir = workingDir ?? process.cwd();
    const found = findComposeFile(searchDir);
    if (!found) {
      p.log.error(`No compose file found in ${searchDir}. Use -f to specify one.`);
      process.exit(1);
    }
    composeFile = found;
  }

  const resolvedWorkingDir = workingDir ?? dirname(composeFile);

  const s = p.spinner();

  // Phase 1: Parse
  s.start('[1/4] Parsing compose file...');
  let parseResult;
  try {
    parseResult = await parseComposeFile({
      file: composeFile,
      envFile: options.envFile,
      workingDir: resolvedWorkingDir,
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
  s.start('[2/4] Analyzing services...');
  const analysis = analyzeProject(parseResult.project);
  s.stop('Analysis complete');

  if (analysis.warnings.length > 0) {
    for (const w of analysis.warnings) {
      p.log.warn(w);
    }
  }

  // Phase 3: Config file, defaults, or interactive
  let config;
  if (options.config) {
    const { config: loaded, warnings: configWarnings } = await loadConfigFile(
      resolve(options.config),
      analysis,
    );
    config = loaded;
    for (const w of configWarnings) {
      p.log.warn(w);
    }
  } else if (options.nonInteractive) {
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
  if (options.imagePullSecret) {
    config.deploy.imagePullSecrets = options.imagePullSecret
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Phase 4: Generate
  s.start('[3/4] Generating Kubernetes manifests...');
  const output = generateManifests({
    analysis,
    config,
    workingDir: resolvedWorkingDir,
  });
  s.stop(`Generated ${output.manifests.length} manifests`);

  if (output.warnings.length > 0) {
    for (const w of output.warnings) {
      p.log.warn(w);
    }
  }

  // Pre-flight: check if output directory already exists
  const outputDir = resolve(config.deploy.outputDir);
  const autoClean: AutoCleanMode =
    options.autoClean ?? (options.nonInteractive ? 'never' : 'interactive');
  const shouldContinue = await handleExistingOutput(outputDir, autoClean);
  if (!shouldContinue) return;

  // Phase 5: Write
  s.start('[4/4] Writing files...');
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

/**
 * Check if output directory exists and has content.
 * Returns true if we should continue, false to abort.
 */
async function handleExistingOutput(
  outputDir: string,
  mode: AutoCleanMode,
): Promise<boolean> {
  try {
    await access(outputDir);
  } catch {
    // Directory doesn't exist — safe to proceed
    return true;
  }

  // Check if directory has any files
  const entries = await readdir(outputDir);
  if (entries.length === 0) return true;

  if (mode === 'force') {
    await rm(outputDir, { recursive: true });
    return true;
  }

  if (mode === 'never') {
    p.log.error(
      `Output directory "${outputDir}" already exists and is not empty. ` +
        'Use --auto-clean=force to delete it, or choose a different output directory.',
    );
    process.exit(1);
  }

  // interactive
  const action = await p.select({
    message: `Output directory "${outputDir}" already exists with ${entries.length} file(s). What do you want to do?`,
    options: [
      { value: 'clean' as const, label: 'Delete and continue', hint: 'removes existing files' },
      { value: 'abort' as const, label: 'Abort' },
    ],
  });

  if (p.isCancel(action) || action === 'abort') {
    p.cancel('Conversion cancelled.');
    return false;
  }

  await rm(outputDir, { recursive: true });
  return true;
}
