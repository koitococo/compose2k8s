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

const DATA_PATHS = [
  '/var/lib/postgresql',
  '/var/lib/mysql',
  '/data/db',
  '/var/lib/redis',
  '/var/lib/rabbitmq',
  '/data',
];

/**
 * Check if a path contains a given segment (e.g., '/ssl/' matches '/etc/ssl/certs' but not '/result/').
 */
function hasPathSegment(path: string, segment: string): boolean {
  // segment includes leading/trailing slashes like '/ssl/'
  return path.includes(segment);
}

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

    // Check for secret patterns in path (match full path segments)
    for (const pattern of SECRET_PATH_PATTERNS) {
      if (hasPathSegment(sourceLower, pattern) || hasPathSegment(targetLower, pattern)) {
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
      // Single file mount → configmap (config files or other text files)
      return 'configmap';
    }

    // Check for data paths (exact prefix match on path segments)
    for (const dataPath of DATA_PATHS) {
      if (mount.target === dataPath || mount.target.startsWith(dataPath + '/')) return 'pvc';
    }

    // Directory bind mount → pvc
    return 'pvc';
  }

  // Anonymous volume → pvc
  return 'pvc';
}
