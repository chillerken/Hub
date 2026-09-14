// Grounded answers for limited public questions. This is not an LLM or a booking agent.
function normalize(text){return String(text||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9²]+/g,' ').trim();}
const transaction=/\b(afspraak|afspraken|boeken|boek|reserveer|reserveren|annuleer|annuleren|verplaats|verplaatsen|wijzig|wijzigen|bevestig|bevestigen|akkoord|klacht|schade|factuur|betalen|betaal|boeking|boekingen|offerte|privacy|verwijder|uitschrijven|stuur|verstuur)\b/;
const priceQuestion=/\b(prijs|prijzen|kost|kosten|tarief|tarieven|hoeveel|offerte|prijsindicatie)\b/;
const serviceQuestion=/\b(dienst|diensten|reinigen|reiniging|aanbod|aanbieden|doen jullie|doet u)\b/;
const car=/\b(auto|autos|autowas|autoreiniging|wagen|wagens|carwash|sedan|suv|break|bestelwagen|detailing)\b/;
function areaIn(text){const m=String(text||'').match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:m²|m2|vierkante\s+meter)(?=$|[\s.,!?;:])/i);if(!m)return null;const n=Number(m[1].replace(',','.'));return n>0&&n<=10000?n:null;}
function familyNames(catalog){
 const names=catalog.map(s=>normalize(s.name));const choices=[];
 if(names.some(n=>/clean shine|interior refresh|full detail|premium mobile|carwash|auto/.test(n)))choices.push('auto');
 if(names.some(n=>n.includes('terras')))choices.push('terras');
 if(names.some(n=>n.includes('oprit')))choices.push('oprit');
 if(names.some(n=>/zetel|stoel|meubel/.test(n)))choices.push('meubels');
 return choices.length?choices.join(', '):catalog.slice(0,5).map(s=>s.name).join(', ');
}
function selectServices(text,catalog){
 const q=normalize(text);
 const exact=catalog.filter(s=>{const n=normalize(s.name);return n.length>3&&(' '+q+' ').includes(' '+n+' ');});
 if(exact.length)return exact;
 const packages=catalog.filter(s=>{const n=normalize(s.name.split('(')[0]);return n.length>5&&(' '+q+' ').includes(' '+n+' ');});
 let rows=packages;
 if(!rows.length){
  if(q.includes('terras')&&q.includes('oprit'))rows=catalog.filter(s=>/terras|oprit/.test(normalize(s.name)));
  else if(/\bterras(?:reiniging)?\b/.test(q))rows=catalog.filter(s=>/^terras/.test(normalize(s.name)));
  else if(/\boprit(?:reiniging)?\b/.test(q))rows=catalog.filter(s=>/^oprit/.test(normalize(s.name)));
  else if(/\btuinmeubel/.test(q))rows=catalog.filter(s=>/tuinmeubel/.test(normalize(s.name)));
  else if(/\b(zetel|zetels|sofa|bankstel|meubel|meubels|meubelreiniging)\b/.test(q))rows=catalog.filter(s=>/zetel/.test(normalize(s.name)));
  else if(/\b(stoel|stoelen|eetkamerstoel)\b/.test(q))rows=catalog.filter(s=>/stoel/.test(normalize(s.name)));
  else if(car.test(q))rows=catalog.filter(s=>/clean shine|interior refresh|full detail|premium mobile|carwash|auto/.test(normalize(s.name)));
 }
 if(/\b(suv|break)\b/.test(q))rows=rows.filter(s=>/suv|break/.test(normalize(s.name)));
 else if(/\bbestelwagen\b/.test(q))rows=rows.filter(s=>/bestelwagen/.test(normalize(s.name)));
 else if(/\bsedan\b/.test(q))rows=rows.filter(s=>/\bsedan\b/.test(normalize(s.name)));
 return rows;
}
function money(cents){return new Intl.NumberFormat('nl-BE',{style:'currency',currency:'EUR'}).format(cents/100);}
function describePrice(service,area){
 const prices=(service.prices||[]).filter(p=>Number.isSafeInteger(p.amount_cents)&&p.amount_cents>=0&&(!p.currency||p.currency==='EUR'));
 if(!prices.length)return service.name+': prijs op aanvraag.';
 return prices.map(p=>{
  const indicative=service.price_mode!=='fixed';
  let line=service.name+(p.category&&p.category!=='standard'?' ('+p.category+')':'')+': '+(indicative?'vanaf ':'')+money(p.amount_cents)+(p.unit?' per '+p.unit:'')+'.';
  if(area&&/^(m²|m2)$/.test(p.unit||''))line+=' Rekenindicatie voor '+String(area).replace('.',',')+' m²: '+(indicative?'vanaf ':'')+money(Math.round(p.amount_cents*area))+'.';
  return line;
 }).join('\n');
}
async function basicReply(message,settings,history,getCatalog){
 const q=normalize(message),business=settings.business||{};
 if(/^(hallo|hoi|hey|dag|goedendag|goedemorgen|goedemiddag|goedenavond)( lina| luxwash)?$/.test(q))
  return {kind:'greeting',answer:settings.ai?.greeting||'Hallo! Welkom bij '+(business.name||'LuxWash')+'. Welke reiniging zoekt u?'};
 if(/^(dank u|dank je|dankjewel|bedankt|merci|thanks)$/.test(q))
  return {kind:'thanks',answer:'Graag gedaan. Heeft u nog een vraag over onze diensten?'};
 // Transactions, complaints, private records and contact intake require the real agent or a handoff.
 if(/\b(hoe lang|hoelang|duurt|beschikbaar|beschikbaarheid|vrij|wanneer|morgen|vandaag|overmorgen)\b/.test(q)||transaction.test(q)||/\b(mijn naam|ik heet|ik ben|mijn email|mijn telefoon|bereik mij)\b/.test(q)||/[^\s@]+@[^\s@]+\.[^\s@]+/.test(message))return null;
 if(/\b(telefoonnummer|telefoon|nummer|contactgegevens|contact|emailadres|email|bellen|bereiken)\b/.test(q)){
  const lines=[business.phone?'U kunt '+(business.name||'LuxWash')+' bellen op '+business.phone+'.':'',business.email?'E-mail: '+business.email+'.':''].filter(Boolean);
  return lines.length?{kind:'contact',answer:lines.join('\n')}:null;
 }
 if(/\b(werkgebied|regio|postcodes|waar werken|waar reinigen|aan huis|komen jullie)\b/.test(q)){
  return business.area?{kind:'area',answer:'Ons opgegeven werkgebied: '+business.area+'. Een vrij moment moet afzonderlijk worden gecontroleerd via de planning.'}:null;
 }
 const area=areaIn(message);
 const looksLikeService=priceQuestion.test(q)||serviceQuestion.test(q)||car.test(q)||/\b(terras|terrasreiniging|oprit|opritreiniging|zetel|zetels|sofa|bankstel|stoel|stoelen|eetkamerstoel|meubel|meubels|meubelreiniging|tuinmeubelen|clean shine|interior refresh|full detail|premium mobile)\b/.test(q)||area;
 if(!looksLikeService)return null;
 // Decline safety/preparation/guarantee questions rather than guessing from a service name.
 if(/\b(veilig|schadevrij|garantie|garanderen|chemisch|product|producten|water|stroom|voorbereid|voorbereiden|allergie|vlekken verwijderen|werkt op|geschikt)\b/.test(q))return null;
 const catalog=(await getCatalog()).filter(s=>s&&s.active!==false&&typeof s.name==='string');
 if(!catalog.length)return null;
 let selected=selectServices(message,catalog),contextText=message;
 if(!selected.length&&(priceQuestion.test(q)||area)){
  for(const m of [...(history||[])].reverse()){
   if(m.direction!=='inbound')continue;
   const prior=selectServices(m.content,catalog);
   if(prior.length){selected=prior;contextText=m.content;break;}
  }
 }
 if(!selected.length){
  // Only a general request gets the menu; an unknown specific service is escalated.
  if(/^(wat zijn (jullie|uw|de) (diensten|prijzen|tarieven)|welke diensten (bieden jullie aan|hebben jullie)|diensten|prijzen|prijslijst|tarieven|wat doen jullie|wat bieden jullie aan|hoeveel kost dat|wat kost dat)$/.test(q))
   return {kind:'service_menu',answer:'Voor welke reiniging wilt u informatie: '+familyNames(catalog)+'? Noem gerust de dienst of het object.'};
  return null;
 }
 if(selected.length>6)
  return {kind:'category_question',answer:'Onze prijslijst maakt onderscheid tussen voertuigtypes en pakketten. Gaat het om een sedan, break/SUV of kleine bestelwagen, en welk reinigingspakket bedoelt u?'};
 const rememberedArea=area||areaIn(contextText);
 let answer=selected.map(s=>describePrice(s,rememberedArea)).join('\n');
 if(selected.some(s=>s.price_mode!=='fixed'))answer+='\nDit zijn catalogusindicaties. LuxWash bevestigt de definitieve prijs op basis van de omvang, het materiaal en de vervuiling.';
 answer+='\nVia het aanvraagformulier kunt u uw gegevens doorgeven. Hiermee is nog geen afspraak geboekt.';
 return {kind:'catalog',answer};
}
module.exports={basicReply,selectServices,areaIn};
