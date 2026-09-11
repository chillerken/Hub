function makeAi(config) {
  async function answer(message) {
    if (!config.openaiKey) {
      const e = new Error('AI-provider niet geconfigureerd');
      e.code = 'AI_NOT_CONFIGURED';
      throw e;
    }
    const b = config.business;
    const instructions = `Je bent de digitale klantenassistent van ${b.name}. Spreek vriendelijk, kort en professioneel Belgisch-Nederlands. Verzin nooit prijzen, beschikbaarheid, voorwaarden of garanties. Gebruik uitsluitend deze bedrijfsinformatie: website ${b.website || 'niet opgegeven'}; telefoon ${b.phone || 'niet opgegeven'}; e-mail ${b.email || 'niet opgegeven'}; regio ${b.area || 'niet opgegeven'}; uren ${b.hours || 'niet opgegeven'}; diensten ${(b.services || []).join('; ') || 'niet opgegeven'}. Bij een exacte offerte, klacht, privacyvraag, betaalvraag of ontbrekende informatie: zeg duidelijk dat een medewerker moet opvolgen en vraag de bezoeker om het contactformulier te gebruiken.`;
    const r = await fetch('https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{ Authorization:`Bearer ${config.openaiKey}`, 'Content-Type':'application/json' },
      body:JSON.stringify({
        model:config.openaiModel,
        instructions,
        input:message,
        max_output_tokens:300,
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
