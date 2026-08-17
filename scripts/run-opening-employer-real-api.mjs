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
  process.stderr.write(`Real API settings file not found: ${settingsPath}\n`);
  process.exit(2);
}

const environment = {
  ...process.env,
  COPV2_RUN_OPENING_EMPLOYER_REAL_API: '1',
  COPV2_REAL_API_SETTINGS_PATH: settingsPath,
  COPV2_OPENING_EMPLOYER_TIMEOUT_MS:
    process.env.COPV2_OPENING_EMPLOYER_TIMEOUT_MS || '600000'
};

const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(
  process.execPath,
  [
    vitestEntry,
    'run',
    'tests/integration/openingCivilianEmployerRealApi.integration.test.ts',
    '--reporter=verbose',
    '--testTimeout=3600000'
  ],
  {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  }
);

child.on('error', (error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.stderr.write(`Vitest terminated by ${signal}.\n`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
