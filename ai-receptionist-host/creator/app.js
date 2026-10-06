import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
const SUPABASE_URL="https://ndecxbsrxspkuxjsbndq.supabase.co";
const SUPABASE_KEY="sb_publishable_rhEeG3_B95xt8PA_MlG86Q_oti2Rklc";
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
const escHtml=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
let platformClients=[],platformReady=false,lastAsset=null,recentHubAssets=[];
const $=id=>document.getElementById(id);
const dashboard=$('dashboard'),workspace=$('workspace'),pageTitle=$('pageTitle'),statusDot=$('statusDot'),statusTitle=$('statusTitle'),statusDetail=$('statusDetail'),connectBtn=$('connectBtn'),testBtn=$('testBtn'),platformBtn=$('platformBtn'),healthText=$('healthText'),puterHealth=$('puterHealth'),toolFields=$('toolFields'),toolTitle=$('toolTitle'),toolDescription=$('toolDescription'),toolBadge=$('toolBadge'),output=$('output'),imageOutput=$('imageOutput'),generateBtn=$('generateBtn'),clearBtn=$('clearBtn'),copyBtn=$('copyBtn'),outputLabel=$('outputLabel'),assetActions=$('assetActions'),assetStatus=$('assetStatus'),recentAssets=$('recentAssets');
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
 website:{title:'Website Builder',badge:'WEB & CONVERSION',description:'Genereer een echte, mobiele statische website die je direct kunt previewen, downloaden en bewaren.',button:'Genereer website',fields:[
  {id:'business',label:'Bedrijf / concept',type:'input',placeholder:'Naam en wat het bedrijf doet'},
  {id:'services',label:'Diensten / aanbod',type:'textarea',placeholder:'Belangrijkste diensten, prijzen of USP’s'},
  {id:'audience',label:'Doelgroep',type:'input',placeholder:'Voor wie is de website?'},
  {id:'goal',label:'Hoofddoel',type:'select',options:['Afspraken aanvragen','Leads verzamelen','Product verkopen','Offerte aanvragen','Merk vertrouwen opbouwen']},
  {id:'style',label:'Visuele stijl',type:'select',options:['Premium donker','Modern licht','Zakelijk strak','Lokaal en persoonlijk','Bold / high impact']}
 ],prompt:v=>`Je bent senior webdesigner, UX-strateeg en conversion-copywriter. Bouw voor ${v.business} een complete, responsieve ONE-PAGE website als één zelf-contained HTML-document. Diensten/aanbod: ${v.services}. Doelgroep: ${v.audience}. Hoofddoel: ${v.goal}. Visuele stijl: ${v.style}. Vereisten: semantische HTML5, alle CSS intern in <style>, mobiel-first, sterke hero, duidelijke CTA's, diensten, voordelen, trust-sectie, FAQ en footer, goede contrasten en focus states, SEO title + meta description. Gebruik geen externe JavaScript-bibliotheken, geen tracking, geen formulieren die echt data versturen en geen verzonnen reviews/keurmerken. Geef uitsluitend het volledige HTML-document, zonder markdown fences of uitleg.`},
 quote:{title:'Offerte Builder',badge:'SALES DOCUMENT',description:'Maak, bewaar, print als PDF en verstuur een professionele offerte via een gekoppelde e-mailintegratie.',button:'Maak offerte',fields:[
  {id:'organization_id',label:'Organisatie voor opslag/verzending',type:'orgselect',required:false},
  {id:'customer',label:'Klant',type:'input',placeholder:'Naam klant / bedrijf'},
  {id:'recipient_email',label:'E-mail klant (optioneel voor genereren)',type:'input',placeholder:'klant@bedrijf.be',required:false},
  {id:'service',label:'Dienst / project',type:'textarea',placeholder:'Wat lever je precies?'},
  {id:'price',label:'Prijs',type:'input',placeholder:'bv. €950 excl. btw of vanaf €150'},
  {id:'scope',label:'Scope / bijzonderheden',type:'textarea',placeholder:'Wat zit inbegrepen, uitgesloten, timing, extra’s…'}
 ],prompt:v=>`Maak een professionele offerte-inhoud in helder Nederlands. Klant: ${v.customer}. Dienst/project: ${v.service}. Prijs: ${v.price}. Scope: ${v.scope}. Structuur: korte intro, doel, inbegrepen werkzaamheden, uitgesloten zaken indien relevant, prijs, betaling, geldigheid, planning, akkoordstap en professionele afsluiting. Verzin geen juridische garanties of feiten die niet zijn opgegeven.`},
 receptionist:{title:'Receptionist Builder',badge:'AI AGENT',description:'Ontwerp én publiceer een echte Reception AI-widget met eigen klantorganisatie en live widgetlink.',button:'Bouw receptionist',fields:[
  {id:'organization_id',label:'Bestaande organisatie (leeg = nieuwe klant)',type:'orgselect',required:false},
  {id:'business',label:'Bedrijf',type:'input',placeholder:'Bedrijfsnaam + sector'},
  {id:'receptionist_name',label:'Naam AI-receptionist',type:'input',placeholder:'bv. Ava, Noor, Sam'},
  {id:'widget_greeting',label:'Openingszin',type:'input',placeholder:'Hallo! Waarmee kan ik helpen?'},
  {id:'services',label:'Diensten / belangrijke info',type:'textarea',placeholder:'Eén dienst of kennisitem per regel…'},
  {id:'qualification_questions',label:'Kwalificatievragen',type:'textarea',placeholder:'Eén vraag per regel…'},
  {id:'actions',label:'Wat moet de AI kunnen?',type:'textarea',placeholder:'bv. vragen beantwoorden, leads registreren, afspraken aanvragen…'},
  {id:'notification_email',label:'Notificatie-e-mail (optioneel)',type:'input',placeholder:'info@bedrijf.be',required:false},
  {id:'widget_allowed_domains',label:'Toegestane website(s) (optioneel)',type:'textarea',placeholder:'bedrijf.be\nwww.bedrijf.be',required:false},
  {id:'tone',label:'Tone of voice',type:'select',options:['Professioneel en vriendelijk','Vlaams en persoonlijk','Premium','Kort en zakelijk']}
 ],prompt:v=>`Je bent AI-agent architect. Ontwerp een complete AI-receptionist voor ${v.business}. Naam: ${v.receptionist_name}. Bedrijfskennis: ${v.services}. Kwalificatievragen: ${v.qualification_questions}. Gewenste acties: ${v.actions}. Toon: ${v.tone}. Lever: 1) systeemrol/prompt, 2) wat de agent wel/niet mag doen, 3) intake- en kwalificatielogica, 4) afspraak/lead-handofflogica, 5) fout- en onzekerheidsregels, 6) voorbeeldgesprek. Laat de agent nooit beschikbaarheid, prijzen of afspraken verzinnen.`},
 lead:{title:'Lead Agent Builder',badge:'LEAD ENGINE',description:'Ontwerp, bewaar en activeer een Lead Agent die echte Reception AI-leads kwalificeert en opvolging plant.',button:'Bouw lead agent',fields:[
  {id:'organization_id',label:'Organisatie',type:'orgselect'},
  {id:'name',label:'Naam Lead Agent',type:'input',placeholder:'bv. Sales Pilot'},
  {id:'target',label:'Doelgroep',type:'input',placeholder:'Wie wil je bereiken?'},
  {id:'offer',label:'Aanbod',type:'textarea',placeholder:'Wat bied je aan en waarom is het relevant?'},
  {id:'criteria',label:'Kwalificatiecriteria',type:'textarea',placeholder:'Wanneer is een lead interessant?'},
  {id:'min_score',label:'Minimum leadscore',type:'input',placeholder:'60'},
  {id:'due_hours',label:'Opvolgen binnen (uren)',type:'input',placeholder:'24'},
  {id:'channel',label:'Kanaal',type:'select',options:['Auto','E-mail','WhatsApp','LinkedIn','Telefoon + follow-up','Multichannel']},
  {id:'execution',label:'Uitvoering',type:'select',options:['Alleen configuratie opslaan','Lead Agent activeren']}
 ],prompt:v=>`Je bent sales automation architect. Ontwerp een production-ready Lead Agent genaamd "${v.name}" voor doelgroep: ${v.target}. Aanbod: ${v.offer}. Kwalificatiecriteria: ${v.criteria}. Minimumscore: ${v.min_score}. Opvolging binnen: ${v.due_hours} uur. Primair kanaal: ${v.channel}. Lever: scoremodel, kwalificatieregels, datavelden, contactstrategie, 3 opvolgmomenten, reply-classificatie, CRM-statussen, human handoff, stopregels en privacy/consentregels. Geen spammy, misleidende of ongewenste outreach.`},
 workflow:{title:'Workflow Builder',badge:'AUTOMATION',description:'Ontwerp een workflow en sla hem als echt, versieerbaar workflow-record op in de Hub-backend.',button:'Bouw workflow',fields:[
  {id:'organization_id',label:'Organisatie (optioneel)',type:'orgselect',required:false},
  {id:'name',label:'Naam workflow',type:'input',placeholder:'bv. Nieuwe lead → opvolging → afspraak'},
  {id:'process',label:'Proces dat je wilt automatiseren',type:'textarea',placeholder:'Beschrijf wat nu handmatig gebeurt, stap voor stap of in gewone taal…'},
  {id:'trigger',label:'Startsignaal',type:'input',placeholder:'bv. nieuw formulier, inkomend bericht, betaling, nieuwe lead'},
  {id:'systems',label:'Apps / systemen',type:'input',placeholder:'bv. Gmail, Calendar, Supabase, WhatsApp, Stripe'},
  {id:'execution',label:'Uitvoering',type:'select',options:['Alleen blueprint opslaan','Reception AI lifecycle activeren']},
  {id:'result',label:'Gewenst eindresultaat',type:'textarea',placeholder:'Wat moet automatisch gebeurd zijn wanneer de workflow klaar is?'}
 ],prompt:v=>`Je bent automation architect. Ontwerp een robuuste productie-workflow met naam "${v.name}". Huidig proces: ${v.process}. Trigger: ${v.trigger}. Systemen: ${v.systems}. Gewenst resultaat: ${v.result}. Geef een genummerde flow met trigger, validatie, deduplicatie, beslispunten, acties, data die wordt opgeslagen, foutafhandeling, retries, human handoff, logging en eindstatus. Sluit af met een MVP-versie en een productieversie.`}
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
function orgOptions(){
 return '<option value="">'+(platformReady?'Nieuwe / geen organisatie':'Platform-login vereist voor opslag')+'</option>'+platformClients.map(c=>`<option value="${escHtml(c.organization_id)}">${escHtml(c.business_name||c.organization_name||'Organisatie')}</option>`).join('');
}
function fieldHTML(f){
 const base=`<label for="f_${f.id}">${f.label}</label>`;
 if(f.type==='textarea')return `<div class="field">${base}<textarea id="f_${f.id}" data-field="${f.id}" placeholder="${f.placeholder||''}"></textarea></div>`;
 if(f.type==='select')return `<div class="field">${base}<select id="f_${f.id}" data-field="${f.id}">${f.options.map(o=>`<option>${escHtml(o)}</option>`).join('')}</select></div>`;
 if(f.type==='orgselect')return `<div class="field">${base}<select id="f_${f.id}" data-field="${f.id}">${orgOptions()}</select></div>`;
 return `<div class="field">${base}<input id="f_${f.id}" data-field="${f.id}" placeholder="${f.placeholder||''}"></div>`
}
function refreshOrgSelects(){
 toolFields.querySelectorAll('select[data-field="organization_id"]').forEach(el=>{const current=el.value;el.innerHTML=orgOptions();if([...el.options].some(o=>o.value===current))el.value=current})
}
function openTool(id){
 const t=tools[id];if(!t)return;currentTool=id;dashboard.classList.remove('active');workspace.classList.add('active');pageTitle.textContent=t.title;toolTitle.textContent=t.title;toolDescription.textContent=t.description;toolBadge.textContent=t.badge;generateBtn.textContent=t.button||'Genereer';toolFields.innerHTML=t.fields.map(fieldHTML).join('');output.innerHTML='<span class="placeholder">Je resultaat verschijnt hier.</span>';output.classList.remove('error');imageOutput.replaceChildren();assetActions.replaceChildren();assetStatus.textContent='';lastOutput='';lastAsset=null;copyBtn.style.display=t.image?'none':'inline-flex';
 document.querySelectorAll('.navitem').forEach(x=>x.classList.toggle('active',x.dataset.tool===id))
}
function values(){const v={};toolFields.querySelectorAll('[data-field]').forEach(el=>v[el.dataset.field]=el.value.trim());return v}
function requiredMissing(v){return (tools[currentTool]?.fields||[]).some(f=>f.required!==false&&!v[f.id])}
function setBusy(on,label){busy=on;generateBtn.disabled=on;clearBtn.disabled=on;generateBtn.textContent=on?(label||'Bezig…'):(tools[currentTool]?.button||'Genereer')}
async function runText(){
 const t=tools[currentTool],v=values();if(requiredMissing(v)){output.textContent='Vul eerst alle velden in.';output.classList.add('error');return}
 if(!puterReady()){refreshStatus();output.textContent='Puter.js is niet geladen. Herlaad de pagina of controleer je verbinding.';output.classList.add('error');return}
 setBusy(true,'AI denkt…');output.classList.remove('error');output.innerHTML='<span class="loading">AI is bezig met je resultaat…</span>';imageOutput.replaceChildren();
 try{
  const prompt=t.prompt(v);
  const r=await timeout(window.puter.ai.chat(prompt,{model:'gpt-5.6-luna',normalize:true,verbosity:'medium'}),60000);
  const txt=textFromResponse(r).trim();if(!txt)throw new Error('De AI gaf een leeg antwoord.');
  lastOutput=txt;lastAsset=null;output.textContent=txt;setStatus('ok','AI klaar','Laatste opdracht succesvol verwerkt.');renderAssetActions();
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
function clearWorkspace(){toolFields.querySelectorAll('[data-field]').forEach(el=>{if(el.tagName==='SELECT')el.selectedIndex=0;else el.value=''});output.innerHTML='<span class="placeholder">Je resultaat verschijnt hier.</span>';output.classList.remove('error');imageOutput.replaceChildren();assetActions.replaceChildren();assetStatus.textContent='';lastOutput='';lastAsset=null}
async function copyResult(){if(!lastOutput)return;try{await navigator.clipboard.writeText(lastOutput);const old=copyBtn.textContent;copyBtn.textContent='Gekopieerd ✓';setTimeout(()=>copyBtn.textContent=old,1400)}catch{copyBtn.textContent='Kopiëren mislukt';setTimeout(()=>copyBtn.textContent='Kopieer',1400)}}
async function platformInvoke(slug,body){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Log eerst in op Reception AI via Platform login.');
 const {data,error}=await supabase.functions.invoke(slug,{body});
 if(error)throw new Error(data?.error||error.message||'Backendactie mislukt');
 if(data?.error)throw new Error(data.error);
 return data;
}
async function loadPlatformContext(){
 platformBtn.disabled=true;platformBtn.textContent='Platform…';
 try{
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){platformReady=false;platformClients=[];recentHubAssets=[];platformBtn.textContent='Platform login';renderRecentAssets();refreshOrgSelects();return}
  await platformInvoke('creator-hub-action',{action:'status'});
  const [clients,assets]=await Promise.all([
    platformInvoke('platform-admin',{action:'list_clients'}),
    platformInvoke('creator-hub-action',{action:'list_assets'})
  ]);
  platformReady=true;platformClients=clients.clients||[];recentHubAssets=assets.assets||[];
  platformBtn.textContent='Platform ✓';renderRecentAssets();refreshOrgSelects();
 }catch(e){platformReady=false;platformClients=[];recentHubAssets=[];platformBtn.textContent='Platform login';if(assetStatus)assetStatus.textContent=errorText(e);renderRecentAssets();refreshOrgSelects()}
 finally{platformBtn.disabled=false}
}
function renderRecentAssets(){
 if(!recentAssets)return;
 if(!platformReady){recentAssets.innerHTML='<div class="assetempty">Log in op Reception AI om opgeslagen Hub-assets te zien.</div>';return}
 if(!recentHubAssets.length){recentAssets.innerHTML='<div class="assetempty">Nog geen opgeslagen Hub-assets.</div>';return}
 recentAssets.innerHTML=recentHubAssets.slice(0,16).map(a=>`<button class="assetrow" data-asset-id="${escHtml(a.id)}"><div><strong>${escHtml(a.title)}</strong><span>${escHtml(a.asset_type)} · ${escHtml(a.status)}</span></div><small>${new Date(a.created_at).toLocaleString('nl-BE')}</small></button>`).join('');
 recentAssets.querySelectorAll('[data-asset-id]').forEach(b=>b.addEventListener('click',()=>openSavedAsset(b.dataset.assetId)));
}
function openSavedAsset(id){
 const asset=recentHubAssets.find(x=>x.id===id);if(!asset)return;
 const toolMap={website:'website',quote:'quote',workflow:'workflow',receptionist:'receptionist',lead_agent:'lead'};
 const tool=toolMap[asset.asset_type];if(!tool)return;
 openTool(tool);
 const p=asset.payload||{};
 const fieldMap=asset.asset_type==='lead_agent'
  ?{name:'name',target_audience:'target',offer:'offer',qualification_criteria:'criteria',preferred_channel:'channel',min_score:'min_score',follow_up_due_hours:'due_hours',organization_id:'organization_id'}
  :p;
 Object.entries(fieldMap).forEach(([source,target])=>{
   const el=toolFields.querySelector('[data-field="'+target+'"]');
   const value=asset.asset_type==='lead_agent'?p[source]:p[source];
   if(el&&value!=null){
     if(el.tagName==='SELECT'){
       const found=[...el.options].find(o=>o.value===String(value)||o.textContent.toLowerCase()===String(value).toLowerCase());
       if(found)el.value=found.value;
     }else el.value=Array.isArray(value)?value.join('\n'):String(value);
   }
 });
 if(asset.organization_id){
   const org=toolFields.querySelector('[data-field="organization_id"]');
   if(org&&[...org.options].some(o=>o.value===asset.organization_id))org.value=asset.organization_id;
 }
 lastAsset=asset;
 lastOutput=String(p.content||p.custom_instructions||p.instructions||'');
 output.textContent=lastOutput||'Asset geladen. Pas de velden aan en genereer een nieuwe versie.';
 if(lastOutput)renderAssetActions();
 assetStatus.textContent='Geladen: '+asset.title+' · '+asset.status;
}
function stripFences(s){
 let x=String(s||'').trim();
 x=x.replace(/^\`\`\`(?:html)?\s*/i,'').replace(/\s*\`\`\`$/,'').trim();
 const d=x.toLowerCase().indexOf('<!doctype html>'),h=x.toLowerCase().indexOf('<html');
 const start=d>=0?d:h;return start>=0?x.slice(start):x;
}
function downloadBlob(content,type,name){
 const blob=new Blob([content],{type}),u=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
}
function safeFile(s){return String(s||'asset').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'asset'}
async function saveCurrentAsset(type,title,status='ready'){
 if(!lastOutput)throw new Error('Genereer eerst een resultaat.');
 const v=values(),content=type==='website'?stripFences(lastOutput):lastOutput;
 const data=await platformInvoke('creator-hub-action',{action:'save_asset',asset_type:type,title,status,organization_id:v.organization_id||null,payload:{...v,content}});
 lastAsset=data.asset;assetStatus.textContent='✓ Opgeslagen als Hub-asset '+data.asset.id;await loadPlatformContext();return data.asset;
}
function previewWebsite(){
 const html=stripFences(lastOutput);if(!html)return;
 const blob=new Blob([html],{type:'text/html'}),u=URL.createObjectURL(blob);window.open(u,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(u),120000);
}
function downloadWebsite(){const v=values();downloadBlob(stripFences(lastOutput),'text/html;charset=utf-8',safeFile(v.business||'website')+'.html')}
function printQuote(){
 const w=window.open('','_blank');if(!w){assetStatus.textContent='Popup geblokkeerd. Sta popups toe om PDF/print te openen.';return}
 const v=values(),body=escHtml(lastOutput).replace(/\n/g,'<br>');
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Offerte – ${escHtml(v.customer||'klant')}</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 30px;color:#171717;line-height:1.6}h1{font-size:28px;margin-bottom:8px}.meta{color:#666;margin-bottom:28px}.quote{white-space:normal}button{margin-top:28px;padding:10px 14px}@media print{button{display:none}}</style></head><body><h1>Offerte</h1><div class="meta">${escHtml(v.customer||'')} · ${new Date().toLocaleDateString('nl-BE')}</div><div class="quote">${body}</div><button onclick="window.print()">Print / Bewaar als PDF</button></body></html>`);
 w.document.close();setTimeout(()=>w.print(),350);
}
async function deployReceptionist(){
 const v=values();assetStatus.textContent='Receptionist wordt in productie aangemaakt…';
 try{
  const data=await platformInvoke('creator-hub-action',{action:'create_receptionist',organization_id:v.organization_id||null,business_name:v.business,receptionist_name:v.receptionist_name,widget_greeting:v.widget_greeting,services:v.services,qualification_questions:v.qualification_questions,description:'Gewenste acties: '+v.actions+' | Tone: '+v.tone,notification_email:v.notification_email,widget_allowed_domains:v.widget_allowed_domains,widget_accent:'#6d5dfc',custom_instructions:lastOutput});
  lastAsset={id:data.asset_id};assetStatus.innerHTML='✓ Live receptionist aangemaakt · <a target="_blank" rel="noopener" href="'+escHtml(data.widget_url)+'">Open live widget ↗</a>';await loadPlatformContext();
 }catch(e){assetStatus.textContent='Niet aangemaakt: '+errorText(e)}
}
async function saveWebsite(){const v=values();assetStatus.textContent='Website opslaan…';try{return await saveCurrentAsset('website',(v.business||'Website')+' – website','ready')}catch(e){assetStatus.textContent='Opslaan mislukt: '+errorText(e);throw e}}
async function publishWebsite(){
 try{
  assetStatus.textContent='Website publiceren…';
  const asset=lastAsset?.id?lastAsset:await saveWebsite();
  const data=await platformInvoke('creator-hub-action',{action:'publish_website',asset_id:asset.id});
  lastAsset={...asset,status:'live',public_url:data.public_url};
  assetStatus.innerHTML='✓ Website live · <a href="'+escHtml(data.public_url)+'" target="_blank" rel="noopener">Open publieke website ↗</a>';
  renderAssetActions();await loadPlatformContext();
 }catch(e){assetStatus.textContent='Publiceren mislukt: '+errorText(e)}
}
async function unpublishWebsite(){
 if(!lastAsset?.id){assetStatus.textContent='Er is nog geen opgeslagen website.';return}
 try{
  assetStatus.textContent='Website offline halen…';
  await platformInvoke('creator-hub-action',{action:'unpublish_website',asset_id:lastAsset.id});
  lastAsset={...lastAsset,status:'ready',public_url:null};
  assetStatus.textContent='✓ Website is offline gehaald.';
  renderAssetActions();await loadPlatformContext();
 }catch(e){assetStatus.textContent='Offline halen mislukt: '+errorText(e)}
}
async function saveLeadAgent(){
 const v=values();
 if(!v.organization_id){assetStatus.textContent='Kies eerst een organisatie.';return}
 const minScore=Number(v.min_score||60),dueHours=Number(v.due_hours||24);
 if(!Number.isFinite(minScore)||minScore<0||minScore>100){assetStatus.textContent='Minimumscore moet tussen 0 en 100 liggen.';return}
 if(!Number.isFinite(dueHours)||dueHours<1||dueHours>720){assetStatus.textContent='Opvolgtermijn moet tussen 1 en 720 uur liggen.';return}
 assetStatus.textContent='Lead Agent opslaan…';
 try{
  const active=v.execution==='Lead Agent activeren';
  const data=await platformInvoke('creator-hub-action',{
    action:'save_lead_agent',
    organization_id:v.organization_id,
    name:v.name,
    target_audience:v.target,
    offer:v.offer,
    qualification_criteria:v.criteria,
    preferred_channel:v.channel,
    min_score:minScore,
    follow_up_due_hours:dueHours,
    instructions:lastOutput,
    active
  });
  lastAsset=data.asset;
  assetStatus.textContent=active
   ?'✓ Lead Agent actief: score ≥ '+data.config.min_score+', opvolging binnen '+data.config.follow_up_due_hours+' uur.'
   :'✓ Lead Agent-configuratie opgeslagen.';
  await loadPlatformContext();
 }catch(e){assetStatus.textContent='Lead Agent opslaan mislukt: '+errorText(e)}
}

async function saveWorkflow(){const v=values();assetStatus.textContent='Workflow opslaan…';try{const activate=v.execution==='Reception AI lifecycle activeren';const data=await platformInvoke('creator-hub-action',{action:'save_workflow',name:v.name||'Workflow',organization_id:v.organization_id||null,activate_lifecycle:activate,payload:{...v,content:lastOutput}});lastAsset=data.asset;assetStatus.textContent=data.lifecycle_active?'✓ Workflow opgeslagen en Reception AI productie-lifecycle geactiveerd.':'✓ Workflow als blueprint opgeslagen.';await loadPlatformContext()}catch(e){assetStatus.textContent='Opslaan mislukt: '+errorText(e)}}
async function saveQuote(){const v=values();assetStatus.textContent='Offerte opslaan…';try{return await saveCurrentAsset('quote',(v.customer||'Klant')+' – offerte','ready')}catch(e){assetStatus.textContent='Opslaan mislukt: '+errorText(e);throw e}}
async function sendQuote(){
 const v=values();if(!v.organization_id){assetStatus.textContent='Kies eerst een organisatie met actieve e-mailintegratie.';return}if(!v.recipient_email){assetStatus.textContent='Vul het e-mailadres van de klant in.';return}
 try{assetStatus.textContent='Offerte wordt veilig verzonden…';const asset=lastAsset?.id?lastAsset:await saveQuote();const data=await platformInvoke('creator-hub-action',{action:'send_quote',asset_id:asset.id,organization_id:v.organization_id,recipient_email:v.recipient_email,subject:'Offerte – '+(v.service||v.customer),quote_text:lastOutput});assetStatus.textContent='✓ Offerte verzonden'+(data.provider_id?' · '+data.provider_id:'');await loadPlatformContext()}catch(e){assetStatus.textContent='Verzenden mislukt: '+errorText(e)}
}
function renderAssetActions(){
 assetActions.replaceChildren();assetStatus.textContent='';if(!lastOutput)return;
 const add=(label,fn,cls='button ghost')=>{const b=document.createElement('button');b.className=cls;b.textContent=label;b.addEventListener('click',fn);assetActions.appendChild(b)};
 if(currentTool==='website'){add('Preview website',previewWebsite);add('Download HTML',downloadWebsite);add('Bewaar website',saveWebsite);lastAsset?.status==='live'?add('Haal website offline',unpublishWebsite):add('Publiceer website',publishWebsite,'button gold')}
 if(currentTool==='quote'){add('Bewaar offerte',saveQuote,'button gold');add('PDF / print',printQuote);add('E-mail offerte',sendQuote)}
 if(currentTool==='receptionist'){add('Maak live receptionist',deployReceptionist,'button gold')}
 if(currentTool==='lead'){add('Lead Agent opslaan / activeren',saveLeadAgent,'button gold')}
 if(currentTool==='workflow'){add('Workflow opslaan / activeren',saveWorkflow,'button gold')}
}

async function testAI(){
 if(!puterReady()){refreshStatus();return}
 const old=testBtn.textContent;testBtn.disabled=true;testBtn.textContent='Testen…';
 try{const r=await timeout(window.puter.ai.chat('Antwoord exact met: AI WERKT',{model:'gpt-5.6-luna',normalize:true}),45000);const txt=textFromResponse(r).trim();if(!txt)throw new Error('Leeg antwoord');setStatus('ok','AI werkt',txt);healthText.textContent='Alles klaar'}catch(e){setStatus('err','AI-test mislukt',errorText(e))}finally{testBtn.disabled=false;testBtn.textContent=old}
}

document.querySelectorAll('[data-open-tool]').forEach(x=>x.addEventListener('click',()=>openTool(x.dataset.openTool)));
document.querySelectorAll('.navitem').forEach(x=>x.addEventListener('click',()=>x.dataset.view==='dashboard'?showDashboard():openTool(x.dataset.tool)));
connectBtn.addEventListener('click',connect);testBtn.addEventListener('click',testAI);generateBtn.addEventListener('click',generate);clearBtn.addEventListener('click',clearWorkspace);copyBtn.addEventListener('click',copyResult);
platformBtn.addEventListener('click',()=>{if(platformReady)loadPlatformContext();else window.open('/?auth=1','_blank','noopener')});
window.addEventListener('focus',()=>loadPlatformContext());
window.addEventListener('error',e=>setStatus('err','Paginafout',e.message||'Onbekende browserfout'));
supabase.auth.onAuthStateChange(()=>setTimeout(loadPlatformContext,50));
setTimeout(refreshStatus,450);setTimeout(refreshStatus,3000);setTimeout(loadPlatformContext,250);