import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];

if (mode !== 'real' && mode !== 'load') {
  console.error('Usage: node scripts/run-background-evolution-test.mjs <real|load>');
  process.exit(2);
}

const environment = { ...process.env };
let testFile;
let timeoutMs;

if (mode === 'real') {
  const settingsPath = path.resolve(
    environment.COPV2_REAL_API_SETTINGS_PATH || path.join(root, 'sorry-im-a-cop-v2-api-settings.json')
  );
  if (!existsSync(settingsPath)) {
    console.error(`Real API settings file not found: ${settingsPath}`);
    process.exit(2);
  }
  environment.COPV2_RUN_BACKGROUND_EVOLUTION_REAL_API = '1';
  environment.COPV2_REAL_API_SETTINGS_PATH = settingsPath;
  testFile = 'tests/integration/backgroundEvolutionRealApi.integration.test.ts';
  timeoutMs = '1200000';
} else {
  environment.COPV2_RUN_BACKGROUND_EVOLUTION_LONG_LOAD = '1';
  testFile = 'tests/load/backgroundEvolutionLongRun.load.test.ts';
  timeoutMs = '300000';
}

const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(process.execPath, [vitestEntry, 'run', testFile, '--reporter=verbose', `--testTimeout=${timeoutMs}`], {
  cwd: root,
  env: environment,
  stdio: 'inherit',
  windowsHide: true
});

child.on('error', (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Vitest terminated by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
