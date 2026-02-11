import { Command } from 'commander';

const program = new Command();

program
  .name('compose2k8s')
  .description('Convert Docker Compose files to Kubernetes manifests')
  .version('0.1.0');

program.parse();
