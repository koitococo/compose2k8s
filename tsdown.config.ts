import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  outputOptions: {
    banner: '#!/usr/bin/env node\n',
  },
  clean: true,
  noExternal: [/.*/],
});
