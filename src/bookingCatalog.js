const SERVICES = [
  { id:'22dacf73-3fc9-4cfa-ab75-5cd7b4657414', name:'Interior Refresh (Sedan)', price:55, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'49077f6d-a24b-4f76-836a-6f843b525377', name:'Interior Refresh (Kleine bestelwagen)', price:75, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'4cc1501c-e7d0-4311-98f2-41ec0542f06b', name:'Premium Mobile Detail (Break/SUV)', price:169, currency:'EUR', durationMinutes:150, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'8b161d1f-1101-479f-974b-8df6fb7d3c53', name:'Clean & Shine (Kleine bestelwagen)', price:69, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'b4774d75-caaf-41ff-9a6f-771407684b59', name:'Interior Refresh (Break/SUV)', price:65, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'d7649e10-175c-429e-91d0-3be2cfce2717', name:'Clean & Shine (Break/SUV)', price:59, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'f46c3eea-b2e9-4823-adcb-087a825d91e0', name:'Clean & Shine (Sedan)', price:49, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'fda7e84b-0565-43b8-b41b-0f9b80629397', name:'Premium Mobile Detail (Sedan)', price:149, currency:'EUR', durationMinutes:150, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' },
  { id:'72f4773f-0fc6-429b-abe0-201ab013fb80', name:'COMBI — INTERIEUR + EXTERIEUR', price:95, currency:'EUR', durationMinutes:null, manualApproval:true, bookingUrl:'https://www.luxwash.online/boeken' }
];

const UPDATED_AT = '2026-09-27T18:30:00+02:00';

function publicServices() {
  return SERVICES.map(({id,name,price,currency,durationMinutes,manualApproval,bookingUrl}) => ({
    id,name,price,currency,durationMinutes,manualApproval,bookingUrl
  }));
}

function promptText() {
  return SERVICES.map(s => `- ${s.name}: ${s.id === '72f4773f-0fc6-429b-abe0-201ab013fb80' ? 'vanaf ' : ''}€${s.price}${s.durationMinutes ? `, ${s.durationMinutes} min` : ''}, aanvraag vereist bevestiging, ${s.bookingUrl}`).join('\n');
}

module.exports = { SERVICES, UPDATED_AT, publicServices, promptText };
