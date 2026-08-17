import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settingsPath = path.resolve(
  process.env.COPV2_REAL_API_SETTINGS_PATH ||
    path.join(root, 'sorry-im-a-cop-v2-api-settings.json')
);

if (!existsSync(settingsPath)) {
  console.error(`Real API settings file not found: ${settingsPath}`);
  process.exit(2);
}

const environment = {
  ...process.env,
  COPV2_RUN_CUSTOM_CONTENT_FIFTY_TURN_REAL_API: '1',
  COPV2_REAL_API_SETTINGS_PATH: settingsPath,
  COPV2_CUSTOM_CONTENT_FIFTY_TURN_TARGET:
    process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_TARGET || '50',
  COPV2_CUSTOM_CONTENT_FIFTY_TURN_REQUEST_TIMEOUT_MS:
    process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_REQUEST_TIMEOUT_MS || '600000',
  COPV2_CUSTOM_CONTENT_FIFTY_TURN_MAX_ATTEMPTS:
    process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_MAX_ATTEMPTS || '2',
  COPV2_CUSTOM_CONTENT_FIFTY_TURN_DELAY_MS:
    process.env.COPV2_CUSTOM_CONTENT_FIFTY_TURN_DELAY_MS || '800'
};

const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(
  process.execPath,
  [
    vitestEntry,
    'run',
    'tests/integration/customContentOpeningRealApi.integration.test.ts',
    '--reporter=verbose',
    '--testTimeout=86400000'
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
