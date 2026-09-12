function setBotAnswer(el,text){
  el.textContent='';
  const value=String(text||'Ik kan daar nu niet op antwoorden.');
  const parts=value.split(/(https?:\/\/[^\s]+)/g);
  for(const part of parts){
    if(/^https?:\/\//.test(part)){
      const clean=part.replace(/[),.;!?]+$/,'');
      const suffix=part.slice(clean.length);
      const a=document.createElement('a');
      a.href=clean;
      a.target='_blank';
      a.rel='noopener noreferrer';
      a.textContent='Boek hier';
      el.append(a);
      if(suffix) el.append(document.createTextNode(suffix));
    }else{
      el.append(document.createTextNode(part));
    }
  }
}

const leadForm=document.getElementById('leadForm');
leadForm?.addEventListener('submit',async e=>{e.preventDefault();const status=document.getElementById('leadStatus');status.textContent='Versturen…';const body=Object.fromEntries(new FormData(leadForm));try{const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Fout');status.textContent='✓ Bedankt. Je aanvraag is geregistreerd.';leadForm.reset()}catch(err){status.textContent='Kon niet versturen: '+err.message}});
const chatForm=document.getElementById('chatForm');chatForm?.addEventListener('submit',async e=>{e.preventDefault();const input=document.getElementById('chatInput'),log=document.getElementById('chatLog');const message=input.value.trim();if(!message)return;log.insertAdjacentHTML('beforeend',`<div class="bubble user"></div>`);log.lastElementChild.textContent=message;input.value='';const wait=document.createElement('div');wait.className='bubble bot';wait.textContent='Even kijken…';log.append(wait);log.scrollTop=log.scrollHeight;try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});const d=await r.json();if(!r.ok)throw new Error(d.error||'AI niet bereikbaar');setBotAnswer(wait,d.answer)}catch(err){wait.textContent=err.message||'Er ging iets mis. Probeer opnieuw.'}log.scrollTop=log.scrollHeight});
