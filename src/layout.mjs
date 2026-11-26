// Fixed project layout shared by registration, discovery, UI and Agent context.
export const projectLayout = Object.freeze({
  ruleFiles: Object.freeze(['AGENTS.md']),
  ruleRoots: Object.freeze(['.agent-workbench/rules']),
  journalDir: 'docs/maintenance',
  requirementRoots: Object.freeze(['docs/需求/进行中','docs/需求/已完成']),
  decisionDir: '.agents/notes',
});
export const indexFiles = project => project.ruleRoots.map(dir => `${dir}/index.md`);
