import { resolve } from 'node:path';
import chalk from 'chalk';

export interface ApplyOptions {
  dir?: string;
  namespace?: string;
  dryRun?: boolean;
}

export async function apply(options: ApplyOptions): Promise<void> {
  const dir = resolve(options.dir ?? './k8s');
  const ns = options.namespace ? `-n ${options.namespace}` : '';
  const dryRun = options.dryRun ? ' --dry-run=client' : '';

  console.log(chalk.bold('To apply the generated manifests, run:'));
  console.log('');
  console.log(`  kubectl apply -f ${dir}/ ${ns}${dryRun}`);
  console.log('');

  if (!options.dryRun) {
    console.log(chalk.yellow('Tip: Add --dry-run to preview changes first.'));
  }
}
