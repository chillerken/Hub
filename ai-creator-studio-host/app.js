const $=id=>document.getElementById(id);
const dashboard=$('dashboard'),workspace=$('workspace'),pageTitle=$('pageTitle'),statusDot=$('statusDot'),statusTitle=$('statusTitle'),statusDetail=$('statusDetail'),connectBtn=$('connectBtn'),testBtn=$('testBtn'),healthText=$('healthText'),puterHealth=$('puterHealth'),toolFields=$('toolFields'),toolTitle=$('toolTitle'),toolDescription=$('toolDescription'),toolBadge=$('toolBadge'),output=$('output'),imageOutput=$('imageOutput'),generateBtn=$('generateBtn'),clearBtn=$('clearBtn'),copyBtn=$('copyBtn'),outputLabel=$('outputLabel');
let currentTool='assistant',busy=false,lastOutput='';

const tools={
 assistant:{title:'AI Assistent',badge:'GENERAL AI',description:'Voor vragen, analyses, teksten, beslissingen en praktische hulp.',button:'Vraag AI',fields:[
  {id:'request',label:'Wat wil je doen?',type:'textarea',placeholder:'Beschrijf je vraag of opdracht zo concreet mogelijk…'}
 ],prompt:v=>v.request},
 content:{title:'Content Studio',badge:'CREATOR',description:'Maak direct bruikbare content voor social media, website of video.',button:'Maak content',fields:[
  {id:'topic',label:'Onderwerp / aanbod',type:'textarea',placeholder:'Waarover moet de content gaan?'},
  {id:'platform',label:'Platform',type:'select',options:['Instagram','Facebook','TikTok','LinkedIn','Website/blog','YouTube']},
  {id:'goal',label:'Doel',type:'select',options:['Meer bereik','Leads krijgen','Verkopen','Informeren','Autoriteit opbouwen']},
  {id:'tone',label:'Stijl',type:'select',options:['Professioneel','Premium','Direct','Enthousiast','Grappig','Lokaal en persoonlijk']}
 ],prompt:v=>`Je bent een senior contentstrateeg. Maak direct publiceerbare content in natuurlijk Nederlands. Platform: ${v.platform}. Doel: ${v.goal}. Stijl: ${v.tone}. Onderwerp/aanbod: ${v.topic}. Geef een sterke hook, hoofdtekst, CTA en indien relevant 5 hashtags. Vermijd clichés en generieke AI-taal.`},
 ads:{title:'Ads Studio',badge:'SALES',description:'Genereer advertentieconcepten met hook, body, CTA en varianten.',button:'Maak advertentie',fields:[
  {id:'offer',label:'Aanbod',type:'textarea',placeholder:'Wat verkoop je en wat is het voordeel?'},
  {id:'audience',label:'Doelgroep',type:'input',placeholder:'bv. lokale KMO’s, autobezitters, horeca…'},
  {id:'platform',label:'Kanaal',type:'select',options:['Facebook / Instagram','Google Search','TikTok','LinkedIn']},
  {id:'tone',label:'Stijl',type:'select',options:['Direct response','Premium','Lokaal','Urgent maar geloofwaardig','Zakelijk']}
 ],prompt:v=>`Werk als performance marketeer. Schrijf 3 duidelijk verschillende advertentievarianten voor ${v.platform}. Aanbod: ${v.offer}. Doelgroep: ${v.audience}. Stijl: ${v.tone}. Geef per variant: hook, primaire tekst, headline en CTA. Maak claims geloofwaardig en concreet.`},
 image:{title:'Image Studio',badge:'VISUAL AI',description:'Genereer een nieuw AI-beeld vanuit een beschrijving. Puter kan hiervoor gebruikerscredits gebruiken.',button:'Genereer beeld',image:true,fields:[
  {id:'prompt',label:'Beeldbeschrijving',type:'textarea',placeholder:'Beschrijf onderwerp, omgeving, licht, camera, sfeer en stijl…'},
  {id:'ratio',label:'Formaat',type:'select',options:['1:1','16:9','9:16','4:5']},
  {id:'style',label:'Afwerking',type:'select',options:['Fotorealistisch','Cinematic','Premium commercial','3D render','Illustratie','Surreal viral']}
 ]},
 website:{title:'Website Builder',badge:'WEB & CONVERSION',description:'Bouw de structuur en volledige verkoopcopy voor een professionele website of landingspagina.',button:'Bouw websiteplan',fields:[
  {id:'business',label:'Bedrijf / concept',type:'input',placeholder:'Naam en wat het bedrijf doet'},
  {id:'services',label:'Diensten / aanbod',type:'textarea',placeholder:'Belangrijkste diensten, prijzen of USP’s'},
  {id:'audience',label:'Doelgroep',type:'input',placeholder:'Voor wie is de website?'},
  {id:'goal',label:'Hoofddoel',type:'select',options:['Afspraken aanvragen','Leads verzamelen','Product verkopen','Offerte aanvragen','Merk vertrouwen opbouwen']}
 ],prompt:v=>`Je bent conversion-copywriter en UX-strateeg. Ontwerp een complete website voor: ${v.business}. Diensten/aanbod: ${v.services}. Doelgroep: ${v.audience}. Hoofddoel: ${v.goal}. Geef: sitemap, hero met headline/subheadline/CTA, sectievolgorde, volledige kerncopy, trust-elementen, FAQ, CTA-strategie en SEO-title/meta-description. Schrijf direct bruikbare Nederlandse copy.`},
 quote:{title:'Offerte Builder',badge:'SALES DOCUMENT',description:'Maak een duidelijke, professionele offerte-inhoud met scope, voorwaarden en betaalstructuur.',button:'Maak offerte',fields:[
  {id:'customer',label:'Klant',type:'input',placeholder:'Naam klant / bedrijf'},
  {id:'service',label:'Dienst / project',type:'textarea',placeholder:'Wat lever je precies?'},
  {id:'price',label:'Prijs',type:'input',placeholder:'bv. €950 excl. btw of vanaf €150'},
  {id:'scope',label:'Scope / bijzonderheden',type:'textarea',placeholder:'Wat zit inbegrepen, uitgesloten, timing, extra’s…'}
 ],prompt:v=>`Maak een professionele offerte-inhoud in helder Nederlands. Klant: ${v.customer}. Dienst/project: ${v.service}. Prijs: ${v.price}. Scope: ${v.scope}. Structuur: korte intro, doel, inbegrepen werkzaamheden, uitgesloten zaken indien relevant, prijs, betaling, geldigheid, planning, akkoordstap en professionele afsluiting. Verzin geen juridische garanties of feiten die niet zijn opgegeven.`},
 receptionist:{title:'Receptionist Builder',badge:'AI AGENT',description:'Ontwerp een verkoopklare AI-receptionist: rol, kennis, intake, kwalificatie en handoff.',button:'Bouw receptionist',fields:[
  {id:'business',label:'Bedrijf',type:'input',placeholder:'Bedrijfsnaam + sector'},
  {id:'services',label:'Diensten / belangrijke info',type:'textarea',placeholder:'Diensten, regio, prijzen/voorwaarden, openingsuren…'},
  {id:'actions',label:'Wat moet de AI kunnen?',type:'textarea',placeholder:'bv. vragen beantwoorden, leads registreren, afspraken aanvragen…'},
  {id:'tone',label:'Tone of voice',type:'select',options:['Professioneel en vriendelijk','Vlaams en persoonlijk','Premium','Kort en zakelijk']}
 ],prompt:v=>`Je bent AI-agent architect. Ontwerp een complete AI-receptionist voor ${v.business}. Bedrijfskennis: ${v.services}. Gewenste acties: ${v.actions}. Toon: ${v.tone}. Lever: 1) systeemrol/prompt, 2) wat de agent wel/niet mag doen, 3) kennisvelden die gevuld moeten worden, 4) intake- en kwalificatievragen, 5) afspraak/lead-handofflogica, 6) fout- en onzekerheidsregels, 7) voorbeeldgesprek, 8) checklist om productie-klaar te maken. Laat de agent nooit beschikbaarheid, prijzen of afspraken verzinnen.`},
 lead:{title:'Lead Agent Builder',badge:'LEAD ENGINE',description:'Ontwerp een agent die leads kwalificeert, personaliseert en systematisch opvolgt.',button:'Bouw lead agent',fields:[
  {id:'target',label:'Doelgroep',type:'input',placeholder:'Wie wil je bereiken?'},
  {id:'offer',label:'Aanbod',type:'textarea',placeholder:'Wat bied je aan en waarom is het relevant?'},
  {id:'criteria',label:'Kwalificatiecriteria',type:'textarea',placeholder:'Wanneer is een lead interessant?'},
  {id:'channel',label:'Kanaal',type:'select',options:['E-mail','WhatsApp','LinkedIn','Telefoon + follow-up','Multichannel']}
 ],prompt:v=>`Je bent sales automation architect. Ontwerp een Lead Agent voor doelgroep: ${v.target}. Aanbod: ${v.offer}. Kwalificatiecriteria: ${v.criteria}. Primair kanaal: ${v.channel}. Lever: ideale leadcriteria, data die verzameld moet worden, kwalificatiescore, outreach-logica, 3 contactmomenten, voorbeeldberichten, reply-classificatie, CRM-statussen, handoff naar mens en stopregels. Geen spammy of misleidende tactieken.`},
 workflow:{title:'Workflow Builder',badge:'AUTOMATION',description:'Zet een handmatig proces om in een concrete automatiseringsflow van trigger tot resultaat.',button:'Bouw workflow',fields:[
  {id:'process',label:'Proces dat je wilt automatiseren',type:'textarea',placeholder:'Beschrijf wat nu handmatig gebeurt, stap voor stap of in gewone taal…'},
  {id:'trigger',label:'Startsignaal',type:'input',placeholder:'bv. nieuw formulier, inkomend bericht, betaling, nieuwe lead'},
  {id:'systems',label:'Apps / systemen',type:'input',placeholder:'bv. Gmail, Calendar, Supabase, WhatsApp, Stripe'},
  {id:'result',label:'Gewenst eindresultaat',type:'textarea',placeholder:'Wat moet automatisch gebeurd zijn wanneer de workflow klaar is?'}
 ],prompt:v=>`Je bent automation architect. Ontwerp een robuuste productie-workflow. Huidig proces: ${v.process}. Trigger: ${v.trigger}. Systemen: ${v.systems}. Gewenst resultaat: ${v.result}. Geef een genummerde flow met trigger, validatie, deduplicatie, beslispunten, acties, data die wordt opgeslagen, foutafhandeling, retries, human handoff, logging en eindstatus. Sluit af met een MVP-versie en een productieversie.`}
};

function puterReady(){return !!(window.puter&&window.puter.ai)}
function setStatus(kind,title,detail){statusDot.className='dot '+kind;statusTitle.textContent=title;statusDetail.textContent=detail}
function refreshStatus(){
 if(!puterReady()){setStatus('err','Puter niet geladen','Controleer internetverbinding of browserblokkering.');puterHealth.textContent='Niet geladen';puterHealth.style.color='var(--red)';healthText.textContent='Actie nodig';return false}
 let signed=false;try{signed=!!window.puter.auth.isSignedIn()}catch{}
 puterHealth.textContent=signed?'Verbonden':'Beschikbaar';puterHealth.style.color=signed?'var(--green)':'var(--gold2)';
 healthText.textContent=signed?'Alles klaar':'AI beschikbaar';
 if(signed){setStatus('ok','AI verbonden','Puter is aangemeld en klaar voor AI-opdrachten.');connectBtn.textContent='Verbonden'}
 else{setStatus('wait','AI beschikbaar','Verbind Puter of start een AI-opdracht.');connectBtn.textContent='Verbind Puter'}
 return true
}
async function connect(){
 if(!puterReady()){refreshStatus();return}
 connectBtn.disabled=true;setStatus('wait','Verbinden…','Rond de Puter-aanmelding af in het geopende venster.');
 try{await window.puter.auth.signIn();refreshStatus()}catch(e){setStatus('err','Aanmelding mislukt',errorText(e))}finally{connectBtn.disabled=false}
}
function errorText(e){return (e&&(e.message||e.msg||e.errorCode||e.code))||String(e||'Onbekende fout')}
async function timeout(p,ms=60000){let t;const q=new Promise((_,r)=>t=setTimeout(()=>r(new Error('De AI reageerde niet binnen '+Math.round(ms/1000)+' seconden.')),ms));try{return await Promise.race([p,q])}finally{clearTimeout(t)}}
function textFromResponse(r){if(!r)return'';if(typeof r==='string')return r;if(r.message&&typeof r.message.content==='string')return r.message.content;if(r.message&&Array.isArray(r.message.content))return r.message.content.map(x=>x&&(x.text||x.content||'')).filter(Boolean).join('\n');if(typeof r.text==='string')return r.text;try{return JSON.stringify(r,null,2)}catch{return String(r)}}

function showDashboard(){
 currentTool='';dashboard.classList.add('active');workspace.classList.remove('active');pageTitle.textContent='Dashboard';
 document.querySelectorAll('.navitem').forEach(x=>x.classList.toggle('active',x.dataset.view==='dashboard'))
}
function fieldHTML(f){
 const base=`<label for="f_${f.id}">${f.label}</label>`;
 if(f.type==='textarea')return `<div class="field">${base}<textarea id="f_${f.id}" data-field="${f.id}" placeholder="${f.placeholder||''}"></textarea></div>`;
 if(f.type==='select')return `<div class="field">${base}<select id="f_${f.id}" data-field="${f.id}">${f.options.map(o=>`<option>${o}</option>`).join('')}</select></div>`;
 return `<div class="field">${base}<input id="f_${f.id}" data-field="${f.id}" placeholder="${f.placeholder||''}"></div>`
}
function openTool(id){
 const t=tools[id];if(!t)return;currentTool=id;dashboard.classList.remove('active');workspace.classList.add('active');pageTitle.textContent=t.title;toolTitle.textContent=t.title;toolDescription.textContent=t.description;toolBadge.textContent=t.badge;generateBtn.textContent=t.button||'Genereer';toolFields.innerHTML=t.fields.map(fieldHTML).join('');output.innerHTML='<span class="placeholder">Je resultaat verschijnt hier.</span>';output.classList.remove('error');imageOutput.replaceChildren();lastOutput='';copyBtn.style.display=t.image?'none':'inline-flex';
 document.querySelectorAll('.navitem').forEach(x=>x.classList.toggle('active',x.dataset.tool===id))
}
function values(){const v={};toolFields.querySelectorAll('[data-field]').forEach(el=>v[el.dataset.field]=el.value.trim());return v}
function requiredMissing(v){return Object.values(v).some(x=>!x)}
function setBusy(on,label){busy=on;generateBtn.disabled=on;clearBtn.disabled=on;generateBtn.textContent=on?(label||'Bezig…'):(tools[currentTool]?.button||'Genereer')}
async function runText(){
 const t=tools[currentTool],v=values();if(requiredMissing(v)){output.textContent='Vul eerst alle velden in.';output.classList.add('error');return}
 if(!puterReady()){refreshStatus();output.textContent='Puter.js is niet geladen. Herlaad de pagina of controleer je verbinding.';output.classList.add('error');return}
 setBusy(true,'AI denkt…');output.classList.remove('error');output.innerHTML='<span class="loading">AI is bezig met je resultaat…</span>';imageOutput.replaceChildren();
 try{
  const prompt=t.prompt(v);
  const r=await timeout(window.puter.ai.chat(prompt,{model:'gpt-5.6-luna',normalize:true,verbosity:'medium'}),60000);
  const txt=textFromResponse(r).trim();if(!txt)throw new Error('De AI gaf een leeg antwoord.');
  lastOutput=txt;output.textContent=txt;setStatus('ok','AI klaar','Laatste opdracht succesvol verwerkt.');
 }catch(e){lastOutput='';output.textContent='Fout: '+errorText(e);output.classList.add('error');setStatus('err','AI-fout',errorText(e))}finally{setBusy(false)}
}
function ratioObj(v){const [w,h]=String(v||'1:1').split(':').map(Number);return {w,h}}
async function runImage(){
 const v=values();if(requiredMissing(v)){output.textContent='Vul eerst alle velden in.';output.classList.add('error');return}
 if(!puterReady()){refreshStatus();output.textContent='Puter.js is niet geladen.';output.classList.add('error');return}
 setBusy(true,'Beeld genereren…');output.classList.remove('error');output.innerHTML='<span class="loading">AI-beeld wordt gegenereerd…</span>';imageOutput.replaceChildren();
 try{
  const full=`${v.prompt}. Visual style: ${v.style}. High quality, intentional composition, no accidental text or watermark.`;
  const img=await timeout(window.puter.ai.txt2img(full,{model:'gemini-3.1-flash-image',ratio:ratioObj(v.ratio)}),120000);
  output.textContent='Beeld gegenereerd. Klik of houd het beeld ingedrukt om het via je browser te gebruiken.';imageOutput.appendChild(img);setStatus('ok','Beeld klaar','Image Studio heeft het beeld gegenereerd.');
 }catch(e){output.textContent='Fout: '+errorText(e);output.classList.add('error');setStatus('err','Image AI-fout',errorText(e))}finally{setBusy(false)}
}
async function generate(){if(busy||!currentTool)return;tools[currentTool].image?runImage():runText()}
function clearWorkspace(){toolFields.querySelectorAll('[data-field]').forEach(el=>{if(el.tagName==='SELECT')el.selectedIndex=0;else el.value=''});output.innerHTML='<span class="placeholder">Je resultaat verschijnt hier.</span>';output.classList.remove('error');imageOutput.replaceChildren();lastOutput=''}
async function copyResult(){if(!lastOutput)return;try{await navigator.clipboard.writeText(lastOutput);const old=copyBtn.textContent;copyBtn.textContent='Gekopieerd ✓';setTimeout(()=>copyBtn.textContent=old,1400)}catch{copyBtn.textContent='Kopiëren mislukt';setTimeout(()=>copyBtn.textContent='Kopieer',1400)}}
async function testAI(){
 if(!puterReady()){refreshStatus();return}
 const old=testBtn.textContent;testBtn.disabled=true;testBtn.textContent='Testen…';
 try{const r=await timeout(window.puter.ai.chat('Antwoord exact met: AI WERKT',{model:'gpt-5.6-luna',normalize:true}),45000);const txt=textFromResponse(r).trim();if(!txt)throw new Error('Leeg antwoord');setStatus('ok','AI werkt',txt);healthText.textContent='Alles klaar'}catch(e){setStatus('err','AI-test mislukt',errorText(e))}finally{testBtn.disabled=false;testBtn.textContent=old}
}

document.querySelectorAll('[data-open-tool]').forEach(x=>x.addEventListener('click',()=>openTool(x.dataset.openTool)));
document.querySelectorAll('.navitem').forEach(x=>x.addEventListener('click',()=>x.dataset.view==='dashboard'?showDashboard():openTool(x.dataset.tool)));
connectBtn.addEventListener('click',connect);testBtn.addEventListener('click',testAI);generateBtn.addEventListener('click',generate);clearBtn.addEventListener('click',clearWorkspace);copyBtn.addEventListener('click',copyResult);
window.addEventListener('error',e=>setStatus('err','Paginafout',e.message||'Onbekende browserfout'));
setTimeout(refreshStatus,450);setTimeout(refreshStatus,3000);