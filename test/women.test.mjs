import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { articleToSignal, extractPerson, femaleSignal, isSensitive } from '../scripts/women/parse.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const art = (title, description = '', source = 'SmartCompany') => ({ title, description, source, link: 'https://example.com' });

test('bereavement, estate and family-law stories are always excluded', () => {
  assert.ok(isSensitive('Obituary: matriarch dies aged 91'));
  assert.ok(isSensitive('Sisters in bitter estate battle over fortune'));
  assert.ok(isSensitive('Businesswoman finalises divorce'));
  assert.equal(articleToSignal(art('Perth matriarch dies, leaving family business to her daughters', 'Perth')), null);
});

test('gender comes from explicit wording, never from names', () => {
  assert.equal(femaleSignal('Priya Example sells company'), 0);
  assert.ok(femaleSignal('She sold her company') >= 2);
  // Sale story with no explicit reference to a woman is dropped.
  assert.equal(articleToSignal(art('Sydney logistics firm Fastlane sold to US buyer', 'Founder Tom said he was proud.')), null);
});

test('women investing initiatives count without a named woman', () => {
  const s = articleToSignal(art('Scale Investors backs three Melbourne startups', ''));
  assert.equal(s.category, 'women_investing');
});

test('extractPerson handles role prefixes and headline-leading names', () => {
  assert.equal(extractPerson('Philanthropist Grace Example pledges $25 million'), 'Grace Example');
  assert.equal(extractPerson('Anna Example takes the helm as chair'), 'Anna Example');
  assert.equal(extractPerson('Sydney Morning trading update'), null);
});

test('end-to-end scan on fixtures', async () => {
  const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'women-')), 'out.json');
  execFileSync('node', ['scripts/women-scan.mjs', '--fixtures', 'test/fixtures/women', '--out', out, '--no-enrich'], { cwd: ROOT });
  const o = JSON.parse(await fs.readFile(out, 'utf8'));
  const links = o.signals.flatMap(s => s.articles.map(a => a.link));
  assert.equal(o.signals.length, 5);
  const ref = o.signals.find(s => s.category === 'referral_partner');
  assert.ok(ref && ref.organisation === 'Example Legal', 'referral partner found (any gender)');
  assert.ok(!links.some(l => l.endsWith('r-nowomen')), 'accountant story without a women focus is excluded');
  for (const bad of ['w-obit', 'w-dispute', 'w-male']) assert.ok(!links.some(l => l.endsWith(bad)), bad + ' should be excluded');
  assert.equal(o.signals[0].person, 'Priya Example');
});

test('overseas stories and end-of-life stories are excluded', () => {
  assert.equal(articleToSignal(art('German female-founded startup Finches raises €2 million', 'She said', 'Startup Daily'), { female: true, au: 'outlet' }), null);
  assert.equal(articleToSignal(art('Roz Hervey had hours left to live. She asked her family to press record', '', "Women's Agenda"), { female: true, au: 'outlet', category: 'philanthropy' }), null);
});

test('a law firm serving women is not excluded by family-law words', () => {
  const s = articleToSignal(art('Building a divorce law firm for women, by women - Lawyers Weekly', 'Sydney practice', 'Lawyers Weekly'), { au: true, category: 'referral_partner' });
  assert.equal(s && s.category, 'referral_partner');
  assert.equal(articleToSignal(art('Sydney businesswoman finalises divorce', '', 'SMH')), null);
});
