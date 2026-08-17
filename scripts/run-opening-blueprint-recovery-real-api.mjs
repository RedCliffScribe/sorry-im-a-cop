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
  COPV2_RUN_OPENING_BLUEPRINT_RECOVERY_REAL_API: '1',
  COPV2_REAL_API_SETTINGS_PATH: settingsPath,
  COPV2_OPENING_BLUEPRINT_RECOVERY_PROFILE:
    process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_PROFILE || 'api_yuqing',
  COPV2_OPENING_BLUEPRINT_RECOVERY_MODEL:
    process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_MODEL || 'grok-4.20-fast',
  COPV2_OPENING_BLUEPRINT_RECOVERY_RUNS:
    process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_RUNS || '5',
  COPV2_OPENING_BLUEPRINT_RECOVERY_TIMEOUT_MS:
    process.env.COPV2_OPENING_BLUEPRINT_RECOVERY_TIMEOUT_MS || '600000'
};

const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const child = spawn(
  process.execPath,
  [
    vitestEntry,
    'run',
    'tests/integration/openingBlueprintRecoveryRealApi.integration.test.ts',
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
