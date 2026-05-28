#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import kleur from 'kleur';
import * as p from '@clack/prompts';
import { collectOptions } from './lib/prompts.js';
import { scaffold } from './lib/scaffold.js';

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, '..', 'templates');

async function main() {
  if (!existsSync(templatesDir)) {
    p.log.error(`Templates directory missing: ${templatesDir}`);
    process.exit(1);
  }

  const opts = await collectOptions({ argv: process.argv.slice(2), cwd: process.cwd() });

  if (existsSync(opts.targetDir)) {
    p.log.error(`Target directory already exists: ${opts.targetDir}`);
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Scaffolding project');
  await scaffold(opts, templatesDir);
  spinner.stop('Project scaffolded');

  p.outro(kleur.green('Done.'));
  p.log.info(`Next:`);
  p.log.info(`  cd ${opts.projectName}`);
  if (!opts.install) p.log.info(`  yarn install`);
  p.log.info(`  yarn dev      # gateway + auth MS + upload MS + client`);
  p.log.info(`  open http://localhost:4200`);
  p.log.info(`  edit apps/microservices/auth/.env to plug in real ${opts.authProvider} creds`);
}

main().catch((err) => {
  p.log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
