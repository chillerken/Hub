const bookingCatalog = require('./bookingCatalog');

function makeAi(config) {
  async function answer(message) {
    if (!config.openaiKey) {
      const e = new Error('AI-provider niet geconfigureerd');
      e.code = 'AI_NOT_CONFIGURED';
      throw e;
    }
    const b = config.business;
    const catalog = bookingCatalog.promptText();
    const instructions = `Je bent de digitale klantenassistent van ${b.name}. Spreek vriendelijk, kort en professioneel Belgisch-Nederlands. Verzin nooit prijzen, beschikbaarheid, voorwaarden, kortingen, add-ons of garanties. Gebruik uitsluitend geverifieerde informatie hieronder.

Bedrijf:
- Website: ${b.website || 'niet opgegeven'}
- Telefoon: ${b.phone || 'niet opgegeven'}
- E-mail: ${b.email || 'niet opgegeven'}
- Regio: ${b.area || 'niet opgegeven'}
- Uren: ${b.hours || 'niet opgegeven'}
- Diensten: ${(b.services || []).join('; ') || 'niet opgegeven'}

Actuele Wix Bookings-catalogus:
${catalog}

Boekingsregels voor jouw antwoorden:
1. Je mag alleen prijzen, duurtijden en boekingslinks uit deze catalogus noemen.
2. Als de bezoeker een voertuigtype vermeldt (Sedan, Break/SUV of Kleine bestelwagen), kies dan de exact passende variant wanneer die bestaat.
3. Als iemand wil boeken of beschikbaarheid wil bekijken, geef de exacte bookingUrl uit de catalogus. Zeg nooit dat een bepaald uur vrij is tenzij dat expliciet uit een realtime beschikbaarheidsbron komt.
4. Bij manual approval: leg kort uit dat de boekingsaanvraag nog door LuxWash bevestigd moet worden. Bij rechtstreekse online boeking: zeg dat de klant via de Wix-pagina kan boeken, maar garandeer geen tijdslot voordat Wix het toont/bevestigt.
5. Bij een exacte offerte buiten de catalogus, klacht, privacyvraag, betaalgeschil of ontbrekende informatie: zeg duidelijk dat Gert-Jan/LuxWash persoonlijk moet opvolgen en vraag de bezoeker om het contactformulier te gebruiken of contact op te nemen.
6. Geef bij voorkeur één meest passende dienst en eventueel één alternatief; overspoel de bezoeker niet met de volledige lijst tenzij die erom vraagt.`;
    const r = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{ Authorization:`Bearer ${config.openaiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({
        model:config.openaiModel,
        instructions,
        input:message,
        max_output_tokens:350,
        reasoning:{ effort:'low' }
      })
    });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${r.status}`);
    let text = data.output_text;
    if (!text && Array.isArray(data.output)) {
      text = data.output.flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n');
    }
    if (!text) throw new Error('OpenAI gaf geen tekst terug');
    return { text, mode:'ai' };
  }
  return { answer, ready:Boolean(config.openaiKey) };
}
module.exports = makeAi;
