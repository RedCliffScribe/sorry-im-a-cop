import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = { ...process.env };
const settingsPath = path.resolve(
  environment.COPV2_REAL_API_SETTINGS_PATH || path.join(root, 'sorry-im-a-cop-v2-api-settings.json')
);
const savePath = path.resolve(
  environment.COPV2_LONG_SAVE_PATH || path.join(root, 'tmp', 'long-save-audit-copy-turn-273.zip')
);

if (!existsSync(settingsPath)) {
  console.error(`Real API settings file not found: ${settingsPath}`);
  process.exit(2);
}
if (!existsSync(savePath)) {
  console.error(`Long-save archive not found: ${savePath}`);
  process.exit(2);
}

environment.COPV2_RUN_LONG_SAVE_REAL_API = '1';
environment.COPV2_REAL_API_SETTINGS_PATH = settingsPath;
environment.COPV2_LONG_SAVE_PATH = savePath;

const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(
  process.execPath,
  [
    vitestEntry,
    'run',
    'tests/integration/longSaveCaseAndPregnancyRealApi.integration.test.ts',
    '--reporter=verbose',
    '--testTimeout=1200000'
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
