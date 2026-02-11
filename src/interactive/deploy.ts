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

  const hasPrivateRegistry = await p.confirm({
    message: 'Do you need image pull secrets for private registries?',
    initialValue: false,
  });
  if (p.isCancel(hasPrivateRegistry)) return hasPrivateRegistry;

  let imagePullSecrets: string[] = [];
  if (hasPrivateRegistry) {
    const secrets = await p.text({
      message: 'Image pull secret name(s):',
      placeholder: 'my-registry-secret (comma-separated for multiple)',
      validate: (val) => {
        if (!val.trim()) return 'At least one secret name is required';
      },
    });
    if (p.isCancel(secrets)) return secrets;

    imagePullSecrets = (secrets as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return {
    namespace: namespace as string,
    imagePullPolicy,
    imagePullSecrets,
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
