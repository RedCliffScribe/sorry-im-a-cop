import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settingsPath = path.resolve(
  process.env.COPV2_REAL_API_SETTINGS_PATH || path.join(root, 'sorry-im-a-cop-v2-api-settings.json')
);
const requestedLevels = (process.env.COPV2_NARRATIVE_LENGTH_LEVELS || 'compact,standard,long,immersive')
  .split(',')
  .map((level) => level.trim())
  .filter(Boolean);
const validLevels = new Set(['compact', 'standard', 'long', 'immersive']);

if (!existsSync(settingsPath)) {
  console.error(`Real API settings file not found: ${settingsPath}`);
  process.exit(2);
}

if (requestedLevels.length === 0 || requestedLevels.some((level) => !validLevels.has(level))) {
  console.error(`Invalid narrative length levels: ${requestedLevels.join(',')}`);
  process.exit(2);
}

const vitestEntry = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');

function runLevel(level) {
  return new Promise((resolve, reject) => {
    console.log(`[narrative-length-real] starting level=${level}`);
    const child = spawn(
      process.execPath,
      [
        vitestEntry,
        'run',
        'tests/integration/narrativeStyleRealApi.integration.test.ts',
        '--reporter=verbose',
        '--testTimeout=7200000'
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          COPV2_RUN_NARRATIVE_STYLE_REAL_API: '1',
          COPV2_REAL_API_SETTINGS_PATH: settingsPath,
          COPV2_NARRATIVE_STYLE_REQUEST_TIMEOUT_MS:
            process.env.COPV2_NARRATIVE_STYLE_REQUEST_TIMEOUT_MS || '600000',
          COPV2_NARRATIVE_STYLE_SCENARIOS: 'police_paperwork',
          COPV2_NARRATIVE_STYLE_LENGTH_LEVEL: level
        },
        stdio: 'inherit',
        windowsHide: true
      }
    );
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Vitest terminated by ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Narrative length real API test failed for ${level} with exit code ${code}.`));
        return;
      }
      console.log(`[narrative-length-real] passed level=${level}`);
      resolve();
    });
  });
}

for (const level of requestedLevels) {
  await runLevel(level);
}

console.log(`[narrative-length-real] all levels passed: ${requestedLevels.join(',')}`);
