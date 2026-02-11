import * as p from '@clack/prompts';
import type { DeployOptions } from '../types/config.js';

/**
 * Step 6: Configure deployment options.
 */
export async function configureDeploy(): Promise<DeployOptions | symbol> {
  const namespace = await p.text({
    message: 'Kubernetes namespace:',
    initialValue: 'default',
  });
  if (p.isCancel(namespace)) return namespace;

  const imagePullPolicy = await p.select({
    message: 'Image pull policy:',
    options: [
      { value: 'IfNotPresent' as const, label: 'IfNotPresent' },
      { value: 'Always' as const, label: 'Always' },
      { value: 'Never' as const, label: 'Never' },
    ],
  });
  if (p.isCancel(imagePullPolicy)) return imagePullPolicy;

  const outputFormat = await p.select({
    message: 'Output format:',
    options: [
      { value: 'plain' as const, label: 'Individual files', hint: 'One YAML file per resource' },
      { value: 'single-file' as const, label: 'Single file', hint: 'All resources in one file' },
    ],
  });
  if (p.isCancel(outputFormat)) return outputFormat;

  const outputDir = await p.text({
    message: 'Output directory:',
    initialValue: './k8s',
  });
  if (p.isCancel(outputDir)) return outputDir;

  return {
    namespace: namespace as string,
    imagePullPolicy,
    outputFormat,
    outputDir: outputDir as string,
    migrationScripts: true,
    resourceDefaults: {
      cpuRequest: '100m',
      cpuLimit: '500m',
      memoryRequest: '128Mi',
      memoryLimit: '512Mi',
    },
  };
}
