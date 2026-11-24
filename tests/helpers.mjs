import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Workbench } from '../src/store.mjs';
export function fixture(t, hooks) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'awb-test-')));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const projectRoot = path.join(root,'project'); fs.mkdirSync(projectRoot);
  const data = path.join(root,'state'); const store = new Workbench(data,hooks);
  const project = store.register({root:projectRoot,name:'Fixture'});
  const write = (relative,text) => { const file = path.join(projectRoot,relative); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,text); return file; };
  const proposal = (overrides = {}) => store.propose({projectId:project.id,file:'AGENTS.md',title:'保留已有修改',reason:'不丢失用户工作',source:'用户明确纠正',content:'# 约束\n\n- 保留已有修改。\n',...overrides});
  return {root,data,store,project,projectRoot,write,proposal};
}
