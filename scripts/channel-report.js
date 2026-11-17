#!/usr/bin/env node
/*
 * Which channel is actually producing students?
 *
 *   node scripts/channel-report.js
 *   node scripts/channel-report.js --since 2026-11-12
 *   node scripts/channel-report.js --since 2026-11-12 --spend google=42.50,facebook=56.08
 *
 * Reads the leads table through the AWS CLI, so there is nothing to install and
 * no resource id committed to this public repo - the table is found by looking
 * for the stack's PianoLeadsTable. Needs the `claude-deploy` profile (override
 * with --profile).
 *
 * Counts a lead as WON using the same booked/not-booked vocabulary the status
 * page writes (backend/src/lib/config.js), so the numbers here match whatever
 * you picked from the "Log it" link in the notification text.
 */

const { execFileSync } = require('child_process');

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
}
const SINCE = flag('since');
const PROFILE = flag('profile', 'claude-deploy');
const REGION = flag('region', 'us-east-1');
const SPEND = {};
(flag('spend', '') || '').split(',').filter(Boolean).forEach((pair) => {
  const [k, v] = pair.split('=');
  if (k && v && !Number.isNaN(parseFloat(v))) SPEND[k.trim().toLowerCase()] = parseFloat(v);
});

// Booked statuses, mirrored from backend/src/lib/config.js.
const BOOKED = new Set(['booked', 'displacement_slot_won']);

// --- aws cli ----------------------------------------------------------------
function aws(args) {
  const buf = execFileSync('aws', args.concat(['--profile', PROFILE, '--region', REGION, '--output', 'json']), {
    maxBuffer: 64 * 1024 * 1024,
  });
  // The CLI on Windows can emit the console codepage rather than UTF-8 when a
  // lead contains a dash or curly quote, which makes a strict UTF-8 parse throw.
  try { return JSON.parse(buf.toString('utf8')); } catch { return JSON.parse(buf.toString('latin1')); }
}

function findTable() {
  if (process.env.LEADS_TABLE) return process.env.LEADS_TABLE;
  const names = aws(['dynamodb', 'list-tables']).TableNames || [];
  const match = names.find((n) => n.includes('PianoLeadsTable'));
  if (!match) throw new Error('No PianoLeadsTable found. Set LEADS_TABLE= explicitly.');
  return match;
}

function scanAll(table) {
  const items = [];
  let startKey = null;
  do {
    const args = ['dynamodb', 'scan', '--table-name', table];
    if (startKey) args.push('--exclusive-start-key', JSON.stringify(startKey));
    const page = aws(args);
    items.push(...(page.Items || []));
    startKey = page.LastEvaluatedKey || null;
  } while (startKey);
  return items;
}

const val = (item, key) => {
  const v = item[key];
  if (!v) return '';
  return v.S !== undefined ? v.S : (v.N !== undefined ? v.N : '');
};

// --- channel bucketing ------------------------------------------------------
// The stored source is "<source> / <medium>[ / <campaign>]" for tagged traffic,
// "<host> / referral" for untagged, or "direct".
function channelOf(source) {
  const s = (source || '').toLowerCase();
  if (!s) return 'Untracked (pre-attribution)';
  if (s.startsWith('google')) return 'Google';
  if (s.includes('facebook') || s.includes('instagram') || s.startsWith('ig ') || s.startsWith('meta')) return 'Facebook / Meta';
  if (s.includes('yelp')) return 'Yelp';
  if (s === 'direct') return 'Direct / typed in';
  if (s.includes('bing') || s.includes('duckduckgo') || s.startsWith('google.com')) return 'Organic search';
  return 'Other referral';
}
const SPEND_KEY = { 'Google': 'google', 'Facebook / Meta': 'facebook', 'Yelp': 'yelp' };

// --- run --------------------------------------------------------------------
const table = findTable();
let leads = scanAll(table).map((it) => ({
  name: val(it, 'parentName'),
  at: val(it, 'submittedAt'),
  source: val(it, 'source'),
  status: val(it, 'status'),
}));

const total = leads.length;
if (SINCE) leads = leads.filter((l) => l.at >= SINCE);
leads.sort((a, b) => a.at.localeCompare(b.at));

const groups = new Map();
for (const l of leads) {
  const ch = channelOf(l.source);
  if (!groups.has(ch)) groups.set(ch, { leads: 0, won: 0, campaigns: new Map() });
  const g = groups.get(ch);
  g.leads += 1;
  if (BOOKED.has(l.status)) g.won += 1;
  const campaign = (l.source || '').split(' / ')[2];
  if (campaign) g.campaigns.set(campaign, (g.campaigns.get(campaign) || 0) + 1);
}

const money = (n) => '$' + n.toFixed(2);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

console.log('');
console.log('Leads by channel' + (SINCE ? ' since ' + SINCE : ' (all time)'));
console.log('  table: ' + table);
console.log('  ' + leads.length + ' of ' + total + ' leads in range');
console.log('');
console.log('  ' + pad('CHANNEL', 28) + padL('LEADS', 7) + padL('WON', 6) + padL('SPEND', 11) + padL('PER LEAD', 11) + padL('PER WIN', 11));
console.log('  ' + '-'.repeat(74));

const rows = [...groups.entries()].sort((a, b) => b[1].leads - a[1].leads);
for (const [ch, g] of rows) {
  const spend = SPEND[SPEND_KEY[ch]];
  const perLead = spend !== undefined && g.leads ? money(spend / g.leads) : (spend !== undefined ? 'no leads' : '-');
  const perWin = spend !== undefined && g.won ? money(spend / g.won) : (spend !== undefined ? 'no wins' : '-');
  console.log('  ' + pad(ch, 28) + padL(g.leads, 7) + padL(g.won, 6)
    + padL(spend !== undefined ? money(spend) : '-', 11) + padL(perLead, 11) + padL(perWin, 11));
  for (const [c, n] of g.campaigns) console.log('  ' + pad('    campaign: ' + c, 28) + padL(n, 7));
}

const spentTotal = Object.values(SPEND).reduce((a, b) => a + b, 0);
const wonTotal = rows.reduce((a, [, g]) => a + g.won, 0);
console.log('  ' + '-'.repeat(74));
console.log('  ' + pad('TOTAL', 28) + padL(leads.length, 7) + padL(wonTotal, 6)
  + padL(spentTotal ? money(spentTotal) : '-', 11));

if (!wonTotal && leads.length) {
  console.log('');
  console.log('  Note: no lead is marked as booked yet. "WON" only counts leads you have');
  console.log('  set to Booked on the "Log it" page, so cost-per-win stays blank until then.');
}
console.log('');
