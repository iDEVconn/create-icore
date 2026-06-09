#!/usr/bin/env node
// Usage: node scripts/audit.mjs <project-dir> [forbiddenDep ...]
import { auditProject } from '../dist/manifest/audit.js';

const [dir, ...forbiddenDeps] = process.argv.slice(2);
if (!dir) {
  console.error('usage: audit.mjs <project-dir> [forbiddenDep ...]');
  process.exit(2);
}
const violations = await auditProject(dir, { forbiddenDeps });
if (violations.length) {
  for (const v of violations) console.error(`AUDIT ${v.kind}: ${v.detail}`);
  process.exit(1);
}
console.log('AUDIT OK: no orphan imports or forbidden deps');
