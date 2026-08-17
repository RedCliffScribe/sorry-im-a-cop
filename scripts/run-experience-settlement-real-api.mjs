import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settingsPath = path.resolve(
  process.env.COPV2_REAL_API_SETTINGS_PATH ??
    path.join(root, 'sorry-im-a-cop-v2-api-settings.json')
);

if (!existsSync(settingsPath)) {
  console.error(`Real API settings file not found: ${settingsPath}`);
  process.exit(2);
}

const child = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules', 'vitest', 'vitest.mjs'),
    'run',
    'tests/integration/experienceSettlementRealApi.integration.test.ts',
    '--reporter=verbose',
    '--testTimeout=14400000'
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      COPV2_RUN_EXPERIENCE_REAL_API: '1',
      COPV2_REAL_API_SETTINGS_PATH: settingsPath
    },
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
