import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const info = file => { try { return fs.lstatSync(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
export function atomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const previous = info(file);
  if (previous?.isSymbolicLink()) throw Error('不经符号链接写入文件');
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', previous ? previous.mode & 0o777 : 0o600);
    if (previous) fs.fchmodSync(fd,previous.mode & 0o777);
    fs.writeFileSync(fd, text); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
  } finally { if (fd !== undefined) fs.closeSync(fd); if (info(temporary)) fs.unlinkSync(temporary); }
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
// A short synchronous transaction serializes writers from both HTTP and CLI.
export function exclusive(directory, operation) {
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, '.write-lock'); const reclaim = lock + '.reclaim';
  const deadline = Date.now() + 2500; let fd;
  while (fd === undefined) {
    try { fd = fs.openSync(lock, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let recoveryFd;
      try {
        recoveryFd = fs.openSync(reclaim, 'wx');
        let owner; try { owner = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { /* writer may still be acquiring the lock */ }
        if (owner?.pid && !alive(owner.pid)) fs.unlinkSync(lock);
      } catch (e) { if (!['EEXIST','ENOENT'].includes(e.code)) throw e; }
      finally { if (recoveryFd !== undefined) { fs.closeSync(recoveryFd); fs.unlinkSync(reclaim); } }
      if (Date.now() > deadline) { const error = Error('另一项写入正在进行，请稍后重试'); error.status = 423; throw error; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); return operation(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
