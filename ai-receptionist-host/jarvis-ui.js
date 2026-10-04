(()=>{
async function run(){
 const b=document.querySelector("#jarvisRun"),o=document.querySelector("#jarvisResult");
 if(!b||!o||!window.__jarvisInvoke)return;
 b.disabled=true;b.textContent="JARVIS analyseert…";
 const r=await window.__jarvisInvoke();
 b.disabled=false;b.textContent="Analyseer opnieuw";
 if(r.error||r.data?.error){o.textContent="JARVIS-analyse mislukt";return}
 const d=r.data;o.innerHTML="<h2>"+window.__jarvisEsc(d.summary)+"</h2>"+d.plan.map((x,i)=>"<div class='jarvisstep'><b>"+(i+1)+". "+window.__jarvisEsc(x.agent)+" · "+window.__jarvisEsc(x.priority)+"</b><p>"+window.__jarvisEsc(x.action)+"</p><small>"+window.__jarvisEsc(x.reason)+"</small></div>").join("");
}
document.addEventListener("click",e=>{if(e.target?.id==="jarvisRun")run()});
})();