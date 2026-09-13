// A narrow citation-scope check, never a certification of the underlying claim.
// Do not convert calendar dates into fiscal quarter numbers.
const ordinal={first:1,second:2,third:3,fourth:4,primer:1,primero:1,segundo:2,tercer:3,tercero:3,cuarto:4};
function quarters(text){
 const visible=text.split('\n').filter(line=>!(line.includes('|')&&/Form\s+10[-‑–][KQ]/i.test(line))).join('\n');
 const result=[];
 for(const match of visible.matchAll(/\b(?:(first|second|third|fourth)\s+(?:fiscal\s+)?quarter|(primer|primero|segundo|tercer|tercero|cuarto)\s+trimestre|Q([1-4])\s+(?:19|20)\d{2}|(?:19|20)\d{2}\s+Q([1-4]))\b/gi))
  result.push(ordinal[(match[1]||match[2]||'').toLowerCase()]||Number(match[3]||match[4]));
 return [...new Set(result)].sort();
}
export function namedQuarterScope(text,quotes){
 const claimedQuarters=quarters(text),bySource=quotes.map(quarters);
 const sourceQuarters=[...new Set(bySource.flat())].sort();
 const base={dimension:'named_fiscal_quarter',claimedQuarters,sourceQuarters,certifiesClaim:false};
 if(!claimedQuarters.length)return {...base,status:'not_requested'};
 // A calendar/fiscal mapping or an implicit period needs a different check.
 if(!quotes.length||bySource.some(q=>!q.length)||[text,...quotes].some(t=>/calendar|calendario|trimestre (?:natural|civil)/i.test(t)))
  return {...base,status:'unresolved'};
 return {...base,status:claimedQuarters.some(q=>!sourceQuarters.includes(q))?'conflict':'not_contradicted'};
}
