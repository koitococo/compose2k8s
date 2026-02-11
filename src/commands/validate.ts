import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import * as p from '@clack/prompts';
import chalk from 'chalk';

export interface ValidateOptions {
  dir?: string;
}

async function findYamlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findYamlFiles(fullPath));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function validate(options: ValidateOptions): Promise<void> {
  const dir = resolve(options.dir ?? './k8s');

  let files: string[];
  try {
    files = await findYamlFiles(dir);
  } catch {
    p.log.warn(`Directory not found: ${dir}`);
    return;
  }

  if (files.length === 0) {
    p.log.warn(`No YAML files found in ${dir}`);
    return;
  }

  let valid = 0;
  let invalid = 0;

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const docs = content.split(/^---$/m).filter((d) => d.trim());

    for (const doc of docs) {
      try {
        const parsed = parseYaml(doc);
        if (!parsed || typeof parsed !== 'object') {
          p.log.error(`${file}: Empty or non-object document`);
          invalid++;
          continue;
        }

        const missing: string[] = [];
        if (!parsed.apiVersion) missing.push('apiVersion');
        if (!parsed.kind) missing.push('kind');
        if (!parsed.metadata?.name) missing.push('metadata.name');

        if (missing.length > 0) {
          p.log.error(`${file}: Missing required fields: ${missing.join(', ')}`);
          invalid++;
        } else {
          valid++;
        }
      } catch (err) {
        p.log.error(`${file}: YAML parse error: ${(err as Error).message}`);
        invalid++;
      }
    }
  }

  console.log('');
  if (invalid === 0) {
    console.log(chalk.green(`All ${valid} manifests are valid.`));
  } else {
    console.log(chalk.yellow(`${valid} valid, ${invalid} invalid manifests.`));
  }
}
