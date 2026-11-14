import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, extractAmount, extractParties, auConfidence, articleToCandidate, scoreEvent, cleanTitle } from '../scripts/liquidity/parse.mjs';
import { parseRss } from '../scripts/liquidity/sources.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('classify picks the most liquidity-relevant type', () => {
  assert.equal(classify('Kinetica sold to Brightwater').type, 'exit');
  assert.equal(classify('Ledgerline raises $75m Series C').type, 'funding');
  assert.equal(classify('Harbourview takes majority stake in Tallis').type, 'pe');
  assert.equal(classify('Acme lists on the ASX').type, 'ipo');
  assert.equal(classify('Founder sells down $40m block trade').type, 'selldown');
  assert.equal(classify('Weather turns cold in Hobart'), null);
});

test('extractAmount normalises to AUD millions', () => {
  assert.deepEqual(extractAmount('sold for $180 million'), { audM: 180, text: '$180 million' });
  assert.equal(extractAmount('a $1.2 billion deal').audM, 1200);
  assert.equal(extractAmount('US$50m round').audM, 77.5);
  assert.equal(extractAmount('no money here'), null);
});

test('extractParties handles common headline shapes', () => {
  assert.deepEqual(extractParties('Brightwater Health acquires Sydney physio chain Kinetica Clinics'),
    { target: 'Kinetica Clinics', counterparty: 'Brightwater Health' });
  assert.equal(extractParties('Melbourne family-owned packaging firm Corbel Packaging sold to US giant for $180 million').target, 'Corbel Packaging');
  assert.equal(extractParties('Perth fintech Ledgerline raises $75m Series C').target, 'Ledgerline');
  assert.equal(extractParties('Private equity firm Harbourview Capital takes majority stake in Brisbane engineering group Tallis').target, 'Tallis');
});

test('auConfidence requires an Australian signal', () => {
  assert.equal(auConfidence('Nvidia acquires California chip startup', 'Reuters', 'https://reuters.com/x'), 0);
  assert.ok(auConfidence('Sydney startup acquired', 'SmartCompany', '') >= 2);
});

test('noise and non-Australian stories are dropped', () => {
  assert.equal(articleToCandidate({ title: 'Swans trade star to Adelaide in AFL draft pick deal - news.com.au', source: 'news.com.au', link: 'x' }), null);
  assert.equal(articleToCandidate({ title: 'Nvidia acquires California chip startup - Reuters', source: 'Reuters', link: 'https://reuters.com' }), null);
});

test('scoring rewards exits over funding rounds', () => {
  const now = new Date();
  const base = { auConfidence: 2, latestPubDate: now.toISOString(), articles: [{}], amountAudM: 50 };
  const exit = scoreEvent({ ...base, type: 'exit' }, now).score;
  const fund = scoreEvent({ ...base, type: 'funding' }, now).score;
  assert.ok(exit > fund);
});

test('cleanTitle strips the Google News publisher suffix', () => {
  assert.equal(cleanTitle('Acme sold to Beta - The Australian Financial Review', 'The Australian Financial Review'), 'Acme sold to Beta');
});

test('parseRss reads items and decodes entities', () => {
  const xml = '<rss><item><title>A &amp; B sold</title><link>https://x</link><pubDate>Mon, 09 Nov 2026 00:00:00 GMT</pubDate><description><![CDATA[<p>Hi</p>]]></description></item></rss>';
  const [a] = parseRss(xml, 'Feed');
  assert.equal(a.title, 'A & B sold');
  assert.equal(a.source, 'Feed');
  assert.equal(a.description, 'Hi');
});

test('end-to-end scan on fixtures is idempotent', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'liq-'));
  const out = path.join(dir, 'out.json');
  const runScan = () => execFileSync('node', ['scripts/liquidity-scan.mjs', '--fixtures', 'test/fixtures', '--out', out, '--no-enrich'], { cwd: ROOT });
  runScan();
  const first = JSON.parse(await fs.readFile(out, 'utf8'));
  assert.equal(first.events.length, 4);
  assert.equal(first.events.find(e => e.company === 'Ledgerline').articles.length, 2);
  runScan();
  const second = JSON.parse(await fs.readFile(out, 'utf8'));
  assert.deepEqual(second.events.map(e => [e.id, e.articles.length]), first.events.map(e => [e.id, e.articles.length]));
});
