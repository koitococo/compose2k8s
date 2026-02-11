import { basename, extname } from 'node:path';
import type { ComposeVolumeMount } from '../types/compose.js';
import type { VolumeClassification } from '../types/analysis.js';

const SECRET_PATH_PATTERNS = [
  '/ssl/',
  '/certs/',
  '/tls/',
  '/private/',
  '/secrets/',
];

const SECRET_EXTENSION_PATTERNS = [
  '.key',
  '.pem',
  '.crt',
  '.cert',
  '.p12',
  '.pfx',
  '.jks',
];

const CONFIG_EXTENSIONS = new Set([
  '.conf',
  '.cfg',
  '.yml',
  '.yaml',
  '.json',
  '.toml',
  '.xml',
  '.ini',
  '.properties',
  '.env',
]);

const DATA_PATHS = [
  '/var/lib/postgresql',
  '/var/lib/mysql',
  '/data/db',
  '/data',
  '/var/lib/redis',
  '/var/lib/rabbitmq',
];

/**
 * Classify a volume mount for K8s conversion.
 */
export function classifyVolume(mount: ComposeVolumeMount): VolumeClassification {
  // tmpfs → emptydir
  if (mount.type === 'tmpfs') return 'emptydir';

  // /tmp paths → emptydir
  if (mount.target.startsWith('/tmp')) return 'emptydir';

  // Named volume → pvc
  if (mount.type === 'volume' && mount.source !== '') return 'pvc';

  // Bind mount classification
  if (mount.type === 'bind') {
    const sourceLower = mount.source.toLowerCase();
    const targetLower = mount.target.toLowerCase();

    // Check for secret patterns in path
    for (const pattern of SECRET_PATH_PATTERNS) {
      if (sourceLower.includes(pattern) || targetLower.includes(pattern)) {
        return 'secret';
      }
    }

    // Check for secret file extensions
    const ext = extname(mount.source).toLowerCase();
    if (SECRET_EXTENSION_PATTERNS.includes(ext)) return 'secret';

    // Check if it's a single file (has extension) vs directory
    const name = basename(mount.source);
    const hasExtension = name.includes('.') && ext !== '';

    if (hasExtension) {
      // Single file: check if config extension
      if (CONFIG_EXTENSIONS.has(ext)) return 'configmap';
      // Other single files → configmap by default
      return 'configmap';
    }

    // Check for data paths
    for (const dataPath of DATA_PATHS) {
      if (mount.target.startsWith(dataPath)) return 'pvc';
    }

    // Directory bind mount → pvc
    return 'pvc';
  }

  // Anonymous volume → pvc
  return 'pvc';
}
