function classifyRules(value) {
  const raw=String(value||'').trim();
  const text=raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const make=(intent,summary,handoff=false,priority='normal',sentiment='unknown')=>({available:true,mode:'rules',intent,priority,sentiment,summary,handoff});
  if(!text)return make('spam','Leeg bericht; geen opvolging nodig.');
  if(/\b(qa test|technische controle|testbericht|geen klant|geen uitvoering|dummy)\b/.test(text))return make('spam','Testbericht herkend; geen klantopvolging nodig.');
  if(/^(hallo|hoi|hey|goeiedag|goedendag|goeiemorgen|goedemorgen|goeiemiddag|goedenavond|hoe gaat het|alles goed)[!.? ]*$/.test(text))return make('information','Begroeting of smalltalk; geen menselijke opvolging nodig.');
  if(text.length<=3 && !/^(hi|hey)$/.test(text))return make('spam','Zeer kort niet-inhoudelijk bericht; geen opvolging nodig.');
  const rules=[
    ['complaint',/klacht|schade|beschadig|kapot|ontevreden|slecht|probleem|niet tevreden/],
    ['cancel',/annule|afzeg|afspraak.*niet|kan niet komen/],
    ['change',/verplaats|wijzig|ander tijdstip|andere datum/],
    ['quote',/offerte|prijsvoorstel|prijsindicatie|definitieve prijs|m2|m²|terras|oprit|zetel|meubel/],
    ['price',/prijs|kost|kosten|tarief|hoeveel/],
    ['booking',/afspraak|boeken|reserver|moment|beschikbaar|wanneer|morgen|zaterdag|zondag|komen reinigen/],
    ['business',/zakelijk|bedrijf|zelfstandig|wagenpark|fleet|factuur|btw/],
    ['information',/informatie|uitleg|hoe werkt|wat doen|waar|welke dienst|opening|regio|gemeente/]
  ];
  const intent=rules.find(([,pattern])=>pattern.test(text))?.[0]||'unknown';
  const priority=intent==='complaint'?'high':'normal';
  const handoff=['complaint','cancel','change','quote','business'].includes(intent)||(intent==='unknown'&&text.length>=80);
  const summaries={complaint:'Klacht of probleem herkend; persoonlijke opvolging nodig.',cancel:'Klant wil annuleren; persoonlijke controle nodig.',change:'Klant wil een afspraak wijzigen; persoonlijke opvolging nodig.',quote:'Offerte- of maatwerkvraag herkend; inhoud persoonlijk controleren.',price:'Prijsvraag herkend.',booking:'Boekings- of beschikbaarheidsvraag herkend.',business:'Zakelijke aanvraag herkend; persoonlijke opvolging aanbevolen.',information:'Algemene informatievraag herkend.',spam:'Niet-inhoudelijk bericht.',unknown:handoff?'Onbekende maar inhoudelijke vraag; persoonlijk beoordelen.':'Kort/onduidelijk bericht; nog geen opvolging nodig.'};
  return make(intent,summaries[intent],handoff,priority,intent==='complaint'?'negative':'unknown');
}
function quoteRules(brief,catalog,selection) {
  const service=catalog.find(s=>s.id===selection.service_id);
  const quantity=Number(selection.quantity);
  if(!service||!Number.isFinite(quantity)||quantity<=0||quantity>1000)throw new Error('Kies een bestaande dienst en een geldig aantal voor dit catalogusconcept.');
  return {title:'Conceptofferte — '+service.name,notes:'Catalogusconcept zonder generatieve AI. Controleer aantallen, omvang en voorwaarden vóór goedkeuring.\n\nAanvraag: '+String(brief).slice(0,3000),items:[{service_id:service.id,quantity}]};
}
module.exports={classifyRules,quoteRules};
