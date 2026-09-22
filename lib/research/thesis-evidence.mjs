const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function evidenceSpans(text){
 const spans=[];
 for(let start=0;start<text.length;start+=600){
  const span=text.slice(start,start+700);if(span.length<40)break;
  spans.push({id:String(spans.length),text:span,start});
  if(start+700>=text.length)break;
 }
 return spans;
}
// Only explicit calendar dates. Fiscal years and relative deadlines are ambiguous.
export function calendarWindow(value){
 const text=String(value||'').trim();let year,month,day,match;
 if((match=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(text))){year=+match[1];month=+match[2];day=+match[3]}
 else if((match=/^([A-Za-z]+)\s+(?:(\d{1,2}),?\s+)?(20\d{2})$/.exec(text))){year=+match[3];month=months.indexOf(match[1].toLowerCase())+1;if(!month)return null;day=match[2]?+match[2]:undefined}
 else if(/^20\d{2}$/.test(text)){year=+text}
 else return null;
 if(month!==undefined&&(month<1||month>12))return null;
 const start=new Date(Date.UTC(year,(month||1)-1,day||1));
 if(start.getUTCFullYear()!==year||(month&&start.getUTCMonth()!==month-1)||(day!==undefined&&start.getUTCDate()!==day))return null;
 const end=day?start:new Date(Date.UTC(year,month||12,0));
 return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),precision:day?'day':month?'month':'year'};
}
export function classifyMilestone(dateText,quotes,asOf){
 const escaped=String(dateText||'').trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const quoted=escaped&&quotes.some(q=>new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?=$|[^a-zA-Z0-9])`,'i').test(q)&&!(/^20\d{2}$/.test(dateText)&&new RegExp(`(?:FY|fiscal(?:\\s+year)?)\\s*${escaped}`,'i').test(q)));
 const window=quoted?calendarWindow(dateText):null,cutoff=String(asOf).slice(0,10);
 if(!window)return {status:'undated',date:null};
 return {status:window.end<cutoff?'historical':window.start>cutoff?'upcoming':'undated',date:dateText,...window};
}
export function gateThesisReview(analysis,review){
 return {...analysis,sections:analysis.sections.map(section=>({...section,findings:section.findings.map((finding,i)=>{
  const answers=review?.items?.find(item=>item.id===`${section.id}:${i}`)?.answers;
  const clear=key=>answers?.[key]&&!answers[key].uncertain;
  const premiseStatus=clear('relation')?answers.relation.choice:'unknown';
  const reasoningStatus=clear('reasoning')?answers.reasoning.choice:'unknown';
  let timing=finding.timing;
  if(section.id==='catalysts'&&timing.status!=='historical'){
   if(clear('timing')&&answers.timing.choice==='historical')timing={...timing,status:'historical'};
   else if(timing.status==='upcoming'&&(!clear('timing')||answers.timing.choice!=='upcoming'))timing={...timing,status:'undated'};
  }
  return {...finding,timing,premiseStatus,reasoningStatus,reviewState:premiseStatus==='contradicts'||reasoningStatus==='overreach'?'challenged':premiseStatus==='supports'&&reasoningStatus==='bounded'?'grounded':'unresolved'};
 })}))};
}
