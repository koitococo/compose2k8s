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
  .option('-o, --output <dir>', 'Output directory', './k8s')
  .option('--non-interactive', 'Use defaults without prompting')
  .option('--format <type>', 'Output format: plain or single-file', 'plain')
  .option('--namespace <ns>', 'Kubernetes namespace')
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
