import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkTimeline } from './check-timeline.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
const types = ['cooperative', 'antagonistic', 'neutral'];
const scopes = ['Federal', 'State', 'Local', 'Community'];
const text = (value, where) => assert(typeof value === 'string' && value.trim(), `${where} must be non-empty text`);
const list = (value, where) => assert(Array.isArray(value), `${where} must be an array`);
const integer = (value, where) => assert(Number.isSafeInteger(value) && value >= 0, `${where} must be a non-negative safe integer`);
const unique = (items, where) => assert.equal(new Set(items).size, items.length, `${where} has duplicate IDs`);

export function validateData(data) {
  assert(data && typeof data === 'object', 'Missing showcase object');
  assert(data.meta && typeof data.meta === 'object', 'Missing provenance metadata');
  text(data.meta.source, 'meta.source');
  text(data.meta.notice, 'meta.notice');
  for (const key of ['sourceSha256', 'csvSha256']) assert(/^[a-f0-9]{64}$/i.test(data.meta[key]), `Invalid ${key}`);
  const summary = data.meta.summary;
  assert(summary && typeof summary === 'object', 'Missing corpus summary');
  for (const key of ['actors', 'pairs', 'countedTies', 'articles', 'sourceRows']) integer(summary[key], `summary.${key}`);
  assert(summary.articles <= summary.sourceRows && summary.countedTies <= summary.sourceRows, 'Invalid corpus totals');
  for (const key of ['nodes', 'edges', 'stories']) {
    list(data[key], key);
    assert(data[key].length, `${key} must not be empty`);
    unique(data[key].map(item => item.id), key);
  }
  const nodes = new Map(data.nodes.map(node => [node.id, node]));
  const edges = new Map(data.edges.map(edge => [edge.id, edge]));
  for (const node of data.nodes) {
    text(node.id, 'node.id');
    assert(/^\d+$/.test(node.id), `Non-numeric actor UID ${node.id}`);
    text(node.label, `node ${node.id} label`);
    text(node.type, `node ${node.id} type`);
    assert(scopes.includes(node.scope), `Invalid scope for ${node.id}`);
  }
  const pairKeys = [];
  const evidenceIds = [];
  let selectedRecordCount = 0;
  for (const edge of data.edges) {
    text(edge.id, 'edge.id');
    assert(nodes.has(edge.a) && nodes.has(edge.b), `Missing actor for edge ${edge.id}`);
    assert(BigInt(edge.a) < BigInt(edge.b), `Edge ${edge.id} must use ascending, distinct UIDs`);
    pairKeys.push(`${edge.a}:${edge.b}`);
    assert(edge.counts && typeof edge.counts === 'object', `Missing counts for ${edge.id}`);
    for (const type of types) integer(edge.counts[type], `${edge.id}.${type}`);
    const count = types.reduce((sum, type) => sum + edge.counts[type], 0);
    assert(count > 0, `No classified records for ${edge.id}`);
    assert(edge.counts.cooperative + edge.counts.antagonistic > 0, `Curated pair ${edge.id} has no drawable non-neutral records`);
    selectedRecordCount += count;
    list(edge.evidence, `${edge.id}.evidence`);
    const evidenceCounts = Object.fromEntries(types.map(type => [type, 0]));
    for (const record of edge.evidence) {
      for (const key of ['id', 'articleId', 'title', 'date', 'publication', 'sourceA', 'sourceB', 'canonicalA', 'canonicalB', 'uidA', 'uidB', 'excerpt']) text(record[key], `${edge.id} evidence.${key}`);
      assert(/^\d{4}-\d{2}-\d{2}/.test(record.date) && !Number.isNaN(Date.parse(record.date)), `Invalid date for ${record.id}`);
      integer(record.relationshipIndex, `${record.id}.relationshipIndex`);
      assert(types.includes(record.interaction), `Invalid classification for ${record.id}`);
      assert(typeof record.relationship === 'string', `Invalid extracted relationship for ${record.id}`);
      assert.deepEqual([record.uidA, record.uidB].sort((a, b) => Number(a) - Number(b)), [edge.a, edge.b], `Evidence pair mismatch for ${record.id}`);
      evidenceIds.push(record.id);
      evidenceCounts[record.interaction] += 1;
    }
    for (const type of types) assert(evidenceCounts[type] <= edge.counts[type], `Curated ${type} evidence exceeds full aggregate for ${edge.id}`);
  }
  unique(pairKeys, 'actor pairs');
  unique(evidenceIds, 'evidence records');
  assert(data.nodes.length <= summary.actors && data.edges.length <= summary.pairs && selectedRecordCount <= summary.countedTies, 'Curated subset exceeds corpus summary');
  for (const story of data.stories) {
    for (const key of ['id', 'title', 'kicker', 'description', 'takeaway']) text(story[key], `story.${key}`);
    for (const key of ['nodeIds', 'edgeIds', 'contextEdgeIds', 'steps']) list(story[key], `${story.id}.${key}`);
    assert(story.nodeIds.length && story.edgeIds.length && story.steps.length, `Incomplete story ${story.id}`);
    unique(story.nodeIds, `${story.id} actor IDs`);
    unique([...story.edgeIds, ...story.contextEdgeIds], `${story.id} edge IDs`);
    for (const id of story.nodeIds) assert(nodes.has(id), `Unknown actor ${id} in ${story.id}`);
    for (const id of [...story.edgeIds, ...story.contextEdgeIds]) assert(edges.has(id), `Unknown edge ${id} in ${story.id}`);
    for (const id of story.edgeIds) for (const endpoint of [edges.get(id).a, edges.get(id).b]) assert(story.nodeIds.includes(endpoint), `Main story ${story.id} omits endpoint ${endpoint}`);
    for (const step of story.steps) {
      text(step.title, `${story.id} step title`);
      text(step.text, `${story.id} step text`);
      list(step.edgeIds, `${story.id} step edge IDs`);
      unique(step.edgeIds, `${story.id} step edge IDs`);
      // Context is always displayed and can now be part of the guided journey.
      for (const id of step.edgeIds) assert([...story.edgeIds, ...story.contextEdgeIds].includes(id), `Step in ${story.id} references an undisplayed edge ${id}`);
    }
  }
  return { actors: data.nodes.length, pairs: data.edges.length, excerpts: evidenceIds.length, stories: data.stories.length };
}

export function validateNetwork(full, curated) {
  assert(full?.meta && Array.isArray(full.nodes) && Array.isArray(full.edges), 'Missing full network');
  assert.equal(full.meta.csvSha256, curated.meta.csvSha256, 'Full network CSV version differs');
  assert.equal(full.meta.actorClassificationSha256, curated.meta.actorClassificationSha256, 'Classification version differs');
  const nodes = new Map(full.nodes.map(n => [n.id, n]));
  const edges = new Map(full.edges.map(e => [e.id, e]));
  assert.equal(nodes.size, full.nodes.length, 'Duplicate full actor');
  assert.equal(edges.size, full.edges.length, 'Duplicate full pair');
  assert.equal(nodes.size, curated.meta.summary.actors);
  assert.equal(edges.size, curated.meta.summary.pairs);
  assert.equal(full.meta.actors, nodes.size);
  assert.equal(full.meta.pairs, edges.size);
  for (const n of nodes.values()) {
    text(n.id, 'full actor ID'); text(n.label, 'full actor label'); text(n.type, 'full actor type');
    assert([...scopes, 'Other'].includes(n.scope), `Invalid full scope ${n.id}`);
    for (const axis of ['x', 'y']) assert(Number.isFinite(n[axis]) && n[axis] >= 0 && n[axis] <= 1, `Invalid ${axis} for ${n.id}`);
  }
  let count = 0;
  for (const e of edges.values()) {
    assert(nodes.has(e.a) && nodes.has(e.b) && BigInt(e.a) < BigInt(e.b), `Invalid full edge ${e.id}`);
    assert.equal(e.id, `${e.a}-${e.b}`);
    for (const t of types) integer(e.counts[t], `full ${e.id}.${t}`);
    const sum = types.reduce((n, t) => n + e.counts[t], 0);
    // The source CSV retains some pairs with only nonstandard source classifications.
    // Their three exported classification counts are zero; retain the topology faithfully.
    count += sum;
  }
  assert.equal(count, curated.meta.summary.countedTies);
  assert.equal(count, full.meta.countedTies);
  for (const n of curated.nodes) for (const k of ['label', 'scope', 'type']) assert.equal(nodes.get(n.id)?.[k], n[k], `Curated/full actor mismatch ${n.id}`);
  for (const e of curated.edges) assert.deepEqual(edges.get(e.id), { id: e.id, a: e.a, b: e.b, counts: e.counts }, `Curated/full pair mismatch ${e.id}`);
  return { actors: nodes.size, pairs: edges.size, countedTies: count };
}

export async function checkData() {
  const data = JSON.parse(await readFile(new URL('../src/data/showcase.json', import.meta.url), 'utf8'));
  const full = JSON.parse(await readFile(new URL('../src/data/network.json', import.meta.url), 'utf8'));
  const network = validateNetwork(full, data);
  console.log(`Full network checks passed: ${network.actors} actors, ${network.pairs} pairs, ${network.countedTies} counted ties.`);
  const result = validateData(data);
  await checkTimeline(full, data);
  console.log(`Data checks passed: ${result.actors} curated actors, ${result.pairs} pairs, ${result.excerpts} excerpts, ${result.stories} stories.`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkData().catch(error => { console.error(`Data validation failed: ${error.message}`); process.exitCode = 1; });
}
