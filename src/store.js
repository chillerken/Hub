const fs=require('fs'); const path=require('path'); const crypto=require('crypto');
const DB=path.join(__dirname,'..','data','db.json'); const uuid=()=>crypto.randomUUID(); const now=()=>new Date().toISOString();
class Store{
 constructor(){fs.mkdirSync(path.dirname(DB),{recursive:true});if(!fs.existsSync(DB))fs.writeFileSync(DB,JSON.stringify({leads:[],appointments:[],events:[]},null,2));}
 read(){return JSON.parse(fs.readFileSync(DB,'utf8'));}
 write(db){const tmp=DB+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,DB);}
 async init(){}
 async listLeads(){return this.read().leads.sort((a,b)=>b.created_at.localeCompare(a.created_at));}
 async getLead(id){return this.read().leads.find(x=>x.id===id)||null;}
 async createLead(d){const db=this.read();const row={id:uuid(),status:'new',last_contact_at:null,next_action:'Opvolgen',review_sent_at:null,created_at:now(),...d};db.leads.push(row);this.write(db);return row;}
 async updateLead(id,p){const db=this.read();const i=db.leads.findIndex(x=>x.id===id);if(i<0)return null;db.leads[i]={...db.leads[i],...p};this.write(db);return db.leads[i];}
 async listAppointments(){return this.read().appointments.sort((a,b)=>a.starts_at.localeCompare(b.starts_at));}
 async createAppointment(d){const db=this.read();const row={id:uuid(),status:'scheduled',reminder_sent_at:null,completed_at:null,created_at:now(),...d};db.appointments.push(row);this.write(db);return row;}
 async updateAppointment(id,p){const db=this.read();const i=db.appointments.findIndex(x=>x.id===id);if(i<0)return null;db.appointments[i]={...db.appointments[i],...p};this.write(db);return db.appointments[i];}
 async createEvent(d){const db=this.read();const row={id:uuid(),created_at:now(),...d};db.events.push(row);this.write(db);return row;}
 async listEvents(limit=100){return this.read().events.sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,limit);}
}
module.exports=()=>new Store();
