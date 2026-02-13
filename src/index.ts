import { Command } from 'commander';
import { convert } from './commands/convert.js';
import { validate } from './commands/validate.js';
import { apply } from './commands/apply.js';

const program = new Command();

program
  .name('compose2k8s')
  .description('Convert Docker Compose files to Kubernetes manifests')
  .version('0.1.0');

// Default command: convert
program
  .command('convert', { isDefault: true })
  .description('Convert a Docker Compose file to Kubernetes manifests')
  .option('-f, --file <path>', 'Path to compose file')
  .option('-e, --env-file <path>', 'Path to .env file')
  .option('-o, --output <dir>', 'Output directory (default: ./k8s)')
  .option('-c, --config <path>', 'Path to pre-answer config file')
  .option('--non-interactive', 'Use defaults without prompting')
  .option('--format <type>', 'Output format: plain or single-file')
  .option('--namespace <ns>', 'Kubernetes namespace')
  .option(
    '--auto-clean <mode>',
    'Action when output dir exists: force, never, or interactive',
  )
  .option(
    '--image-pull-secret <names>',
    'Image pull secret name(s), comma-separated',
  )
  .option(
    '--chdir <dir>',
    'Working directory for resolving relative paths (bind mounts, env_file)',
  )
  .option(
    '--save-config <path>',
    'Save finalized wizard config as YAML file',
  )
  .action(convert);

// Validate command
program
  .command('validate')
  .description('Validate generated K8s manifests')
  .option('-d, --dir <path>', 'Directory containing manifests', './k8s')
  .action(validate);

// Apply command (prints instructions)
program
  .command('apply')
  .description('Show kubectl apply command for generated manifests')
  .option('-d, --dir <path>', 'Directory containing manifests', './k8s')
  .option('-n, --namespace <ns>', 'Kubernetes namespace')
  .option('--dry-run', 'Add --dry-run=client flag')
  .action(apply);

program.parse();
