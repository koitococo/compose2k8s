import type {
  ComposePort,
  ComposeVolumeMount,
  ComposeDependsOnEntry,
} from '../types/compose.js';

/**
 * Normalize environment from string[] or Record to Record<string, string>.
 */
export function normalizeEnvironment(
  env: string[] | Record<string, string | number | boolean | null> | undefined,
): Record<string, string> {
  if (!env) return {};

  if (Array.isArray(env)) {
    const result: Record<string, string> = {};
    for (const entry of env) {
      const eqIndex = entry.indexOf('=');
      if (eqIndex === -1) {
        result[entry] = '';
      } else {
        result[entry.slice(0, eqIndex)] = entry.slice(eqIndex + 1);
      }
    }
    return result;
  }

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(env)) {
    result[key] = val === null ? '' : String(val);
  }
  return result;
}

/**
 * Validate that a port number is within the valid range (1-65535).
 */
function validatePort(value: number, raw: string): number {
  if (Number.isNaN(value) || !Number.isInteger(value)) {
    throw new Error(`Invalid port number: "${raw}" is not a valid integer`);
  }
  if (value < 1 || value > 65535) {
    throw new Error(`Port number out of range: ${value} (must be 1-65535)`);
  }
  return value;
}

/**
 * Parse a port string like "8080:80", "80", "8080:80/udp" into a ComposePort.
 */
function parsePortString(port: string): ComposePort {
  let protocol: 'tcp' | 'udp' = 'tcp';
  let portStr = port;

  if (portStr.includes('/')) {
    const parts = portStr.split('/');
    portStr = parts[0];
    const proto = parts[1];
    if (proto !== 'tcp' && proto !== 'udp') {
      throw new Error(`Invalid port protocol: "${proto}" (must be tcp or udp)`);
    }
    protocol = proto;
  }

  // Handle IP binding like "0.0.0.0:8080:80"
  const segments = portStr.split(':');
  if (segments.length === 3) {
    // ip:published:target — validate that first segment looks like an IP
    const ip = segments[0];
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && !ip.startsWith('[')) {
      throw new Error(
        `Invalid port mapping: "${port}" — 3-segment format requires IP:published:target`,
      );
    }
    return {
      target: validatePort(parseInt(segments[2], 10), segments[2]),
      published: validatePort(parseInt(segments[1], 10), segments[1]),
      protocol,
    };
  }
  if (segments.length === 2) {
    return {
      target: validatePort(parseInt(segments[1], 10), segments[1]),
      published: validatePort(parseInt(segments[0], 10), segments[0]),
      protocol,
    };
  }

  return {
    target: validatePort(parseInt(segments[0], 10), segments[0]),
    protocol,
  };
}

/**
 * Normalize ports from mixed string/number/object array to ComposePort[].
 */
export function normalizePorts(
  ports:
    | Array<
        string | number | { target: number; published?: number | string; protocol?: string }
      >
    | undefined,
): ComposePort[] {
  if (!ports) return [];

  return ports.map((p) => {
    if (typeof p === 'number') {
      return { target: p, protocol: 'tcp' as const };
    }
    if (typeof p === 'string') {
      return parsePortString(p);
    }
    return {
      target: p.target,
      published: p.published !== undefined ? Number(p.published) : undefined,
      protocol: (p.protocol as 'tcp' | 'udp') ?? 'tcp',
    };
  });
}

/**
 * Normalize volume mounts from string or object to ComposeVolumeMount[].
 * Uses topLevelVolumes to disambiguate named volumes from bind mounts.
 */
export function normalizeVolumeMounts(
  volumes:
    | Array<
        | string
        | {
            type?: string;
            source?: string;
            target: string;
            read_only?: boolean;
          }
      >
    | undefined,
  topLevelVolumes: Set<string>,
): ComposeVolumeMount[] {
  if (!volumes) return [];

  return volumes.map((v) => {
    if (typeof v === 'string') {
      return parseVolumeString(v, topLevelVolumes);
    }
    return {
      source: v.source ?? '',
      target: v.target,
      readOnly: v.read_only ?? false,
      type: (v.type as ComposeVolumeMount['type']) ?? 'volume',
    };
  });
}

function parseVolumeString(
  vol: string,
  topLevelVolumes: Set<string>,
): ComposeVolumeMount {
  const parts = vol.split(':');

  if (parts.length === 1) {
    // Anonymous volume: /data
    return { source: '', target: parts[0], readOnly: false, type: 'volume' };
  }

  const source = parts[0];
  const target = parts[1];
  const readOnly = parts[2] === 'ro';

  // Determine type: if source matches a top-level volume name, it's a named volume.
  // If source starts with . or / it's a bind mount.
  let type: ComposeVolumeMount['type'] = 'volume';
  if (topLevelVolumes.has(source)) {
    type = 'volume';
  } else if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
    type = 'bind';
  } else {
    // Could be a named volume not yet declared at top level
    type = 'volume';
  }

  return { source, target, readOnly, type };
}

/**
 * Normalize depends_on from string[] or Record to Record<string, ComposeDependsOnEntry>.
 */
export function normalizeDependsOn(
  dependsOn:
    | string[]
    | Record<string, ComposeDependsOnEntry>
    | undefined,
): Record<string, ComposeDependsOnEntry> {
  if (!dependsOn) return {};

  if (Array.isArray(dependsOn)) {
    const result: Record<string, ComposeDependsOnEntry> = {};
    for (const dep of dependsOn) {
      result[dep] = { condition: 'service_started' };
    }
    return result;
  }

  return dependsOn;
}

/**
 * Normalize labels from string[] or Record to Record<string, string>.
 */
export function normalizeLabels(
  labels: string[] | Record<string, string> | undefined,
): Record<string, string> {
  if (!labels) return {};

  if (Array.isArray(labels)) {
    const result: Record<string, string> = {};
    for (const label of labels) {
      const eqIndex = label.indexOf('=');
      if (eqIndex === -1) {
        result[label] = '';
      } else {
        result[label.slice(0, eqIndex)] = label.slice(eqIndex + 1);
      }
    }
    return result;
  }

  return labels;
}
