import {createTimeline} from './timeline.js';
(async function () {
'use strict';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;};
const sv=(tag,attrs={},text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));if(text!=null)n.textContent=String(text);return n;};
const fmt=n=>Number(n||0).toLocaleString('en-AU');
const types=['cooperative','antagonistic','neutral'];
const graphTypes=['cooperative','antagonistic'];
const hasVisibleRecords=e=>graphTypes.some(t=>Number(e.counts[t]||0)>0);
const total=e=>types.reduce((n,t)=>n+Number(e.counts[t]||0),0);
const announce=t=>{$('announcer').textContent=t;};
const mobile=()=>matchMedia('(max-width:1000px)').matches;
try {
 const [data,full]=await Promise.all(['showcase','network'].map(async name=>{const r=await fetch(`./data/${name}.json`);if(!r.ok)throw Error(`${name}: HTTP ${r.status}`);return r.json();}));
 if(!data.stories?.length||!full.nodes?.length||!full.edges?.length)throw Error('Incomplete exhibit data');
 const nodes=new Map(full.nodes.map(n=>[String(n.id),n]));
 const edges=new Map(data.edges.map(e=>[String(e.id),e]));
 const allEdges=new Map(full.edges.map(e=>[String(e.id),e]));
 for(const n of full.nodes)if(!Number.isFinite(n.x)||!Number.isFinite(n.y))throw Error(`Missing position ${n.id}`);
 for(const e of full.edges)if(!nodes.has(String(e.a))||!nodes.has(String(e.b)))throw Error(`Missing endpoint ${e.id}`);
 for(const e of data.edges)if(!allEdges.has(String(e.id)))throw Error(`Curated pair outside full network ${e.id}`);
 // Keep the research export intact. The exhibit omits Other actors and their
 // incident pairs, and expands the four retained scope bands to fill the map.
 const displayScopes=['Federal','State','Local','Community'];
 const displayNodes=full.nodes.filter(n=>displayScopes.includes(n.scope)).map(n=>({...n,y:n.y*5/4}));
 const displayIds=new Set(displayNodes.map(n=>String(n.id)));
 for(const n of displayNodes)nodes.set(String(n.id),n);
 const drawableEdges=full.edges.filter(e=>displayIds.has(String(e.a))&&displayIds.has(String(e.b))&&hasVisibleRecords(e));
 if(data.edges.some(e=>!displayIds.has(String(e.a))||!displayIds.has(String(e.b))))throw Error('Curated story references an omitted scope');
 const displaySummary=`${fmt(displayNodes.length)} displayed actors · ${fmt(drawableEdges.length)} displayed pairs`;

 const state={mode:'stories',storyIndex:0,stepIndex:0,selectedEdge:null,view:'overview',mobileView:'network'};
 let temporal;
 const story=()=>data.stories[state.storyIndex],step=()=>story().steps[state.stepIndex];
 const shownEdges=()=>[...story().edgeIds,...story().contextEdgeIds].map(id=>edges.get(String(id))).filter(hasVisibleRecords);
 const shownIds=()=>[...new Set(shownEdges().flatMap(e=>[String(e.a),String(e.b)]))];
 const label=id=>nodes.get(String(id))?.label||String(id);
 const pair=e=>`${label(e.a)} ↔ ${label(e.b)}`;
 function selectNearestEdge(event,fallback){
   if(!event.detail){selectEdge(fallback);return;}
   const svg=$('network'),matrix=svg.getScreenCTM();if(!matrix)return;
   const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
   let nearest=fallback,best=Infinity;
   for(const path of svg.querySelectorAll('.edge-hit')){
     const length=path.getTotalLength();let a=path.getPointAtLength(0);
     for(let i=1;i<=100;i++){
       const b=path.getPointAtLength(length*i/100),dx=b.x-a.x,dy=b.y-a.y;
       const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
       const d=(p.x-a.x-t*dx)**2+(p.y-a.y-t*dy)**2;
       if(d<best){best=d;nearest=path.parentElement.dataset.edgeId;}a=b;
     }
   }selectEdge(nearest);
 }
 const setMobileView=view=>{state.mobileView=view;$('exhibit').dataset.mobileView=view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));requestAnimationFrame(renderGraph);};
 function chooseStory(index,hash=true){state.storyIndex=index;state.stepIndex=0;state.selectedEdge=story().steps[0].edgeIds[0]||story().edgeIds[0];if(hash){try{history.replaceState(null,'',`#${encodeURIComponent(story().id)}`);}catch{/* Local history may be unavailable. */}}$('story-scroll').scrollTop=0;renderStory();announce(`${story().title}. Step 1 of ${story().steps.length}.`);}
 function advance(delta){const index=state.stepIndex+delta;if(index<0||index>=story().steps.length)return;state.stepIndex=index;state.selectedEdge=step().edgeIds[0]||state.selectedEdge;renderStory();announce(`${step().title}. Step ${index+1} of ${story().steps.length}.`);}
 function selectEdge(id){if(!shownEdges().some(e=>e.id===id))return;state.selectedEdge=id;renderEvidence();renderRelationshipList();renderGraph();if(mobile())setMobileView('evidence');$('evidence-heading').focus({preventScroll:true});announce(`Selected ${pair(edges.get(id))}. Evidence is in the evidence panel.`);}
 function renderCards(){data.stories.forEach((s,i)=>{const option=el('option','',`${String(i+1).padStart(2,'0')} / ${s.title}`);option.value=s.id;$('story-select').append(option);});$('story-select').addEventListener('change',event=>{const index=data.stories.findIndex(s=>s.id===event.target.value);if(index>=0)chooseStory(index);});}
 function renderStory(){
   const s=story();$('story-select').value=s.id;$('story-kicker').textContent=`STORY ${state.storyIndex+1} OF ${data.stories.length} · ${s.kicker.replace(/^\d+\s*\/\s*/,'')}`;
   $('story-title').textContent=s.title;$('story-description').textContent=s.description;$('story-takeaway').textContent=s.takeaway;
   $('step-position').textContent=`STEP ${state.stepIndex+1} OF ${s.steps.length}`;$('step-title').textContent=step().title;$('step-text').textContent=step().text;
   $('previous-step').disabled=state.stepIndex===0;$('next-step').disabled=state.stepIndex===s.steps.length-1;$('next-step').textContent=state.stepIndex===s.steps.length-1?'Complete ✓':'Next →';
   $('step-dots').replaceChildren();s.steps.forEach((_,i)=>{const dot=el('span',`step-dot${i===state.stepIndex?' is-active':i<state.stepIndex?' is-complete':''}`);dot.setAttribute('aria-hidden','true');$('step-dots').append(dot);});$('step-dots').setAttribute('aria-label',`Step ${state.stepIndex+1} of ${s.steps.length}`);
   renderRelationshipList();renderEvidence();renderGraph();
 }
 function renderRelationshipList(){const host=$('relationship-list');host.replaceChildren();$('relationship-count').textContent=`${shownEdges().length} pairs`;for(const e of shownEdges()){const b=el('button','relationship-button');b.type='button';b.dataset.edgeId=e.id;b.setAttribute('aria-pressed',String(e.id===state.selectedEdge));b.setAttribute('aria-controls','evidence-content');b.append(el('span','pair-name',pair(e)),el('span','pair-meta',`${fmt(total(e))} records · ${e.evidence.length} curated excerpt${story().edgeIds.includes(e.id)?'':' · context'}`));b.addEventListener('click',()=>selectEdge(e.id));host.append(b);}}
 const field=(list,key,value)=>{const div=el('div');div.append(el('dt','',key),el('dd','',value||'Not supplied'));list.append(div);};
 function renderEvidence(){
   const host=$('evidence-content');host.replaceChildren();const e=edges.get(state.selectedEdge);if(!e){$('evidence-heading').textContent='Choose a highlighted relationship';return;}
   $('evidence-heading').textContent=pair(e);host.dataset.edgeId=e.id;
   for(const [i,r]of e.evidence.entries()){
     const article=el('article','evidence-card');article.append(el('p','eyebrow',`PASSAGE ${i+1} · ${r.interaction.toUpperCase()}`),el('h3','',r.title));const date=new Date(String(r.date).slice(0,10)+'T12:00:00Z');article.append(el('p','article-meta',`${isNaN(date)?r.date:date.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})} · ${r.publication}`),el('p','excerpt-label','NEWS EXCERPT'),el('blockquote','',r.excerpt));
     const details=el('details','evidence-details');details.append(el('summary','','Source details & research mapping'));const list=el('dl','evidence-fields');field(list,'Actor A in the reporting',r.sourceA);field(list,'Actor B in the reporting',r.sourceB);field(list,'Network actor A',`${r.canonicalA} (UID ${r.uidA})`);field(list,'Network actor B',`${r.canonicalB} (UID ${r.uidB})`);field(list,'Reported relationship',r.relationship);field(list,'Interaction type',r.interaction);details.append(list);
     details.append(el('p','record-id',`Article ${r.articleId} · relationship ${r.relationshipIndex} · record ${r.id}`));article.append(details);host.append(article);
   }
   const aggregate=el('details','evidence-details');aggregate.append(el('summary','',`${fmt(total(e))} relationship records`));const badges=el('div','edge-counts');types.forEach(t=>badges.append(el('span',`count-badge ${t}`,`${fmt(e.counts[t])} ${t}`)));aggregate.append(badges);host.append(aggregate);$('evidence-scroll').scrollTop=0;
 }
 // A single fixed layout drives both the real-network canvas and story anchors.
 // Camera framing never recomputes positions; the locator always shows every node.
 function camera(){if(state.mode==='time'||state.view==='overview')return{x:0,y:0,w:1,h:1};const ns=shownIds().map(id=>nodes.get(id));const xs=ns.map(n=>n.x),ys=ns.map(n=>n.y);let w=Math.max(.26,Math.max(...xs)-Math.min(...xs)+.18),h=Math.max(.34,Math.max(...ys)-Math.min(...ys)+.22);w=Math.min(1,w);h=Math.min(1,h);return{x:Math.max(0,Math.min(1-w,(Math.min(...xs)+Math.max(...xs)-w)/2)),y:Math.max(0,Math.min(1-h,(Math.min(...ys)+Math.max(...ys)-h)/2)),w,h};}
 const project=(n,w,h,c)=>{
   // Reserve only the caption and a small lower margin, not a fixed 155px
   // label shelf. Callouts already search for free space around real anchors.
   const top=h<160?18:46;
   const bottom=h<160?16:24;
   const span=Math.max(4,h-top-bottom);
   return{x:28+(n.x-c.x)/c.w*(w-56),y:top+(n.y-c.y)/c.h*span};
 };
 function pathFor(a,b){if(Math.abs(a.y-b.y)<28){const rise=Math.max(18,Math.min(85,Math.abs(a.x-b.x)*.2));return`M${a.x},${a.y} Q${(a.x+b.x)/2},${Math.min(a.y,b.y)-rise} ${b.x},${b.y}`;}return`M${a.x},${a.y} C${a.x},${(a.y+b.y)/2} ${b.x},${(a.y+b.y)/2} ${b.x},${b.y}`;}
 function classificationOffset(e,t,a,b,gap){if(!graphTypes.every(kind=>e.counts[kind]>0))return{x:0,y:0};const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,side=t==='cooperative'?-1:1;return{x:-dy/length*gap*side,y:dx/length*gap*side};}
 function drawCanvas(canvas,w,h,c,mini=false){
   if(!mini)canvas.parentElement.dataset.compact=String(h<160);
   const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas is unavailable');ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
   const p=n=>mini?{x:5+n.x*(w-10),y:5+n.y*(h-10)}:project(n,w,h,c);
   ctx.lineWidth=mini?.35:.6;ctx.strokeStyle=mini?'#7599b940':'#6289a52f';ctx.beginPath();
   // Neutral-only and nonstandard-only pairs are preserved in data, not drawn.
   for(const e of drawableEdges){const a=p(nodes.get(String(e.a))),b=p(nodes.get(String(e.b)));ctx.moveTo(a.x,a.y);if(Math.abs(a.y-b.y)<(mini?4:28)){const rise=Math.max(mini?2:18,Math.min(mini?14:85,Math.abs(a.x-b.x)*.2));ctx.quadraticCurveTo((a.x+b.x)/2,Math.min(a.y,b.y)-rise,b.x,b.y);}else ctx.bezierCurveTo(a.x,(a.y+b.y)/2,b.x,(a.y+b.y)/2,b.x,b.y);}ctx.stroke();
   ctx.fillStyle=mini?'#517d9a90':'#517d9a8c';for(const n of displayNodes){const q=p(n);ctx.beginPath();ctx.arc(q.x,q.y,mini?.65:1.25,0,Math.PI*2);ctx.fill();}
   if(mini){
     ctx.lineWidth=1.3;
     for(const e of shownEdges())for(const t of graphTypes.filter(t=>e.counts[t]>0)){const a=p(nodes.get(String(e.a))),b=p(nodes.get(String(e.b))),offset=classificationOffset(e,t,a,b,1.5);ctx.strokeStyle=t==='antagonistic'?'#ac3c3c':'#006dae';ctx.setLineDash(story().contextEdgeIds.includes(e.id)?[3,2]:[]);ctx.beginPath();ctx.moveTo(a.x+offset.x,a.y+offset.y);ctx.lineTo(b.x+offset.x,b.y+offset.y);ctx.stroke();}
     ctx.setLineDash([]);ctx.fillStyle='#003b63';for(const id of shownIds()){const q=p(nodes.get(id));ctx.beginPath();ctx.arc(q.x,q.y,2.2,0,Math.PI*2);ctx.fill();}
     ctx.strokeStyle='#ce6700';ctx.lineWidth=1;ctx.strokeRect(5+c.x*(w-10),5+c.y*(h-10),c.w*(w-10),c.h*(h-10));
   }
   canvas.dataset.nodeCount=String(displayNodes.length);canvas.dataset.fullNodeCount=String(full.nodes.length);canvas.dataset.edgeCount=String(drawableEdges.length);canvas.dataset.fullEdgeCount=String(full.edges.length);
   canvas.dataset.neutralPaths='0';
 }
 function lines(text,limit){const out=[];let line='';for(const word of String(text).split(/\s+/)){if((line+' '+word).trim().length>limit&&line){out.push(line);line=word;}else line=(line+' '+word).trim();}if(line)out.push(line);return out.length>3?[...out.slice(0,2),out.slice(2).join(' ').slice(0,limit-1)+'…']:out;}
 function renderGraph(){const stage=$('graph-stage'),w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;const c=camera(),svg=$('network');svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.dataset.mode=state.mode;svg.dataset.view=state.view;svg.dataset.storyId=story().id;drawCanvas($('network-background'),w,h,c);
 if(state.mode==='time'){temporal?.renderGraph(svg,w,h);return;}
 svg.setAttribute('role','group');delete svg.dataset.week;delete svg.dataset.windowNodes;delete svg.dataset.windowPairs;svg.append(sv('title',{},`${story().title}, highlighted within ${fmt(displayNodes.length)} displayed actors`),sv('desc',{},'Actor positions follow Federal, State, Local and Community scope bands. Leader lines connect labels to their network positions. Highlighted relationships and the matching buttons in the Story panel open the news excerpts.'));const mc=$('network-minimap');drawCanvas(mc,mc.clientWidth||146,mc.clientHeight||75,c,true);
 const scopeLabels=[];
 displayScopes.forEach((scope,i)=>{const y=project({x:0,y:i/displayScopes.length},w,h,c).y;if(y>=(h<160?12:24)&&y<=h-12){scopeLabels.push({scope,y});svg.append(sv('line',{x1:12,y1:y,x2:w-12,y2:y,class:'scope-rule'}));}});
 const shown=shownEdges(),ids=shownIds(),positions=new Map(ids.map(id=>[id,project(nodes.get(id),w,h,c)]));
 for(const e of shown){const a=positions.get(String(e.a)),b=positions.get(String(e.b));const selected=e.id===state.selectedEdge;const g=sv('g',{class:`edge-group${selected?' is-selected':''}${step().edgeIds.includes(e.id)?' is-emphasised':''}${story().edgeIds.includes(e.id)?'':' is-context'}`,'data-edge-id':e.id,role:'button',tabindex:0,'aria-label':`${pair(e)}${story().contextEdgeIds.includes(e.id)?'. Story context':''}. ${graphTypes.filter(t=>e.counts[t]>0).join(' and ')} records. Read evidence.`,'aria-pressed':String(selected)});g.append(sv('title',{},pair(e)));for(const t of graphTypes.filter(t=>e.counts[t]>0)){const offset=classificationOffset(e,t,a,b,3);g.append(sv('path',{d:pathFor(a,b),transform:`translate(${offset.x} ${offset.y})`,class:`edge-line ${t}`}));}g.append(sv('path',{d:pathFor(a,b),class:'edge-hit'}));g.addEventListener('click',event=>selectNearestEdge(event,e.id));g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEdge(e.id);}});svg.append(g);}
 // Callouts are obstacles, not replacements for actor anchors. Test candidate
 // rectangles against every anchor, sampled highlighted path and scope caption.
 const boxW=Math.min(146,Math.max(110,w*.38)),boxH=60,slots=[];
 const locatorVisible=document.querySelector('.overview-map').getClientRects().length>0;
 const pathPoints=[...svg.querySelectorAll('.edge-hit')].flatMap(path=>{const length=path.getTotalLength();return Array.from({length:101},(_,i)=>path.getPointAtLength(length*i/100));});
 const inside=(p,s,pad=0)=>p.x>=s.x-pad&&p.x<=s.x+boxW+pad&&p.y>=s.y-pad&&p.y<=s.y+boxH+pad;
 for(let y=48;y+boxH<h-14;y+=14)for(let x=12;x+boxW<w-12;x+=14){
   const s={x,y};
   if(locatorVisible&&x+boxW>w-180&&y+boxH>h-115)continue;
   if([...positions.values()].some(p=>inside(p,s,18)))continue;
   if(pathPoints.some(p=>inside(p,s,7)))continue;
   if(scopeLabels.some(l=>x<110&&y<l.y+5&&y+boxH>l.y-20))continue;
   slots.push(s);
 }
 const occupied=[],selected=edges.get(state.selectedEdge);
 const ordered=[...ids].sort((a,b)=>{const selectedA=[String(selected?.a),String(selected?.b)].includes(a),selectedB=[String(selected?.a),String(selected?.b)].includes(b);return Number(selectedB)-Number(selectedA)||positions.get(a).x-positions.get(b).x;});
 for(const id of ordered){
   // Keep the two selected endpoints as the phone's callout priority.
   if(w<=600&&![String(selected?.a),String(selected?.b)].includes(id))continue;
   const n=nodes.get(id),p=positions.get(id);let best=null,cost=Infinity;
   for(const s of slots){if(occupied.some(o=>s.x<o.x+boxW+8&&s.x+boxW+8>o.x&&s.y<o.y+boxH+8&&s.y+boxH+8>o.y))continue;const d=(s.x+boxW/2-p.x)**2+(s.y+boxH/2-p.y)**2;if(d<cost){best=s;cost=d;}}
   if(!best)continue; // On tiny screens keep anchors/lines, not overlapping labels.
   const s=best;occupied.push(s);const connected=[String(selected?.a),String(selected?.b)].includes(id);
   const g=sv('g',{class:`network-node${connected?' is-connected':''}${story().nodeIds.map(String).includes(id)?'':' is-context'}`,'data-node-id':id,'data-anchor-x':n.x,'data-anchor-y':n.y,'pointer-events':'none'});
   const end={x:Math.max(s.x,Math.min(s.x+boxW,p.x)),y:Math.max(s.y,Math.min(s.y+boxH,p.y))};
   g.append(sv('title',{},`${n.label} · ${n.scope} scope · UID ${id}`),sv('path',{d:`M${p.x},${p.y} L${end.x},${end.y}`,class:'label-leader'}),sv('rect',{x:s.x,y:s.y,width:boxW,height:boxH,class:'node-box'}));
   const text=sv('text',{x:s.x+8,y:s.y+14,class:'node-label'});lines(n.label,Math.max(16,Math.floor((boxW-16)/5.5))).forEach((line,i)=>text.append(sv('tspan',{x:s.x+8,dy:i?11:0},line)));g.append(text,sv('text',{x:s.x+8,y:s.y+53,class:'node-scope'},`${n.scope} · ${id}`));svg.append(g);
 }
 // Anchors paint last and never intercept selection of their relationship lines.
 for(const id of ids){const p=positions.get(id),n=nodes.get(id);const g=sv('g',{'data-actor-anchor':id,'data-anchor-x':n.x,'data-anchor-y':n.y,'pointer-events':'none'});g.append(sv('title',{},`${n.label} · ${n.scope} · UID ${id}`),sv('circle',{cx:p.x,cy:p.y,r:12,class:'node-halo'}),sv('circle',{cx:p.x,cy:p.y,r:5,class:'node-dot'}));svg.append(g);}
 for(const {scope,y} of scopeLabels)svg.append(sv('text',{x:13,y:y-7,class:'scope-label','pointer-events':'none'},scope.toUpperCase()));
 $('scene-count').textContent=`${ids.length} highlighted actors · ${shown.length} curated pairs`;$('map-caption').textContent=state.view==='overview'?'Blue highlights locate this story in the full network.':'Closer framing of this story. The locator retains the full network.';$('view-overview').setAttribute('aria-pressed',String(state.view==='overview'));$('view-focus').setAttribute('aria-pressed',String(state.view==='focus'));}
 function provenance(){$('provenance').append(el('p','',`Explore ${fmt(displayNodes.length)} actors and ${fmt(drawableEdges.length)} relationships through ${data.stories.length} stories, with news excerpts for ${data.edges.length} selected relationships.`));}
 $('network-count').textContent=displaySummary;
 $('previous-step').addEventListener('click',()=>advance(-1));$('next-step').addEventListener('click',()=>advance(1));$('reset-story').addEventListener('click',()=>chooseStory(state.storyIndex));
 for(const view of ['overview','focus'])$(`view-${view}`).addEventListener('click',()=>{state.view=view;renderGraph();announce(view==='overview'?'Whole network framing.':'Story framing. Full network remains visible in the locator.');});
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setMobileView(b.dataset.view)));
 $('open-methods').addEventListener('click',()=>$('methods').showModal());$('close-methods').addEventListener('click',()=>$('methods').close());
 // A non-native overlay keeps the actual interface visible, with a ring and
 // leader pointing to each target instead of an unrelated centred dialog.
 const tourSteps=[
   {target:'#graph-stage',view:'network',title:'Start with the bigger picture.',text:`This network shows ${fmt(displayNodes.length)} groups, agencies and other actors related to Geelong. Each link represents reported relationships recovered from news coverage of the region in 2015–2016. Blue highlights locate the current story.`},
   {target:'.story-choice',title:'Choose a story.',text:`We have created ${data.stories.length} social cohesion stories for you to explore. After this tour, choose one from this list; its connections will light up on the map.`},
   {target:'.active-step, .journey-controls',view:'network',title:'Follow the story, step by step.',text:'Use Next and Previous here to move through each story. The highlighted connections in the map below change with the step. Restart story takes you back to its beginning.'},
   {target:'#relationship-list',view:'story',title:'Explore the connections.',text:'Choose a relationship here, or select a highlighted line on the map, to see the reporting behind it. Solid lines follow the main story; dashed lines add context. Blue is cooperative; red is antagonistic.'},
   {target:'#evidence-content > .evidence-card:first-child',view:'evidence',title:'Read the words behind a line.',text:'This clipping brings together the headline, publication, date and a news excerpt. Open Source details & research mapping to explore the actors and relationship behind the connection.'},
   {target:'#mode-time',view:'network',title:'See the network through time.',text:'Network stories follows selected connections. Network over time opens a weekly view of the whole network. We will switch to that view next, starting with the week of the Geelong flood.'},
   {target:'#graph-stage',mode:'time',title:'Watch a ten-week network take shape.',text:'Bright blue and red ties were reported in the selected week. Older ties fade across the previous nine weeks, then leave the active window. The faint two-year network keeps the actors and connections in context.'},
   {target:'.playback-controls, .scrubber-row',mode:'time',title:'Play, pause, or choose a week.',text:'After the tour, press Play to move through the reporting, change the speed, or drag the slider to a week of interest. The arrow buttons move one week at a time. The dates show the full ten-week window.'},
   {target:'.timeline-heading, #scni-chart',mode:'time',title:'From connections to a weekly SCNI.',text:'The line tracks SCNI: reachability × proximity along cooperative paths. The shaded band shows the selected ten-week window; the moving dot marks its SCNI. The orange vertical line marks the 27 January 2016 flood. You can also scrub directly on this plot.'},
   {target:'#open-methods',mode:'time',title:'Go deeper, or start exploring.',text:'About this project introduces the researchers and the measurement approach. Use either mode to explore, and restart this walkthrough any time with How to read this. Finishing or closing returns you to your original view and week.'}
 ];let tourIndex=0,tourReturnFocus=null,tourOriginalView=null,inertElements=[],tourFrame=0;
 const tourOpen=()=>!$('tour').hidden;
 function revealTourTarget(){
   const targets=[...document.querySelectorAll(tourSteps[tourIndex].target)].filter(n=>n.getClientRects().length);
   // Compact layouts scroll the exhibit; larger layouts scroll individual
   // panels. Reveal the target through every actual scrolling ancestor.
   for(let host=targets[0]?.parentElement;host;host=host.parentElement){
     if(!['auto','scroll'].includes(getComputedStyle(host).overflowY))continue;
     const bounds=host.getBoundingClientRect(),rects=targets.map(n=>n.getBoundingClientRect());
     const top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
     if(top<bounds.top-1||bottom-top>host.clientHeight)host.scrollTop+=top-bounds.top;
     else if(bottom>bounds.bottom+1)host.scrollTop+=bottom-bounds.bottom;
   }
 }
 function positionTour(){
   if(!tourOpen())return;
   const t=tourSteps[tourIndex];
   if(t.view&&mobile()&&state.mobileView!==t.view)setMobileView(t.view);
   revealTourTarget();
   const targets=[...document.querySelectorAll(t.target)].filter(n=>n.getClientRects().length);
   if(!targets.length)return;
   const rects=targets.map(n=>{
     const r=n.getBoundingClientRect(),clip=n.closest('.panel-scroll, #network-panel')?.getBoundingClientRect();
     return clip?{left:Math.max(r.left,clip.left),top:Math.max(r.top,clip.top),right:Math.min(r.right,clip.right),bottom:Math.min(r.bottom,clip.bottom)}:r;
   });
   const vw=document.documentElement.clientWidth,vh=window.innerHeight;
   const x=Math.max(6,Math.min(...rects.map(r=>r.left))-5),y=Math.max(6,Math.min(...rects.map(r=>r.top))-5);
   const right=Math.min(vw-6,Math.max(...rects.map(r=>r.right))+5),bottom=Math.min(vh-6,Math.max(...rects.map(r=>r.bottom))+5);
   const ring=$('tour-spotlight');Object.assign(ring.style,{left:`${x}px`,top:`${y}px`,width:`${Math.max(1,right-x)}px`,height:`${Math.max(1,bottom-y)}px`});
   const note=$('tour-note');note.style.maxHeight=`${vh-24}px`;
   const {width:nw,height:nh}=note.getBoundingClientRect(),gap=18,pad=12;
   const clamp=(v,lo,hi)=>Math.max(lo,Math.min(Math.max(lo,hi),v));
   const candidates=[{x:right+gap,y:(y+bottom-nh)/2},{x:x-nw-gap,y:(y+bottom-nh)/2},{x:(x+right-nw)/2,y:bottom+gap},{x:(x+right-nw)/2,y:y-nh-gap}];
   const score=p=>Math.max(0,Math.min(p.x+nw,right)-Math.max(p.x,x))*Math.max(0,Math.min(p.y+nh,bottom)-Math.max(p.y,y));
   const placed=candidates.map(p=>({x:clamp(p.x,pad,vw-nw-pad),y:clamp(p.y,pad,vh-nh-pad)})).sort((a,b)=>score(a)-score(b))[0];
   note.style.left=`${placed.x}px`;note.style.top=`${placed.y}px`;
   // Connect nearest points on the annotation and highlighted region.
   const cx=(x+right)/2,cy=(y+bottom)/2;
   const ax=clamp(cx,placed.x,placed.x+nw),ay=clamp(cy,placed.y,placed.y+nh);
   const bx=clamp(ax,x,right),by=clamp(ay,y,bottom);
   $('tour-leader').setAttribute('viewBox',`0 0 ${vw} ${vh}`);
   $('tour-leader-line').setAttribute('d',`M${ax},${ay} L${bx},${by}`);
   $('tour-leader-dot').setAttribute('cx',bx);$('tour-leader-dot').setAttribute('cy',by);
 }
 function queueTourPosition(){cancelAnimationFrame(tourFrame);tourFrame=requestAnimationFrame(positionTour);}
 function renderTour(){
   const t=tourSteps[tourIndex];
   const mode=t.mode||'stories';
   if(state.mode!==mode){
     setMode(mode);if(mode==='time')temporal.showFloodWeek();
   }
   if(t.view&&mobile())setMobileView(t.view);
   if(t.target==='#relationship-list')$('story-scroll').scrollTop=0;
   if(t.view==='evidence')$('evidence-scroll').scrollTop=0;
   $('tour').dataset.step=String(tourIndex+1);$('tour').dataset.target=t.target;
   $('tour-position').textContent=`TOUR ${tourIndex+1} OF ${tourSteps.length}`;$('tour-title').textContent=t.title;$('tour-text').textContent=t.text;
   $('tour-back').disabled=tourIndex===0;$('tour-next').textContent=tourIndex===tourSteps.length-1?'Start exploring →':'Next →';
   positionTour();queueTourPosition();$('tour-title').focus({preventScroll:true});
 }
 function startTour(){
   if(tourOpen())return;
   tourReturnFocus=document.activeElement;tourOriginalView={mode:state.mode,week:temporal.getIndex(),mobile:state.mobileView,camera:state.view,networkScroll:$('network-panel').scrollTop,exhibitScroll:$('exhibit').scrollTop};
   temporal.pause();
   if(state.mode==='time')setMode('stories');
   state.view='overview';setMobileView('network');
   inertElements=[...document.body.children].filter(n=>n!==$('tour')&&n.id!=='announcer'&&!n.inert);
   inertElements.forEach(n=>{n.inert=true;});tourIndex=0;$('tour').hidden=false;renderTour();
 }
 function closeTour(){
   $('tour').hidden=true;cancelAnimationFrame(tourFrame);inertElements.forEach(n=>{n.inert=false;});inertElements=[];
   if(tourOriginalView){
     state.view=tourOriginalView.camera;temporal.setIndex(tourOriginalView.week);setMode(tourOriginalView.mode);setMobileView(tourOriginalView.mobile);
     $('network-panel').scrollTop=tourOriginalView.networkScroll;
     $('exhibit').scrollTop=tourOriginalView.exhibitScroll;
   }
   const focus=tourReturnFocus&&tourReturnFocus!==document.body&&tourReturnFocus.isConnected?tourReturnFocus:$('open-tour');focus.focus({preventScroll:true});
 }
 $('open-tour').addEventListener('click',startTour);$('skip-tour').addEventListener('click',closeTour);
 $('tour-back').addEventListener('click',()=>{if(tourIndex>0){tourIndex--;renderTour();}});
 $('tour-next').addEventListener('click',()=>{if(tourIndex<tourSteps.length-1){tourIndex++;renderTour();}else closeTour();});
 $('tour').addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();closeTour();return;}
   if(event.key!=='Tab')return;
   const controls=[...$('tour').querySelectorAll('button:not(:disabled)')];
   const index=controls.indexOf(document.activeElement),next=event.shiftKey?(index<=0?controls.length-1:index-1):(index+1)%controls.length;
   event.preventDefault();controls[next].focus();
 });
 window.addEventListener('resize',queueTourPosition);document.addEventListener('scroll',queueTourPosition,true);
 const tourObserver=new ResizeObserver(queueTourPosition);
 window.addEventListener('hashchange',()=>{let id='';try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const i=data.stories.findIndex(s=>s.id===id);if(i>=0)chooseStory(i,false);});
 function setMode(mode){
   state.mode=mode;$('exhibit').dataset.mode=mode;
   $('mode-stories').setAttribute('aria-pressed',String(mode==='stories'));$('mode-time').setAttribute('aria-pressed',String(mode==='time'));
   $('network-heading').textContent=mode==='time'?'Ten weeks, connected.':'The bigger picture.';
   document.querySelector('.map-heading .eyebrow').textContent=mode==='time'?'THE NETWORK THROUGH TIME':'ONE NETWORK. MANY POSSIBLE STORIES.';
   $('network').setAttribute('aria-label',mode==='time'?'Ten-week rolling network':'Selected story highlighted within the full network');
   temporal.setActive(mode==='time');renderGraph();requestAnimationFrame(renderGraph);
   announce(mode==='time'?'Network over time. Use Play or the weekly slider to explore.':'Network stories. Your story and step are preserved.');
 }
 temporal=await createTimeline({full,nodes,project,pathFor,sv,onRender:renderGraph,announce});
 // Native details preserve keyboard/screen-reader operation. Collapse prose
 // on small/short screens; resize only at a breakpoint, not on every frame.
 const compactControls=matchMedia('(max-width:600px), (max-width:1000px) and (max-height:500px)');
 const sizeDisclosures=()=>{
   $('step-details').open=!compactControls.matches;
   $('time-intro').open=!compactControls.matches;
 };
 sizeDisclosures();compactControls.addEventListener('change',sizeDisclosures);
 tourSteps.forEach(t=>document.querySelectorAll(t.target).forEach(n=>tourObserver.observe(n)));
 $('mode-stories').addEventListener('click',()=>setMode('stories'));$('mode-time').addEventListener('click',()=>setMode('time'));
 renderCards();provenance();let initial='';try{initial=decodeURIComponent(location.hash.slice(1));}catch{/* Ignore malformed links. */}const index=data.stories.findIndex(s=>s.id===initial);$('load-status').hidden=true;$('exhibit').hidden=false;$('exhibit').dataset.mode='stories';chooseStory(index<0?0:index,false);new ResizeObserver(()=>{renderGraph();queueTourPosition();}).observe($('graph-stage'));$('exhibit').dataset.ready='true';startTour();
} catch(error){console.error('Exhibit failed:',error);$('load-status').hidden=false;$('load-status').className='status error';$('load-status').textContent='The exhibit could not load. Serve the built site over HTTP and check data/showcase.json and data/network.json. Technical details are in the browser console.';$('exhibit').hidden=true;}
})();
