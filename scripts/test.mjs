import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('tests').filter(file => file.endsWith('.test.mjs')).sort().map(file => 'tests/'+file);
if (!files.length) throw Error('No test files found');
const result = spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{encoding:'utf8',maxBuffer:8_000_000});
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
process.exitCode = result.status || (!/^# tests [1-9]\d*$/m.test(result.stdout) ? 1 : 0);
