import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { composeSchema } from './schema.js';
import { parseEnvFile, interpolateAll } from './env.js';
import {
  normalizeEnvironment,
  normalizePorts,
  normalizeVolumeMounts,
  normalizeDependsOn,
  normalizeLabels,
} from './normalize.js';
import type { ComposeProject, ComposeService, ParseResult } from '../types/compose.js';

export interface ParseOptions {
  file: string;
  envFile?: string;
  workingDir?: string;
}

/**
 * Parse a Docker Compose file into a normalized ComposeProject.
 */
export async function parseComposeFile(options: ParseOptions): Promise<ParseResult> {
  const warnings: string[] = [];

  // Read compose file
  const content = await readFile(options.file, 'utf-8');

  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch (err) {
    throw new Error(
      `Failed to parse YAML in ${options.file}: ${(err as Error).message}`,
    );
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(
      `Invalid compose file: ${options.file} does not contain a valid YAML object`,
    );
  }

  // Load env file — use workingDir if provided, else dirname of compose file
  const baseDir = options.workingDir ?? dirname(resolve(options.file));
  let env: Record<string, string> = { ...process.env as Record<string, string> };
  const autoEnvPath = resolve(baseDir, '.env');
  const envFilePath = options.envFile ?? (existsSync(autoEnvPath) ? autoEnvPath : null);
  if (envFilePath && existsSync(envFilePath)) {
    const envContent = await readFile(envFilePath, 'utf-8');
    const fileEnv = parseEnvFile(envContent);
    env = { ...env, ...fileEnv };
  }

  // Interpolate variables
  const interpolated = interpolateAll(raw, env);

  // Validate with zod
  let parsed: ReturnType<typeof composeSchema.parse>;
  try {
    parsed = composeSchema.parse(interpolated);
  } catch (err) {
    const zodErr = err as { errors?: Array<{ path: (string | number)[]; message: string }> };
    if (zodErr.errors) {
      const details = zodErr.errors
        .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
        .join('\n');
      throw new Error(
        `Invalid compose file structure in ${options.file}:\n${details}`,
      );
    }
    throw new Error(
      `Invalid compose file structure in ${options.file}: ${(err as Error).message}`,
    );
  }

  // Build top-level volume set for disambiguation
  const topLevelVolumes = new Set(Object.keys(parsed.volumes ?? {}));

  // Normalize services
  const services: Record<string, ComposeService> = {};
  for (const [name, rawService] of Object.entries(parsed.services)) {
    const svc = rawService as Record<string, unknown>;

    // Handle env_file: load additional env files and merge into environment
    let envFromFiles: Record<string, string> = {};
    if (svc.env_file) {
      const composeDir = baseDir;
      const envFiles = Array.isArray(svc.env_file) ? svc.env_file : [svc.env_file];
      for (const ef of envFiles) {
        const efPath = typeof ef === 'string' ? ef : (ef as { path: string }).path;
        const fullPath = resolve(composeDir, efPath);
        // Prevent path traversal: env_file must resolve within the compose directory
        if (!fullPath.startsWith(composeDir + '/') && fullPath !== composeDir) {
          warnings.push(`env_file path escapes compose directory for service "${name}": ${efPath} (skipped)`);
          continue;
        }
        if (existsSync(fullPath)) {
          const efContent = await readFile(fullPath, 'utf-8');
          envFromFiles = { ...envFromFiles, ...parseEnvFile(efContent) };
        } else {
          warnings.push(`env_file not found for service "${name}": ${efPath}`);
        }
      }
    }

    const normalizedEnv = {
      ...envFromFiles,
      ...normalizeEnvironment(svc.environment as Parameters<typeof normalizeEnvironment>[0]),
    };

    let normalizedNetworks: string[] | undefined;
    if (svc.networks) {
      if (Array.isArray(svc.networks)) {
        normalizedNetworks = svc.networks as string[];
      } else {
        const networkRecord = svc.networks as Record<string, unknown>;
        normalizedNetworks = Object.keys(networkRecord);
        // Warn if network-level config (ipv4_address, aliases, etc.) is being discarded
        for (const [netName, netConfig] of Object.entries(networkRecord)) {
          if (netConfig && typeof netConfig === 'object' && Object.keys(netConfig).length > 0) {
            warnings.push(
              `Network configuration for "${name}" on network "${netName}" is not supported and will be ignored`,
            );
          }
        }
      }
    }

    services[name] = {
      ...svc,
      environment: normalizedEnv,
      ports: normalizePorts(svc.ports as Parameters<typeof normalizePorts>[0]),
      volumes: normalizeVolumeMounts(
        svc.volumes as Parameters<typeof normalizeVolumeMounts>[0],
        topLevelVolumes,
      ),
      depends_on: normalizeDependsOn(
        svc.depends_on as Parameters<typeof normalizeDependsOn>[0],
      ),
      labels: normalizeLabels(svc.labels as Parameters<typeof normalizeLabels>[0]),
      networks: normalizedNetworks,
    } as ComposeService;
  }

  const project: ComposeProject = {
    version: parsed.version,
    services,
    volumes: (parsed.volumes as ComposeProject['volumes']) ?? {},
    networks: (parsed.networks as ComposeProject['networks']) ?? {},
  };

  return { project, warnings, sourceFile: options.file };
}
