#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const passthroughArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== '--runInBand');

const cleanedArgs = ['run', ...passthroughArgs];

if (passthroughArgs.length !== process.argv.slice(2).length) {
  console.log('Note: --runInBand is a Jest flag; ignoring while running vitest in serial mode.');
}

const result = spawnSync('npx', ['vitest', ...cleanedArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITEST_POOL: 'threads',
  },
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
