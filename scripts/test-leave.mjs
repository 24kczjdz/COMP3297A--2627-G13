import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Compile the shared/UI regressions with the existing Vite dependency toolchain.
const test_directory = await mkdtemp(join(tmpdir(), 'leaveflow-regressions-'));
try {
  const test_path = join(test_directory, 'leave.test.cjs');
  await build({ entryPoints: ['scripts/test-leave.tsx'], outfile: test_path,
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', logLevel: 'warning' });
  const result = spawnSync(process.execPath, ['--test', test_path], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(test_directory, { recursive: true, force: true });
}
