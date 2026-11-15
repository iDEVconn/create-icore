import { describe, expect, it } from 'vitest';
import { removeNotesKeysBlock } from '../../../../remove-notes.mjs';

const KEYS = [
  'export const keys = {',
  '  nav: {',
  '    dashboard: "x",',
  '  },',
  '    notes: {',
  '      title: "Notes",',
  '        nested: "deep",',
  '    },',
  '    profile: { title: "P" },',
  '};',
  '',
].join('\n');

describe('removeNotesKeysBlock', () => {
  it('drops the notes block (4-space indent, closed by the first 4-space `},`) and nothing else', () => {
    expect(removeNotesKeysBlock(KEYS)).toBe(
      [
        'export const keys = {',
        '  nav: {',
        '    dashboard: "x",',
        '  },',
        '    profile: { title: "P" },',
        '};',
        '',
      ].join('\n'),
    );
  });

  it('leaves the source alone when there is no notes block or it never closes', () => {
    const none = 'export const keys = {\n    profile: {},\n};\n';
    expect(removeNotesKeysBlock(none)).toBe(none);
    const open = 'export const keys = {\n    notes: {\n      a: 1,\n};\n';
    expect(removeNotesKeysBlock(open)).toBe(open);
  });

  it('is linear on a pathological input (the old regex backtracked exponentially)', () => {
    const evil = '    notes: {\n' + ' \n'.repeat(5000);
    const t = Date.now();
    removeNotesKeysBlock(evil);
    expect(Date.now() - t).toBeLessThan(500);
  });
});
