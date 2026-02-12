/**
 * Parse a .env file into a key-value record.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      result[trimmed] = '';
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    if (key === '') continue;

    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Interpolate ${VAR}, $VAR, and ${VAR:-default} in a string.
 */
export function interpolateVariables(
  value: string,
  env: Record<string, string>,
): string {
  // Handle ${VAR:-default} and ${VAR} with brace-depth aware parsing
  let result = '';
  let i = 0;
  while (i < value.length) {
    if (value[i] === '$' && value[i + 1] === '{') {
      // Find var name (until ':' or '}')
      let j = i + 2;
      while (j < value.length && value[j] !== ':' && value[j] !== '}') {
        j++;
      }
      const varName = value.slice(i + 2, j);

      if (j < value.length && value[j] === '}') {
        // Simple ${VAR}
        result += varName in env ? env[varName] : '';
        i = j + 1;
      } else if (j + 1 < value.length && value[j] === ':' && value[j + 1] === '-') {
        // ${VAR:-default} — count brace depth to find matching '}'
        let depth = 1;
        let k = j + 2;
        while (k < value.length && depth > 0) {
          if (value[k] === '{') depth++;
          else if (value[k] === '}') depth--;
          if (depth > 0) k++;
        }
        const defaultValue = value.slice(j + 2, k);
        if (varName in env) {
          result += env[varName];
        } else {
          result += defaultValue;
        }
        i = k + 1;
      } else {
        // Malformed — emit as-is
        result += value[i];
        i++;
      }
    } else {
      result += value[i];
      i++;
    }
  }

  // Handle bare $VAR (not preceded by $ to avoid double-processing)
  result = result.replace(
    /(?<!\$)\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_match, varName: string) => {
      return env[varName] ?? '';
    },
  );

  return result;
}

/**
 * Deep-interpolate all string values in an object.
 */
export function interpolateAll(
  obj: unknown,
  env: Record<string, string>,
): unknown {
  if (typeof obj === 'string') {
    return interpolateVariables(obj, env);
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => interpolateAll(item, env));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = interpolateAll(val, env);
    }
    return result;
  }
  return obj;
}
