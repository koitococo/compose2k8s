import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';
import type { StorageConfig } from '../types/config.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Step 4: Configure storage for PVC volumes.
 */
export async function configureStorage(
  analysis: AnalysisResult,
  selectedServices: string[],
): Promise<StorageConfig[] | symbol> {
  const storageConfigs: StorageConfig[] = [];

  for (const svcName of selectedServices) {
    const svc = analysis.services[svcName];
    if (!svc) continue;

    const pvcVolumes = svc.volumes.filter((v) => v.classification === 'pvc');
    if (pvcVolumes.length === 0) continue;

    for (const vol of pvcVolumes) {
      const volName = toK8sName(vol.suggestedName);
      const isDb = svc.category === 'database';
      const defaultSize = isDb ? '10Gi' : '1Gi';

      p.log.info(`Storage for ${svcName}: ${vol.mount.target}`);

      const storageClass = await p.text({
        message: `Storage class for ${volName}:`,
        placeholder: '(default)',
        initialValue: '',
      });
      if (p.isCancel(storageClass)) return storageClass;

      const size = await p.text({
        message: `Size for ${volName}:`,
        initialValue: defaultSize,
        validate: (v) => {
          if (!/^\d+[KMGT]i$/.test(v)) return 'Use format like 1Gi, 10Gi, 500Mi';
          return undefined;
        },
      });
      if (p.isCancel(size)) return size;

      const accessMode = await p.select({
        message: `Access mode for ${volName}:`,
        options: [
          { value: 'ReadWriteOnce' as const, label: 'ReadWriteOnce (single node)' },
          { value: 'ReadWriteMany' as const, label: 'ReadWriteMany (multiple nodes)' },
          { value: 'ReadOnlyMany' as const, label: 'ReadOnlyMany (read-only)' },
        ],
      });
      if (p.isCancel(accessMode)) return accessMode;

      storageConfigs.push({
        volumeName: volName,
        storageClass: storageClass as string,
        size: size as string,
        accessMode,
      });
    }
  }

  return storageConfigs;
}
