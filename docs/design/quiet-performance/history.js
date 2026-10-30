/* Design data only. This file does not read Fitzen athlete storage or call an API. */
const PREVIEW_HISTORY_KEY = 'fitzen.quiet-performance.sample-report.v1';
const CURRENT_SAMPLE = { id:'report-squat-29', exercise:'Bodyweight squat', date:'2026-10-29', value:12, unit:'reps', form:86, source:'Camera', eligible:true, saved:true };
const seedSessions = [
  ...[35.2,35.9,36.8,36.3,37.6,38.4].map((value,i)=>({id:`jump-${i}`,exercise:'Countermovement jump',date:`2026-10-${['04','09','13','18','23','26'][i]}`,value,unit:'cm',form:[78,80,82,81,85,88][i],source:i===2?'Video':'Camera',eligible:true})),
  ...[8,10,11].map((value,i)=>({id:`squat-${i}`,exercise:'Bodyweight squat',date:`2026-10-${['18','23','26'][i]}`,value,unit:'reps',form:[79,82,85][i],source:'Camera',eligible:true})),
  ...[6,8,9].map((value,i)=>({id:`push-${i}`,exercise:'Push-up',date:`2026-10-${['13','21','28'][i]}`,value,unit:'reps',form:[74,80,83][i],source:'Camera',eligible:true})),
  ...[20,25,30].map((value,i)=>({id:`plank-${i}`,exercise:'Plank',date:`2026-10-${['14','22','28'][i]}`,value,unit:'s',form:[76,81,84][i],source:'Video',eligible:true})),
  {id:'squat-demo',exercise:'Bodyweight squat',date:'2026-10-25',value:14,unit:'reps',form:92,source:'Demo',eligible:false},
  {id:'jump-missing',exercise:'Countermovement jump',date:'2026-10-27',value:null,unit:'cm',form:null,source:'Camera',eligible:false,reason:'Take-off and landing were not both visible. No jump estimate was retained.'}
];
let savedSample=false,storageAvailable=true,wellnessSamples=true,growthExercise='Countermovement jump',growthPeriod='all',exerciseDetail=null;
try{const record=JSON.parse(localStorage.getItem(PREVIEW_HISTORY_KEY)||'null');savedSample=record?.version===1&&record.id===CURRENT_SAMPLE.id;}catch{storageAvailable=false;}
const allSessions=()=>[...seedSessions,...(savedSample?[CURRENT_SAMPLE]:[])].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
const eligibleFor=name=>allSessions().filter(s=>s.exercise===name&&s.eligible&&Number.isFinite(s.value)).sort((a,b)=>a.date.localeCompare(b.date));
const shortDate=date=>`${Number(date.slice(-2))} Oct`;
const numberText=n=>Number.isInteger(n)?String(n):n.toFixed(1);
const deltaText=(a,b,unit)=>`${a-b>0?'+':''}${numberText(Math.round((a-b)*10)/10)} ${unit}`;
const glyph=id=>`<svg aria-hidden="true"><use href="#${id}"/></svg>`;
function lineChart(rows,label,compact=false,selected=-1,bars=false){
  if(!rows.length)return '<p class="small muted">No comparable sessions yet.</p>';
  const values=rows.map(r=>r.value),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.2,1),bottom=lo-pad,top=hi+pad;
  const width=compact?260:700,left=compact?4:48,right=compact?254:650,height=compact?52:210,yTop=compact?7:22,yBottom=compact?46:166;
  const x=i=>rows.length===1?(left+right)/2:left+i*(right-left)/(rows.length-1),y=v=>yBottom-(v-bottom)/(top-bottom)*(yBottom-yTop),avg=values.reduce((a,b)=>a+b,0)/values.length;
  const chosen=selected<0?rows.length-1:selected;
  const ticks=compact?'':[0,.5,1].map(f=>{const value=bottom+f*(top-bottom),yy=y(value);return `<path d="M${left} ${yy}H${right}" stroke="#e5e5dd"/><text x="8" y="${yy+4}">${numberText(Math.round(value*10)/10)}</text>`}).join('');
  const drawing=bars?rows.map((r,i)=>`<rect x="${x(i)-Math.min(9,(right-left)/rows.length/3)}" y="${y(r.value)}" width="${Math.min(18,(right-left)/rows.length/1.5)}" height="${Math.max(2,yBottom-y(r.value))}" fill="${i===chosen?'#d87541':'#a8a99c'}" opacity="${i===chosen?1:.5}"/>`).join(''):`<path d="M${rows.map((r,i)=>`${x(i)},${y(r.value)}`).join(' L')}" fill="none" stroke="currentColor" stroke-width="${compact?1.5:2}"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.value)}" r="${i===chosen?4:compact?1.8:3}" fill="${i===chosen?'#d87541':'currentColor'}"/>`).join('')}`;
  return `<svg class="${compact?'spark':'chart'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}: ${rows.map(r=>`${shortDate(r.date)} ${r.value}`).join(', ')}">${ticks}<path d="M${left} ${y(avg)}H${right}" stroke="#b7b7aa" stroke-dasharray="3 4"/>${drawing}${compact?'':rows.map((r,i)=>`<text x="${x(i)}" y="199" text-anchor="middle">${shortDate(r.date)}</text>`).join('')}</svg>`;
}
function comparison(rows){
  if(!rows.length)return '';
  const first=rows[0],last=rows.at(-1),previous=rows.at(-2);
  return `<div class="compare-grid"><div><strong>${previous?deltaText(last.value,previous.value,last.unit):'—'}</strong><span>Since previous session</span></div><div><strong>${deltaText(last.value,first.value,last.unit)}</strong><span>Since first shown</span></div><div><strong>${rows.length}</strong><span>Comparable sessions shown</span></div></div>`;
}
function latestSummary(name){const rows=eligibleFor(name),last=rows.at(-1),previous=rows.at(-2);return {rows,last,previous};}
function showHistoryDialog(title,subtitle,content,origin){
  const opened=$('#dialog').open;if(!opened)lastTrigger=origin;
  $('#dialog-title').textContent=title;$('#dialog-subtitle').textContent=subtitle;$('#dialog-body').innerHTML=content;
  if(!opened)$('#dialog').showModal();else{$('#dialog-title').tabIndex=-1;$('#dialog-title').focus();}
}
const wellness={
  recovery:{name:'Recovery',unit:'%',values:[76,80,66,62,72,69,55],bars:true,note:'Illustrative recovery score. A future source would need to supply and explain its score; this is not inferred from camera exercise data.'},
  hrv:{name:'HRV',unit:'ms',values:[60,56,65,69,62,61,69],note:'Illustrative heart-rate variability readings. No wearable is connected and Fitzen’s pose camera does not measure HRV.'},
  rhr:{name:'Resting heart rate',unit:'bpm',values:[57,58,57,59,58,58,58],note:'Illustrative resting heart rate. This mockup does not take a pulse or diagnose a condition.'},
  sleep:{name:'Sleep',unit:'h',values:[7.1,7.2,7.4,7.2,7.4,7.7,7.8],bars:true,note:'Illustrative sleep duration. The stage totals below are design data, not a sleep study or camera-derived measurements.'}
};
const signalRows=key=>wellness[key].values.map((value,i)=>({value,date:`2026-10-${23+i}`}));
function renderWellness(){
  for(const [key,m] of Object.entries(wellness)){
    const rows=signalRows(key),value=rows.at(-1).value,previous=rows.at(-2).value;
    const delta=deltaText(value,previous,key==='recovery'?'points':m.unit);
    $(`#signal-${key}`).innerHTML=`<div class="panel-title"><h2>${m.name}</h2><button class="open" data-signal="${key}" aria-label="Open ${m.name} history">${glyph('arrow')}</button></div>${wellnessSamples?`<div class="value">${value}<small>${m.unit}</small></div><div class="row between"><span class="small muted">${key==='sleep'?'Last night':'Today'} · sample</span><span class="change">${value===previous?'Steady':delta}</span></div>${key==='sleep'?'<div class="sleep-stages" aria-hidden="true"><i></i><i></i><i></i></div><p class="stages-label muted">Deep 1.7 h · REM 1.7 h · Light 4.4 h · sample</p>':''}${lineChart(rows,m.name+' sample history',true,-1,m.bars)}<div class="axis"><span>23 Oct</span><span>29 Oct</span></div>`:`<div class="signal-empty"><p>No source connected. This signal is not available from Fitzen’s camera.</p><button class="text-btn" data-dialog="sources">About future sources →</button></div>`}`;
  }
  $('#wellness-toggle').textContent=wellnessSamples?'Hide wellness samples':'Show wellness samples';$('#wellness-toggle').setAttribute('aria-pressed',wellnessSamples);
  $('#week-table').innerHTML=`<thead><tr><th scope="col">Signal</th>${[23,24,25,26,27,28,29].map(d=>`<th scope="col">${d} Oct</th>`).join('')}</tr></thead><tbody>${['recovery','sleep','hrv'].map(key=>`<tr><th scope="row"><button data-signal="${key}">${wellness[key].name} <small>${wellness[key].unit}</small></button></th>${wellness[key].values.map(v=>`<td>${wellnessSamples?v:'—'}</td>`).join('')}</tr>`).join('')}<tr><th scope="row"><button data-page="history">Training</button></th>${[23,24,25,26,27,28,29].map(d=>`<td>${allSessions().filter(s=>s.date===`2026-10-${d}`&&s.eligible).length}</td>`).join('')}</tr></tbody>`;
}
function signalDetail(key,origin,index=6){
  const m=wellness[key],rows=signalRows(key),avg=m.values.reduce((a,b)=>a+b,0)/rows.length;
  showHistoryDialog(m.name,'Sample wellness data · no source connected',wellnessSamples?`<div class="detail-reading" id="signal-value">${rows[index].value}<small> ${m.unit}</small></div><p id="signal-date" class="small">${shortDate(rows[index].date)} · illustrative reading</p><div class="detail-chart" id="signal-chart">${lineChart(rows,m.name+' sample trend',false,index,m.bars)}</div><label class="detail-controls">Read a day<input id="signal-slider" data-key="${key}" type="range" min="0" max="6" step="1" value="${index}" aria-label="${m.name} sample day"></label><div class="compare-grid"><div><strong>${numberText(Math.round(avg*10)/10)}</strong><span>7-day average · ${m.unit}</span></div><div><strong>${Math.min(...m.values)}–${Math.max(...m.values)}</strong><span>Sample range · ${m.unit}</span></div><div><strong>7</strong><span>Sample days</span></div></div><p>${m.note}</p><button class="text-btn" data-dialog="sources">Where would real readings come from? →</button>`:`<p>No readings are connected. Fitzen does not calculate ${m.name.toLowerCase()} from pose tracking.</p><button class="btn light" id="show-samples">Show illustrative samples</button>`,origin);
}
function exerciseRows(name,limit='all'){const rows=eligibleFor(name);return limit==='3'?rows.slice(-3):rows;}
function openExerciseHistory(name,origin,limit='all',index=null){
  const rows=exerciseRows(name,limit);exerciseDetail={name,limit,index:index===null?Math.max(0,rows.length-1):index};
  if(!rows.length){showHistoryDialog(name,'Exercise history · design data',`<div class="growth-empty"><h2>No comparable sessions yet.</h2><p>This exercise has no seeded assessment history. Its section is ready for a future report.</p><button class="btn" data-movement="${name}">Prepare this movement →</button></div>`,origin);return;}
  const current=rows[exerciseDetail.index];
  showHistoryDialog(name,'Exercise history · eligible sample sessions only',`<div class="detail-controls"><div class="segments" aria-label="History window"><button data-exercise-period="all" aria-pressed="${limit==='all'}">All sessions</button><button data-exercise-period="3" aria-pressed="${limit==='3'}">Last 3</button></div><button class="text-btn" data-history-page="${name}">Complete exercise log →</button></div><div class="detail-reading" id="exercise-reading">${current.value}<small> ${current.unit}</small></div><p class="small" id="exercise-date">${shortDate(current.date)} · ${current.source} sample</p><div class="detail-chart" id="exercise-chart">${lineChart(rows,name+' eligible sample history',false,exerciseDetail.index)}</div><label class="detail-controls">Read a past session<input type="range" id="exercise-slider" min="0" max="${rows.length-1}" step="1" value="${exerciseDetail.index}" aria-label="${name} historical session" aria-valuetext="${shortDate(current.date)}: ${current.value} ${current.unit}"></label><div id="selected-comparison"></div>${comparison(rows)}<button class="btn light" id="selected-report" data-session="${current.id}">Open selected session report →</button><p class="source-note">Comparisons use this exercise and the standard screening protocol only. Dates are spaced by session, not elapsed time. Demos and incomplete attempts remain in the complete log.</p>`,origin);
  updateExerciseSelection(exerciseDetail.index);
}
function updateExerciseSelection(index){
  const {name,limit}=exerciseDetail,rows=exerciseRows(name,limit),record=rows[index],prev=rows[index-1];exerciseDetail.index=index;
  $('#exercise-reading').innerHTML=`${record.value}<small> ${record.unit}</small>`;$('#exercise-date').textContent=`${shortDate(record.date)} · ${record.source} sample`;
  $('#exercise-chart').innerHTML=lineChart(rows,name+' eligible sample history',false,index);
  $('#selected-comparison').innerHTML=`<p class="notice">${prev?`${deltaText(record.value,prev.value,record.unit)} compared with the preceding shown session (${shortDate(prev.date)}).`:'This is the first shown eligible session. There is no preceding shown result to compare.'}</p>`;
  $('#selected-report').dataset.session=record.id;$('#exercise-slider').setAttribute('aria-valuetext',`${shortDate(record.date)}: ${record.value} ${record.unit}`);
}
function renderSummary(){
  for(const [name,id] of [['Countermovement jump','summary-jump'],['Bodyweight squat','summary-squat']]){
    const {rows,last,previous}=latestSummary(name);
    $(`#${id}`).innerHTML=`<div class="panel-title"><h2>${name==='Countermovement jump'?'Vertical jump':'Squat performance'}</h2><button class="open" data-history="${name}" aria-label="Open ${name} exercise history">${glyph('arrow')}</button></div><div class="value">${last.value}<small>${last.unit}</small></div><div class="row between"><span class="small muted">${shortDate(last.date)} · sample</span><span class="change">${deltaText(last.value,previous.value,last.unit)}</span></div>${lineChart(rows,name+' sample history',true)}<div class="axis"><span>Since previous session</span><span>${rows.length} sessions</span></div>`;
  }
  const {rows,last}=latestSummary('Countermovement jump');
  $('#summary-growth').innerHTML=`<div class="panel-title"><h2>How you’re growing</h2><button class="text-btn" data-page="progress">All exercise trends</button></div><p class="small" style="margin-top:12px">Countermovement jump · ${rows.length} comparable samples</p>${lineChart(rows,'Countermovement jump trend')}${comparison(rows)}<p class="source-note">Latest ${last.value} cm. These are observed changes in sample estimates, not predicted gains.</p>`;
  $('#summary-recent').innerHTML=allSessions().slice(0,3).map(s=>`<div class="session-mini"><div><h3>${s.exercise}</h3><p>${shortDate(s.date)} · ${s.source} sample${s.saved?' · saved here':''}</p></div><div><div class="mini-value">${s.value===null?'—':s.value}<small> ${s.value===null?'':s.unit}</small></div><button class="text-btn" data-session="${s.id}">View report →</button></div></div>`).join('');
  renderWellness();renderReportComparison();
}
function renderReportComparison(){
  const rows=[...eligibleFor('Bodyweight squat').filter(s=>s.id!==CURRENT_SAMPLE.id),CURRENT_SAMPLE];
  $('#report-comparison').innerHTML=`<div class="panel-title"><h2>This session in your timeline</h2><span class="tag">Sample comparison</span></div>${lineChart(rows,'Squat report comparison')}${comparison(rows)}`;
  $('#save-sample').disabled=savedSample;$('#save-sample').textContent=savedSample?'Sample report saved':'Save sample report';
  $('#save-status').textContent=savedSample?(storageAvailable?'Saved sample report and graph data in this browser only. Not synced to Fitzen.':'Saved for this tab only. Browser storage is unavailable.'):'This illustrative 29 October report has not been added to preview history.';
  $('#reset-saved').disabled=!savedSample;
}
function renderExerciseCards(){
  const term=$('#search').value.toLowerCase(),items=movements.filter(m=>(category==='All'||m[1]===category)&&m[0].toLowerCase().includes(term));
  $('#exercise-grid').innerHTML=items.map(m=>{const rows=eligibleFor(m[0]),last=rows.at(-1),all=allSessions().filter(s=>s.exercise===m[0]);return `<article class="panel exercise"><button class="exercise-select" data-movement="${m[0]}" aria-label="Prepare ${m[0]}"><div class="exercise-art ${m[6]} ${m[7]!=='tree-pose'?'has-photo':''}" aria-hidden="true">${m[7]!=='tree-pose'?`<img src="${ASSETS}${m[7]}-0.jpg" alt="" loading="lazy">`:`<span class="motif">${m[2]}</span>`}<span class="art-label">${m[3]}</span></div><div class="exercise-body"><h3>${m[0]}</h3><p>${m[1]} · ${m[5]}</p><div class="row"><span class="tag">${m[4]}</span><span style="margin-left:auto">Start ↗</span></div></div></button><div class="exercise-card-actions"><button data-history="${m[0]}">History · ${all.length}</button><small>${last?`Latest ${last.value} ${last.unit}`:'No sessions yet'}</small></div></article>`}).join('');$('#no-exercises').hidden=items.length!==0;
}
function renderGrowth(){
  const rows=exerciseRows(growthExercise,growthPeriod),all=allSessions().filter(s=>s.exercise===growthExercise);
  $('#growth-content').innerHTML=rows.length?`<article class="panel"><div class="panel-title"><h2>${growthExercise}</h2><button class="text-btn" data-history="${growthExercise}">Explore individual sessions →</button></div><div class="value">${rows.at(-1).value}<small>${rows.at(-1).unit}</small></div><p class="small muted">Latest shown estimate · ${shortDate(rows.at(-1).date)} · sample</p>${lineChart(rows,growthExercise+' progression')}${comparison(rows)}<p class="source-note">“Since first shown” uses the first session in the selected window. Only eligible examples of the same exercise and standard protocol are compared.</p></article><article class="panel" style="margin-top:18px"><div class="panel-title"><h2>Every attempt for this exercise</h2><button class="text-btn" data-history-page="${growthExercise}">Open full log →</button></div>${all.map(s=>`<div class="session-mini"><div><h3>${shortDate(s.date)} · ${s.source} sample</h3><p>${s.eligible?'Eligible sample':'Excluded from trends'}${s.saved?' · saved in this browser':''}</p></div><button class="text-btn" data-session="${s.id}">${s.value===null?'Not assessed':s.value+' '+s.unit} →</button></div>`).join('')}</article>`:`<div class="panel growth-empty"><h2>No comparable sessions yet.</h2><p>Your ${growthExercise.toLowerCase()} attempts will have their own timeline. Demos and incomplete results can be inspected in History.</p><button class="btn light" data-movement="${growthExercise}">Prepare this movement →</button></div>`;
}
function renderHistory(){
  const name=$('#history-exercise').value,range=$('#history-range').value,evidence=$('#history-evidence').value;
  const rows=allSessions().filter(s=>(name==='all'||s.exercise===name)&&(range==='all'||s.date>='2026-10-23')&&(evidence==='all'||(evidence==='eligible'?s.eligible:!s.eligible)));
  $('#history-overview').innerHTML=`<div><strong>${rows.length}</strong><span>Attempts in this view</span></div><div><strong>${rows.filter(s=>s.eligible).length}</strong><span>Eligible samples</span></div><div><strong>${new Set(rows.map(s=>s.exercise)).size}</strong><span>Movements in this view</span></div>`;
  const dates=[...new Set(rows.map(s=>s.date))];
  $('#history-list').innerHTML=rows.length?dates.map(date=>`<section><h2 class="history-day">${shortDate(date)} 2026</h2><div>${rows.filter(s=>s.date===date).map(s=>`<article class="history-row"><div><h3><button class="text-btn" data-history="${s.exercise}">${s.exercise}</button></h3><p>${s.source} sample · Standard protocol${s.saved?' · saved here':''}</p></div><span class="reading">${s.value===null?'—':s.value}<small> ${s.value===null?'Not assessed':s.unit}</small></span><span class="evidence-tag ${s.eligible?'':'other'}">${s.eligible?'Eligible sample':s.source==='Demo'?'Demo · excluded':'Incomplete'}</span><button class="text-btn" data-session="${s.id}">Open report →</button></article>`).join('')}</div></section>`).join(''):`<div class="panel growth-empty"><h2>No attempts match these filters.</h2><p>Choose another exercise, a wider date range, or all evidence states.</p><button class="btn light" id="clear-history">Clear history filters</button></div>`;
}
function openSession(id,origin){
  const s=allSessions().find(s=>s.id===id);if(!s)return;
  const rows=eligibleFor(s.exercise).filter(r=>r.date<=s.date),previous=rows.filter(r=>r.id!==s.id).at(-1);
  showHistoryDialog(s.exercise,`${shortDate(s.date)} 2026 · ${s.source} sample${s.saved?' · saved in this browser':''}`,`<div class="detail-reading">${s.value===null?'Not assessed':s.value}<small> ${s.value===null?'':s.unit}</small></div><p class="notice">${s.eligible?'Eligible design example. This is not a real athlete assessment.':s.reason||'Demonstrator session. Retained for inspection and excluded from growth comparisons.'}</p>${s.eligible?`<p>${previous?`${deltaText(s.value,previous.value,s.unit)} since the previous eligible session (${shortDate(previous.date)}).`:'First eligible session in the sample history.'}</p><div class="detail-chart">${lineChart(rows,s.exercise+' report timeline')}</div>`:''}<div class="compare-grid"><div><strong>${s.form===null?'—':s.form+'%'}</strong><span>Sample form reading</span></div><div><strong>${s.source}</strong><span>Illustrative capture source</span></div><div><strong>${s.saved?'Saved':'Seeded'}</strong><span>Preview record type</span></div></div><button class="text-btn" data-history="${s.exercise}">All ${s.exercise.toLowerCase()} history →</button><p class="source-note">${s.saved?'The saved sample includes its comparison-series data. It is stored under a mockup-only key, separate from the real app.':'This is a seeded example, not a saved real report.'} Single-camera estimates are screening information.</p>`,origin);
}
const baseOpenDialog=openDialog;
openDialog=function(kind,origin){
  if(kind==='jump')return openExerciseHistory('Countermovement jump',origin);
  if(kind==='history'){showPage('history');return;}
  if(kind==='sources')return showHistoryDialog('A signal needs a source.','Future integration concept · nothing connected','<p>Recovery, sleep, resting heart rate and HRV need appropriate wearable or imported records. Fitzen currently has no connected source for these signals.</p><p>This is a design extension inspired by Xeyo, not a feature already implemented in Fitzen. No sign-in, permission request or source connection happens here.</p><div class="notice">The camera continues to assess movement only. Sample wellness readings are never included in exercise-performance comparisons.</div>',origin);
  if(kind==='week')return showHistoryDialog('Your week, in context.','23–29 October · illustrative data',`<p>Your latest sample jump is <strong>0.8 cm above the previous eligible session</strong>, and <strong>3.2 cm above your first sample</strong>.</p><p>Sleep and recovery are separate simulated signals. They are shown beside training for context, without claiming that one caused the other.</p><button class="btn light" data-page="history">Explore the complete history →</button>`,origin);
  return baseOpenDialog(kind,origin);
};
const baseShowPage=showPage;
showPage=function(next){baseShowPage(next);if(next==='history')renderHistory();if(next==='progress')renderGrowth();if(next==='results')renderReportComparison();};
renderExercises=renderExerciseCards;
$('#growth-exercise').innerHTML=movements.map(m=>`<option${m[0]===growthExercise?' selected':''}>${m[0]}</option>`).join('');
$('#history-exercise').innerHTML='<option value="all">All exercises</option>'+movements.map(m=>`<option>${m[0]}</option>`).join('');
const historyNav=document.createElement('button');historyNav.dataset.page='history';historyNav.innerHTML=glyph('move')+'History';$('.nav').append(historyNav);
// The new top-level History destination is active independently of Summary.
const summaryPage=showPage;showPage=function(next){summaryPage(next);if(next==='history')$$('.nav button').forEach(b=>{if(b.dataset.page==='history')b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});};
document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.signal)signalDetail(button.dataset.signal,button);
  if(button.dataset.history)openExerciseHistory(button.dataset.history,button);
  if(button.dataset.session)openSession(button.dataset.session,button);
  if(button.dataset.historyPage){if($('#dialog').open)$('#dialog').close();$('#history-exercise').value=button.dataset.historyPage;showPage('history');}
  if(button.dataset.exercisePeriod)openExerciseHistory(exerciseDetail.name,button,button.dataset.exercisePeriod);
  if(button.dataset.growthPeriod){growthPeriod=button.dataset.growthPeriod;$$('[data-growth-period]').forEach(b=>b.setAttribute('aria-pressed',b===button));renderGrowth();}
  if(button.id==='wellness-toggle'){wellnessSamples=!wellnessSamples;renderWellness();}
  if(button.id==='show-samples'){wellnessSamples=true;renderWellness();$('#dialog').close();}
  if(button.id==='save-sample'){
    savedSample=true;
    try{localStorage.setItem(PREVIEW_HISTORY_KEY,JSON.stringify({version:1,id:CURRENT_SAMPLE.id,report:CURRENT_SAMPLE,series:eligibleFor('Bodyweight squat').map(s=>({date:s.date,value:s.value,unit:s.unit}))}));storageAvailable=true;}catch{storageAvailable=false;}
    renderSummary();renderExercises();renderHistory();renderGrowth();
  }
  if(button.id==='reset-saved'){savedSample=false;try{localStorage.removeItem(PREVIEW_HISTORY_KEY);}catch{}renderSummary();renderHistory();renderExercises();renderGrowth();$('#storage-note').textContent='Saved sample reset. Seeded design examples remain. Real Fitzen data is untouched.';}
  if(button.id==='clear-history'){$('#history-exercise').value='all';$('#history-range').value='all';$('#history-evidence').value='all';renderHistory();}
});
document.addEventListener('change',e=>{
  if(['history-exercise','history-range','history-evidence'].includes(e.target.id))renderHistory();
  if(e.target.id==='growth-exercise'){growthExercise=e.target.value;renderGrowth();}
});
document.addEventListener('input',e=>{
  if(e.target.id==='exercise-slider')updateExerciseSelection(Number(e.target.value));
  if(e.target.id==='signal-slider'){const key=e.target.dataset.key,index=Number(e.target.value),m=wellness[key],rows=signalRows(key);$('#signal-value').innerHTML=`${rows[index].value}<small> ${m.unit}</small>`;$('#signal-date').textContent=shortDate(rows[index].date)+' · illustrative reading';$('#signal-chart').innerHTML=lineChart(rows,m.name+' sample trend',false,index,m.bars);}
});
renderSummary();renderHistory();renderGrowth();renderExercises();
