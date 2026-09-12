const SERVICES = [
  { id:'22dacf73-3fc9-4cfa-ab75-5cd7b4657414', name:'Interior Refresh (Sedan)', price:55, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/booking-calendar/interior-refresh-sedan' },
  { id:'49077f6d-a24b-4f76-836a-6f843b525377', name:'Interior Refresh (Kleine bestelwagen)', price:75, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/booking-calendar/interior-refresh-kleine-bestelwagen' },
  { id:'4cc1501c-e7d0-4311-98f2-41ec0542f06b', name:'Premium Mobile Detail (Break/SUV)', price:145, currency:'EUR', durationMinutes:150, manualApproval:false, bookingUrl:'https://www.luxwash.online/booking-calendar/premium-mobile-detail-break-suv' },
  { id:'4fbb9354-0b4b-4cb1-a434-09e87ad0f4ec', name:'Premium Mobile Detail', price:135, currency:'EUR', durationMinutes:150, manualApproval:false, bookingUrl:'https://www.luxwash.online/booking-calendar/premium-mobile-detail' },
  { id:'8b161d1f-1101-479f-974b-8df6fb7d3c53', name:'Clean & Shine (Kleine bestelwagen)', price:65, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/booking-calendar/clean-shine-kleine-bestelwagen' },
  { id:'9e72da22-f58e-487a-bc7c-616e0432464d', name:'Full Detail Light (Kleine bestelwagen)', price:110, currency:'EUR', durationMinutes:120, manualApproval:false, bookingUrl:'https://www.luxwash.online/booking-calendar/full-detail-light-kleine-bestelwagen' },
  { id:'a061c6c3-c3a6-4a3f-929e-eb309567cb5a', name:'Full Detail Light (Break/SUV)', price:100, currency:'EUR', durationMinutes:120, manualApproval:false, bookingUrl:'https://www.luxwash.online/booking-calendar/full-detail-light-break-suv' },
  { id:'b4774d75-caaf-41ff-9a6f-771407684b59', name:'Interior Refresh (Break/SUV)', price:65, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/booking-calendar/interior-refresh-break-suv' },
  { id:'d5ca0138-2257-48c7-9909-7d4e98fb12fb', name:'Full Detail Light (Sedan)', price:90, currency:'EUR', durationMinutes:120, manualApproval:false, bookingUrl:'https://www.luxwash.online/booking-calendar/full-detail-light-sedan' },
  { id:'d7649e10-175c-429e-91d0-3be2cfce2717', name:'Clean & Shine (Break/SUV)', price:55, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/booking-calendar/clean-shine-break-suv' },
  { id:'e5cc6efe-f4fc-40dd-9d0a-4af3698213de', name:'Premium Mobile Detail (Kleine bestelwagen)', price:155, currency:'EUR', durationMinutes:150, manualApproval:false, bookingUrl:'https://www.luxwash.online/booking-calendar/premium-mobile-detail-kleine-bestelwagen' },
  { id:'f46c3eea-b2e9-4823-adcb-087a825d91e0', name:'Clean & Shine (Sedan)', price:45, currency:'EUR', durationMinutes:60, manualApproval:true, bookingUrl:'https://www.luxwash.online/booking-calendar/clean-shine-sedan' },
  { id:'fda7e84b-0565-43b8-b41b-0f9b80629397', name:'Premium Mobile Detail (Sedan)', price:135, currency:'EUR', durationMinutes:150, manualApproval:false, bookingUrl:'https://www.luxwash.online/booking-calendar/premium-mobile-detail-sedan' }
];

const UPDATED_AT = '2026-09-12T07:45:00+02:00';

function publicServices() {
  return SERVICES.map(({id,name,price,currency,durationMinutes,manualApproval,bookingUrl}) => ({
    id,name,price,currency,durationMinutes,manualApproval,bookingUrl
  }));
}

function promptText() {
  return SERVICES.map(s => `- ${s.name}: €${s.price}, ${s.durationMinutes} min, ${s.manualApproval ? 'aanvraag vereist bevestiging' : 'rechtstreeks online boekbaar'}, ${s.bookingUrl}`).join('\n');
}

module.exports = { SERVICES, UPDATED_AT, publicServices, promptText };
