// One default layout shared by registration, discovery, UI and Agent context.
export const projectLayout = Object.freeze({
  ruleFiles: Object.freeze(['AGENTS.md']),
  ruleRoots: Object.freeze(['.agent-workbench/rules']),
  journalDir: 'docs/maintenance',
  decisionDir: '.agents/notes',
  legacyJournalDir: '.trellis/workspace',
});
export const indexFiles = project => project.ruleRoots.map(dir => `${dir}/index.md`);
