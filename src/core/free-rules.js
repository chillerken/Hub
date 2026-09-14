function classifyRules(value) {
  const text=String(value).toLowerCase();
  const rules=[['complaint',/klacht|schade|beschadig|ontevreden/],['cancel',/annule|afzeg/],['change',/verplaats|wijzig/],['quote',/offerte|prijsvoorstel/],['price',/prijs|kost|tarief/],['booking',/afspraak|boeken|reserver/],['business',/zakelijk|bedrijf|wagenpark/],['information',/informatie|uitleg|hoe werkt/]];
  const intent=rules.find(([,pattern])=>pattern.test(text))?.[0]||'unknown';
  const high=intent==='complaint';
  return {available:true,mode:'rules',intent,priority:high?'high':'normal',sentiment:'unknown',summary:'Regelgebaseerde indeling: '+intent+'. Lees het oorspronkelijke bericht voor de inhoud en neem persoonlijk contact op waar nodig.',handoff:['complaint','cancel','change','quote','unknown'].includes(intent)};
}
function quoteRules(brief,catalog,selection) {
  const service=catalog.find(s=>s.id===selection.service_id);
  const quantity=Number(selection.quantity);
  if(!service||!Number.isFinite(quantity)||quantity<=0||quantity>1000)throw new Error('Kies een bestaande dienst en een geldig aantal voor dit catalogusconcept.');
  return {title:'Conceptofferte — '+service.name,notes:'Catalogusconcept zonder generatieve AI. Controleer aantallen, omvang en voorwaarden vóór goedkeuring.\n\nAanvraag: '+String(brief).slice(0,3000),items:[{service_id:service.id,quantity}]};
}
module.exports={classifyRules,quoteRules};
