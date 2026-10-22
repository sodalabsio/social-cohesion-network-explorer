// Pure window reconstruction shared by the UI and deterministic data checks.
export function buildWindow(weeks,index,size=10){
 const nodes=new Set(),edges=new Map();let reports=0;
 for(let j=Math.max(0,index-size+1);j<=index;j++)for(const [id,kind,count] of weeks[j].observations){
  const [a,b]=id.split('-');nodes.add(a);nodes.add(b);
  if(j===index)reports+=count;
  if(kind!=='cooperative'&&kind!=='antagonistic')continue;
  if(!edges.has(id))edges.set(id,{id,a,b});
  edges.get(id)[kind]=index-j;
 }
 return {nodes,edges,reports};
}

export async function createTimeline({full,nodes,project,pathFor,sv,onRender,announce}){
 const $=id=>document.getElementById(id);
 const response=await fetch('./data/timeline.json');
 if(!response.ok)throw Error(`timeline: HTTP ${response.status}`);
 const data=await response.json(),weeks=data.weeks,size=data.meta.windowWeeks;
 if(!weeks?.length||size!==10||data.meta.networkCsvSha256!==full.meta.csvSha256)throw Error('Timeline version differs from network');
 const dates=weeks.map(w=>Date.parse(w.date+'T00:00:00Z')),day=86400000;
 const formatDate=(value,options={day:'numeric',month:'short',year:'numeric'})=>new Date(value).toLocaleDateString('en-AU',{...options,timeZone:'UTC'});
 const value=n=>n==null?'—':n.toFixed(4);
 let index=Math.min(size-1,weeks.length-1),active=false,timer=null;
 let current=buildWindow(weeks,index,size);
 $('network-panel').append($('timeline-template').content.cloneNode(true));
 const slider=$('week-slider');slider.max=String(weeks.length-1);
 function pause(){if(timer!==null)clearInterval(timer);timer=null;$('play-time').textContent='Play ▶';$('play-time').setAttribute('aria-pressed','false');}
 function play(){
  pause();if(!active)return;
  if(index===weeks.length-1)setIndex(0);
  $('play-time').textContent='Pause Ⅱ';$('play-time').setAttribute('aria-pressed','true');
  timer=setInterval(()=>{if(index>=weeks.length-1){pause();return;}setIndex(index+1);if(index===weeks.length-1)pause();},Number($('time-speed').value));
 }
 function setIndex(next,spoken=false){
  index=Math.max(0,Math.min(weeks.length-1,Math.round(next)));current=buildWindow(weeks,index,size);
  renderControls();if(active)onRender();
  if(spoken)announce(`Week beginning ${formatDate(dates[index])}. ${weeks[index].metrics?'SCNI '+value(weeks[index].metrics.E):'Building the ten-week window'}.`);
 }
 function renderControls(){
  const week=weeks[index],metrics=week.metrics,first=Math.max(0,index-size+1),end=dates[index]+6*day;
  slider.value=String(index);slider.setAttribute('aria-valuetext',`Week beginning ${formatDate(dates[index])}`);
  $('timeline-week').textContent=`Week of ${formatDate(dates[index])}`;
  $('scni-current').textContent=metrics?`SCNI ${value(metrics.E)}`:`Building window · ${index+1}/${size}`;
  $('window-range').textContent=`${formatDate(dates[first])} – ${formatDate(end)}`;
  const fresh=[...current.edges.values()].filter(e=>e.cooperative===0||e.antagonistic===0).length;
  $('window-count').textContent=`${current.reports.toLocaleString('en-AU')} reports · ${fresh} pairs firing this week`;
  $('previous-week').disabled=index===0;$('next-week').disabled=index===weeks.length-1;
  $('metric-e').textContent=value(metrics?.E);$('metric-r').textContent=value(metrics?.R);$('metric-q').textContent=value(metrics?.Q);
  $('metric-status').textContent=metrics?`${metrics.n} actors · ${metrics.reachable.toLocaleString('en-AU')} reachable pairs of ${metrics.possible.toLocaleString('en-AU')} possible`:`${index+1} of ${size} reporting weeks collected. SCNI starts with the first complete window.`;
  $('timeline-caption').textContent=metrics?'SCNI = reachability × proximity · cooperative weighted paths · Geelong showcase population.':`The network is building. The first full ten-week SCNI window begins ${formatDate(dates[size-1])}.`;
  $('timeline-console').dataset.week=week.date;$('timeline-console').dataset.index=String(index);
  renderChart();
 }
 function renderChart(){
  if(!active)return;
  const svg=$('scni-chart'),w=svg.clientWidth,h=svg.clientHeight;if(!w||!h)return;
  const margin={left:44,right:12,top:12,bottom:24},x0=dates[0],x1=dates.at(-1)+6*day;
  const maximum=Math.max(...weeks.map(w=>w.metrics?.E||0));
  const upper=Math.ceil(maximum*1.1*100)/100;
  const x=t=>margin.left+(t-x0)/(x1-x0)*(w-margin.left-margin.right);
  const y=n=>h-margin.bottom-n/upper*(h-margin.top-margin.bottom);
  svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svg.append(sv('title',{},'Ten-week rolling Social Cohesion Network Index'),sv('desc',{},`Weekly SCNI for the Geelong showcase population, ${formatDate(x0)} to ${formatDate(x1)}. The orange line marks 27 January 2016. The shaded band is the selected ten-week window. Use the Reporting week slider for keyboard control.`));
  const first=Math.max(0,index-size+1);
  svg.append(sv('rect',{x:x(dates[first]),y:margin.top,width:Math.max(1,x(dates[index]+6*day)-x(dates[first])),height:h-margin.top-margin.bottom,class:'chart-window'}));
  for(const v of [0,upper/2,upper]){
   svg.append(sv('line',{x1:margin.left,x2:w-margin.right,y1:y(v),y2:y(v),class:'chart-grid'}),sv('text',{x:margin.left-7,y:y(v)+3,'text-anchor':'end',class:'chart-tick'},v.toFixed(2)));
  }
  const points=weeks.map((week,i)=>week.metrics?{x:x(dates[i]),y:y(week.metrics.E)}:null);
  let line='',pen=false;for(const p of points){if(!p){pen=false;continue;}line+=`${pen?'L':'M'}${p.x},${p.y} `;pen=true;}
  svg.append(sv('path',{d:line,class:'scni-line'}));
  for(let i=0;i<=(w<460?2:4);i++){
   const count=w<460?2:4,t=x0+(x1-x0)*i/count;
   svg.append(sv('text',{x:x(t),y:h-6,'text-anchor':i===0?'start':i===count?'end':'middle',class:'chart-tick'},formatDate(t,{month:'short',year:'2-digit'})));
  }
  const flood=Date.parse(data.meta.floodDate+'T00:00:00Z');
  svg.append(sv('line',{x1:x(flood),x2:x(flood),y1:margin.top,y2:h-margin.bottom,class:'chart-flood','data-flood-date':data.meta.floodDate}));
  const cursor=x(dates[index]);svg.append(sv('line',{x1:cursor,x2:cursor,y1:margin.top,y2:h-margin.bottom,class:'chart-cursor'}));
  if(points[index])svg.append(sv('circle',{cx:cursor,cy:points[index].y,r:4,class:'chart-point'}));
  // The chart supports direct pointer scrubbing; the range supplies keyboard access.
  svg.dataset.plotLeft=String(margin.left);svg.dataset.plotRight=String(w-margin.right);svg.dataset.plotStart=String(x0);svg.dataset.plotEnd=String(x1);
 }
 function scrub(event){
  const svg=$('scni-chart'),r=svg.getBoundingClientRect(),left=Number(svg.dataset.plotLeft),right=Number(svg.dataset.plotRight);
  const fraction=Math.max(0,Math.min(1,(event.clientX-r.left-left)/(right-left)));
  const t=dates[0]+fraction*(dates.at(-1)+6*day-dates[0]);
  setIndex(Math.round((t-dates[0])/(7*day)));
 }
 $('scni-chart').addEventListener('pointerdown',event=>{if(event.button!==0)return;pause();event.currentTarget.setPointerCapture(event.pointerId);scrub(event);});
 $('scni-chart').addEventListener('pointermove',event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))scrub(event);});
 $('scni-chart').addEventListener('pointerup',event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);});
 slider.addEventListener('input',()=>{pause();setIndex(Number(slider.value));});
 slider.addEventListener('change',()=>setIndex(Number(slider.value),true));
 $('previous-week').addEventListener('click',()=>{pause();setIndex(index-1,true);});
 $('next-week').addEventListener('click',()=>{pause();setIndex(index+1,true);});
 $('play-time').addEventListener('click',()=>timer===null?play():pause());
 $('time-speed').addEventListener('change',()=>{if(timer!==null)play();});
 function showFloodWeek(spoken=false){pause();const flood=Date.parse(data.meta.floodDate+'T00:00:00Z');setIndex(Math.floor((flood-dates[0])/(7*day)),spoken);}
 $('jump-flood').addEventListener('click',()=>showFloodWeek(true));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 const resize=new ResizeObserver(renderChart);resize.observe($('scni-chart'));
 function renderGraph(svg,w,h){
  const c={x:0,y:0,w:1,h:1},p=id=>project(nodes.get(id),w,h,c);
  svg.setAttribute('role','img');svg.dataset.week=weeks[index].date;svg.dataset.windowNodes=String(current.nodes.size);svg.dataset.windowPairs=String(current.edges.size);
  svg.append(sv('title',{},`Reported network, week beginning ${formatDate(dates[index])}`),sv('desc',{},`${current.nodes.size} actors in the rolling window. Bright blue and red ties were reported in the selected week; older ties fade through nine weeks. SCNI uses cooperative paths. Neutral and other observations supply actors to the roster.`));
  for(const e of current.edges.values()){
   const a=p(e.a),b=p(e.b),mixed=e.cooperative!=null&&e.antagonistic!=null;
   for(const kind of ['cooperative','antagonistic']){
    const age=e[kind];if(age==null)continue;
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,side=kind==='cooperative'?-1:1;
    const ox=mixed?-dy/length*2*side:0,oy=mixed?dx/length*2*side:0;
    const path=sv('path',{d:pathFor(a,b),transform:`translate(${ox} ${oy})`,class:`temporal-edge ${kind}${age===0?' is-firing':''}`,'data-edge-id':e.id,'data-age':age,opacity:(.23+.72*(1-age/size)).toFixed(2)});
    path.append(sv('title',{},`${nodes.get(e.a).label} ↔ ${nodes.get(e.b).label} · ${kind} · ${age===0?'reported this week':age+' week'+(age===1?'':'s')+' old'}`));svg.append(path);
   }
  }
  const cooperativeNodes=new Set([...current.edges.values()].filter(e=>e.cooperative!=null).flatMap(e=>[e.a,e.b]));
  for(const id of current.nodes){const q=p(id),cooperative=cooperativeNodes.has(id);const dot=sv('circle',{cx:q.x,cy:q.y,r:cooperative?2.6:2,class:`temporal-node${cooperative?' cooperative':''}`,'data-window-node':id});dot.append(sv('title',{},`${nodes.get(id).label} · ${nodes.get(id).scope}${cooperative?' · cooperative network':' · window roster'}`));svg.append(dot);}
  ['Federal','State','Local','Community'].forEach((scope,i)=>{const y=project({x:0,y:i/4},w,h,c).y;svg.append(sv('text',{x:13,y:y-7,class:'scope-label','pointer-events':'none'},scope.toUpperCase()));});
  $('scene-count').textContent=`${current.nodes.size} window actors · ${current.edges.size} active pairs`;
  $('map-caption').textContent='Bright ties: this week · Fading ties: previous nine weeks';
  renderChart();
 }
 function setActive(next){active=next;if(!next)pause();$('timeline-console').hidden=!next;$('time-intro').hidden=!next;$('time-insight').hidden=!next;if(next)renderControls();}
 return {renderGraph,setActive,pause,showFloodWeek,getIndex:()=>index,setIndex};
}
