import {SAXParser} from 'parse5-sax-parser';

const REVENUE=['RevenueFromContractWithCustomerExcludingAssessedTax','RevenueFromContractWithCustomerIncludingAssessedTax','Revenues','SalesRevenueNet'];
const AXES=new Set(['ProductOrServiceAxis','StatementBusinessSegmentsAxis','StatementGeographicalAxis']);
const DAYS=86400000;
const duration=f=>(Date.parse(f.end)-Date.parse(f.start))/DAYS;
const clean=s=>s.replace(/\s+/g,' ').trim();
const local=q=>q?.split(':').at(-1);
function numeric(attrs,text,namespaces){
 if(attrs['xsi:nil']==='true'||attrs['xsi:nil']==='1'||attrs.target||attrs.tupleref||attrs.sign&&attrs.sign!=='-')return null;
 const format=local(attrs.format),uri=namespaces[attrs.format?.split(':')[0]];
 let digits=clean(text);
 if(attrs.format){
  if(!/^https?:\/\/www\.xbrl\.org\/inlineXBRL\/transformation\/\d{4}-\d{2}-\d{2}$/.test(uri||''))return null;
  if(format==='fixed-zero'||format==='zerodash')digits='0';
  else if(format==='num-dot-decimal'||format==='numdotdecimal'){
   if(!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(digits))return null;
   digits=digits.replaceAll(',','');
  }else return null;
 }
 if(!/^\d+(?:\.\d+)?$/.test(digits)||!/^[-+]?\d+$/.test(attrs.scale||'0'))return null;
 const scale=Number(attrs.scale||0),decimals=attrs.decimals==='INF'?Infinity:Number(attrs.decimals);
 if(Math.abs(scale)>15||!(Number.isInteger(decimals)&&Math.abs(decimals)<=15||decimals===Infinity))return null;
 const value=Number(digits)*10**scale*(attrs.sign==='-'?-1:1);
 return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?{value,radius:decimals===Infinity?0:10**(-decimals)/2}:null;
}
function parse(html){
 const namespaces={},contexts=new Map(),units=new Map(),facts=[],tables=[],stack=[],tableStack=[],factStack=[];
 const parser=new SAXParser();let context=null,unit=null,capture=null,row=null,cell=null,namespaceConflict=false;
 const put=(map,id,value)=>map.set(id,map.has(id)?null:value);
 function finishFact(f){const number=numeric(f.attrs,f.text,namespaces);facts.push({...f,...number,invalid:f.nested||!number});}
 parser.on('startTag',t=>{
  const attrs=Object.fromEntries(t.attrs.map(a=>[a.name,a.value]));
  for(const [key,value] of Object.entries(attrs))if(key.startsWith('xmlns:')){
   const prefix=key.slice(6);if(namespaces[prefix]&&namespaces[prefix]!==value)namespaceConflict=true;namespaces[prefix]=value;
  }
  const hidden=stack.at(-1)?.hidden||['script','style','ix:hidden','head'].includes(t.tagName)||'hidden' in attrs||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style||'');
  if(!t.selfClosing&&!/^(br|hr|img|input|meta|link|col|wbr|source|area|base|embed|param)$/.test(t.tagName))stack.push({tag:t.tagName,hidden});
  if(t.tagName==='xbrli:context')context={id:attrs.id,dimensions:[],unsupported:false};
  if(t.tagName==='xbrli:unit')unit={id:attrs.id,measures:[],divide:false};
  if(context&&t.tagName==='xbrldi:typedmember')context.unsupported=true;
  if(unit&&t.tagName==='xbrli:divide')unit.divide=true;
  if(context&&['xbrli:identifier','xbrli:startdate','xbrli:enddate','xbrldi:explicitmember'].includes(t.tagName)
   ||unit&&t.tagName==='xbrli:measure')capture={tag:t.tagName,attrs,text:''};
  if(!hidden&&t.tagName==='table'){
   if(tableStack.length)tableStack.forEach(t=>t.nested=true);
   const table={id:tables.length,nested:tableStack.length>0,complete:false};tables.push(table);tableStack.push(table);
  }
  if(!hidden&&t.tagName==='tr')row={cells:[]};
  if(!hidden&&['td','th'].includes(t.tagName)&&row){cell={text:''};row.cells.push(cell);}
  if(!hidden&&t.tagName==='ix:nonfraction'){
   if(factStack.length)factStack.forEach(f=>f.nested=true);
   const f={attrs,text:'',table:tableStack.at(-1),row,nested:factStack.length>0};
   if(t.selfClosing)finishFact(f);else factStack.push(f);
  }
 });
 parser.on('text',t=>{
  if(capture)capture.text+=t.text;
  if(!stack.at(-1)?.hidden){if(cell)cell.text+=t.text;for(const f of factStack)f.text+=t.text;}
 });
 parser.on('endTag',t=>{
  if(capture?.tag===t.tagName){
   const text=clean(capture.text);
   if(t.tagName==='xbrli:identifier'){context.cik=text;context.scheme=capture.attrs.scheme;}
   if(t.tagName==='xbrli:startdate')context.start=text;
   if(t.tagName==='xbrli:enddate')context.end=text;
   if(t.tagName==='xbrldi:explicitmember')context.dimensions.push({axis:capture.attrs.dimension,member:text});
   if(t.tagName==='xbrli:measure')unit.measures.push(text);
   capture=null;
  }
  if(t.tagName==='xbrli:context'&&context){put(contexts,context.id,context);context=null;}
  if(t.tagName==='xbrli:unit'&&unit){put(units,unit.id,unit);unit=null;}
  if(!stack.at(-1)?.hidden){
   if(t.tagName==='ix:nonfraction'&&factStack.length)finishFact(factStack.pop());
   if(['td','th'].includes(t.tagName))cell=null;
   if(t.tagName==='tr')row=null;
   if(t.tagName==='table'&&tableStack.length)tableStack.pop().complete=true;
  }
  const i=stack.findLastIndex(x=>x.tag===t.tagName);if(i>=0)stack.length=i;
 });
 parser.end(html);
 const ids=new Map();for(const f of facts)ids.set(f.attrs.id,(ids.get(f.attrs.id)||0)+1);
 const standard=(q,family)=>new RegExp(`^https?://fasb\\.org/${family}/\\d{4}$`).test(namespaces[q?.split(':')[0]]||'');
 return {namespaceConflict,facts:facts.filter(f=>standard(f.attrs.name,'us-gaap')&&REVENUE.includes(local(f.attrs.name))).map(f=>{
  const ctx=contexts.get(f.attrs.contextref),u=units.get(f.attrs.unitref),measure=u?.measures[0];
  return {...f,context:ctx,concept:local(f.attrs.name),usd:!u?.divide&&u?.measures.length===1&&local(measure)==='USD'&&namespaces[measure.split(':')[0]]==='http://www.xbrl.org/2003/iso4217',
   invalid:f.invalid||ids.get(f.attrs.id)!==1||!/^[A-Za-z_][\w:.-]*$/.test(f.attrs.id||''),
   axisAllowed:ctx?.dimensions.length===1&&AXES.has(local(ctx.dimensions[0].axis))&&standard(ctx.dimensions[0].axis,'(?:us-gaap|srt)')};
 })};
}
function resolve(rows){
 if(!rows.length||rows.some(f=>f.invalid||!f.usd))return null;
 const best=[...rows].sort((a,b)=>a.radius-b.radius||a.attrs.id.localeCompare(b.attrs.id))[0];
 if(rows.some(f=>f.radius===best.radius&&f.value!==best.value||Math.abs(f.value-best.value)>f.radius+best.radius))return null;
 return best;
}
function envelope(f){return {value:f.value,factId:f.attrs.id,contextId:f.attrs.contextref,start:f.context.start,end:f.context.end};}

export function revenueBreakdown(html,source){
 const base={version:'revenue-breakdown-v1',sourceId:source.id,partitions:[],exclusions:[],economicCauseVerified:false};
 if(!Number.isFinite(Date.parse(source.acceptedAt))||Date.parse(source.periodEnd)>Date.parse(source.acceptedAt))return {...base,status:'unresolved',reason:'INVALID_SOURCE_PERIOD'};
 const parsed=parse(html);if(parsed.namespaceConflict)return {...base,status:'unresolved',reason:'CONFLICTED_NAMESPACES'};
 const facts=parsed.facts.filter(f=>f.context&&!f.context.unsupported&&Number(f.context.cik)===Number(source.cik)
  &&f.context.scheme==='http://www.sec.gov/CIK'&&duration(f.context)>=60&&duration(f.context)<=380);
 const totals=facts.filter(f=>f.context.dimensions.length===0),newest=totals.filter(f=>f.context.end===source.periodEnd);
 const concept=REVENUE.find(c=>newest.some(f=>f.concept===c));
 const currentStart=newest.filter(f=>f.concept===concept).map(f=>f.context.start).sort()[0];
 const current=resolve(newest.filter(f=>f.concept===concept&&f.context.start===currentStart));
 if(!current)return {...base,status:'unresolved',reason:'MISSING_OR_CONFLICTED_TOTAL'};
 const previous=totals.filter(f=>f.concept===concept&&Math.abs(duration(f.context)-duration(current.context))<=8
  &&(Date.parse(current.context.end)-Date.parse(f.context.end))/DAYS>=330&&(Date.parse(current.context.end)-Date.parse(f.context.end))/DAYS<=380);
 const periods=new Set(previous.map(f=>f.context.start+'|'+f.context.end));
 const prior=periods.size===1?resolve(previous):null;
 if(!prior)return {...base,status:'unresolved',reason:'MISSING_OR_CONFLICTED_COMPARATIVE'};
 const relevant=facts.filter(f=>f.concept===concept&&f.axisAllowed&&f.table
  &&[current,prior].some(p=>p.context.start===f.context.start&&p.context.end===f.context.end));
 const atomKey=f=>JSON.stringify([f.concept,f.context.start,f.context.end,f.context.dimensions]);
 const atoms=new Map();
 for(const f of facts){const key=atomKey(f);if(!atoms.has(key))atoms.set(key,[]);atoms.get(key).push(f);}
 const conflicts=new Set([...atoms].filter(([,rows])=>!resolve(rows)).map(([key])=>key));
 const groups=new Map();
 for(const f of relevant){const key=f.table.id+'|'+f.context.dimensions[0].axis;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 const candidates=[];
 for(const group of groups.values()){
  const table=group[0].table,axis=group[0].context.dimensions[0].axis;
  const reject=reason=>base.exclusions.push({tableId:table.id,axis,reason});
  if(table.nested||!table.complete){reject('INCOMPLETE_OR_NESTED_TABLE');continue;}
  const members=[...new Set(group.map(f=>f.context.dimensions[0].member))];
  if(members.length<2||members.length>30){reject('UNSUPPORTED_MEMBER_COUNT');continue;}
  const rows=[];let invalid=false;
  for(const member of members){
   const ofMember=group.filter(f=>f.context.dimensions[0].member===member);
   const a=resolve(ofMember.filter(f=>f.context.start===prior.context.start&&f.context.end===prior.context.end));
   const b=resolve(ofMember.filter(f=>f.context.start===current.context.start&&f.context.end===current.context.end));
   if(!a||!b||conflicts.has(atomKey(a))||conflicts.has(atomKey(b))){invalid=true;break;}
   const rowMembers=new Set(group.filter(f=>f.row===b.row).map(f=>f.context.dimensions[0].member));
   const label=clean(b.row?.cells[0]?.text||'');
   rows.push({member,label:rowMembers.size===1&&/[A-Za-z]/.test(label)&&label.length<=130?label:local(member).replace(/Member$/,'').replace(/([a-z])([A-Z])/g,'$1 $2'),
    labelBasis:rowMembers.size===1&&/[A-Za-z]/.test(label)&&label.length<=130?'filing_row':'taxonomy_identifier',
    prior:envelope(a),current:envelope(b),change:b.value-a.value,
    currentShare:current.value>0?b.value/current.value:null,growthContribution:prior.value>0?(b.value-a.value)/prior.value:null,
    priorRadius:a.radius,currentRadius:b.radius});
  }
  if(invalid){reject('MISSING_OR_CONFLICTED_MEMBER');continue;}
  const priorGap=prior.value-rows.reduce((s,r)=>s+r.prior.value,0),currentGap=current.value-rows.reduce((s,r)=>s+r.current.value,0);
  const tolerance={prior:prior.radius+rows.reduce((s,r)=>s+r.priorRadius,0),current:current.radius+rows.reduce((s,r)=>s+r.currentRadius,0)};
  if(Math.abs(priorGap)>tolerance.prior||Math.abs(currentGap)>tolerance.current){reject('DOES_NOT_RECONCILE');continue;}
  const labels=rows.map(r=>r.label);
  for(const r of rows)if(labels.filter(x=>x===r.label).length>1||/^(?:total )?(?:net sales|revenue|revenues|sales)$/i.test(r.label)){
   r.label=local(r.member).replace(/Member$/,'').replace(/([a-z])([A-Z])/g,'$1 $2');r.labelBasis='taxonomy_identifier';
  }
  candidates.push({sourceId:source.id,tableId:table.id,axis,concept,unit:'USD',currentTotal:envelope(current),priorTotal:envelope(prior),rows:rows.map(({priorRadius,currentRadius,...r})=>r),
   totalGrowth:prior.value>0?(current.value-prior.value)/prior.value:null,reconciliation:{priorGap,currentGap,roundingTolerance:tolerance}});
 }
 // Keep a whole reported table per axis, preferring the more detailed complete
 // disclosure. Never search combinations of rows to force a sum to match.
 candidates.sort((a,b)=>b.rows.length-a.rows.length||a.tableId-b.tableId);
 for(const p of candidates)if(!base.partitions.some(x=>x.axis===p.axis))base.partitions.push(p);
 return {...base,status:base.partitions.length?'available':'unresolved',start:current.context.start,end:current.context.end};
}
