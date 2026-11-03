import { describe, expect, it } from 'vitest';
import type { Subject } from '@/types/entities';
import { groupByStream, streamHeading } from './streams';

const subject = (id: string, sortOrder: number, parentSubjectId: string | null = null) =>
  ({ id, code: id.toUpperCase(), nameLo: id, sortOrder, parentSubjectId }) as unknown as Subject;

describe('groupByStream', () => {
  // ມ.1's eight, as the sheet orders them: LAO 1 · MATH 2 · CIV 3 · PHYS 4 ·
  // CHEM 5 · BIO 6 · GEO 7 · HIST 8.
  const marked = [
    subject('hist', 8, 'social'),
    subject('lao', 1),
    subject('geo', 7, 'social'),
    subject('bio', 6, 'nature'),
    subject('math', 2),
    subject('civ', 3, 'social'),
    subject('chem', 5, 'nature'),
    subject('phys', 4, 'nature'),
  ];
  const taught = [
    subject('lao', 1),
    subject('math', 2),
    subject('social', 3),
    subject('nature', 4),
  ];

  it('keeps each ສາຍ together, standing where its first subject would', () => {
    const streams = groupByStream(marked, taught);
    expect(
      streams.map(({ parent, subjects }) => [parent?.id ?? null, subjects.map((s) => s.id)]),
    ).toEqual([
      [null, ['lao']],
      [null, ['math']],
      ['social', ['civ', 'geo', 'hist']],
      ['nature', ['phys', 'chem', 'bio']],
    ]);
  });

  it('still keeps siblings together when their parent cannot be named', () => {
    const streams = groupByStream(marked);
    expect(streams[2]).toMatchObject({ parent: null });
    expect(streams[2]!.subjects.map((s) => s.id)).toEqual(['civ', 'geo', 'hist']);
  });
});

describe('streamHeading', () => {
  it('prefixes ສາຍ only where the name lacks it', () => {
    expect(streamHeading('ສັງຄົມ', 'lo')).toBe('ສາຍສັງຄົມ');
    expect(streamHeading('ສາຍສັງຄົມ', 'lo')).toBe('ສາຍສັງຄົມ');
    expect(streamHeading('Social Studies', 'en')).toBe('Social Studies');
  });
});
