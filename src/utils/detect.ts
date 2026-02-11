import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const COMPOSE_FILE_NAMES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yml',
  'docker-compose.yaml',
];

/**
 * Auto-detect a compose file in a directory.
 */
export function findComposeFile(dir: string): string | null {
  for (const name of COMPOSE_FILE_NAMES) {
    const fullPath = resolve(dir, name);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

/**
 * Find the .env file next to a compose file.
 */
export function findEnvFile(composeFilePath: string): string | null {
  const envPath = resolve(dirname(composeFilePath), '.env');
  return existsSync(envPath) ? envPath : null;
}
