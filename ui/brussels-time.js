const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function brusselsLocal(value){const parts=Object.fromEntries(formatter.formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;}
function brusselsInstant(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Vul een geldig Belgisch tijdstip in');
 const naive=Date.parse(value+'Z');if(!Number.isFinite(naive))throw new Error('Ongeldig tijdstip');
 const offsets=new Set([-86400000,0,86400000].map(delta=>Date.parse(brusselsLocal(naive+delta)+'Z')-(naive+delta)));
 const candidates=[...offsets].map(offset=>naive-offset).filter(t=>brusselsLocal(t)===value);
 if(candidates.length!==1)throw new Error(candidates.length?'Dit uur komt tweemaal voor door de wintertijd. Kies een tijdstip na de uurwissel.':'Dit tijdstip bestaat niet in België door de zomeruurwissel of een ongeldige datum.');
 return new Date(candidates[0]).toISOString();
}
module.exports={brusselsInstant,brusselsLocal};
