import { Controller, Get, Query } from '@nestjs/common';
// @ts-ignore - provided by the workerd runtime
import { env } from 'cloudflare:workers';
import { Public } from '../../../../apps/api/src/app/auth/public.decorator';

// Probe routes are public: they measure bindings, not the auth pipeline.
@Public()
@Controller('g0')
export class ProbesController {
  @Get('do')
  async durableObject(@Query('id') id = 'default', @Query('hint') hint?: string) {
    const ns = (env as any).PROBE;
    // `hint` (e.g. me, eeur, weur) is a Durable Object location hint, used to test placement.
    const stub = ns.get(ns.idFromName(id), hint ? { locationHint: hint } : undefined);
    const t0 = performance.now();
    const res = await stub.fetch('https://probe.invalid/touch');
    const doMs = performance.now() - t0;
    const { n } = (await res.json()) as { n: number };
    return { n, doMs };
  }

  @Get('d1')
  async d1() {
    const db = (env as any).DB;
    if (!db) return { skipped: true };
    const t0 = performance.now();
    await db.exec('CREATE TABLE IF NOT EXISTS g0_probe (id INTEGER PRIMARY KEY, v TEXT)');
    await db.prepare('INSERT INTO g0_probe (v) VALUES (?)').bind('probe').run();
    const row = await db.prepare('SELECT COUNT(*) AS c FROM g0_probe').first();
    return { ok: Number(row?.c) >= 1, d1Ms: performance.now() - t0 };
  }
}
