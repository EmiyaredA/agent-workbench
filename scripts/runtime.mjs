import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function runtimePackages(root) {
  const lockFile = fs.existsSync(path.join(root,'npm-shrinkwrap.json')) ? 'npm-shrinkwrap.json' : 'package-lock.json';
  const lock = JSON.parse(fs.readFileSync(path.join(root, lockFile), 'utf8'));
  return Object.entries(lock.packages).filter(([name, entry]) => name.startsWith('node_modules/') && !entry.dev);
}

export function ensureRuntime(root) {
  const missing = runtimePackages(root).filter(([name, entry]) => {
    try {
      const installed = JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8'));
      return installed.version !== entry.version;
    } catch {
      return !entry.optional;
    }
  });
  if (!missing.length) return;
  console.error('首次启动或依赖版本已更新，正在按锁文件准备运行依赖（需要联网，不执行安装脚本）…');
  const args = ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
  // npm start supplies its CLI path; direct node startup uses npm on PATH.
  const npmCLI = process.env.npm_execpath;
  const result = npmCLI
    ? spawnSync(process.execPath, [npmCLI, ...args], { cwd: root, stdio: 'inherit' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) {
    throw Error('运行依赖准备失败，请确认 npm 可用且网络正常后重试；也可使用内置依赖的离线分发包。');
  }
}
