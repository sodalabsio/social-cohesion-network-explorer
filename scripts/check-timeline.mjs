import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildWindow} from '../src/timeline.js';

export async function checkTimeline(full,showcase){
 const timeline=JSON.parse(await readFile(new URL('../src/data/timeline.json',import.meta.url),'utf8'));
 const {meta,weeks}=timeline;
 assert.equal(meta.sourceSha256,showcase.meta.sourceSha256);
 assert.equal(meta.networkCsvSha256,full.meta.csvSha256);
 assert.equal(meta.actorClassificationSha256,full.meta.actorClassificationSha256);
 assert.equal(meta.networkSha256,createHash('sha256').update(await readFile(new URL('../src/data/network.json',import.meta.url))).digest('hex'));
 assert.equal(meta.windowWeeks,10);assert.equal(meta.decay,.2);assert.equal(meta.floodDate,'2016-01-27');
 const nodes=new Map(full.nodes.map(n=>[n.id,n])),edges=new Map(full.edges.map(e=>[e.id,e]));
 const totals=new Map(),allNodes=new Set(),allPairs=new Set();let rows=0,fullWindows=0;
 const excluded=n=>['Federal','State'].includes(n.scope)&&['government','police, legal and emergency services'].includes(n.type.toLowerCase().trim());
 assert(weeks.length>=10);
 for(const [i,week] of weeks.entries()){
  assert.deepEqual(Object.keys(week).sort(),['date','metrics','observations']);
  const date=Date.parse(week.date+'T00:00:00Z');assert(Number.isFinite(date));assert.equal(new Date(date).getUTCDay(),1);
  if(i)assert.equal(date-Date.parse(weeks[i-1].date+'T00:00:00Z'),7*86400000);
  const seen=new Set();
  for(const observation of week.observations){
   assert.equal(observation.length,3);const [id,kind,count]=observation,e=edges.get(id);
   assert(e,`Unknown pair ${id}`);assert(['cooperative','antagonistic','neutral','other'].includes(kind));assert(Number.isSafeInteger(count)&&count>0);
   assert(!seen.has(id+':'+kind));seen.add(id+':'+kind);
   for(const uid of [e.a,e.b]){assert(['Federal','State','Local','Community'].includes(nodes.get(uid).scope));allNodes.add(uid);}
   assert(!(excluded(nodes.get(e.a))&&excluded(nodes.get(e.b))));
   rows+=count;allPairs.add(id);if(kind!=='other')totals.set(id+':'+kind,(totals.get(id+':'+kind)||0)+count);
  }
  const window=buildWindow(weeks,i),m=week.metrics;
  if(i<9){assert.equal(m,null);continue;}
  fullWindows++;
  if(window.nodes.size<2){assert.equal(m,null);continue;}
  assert.equal(m.n,window.nodes.size);assert.equal(m.possible,m.n*(m.n-1)/2);
  const parent=new Map([...window.nodes].map(id=>[id,id]));
  const find=id=>{while(parent.get(id)!==id)id=parent.get(id);return id;};
  const degree=new Set();
  for(const e of window.edges.values())if(e.cooperative!=null){parent.set(find(e.a),find(e.b));degree.add(e.a);degree.add(e.b);assert(e.cooperative>=0&&e.cooperative<=9);}
  const components=new Map();for(const id of window.nodes){const root=find(id);components.set(root,(components.get(root)||0)+1);}
  const reachable=[...components.values()].reduce((sum,n)=>sum+n*(n-1)/2,0);
  assert.equal(m.reachable,reachable);assert.equal(m.isolates,m.n-degree.size);
  assert(Math.abs(m.R-reachable/m.possible)<1e-12);
  assert(Number.isFinite(m.E)&&m.E>=0&&m.E<=1);
  if(reachable){assert(m.Q>0&&m.Q<=1);assert(Math.abs(m.E-m.R*m.Q)<1e-12);}else{assert.equal(m.E,0);assert.equal(m.Q,null);}
 }
 for(const [key,count] of totals){const [id,kind]=key.split(':');assert(count<=edges.get(id).counts[kind]);}
 assert.equal(rows,meta.diagnostics.retainedRows);assert.equal(allNodes.size,meta.diagnostics.retainedActors);assert.equal(allPairs.size,meta.diagnostics.retainedPairs);assert.equal(fullWindows,meta.diagnostics.fullWindows);
 // Current-week cooperative refresh is independent of newer antagonistic reports.
 const fixture=Array.from({length:12},()=>({observations:[]}));
 fixture[0].observations=[['1-2','cooperative',2]];fixture[8].observations=[['1-2','antagonistic',1],['2-3','neutral',1]];
 assert.equal(buildWindow(fixture,9).edges.get('1-2').cooperative,9);
 assert.equal(buildWindow(fixture,9).edges.get('1-2').antagonistic,1);
 assert.equal(buildWindow(fixture,10).edges.get('1-2').cooperative,undefined);
 fixture[10].observations=[['1-2','cooperative',1]];assert.equal(buildWindow(fixture,10).edges.get('1-2').cooperative,0);
 assert.equal(buildWindow(fixture,9).nodes.size,3);
 console.log(`Timeline checks passed: ${weeks.length} weekly bins, ${fullWindows} complete windows, ${rows} retained reports.`);
 return timeline;
}
