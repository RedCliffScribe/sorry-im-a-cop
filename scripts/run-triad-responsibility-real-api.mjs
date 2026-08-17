import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settingsPath = path.resolve(
  process.env.COPV2_REAL_API_SETTINGS_PATH || path.join(root, 'sorry-im-a-cop-v2-api-settings.json')
);

if (!existsSync(settingsPath)) {
  console.error(`Real API settings file not found: ${settingsPath}`);
  process.exit(2);
}

const environment = {
  ...process.env,
  COPV2_RUN_TRIAD_RESPONSIBILITY_REAL_API: '1',
  COPV2_REAL_API_SETTINGS_PATH: settingsPath,
  COPV2_TRIAD_RESPONSIBILITY_REQUEST_TIMEOUT_MS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_REQUEST_TIMEOUT_MS || '600000',
  COPV2_TRIAD_RESPONSIBILITY_MIN_TURNS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_MIN_TURNS || '24',
  COPV2_TRIAD_RESPONSIBILITY_MAX_TURNS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_MAX_TURNS || '30',
  COPV2_TRIAD_RESPONSIBILITY_MAX_REQUEST_ATTEMPTS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_MAX_REQUEST_ATTEMPTS || '6',
  COPV2_TRIAD_RESPONSIBILITY_MAX_OPENING_ATTEMPTS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_MAX_OPENING_ATTEMPTS || '3',
  COPV2_TRIAD_RESPONSIBILITY_RETRY_BASE_MS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_RETRY_BASE_MS || '5000',
  COPV2_TRIAD_RESPONSIBILITY_RETRY_MAX_MS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_RETRY_MAX_MS || '60000',
  COPV2_TRIAD_RESPONSIBILITY_TURN_TIMEOUT_MS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_TURN_TIMEOUT_MS || '3600000',
  COPV2_TRIAD_RESPONSIBILITY_TEST_TIMEOUT_MS:
    process.env.COPV2_TRIAD_RESPONSIBILITY_TEST_TIMEOUT_MS || '21600000'
};
const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(
  process.execPath,
  [
    vitestEntry,
    'run',
    'tests/integration/triadResponsibilityRealApi.integration.test.ts',
    '--reporter=verbose',
    '--testTimeout=21600000'
  ],
  {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  }
);

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
