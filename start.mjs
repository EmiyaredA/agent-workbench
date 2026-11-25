#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureRuntime } from './scripts/runtime.mjs';

try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw Error('需要 Node.js 24 或以上版本。');
  const root = path.dirname(fileURLToPath(import.meta.url));
  ensureRuntime(root);
  process.argv[1] = path.join(root, 'src/server.mjs');
  await import(pathToFileURL(process.argv[1]).href);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
