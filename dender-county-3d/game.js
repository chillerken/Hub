import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";

const canvas = document.querySelector("#game");
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x91a3ad);
scene.fog = new THREE.FogExp2(0x8d9aa1, 0.0025);

const camera = new THREE.PerspectiveCamera(65, innerWidth/innerHeight, 0.1, 900);
camera.position.set(0,5,9);

const hemi = new THREE.HemisphereLight(0xcfe7ff, 0x384029, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d2, 3.2);
sun.position.set(80,120,30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left = -150; sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150; sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
scene.add(sun);

const WORLD = 420;
const world = new THREE.Group();
scene.add(world);

const mat = {
  grass:new THREE.MeshStandardMaterial({color:0x506f46, roughness:1}),
  road:new THREE.MeshStandardMaterial({color:0x24282b, roughness:.93}),
  path:new THREE.MeshStandardMaterial({color:0x72797c, roughness:1}),
  line:new THREE.MeshStandardMaterial({color:0xe7e2cc, roughness:.75}),
  brick:[0x8b4a35,0x9a563e,0x744133,0xa26a52,0x6c5047].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.94})),
  roof:new THREE.MeshStandardMaterial({color:0x343338,roughness:.9}),
  glass:new THREE.MeshStandardMaterial({color:0x233440,metalness:.05,roughness:.18}),
  field:new THREE.MeshStandardMaterial({color:0x7a8140,roughness:1}),
  water:new THREE.MeshStandardMaterial({color:0x315869,roughness:.25,metalness:.05,transparent:true,opacity:.9}),
  concrete:new THREE.MeshStandardMaterial({color:0x8e8b83,roughness:.9})
};

function meshBox(w,h,d,material,x=0,y=h/2,z=0){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; return m;
}
function addBox(parent,w,h,d,material,x,y,z){const m=meshBox(w,h,d,material,x,y,z);parent.add(m);return m;}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD,WORLD),mat.grass);
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; world.add(ground);

const roads=[];
function addRoad(x,z,w,d,rot=0){
  const r=meshBox(w,.12,d,mat.road,x,.06,z); r.rotation.y=rot; world.add(r); roads.push({x,z,w,d,rot});
  const axis = w>d ? "x":"z";
  const len = axis==="x"?w:d;
  for(let p=-len/2+8;p<len/2;p+=15){
    const l=meshBox(axis==="x"?7:.18,.03,axis==="x"?.18:7,mat.line,
      x+(axis==="x"?p:0),.14,z+(axis==="z"?p:0));
    world.add(l);
  }
  return r;
}
addRoad(0,0,390,14);
addRoad(-78,0,14,330);
addRoad(86,-22,14,360);
addRoad(0,-92,300,12);
addRoad(20,96,330,12);
addRoad(-5,48,210,10,Math.PI/18);
addRoad(52,25,10,130,-Math.PI/7);

function addSidewalk(x,z,w,d){
  const p=meshBox(w,.12,d,mat.path,x,.12,z); world.add(p);
}
addSidewalk(0,10,390,4); addSidewalk(0,-10,390,4);
addSidewalk(-68,0,4,330); addSidewalk(-88,0,4,330);
addSidewalk(76,-22,4,360); addSidewalk(96,-22,4,360);

const canal=meshBox(330,.18,12,mat.water,18,.02,155); world.add(canal);
addBox(world,330,.5,2,mat.concrete,18,.25,148);
addBox(world,330,.5,2,mat.concrete,18,.25,162);

let seed=1337;
function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646}
const buildingBoxes=[];
function addBuilding(x,z,w,d,h,colorIdx=Math.floor(rnd()*mat.brick.length)){
  const g=new THREE.Group(); g.position.set(x,0,z);
  const body=meshBox(w,h,d,mat.brick[colorIdx],0,h/2,0); g.add(body);
  const roof=meshBox(w+.6,.7,d+.6,mat.roof,0,h+.35,0); g.add(roof);
  const floors=Math.max(1,Math.floor(h/3));
  for(let fy=1;fy<=floors;fy++){
    for(const side of [-1,1]){
      const win=meshBox(Math.max(1,w*.2),1.15,.08,mat.glass,0,fy*2.7,side*(d/2+.045));g.add(win);
    }
  }
  world.add(g); buildingBoxes.push({x,z,w,d});
}
function roadNear(x,z){
  return roads.some(r=>Math.abs(x-r.x)<r.w/2+10 && Math.abs(z-r.z)<r.d/2+10);
}
for(let i=0;i<115;i++){
  let x,z,tries=0;
  do{x=(rnd()-.5)*370;z=(rnd()-.5)*330;tries++;}while(roadNear(x,z)&&tries<30);
  if(Math.abs(z-155)<14) continue;
  const w=8+rnd()*14,d=8+rnd()*12,h=5+rnd()*12;
  addBuilding(x,z,w,d,h);
}
for(let i=0;i<14;i++){
  const x=-175+i*27;
  const f=meshBox(22,.08,50,mat.field,x,.04,-155);world.add(f);
}
for(let i=0;i<12;i++){
  const x=-165+i*30;
  const f=meshBox(25,.08,38,new THREE.MeshStandardMaterial({color:i%2?0x7c8744:0x647438,roughness:1}),x,.04,185);world.add(f);
}

// Flemish landmark church silhouette
const church=new THREE.Group(); church.position.set(-120,0,-72);
addBox(church,18,14,26,mat.brick[2],0,7,0);
addBox(church,8,28,8,mat.brick[1],0,14,-8);
const spire=new THREE.Mesh(new THREE.ConeGeometry(5,15,4),mat.roof);spire.position.set(0,35.5,-8);spire.rotation.y=Math.PI/4;spire.castShadow=true;church.add(spire);world.add(church);

// Open garage interior
const garage=new THREE.Group();garage.position.set(74,0,-58);
addBox(garage,24,.5,20,mat.concrete,0,.25,0);
addBox(garage,24,7,.5,mat.brick[0],0,3.5,-10);
addBox(garage,.5,7,20,mat.brick[0],-12,3.5,0);
addBox(garage,.5,7,20,mat.brick[0],12,3.5,0);
addBox(garage,24,.5,20,mat.roof,0,7,0);
const sign=meshBox(11,1,.25,new THREE.MeshStandardMaterial({color:0x20252b,emissive:0x13171a}),0,5.1,10.1);garage.add(sign);
world.add(garage);

// Trees
const trunkMat=new THREE.MeshStandardMaterial({color:0x5c4027,roughness:1});
const leafMat=new THREE.MeshStandardMaterial({color:0x315c33,roughness:1});
for(let i=0;i<70;i++){
  const x=(rnd()-.5)*390,z=(rnd()-.5)*390;
  if(roadNear(x,z)||Math.abs(z-155)<15)continue;
  const g=new THREE.Group();g.position.set(x,0,z);
  const t=new THREE.Mesh(new THREE.CylinderGeometry(.35,.5,3,7),trunkMat);t.position.y=1.5;t.castShadow=true;g.add(t);
  const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2,1),leafMat);crown.position.y=4.1;crown.castShadow=true;g.add(crown);world.add(g);
}

function createHuman(color=0x2f5b7b){
  const g=new THREE.Group();
  const torso=meshBox(.85,1.5,.45,new THREE.MeshStandardMaterial({color,roughness:.8}),0,1.55,0);g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.34,16,12),new THREE.MeshStandardMaterial({color:0xd1a37f,roughness:.9}));head.position.y=2.65;head.castShadow=true;g.add(head);
  const legs=new THREE.MeshStandardMaterial({color:0x20252d,roughness:.9});
  addBox(g,.28,1.25,.3,legs,-.22,.65,0);addBox(g,.28,1.25,.3,legs,.22,.65,0);
  return g;
}
const player=createHuman(0x1f4b6e); player.position.set(0,0,18); scene.add(player);

function createCar(color=0x5c646d){
  const g=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color,metalness:.58,roughness:.32});
  addBox(g,2.2,.65,4.4,bodyMat,0,.72,0);
  addBox(g,1.85,.7,2.1,bodyMat,0,1.27,-.2);
  const glassMat=new THREE.MeshStandardMaterial({color:0x182733,metalness:.25,roughness:.15});
  addBox(g,1.65,.5,.07,glassMat,0,1.38,.88);
  const wheelMat=new THREE.MeshStandardMaterial({color:0x111214,roughness:.9});
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.32,16),wheelMat);
    w.rotation.z=Math.PI/2;w.position.set(sx*1.07,.48,sz*1.42);w.castShadow=true;g.add(w);
  }
  g.userData.speed=0;g.userData.heading=0;return g;
}
const heroCar=createCar(0x747b82);heroCar.position.set(8,0,18);scene.add(heroCar);

const traffic=[];
const routeA=[new THREE.Vector3(-165,0,-2),new THREE.Vector3(165,0,-2),new THREE.Vector3(165,0,5),new THREE.Vector3(-165,0,5)];
const routeB=[new THREE.Vector3(-82,0,-145),new THREE.Vector3(-82,0,145),new THREE.Vector3(-75,0,145),new THREE.Vector3(-75,0,-145)];
const routeC=[new THREE.Vector3(82,0,-170),new THREE.Vector3(82,0,150),new THREE.Vector3(90,0,150),new THREE.Vector3(90,0,-170)];
function pathPoint(route,t){
  const segs=route.length;const f=(t%1+1)%1*segs;const i=Math.floor(f),u=f-i;
  return route[i].clone().lerp(route[(i+1)%segs],u);
}
for(let i=0;i<16;i++){
  const car=createCar([0x2f5f7b,0x7a2f30,0x202226,0x5d6a3d,0xa1a1a1][i%5]);
  const route=i%3===0?routeB:i%3===1?routeA:routeC;
  car.userData.route=route;car.userData.t=(i/16+.17*(i%3))%1;car.userData.routeSpeed=.007+.003*(i%4);
  scene.add(car);traffic.push(car);
}

const pedestrians=[];
for(let i=0;i<24;i++){
  const p=createHuman([0x3a6074,0x75483a,0x4a6847,0x6d556d][i%4]);
  p.position.set((rnd()-.5)*260,0,(rnd()-.5)*220);
  p.userData.target=new THREE.Vector3((rnd()-.5)*260,0,(rnd()-.5)*220);
  p.userData.speed=1.1+rnd()*.7;scene.add(p);pedestrians.push(p);
}

const police=createCar(0x173f68); police.visible=false; scene.add(police);
const blueLight=new THREE.PointLight(0x3388ff,0,12);blueLight.position.set(-.6,1.9,0);police.add(blueLight);
const redLight=new THREE.PointLight(0xff3322,0,12);redLight.position.set(.6,1.9,0);police.add(redLight);

const marker=new THREE.Mesh(new THREE.TorusGeometry(2.2,.18,10,30),new THREE.MeshBasicMaterial({color:0xffd36b}));
marker.rotation.x=Math.PI/2;marker.position.y=.2;scene.add(marker);

const keys={};let inVehicle=false,camYaw=0,camPitch=-.17,wanted=0,wantedCooldown=0,day=8.25,mission=0,followTimer=0;
const clock=new THREE.Clock();
const tempV=new THREE.Vector3();

const missionData=[
  {title:"Ophaalrit",text:"Stap in de grijze wagen. Druk E wanneer je ernaast staat.",target:()=>heroCar.position},
  {title:"Naar Lede Markt",text:"Rij naar het gele doel aan het dorpscentrum.",target:()=>new THREE.Vector3(-116,0,-70)},
  {title:"Garage Drop",text:"Breng de wagen naar de garage in Erpe-Mere.",target:()=>new THREE.Vector3(74,0,-58)},
  {title:"Schaduwrit",text:"Volg de blauwe wagen 15 seconden zonder verder dan 28 meter te raken.",target:()=>traffic[0].position},
  {title:"Vertical slice voltooid",text:"Vrije rit. Verken de streek, regen en dag/nacht blijven actief.",target:()=>null}
];

function updateMissionUI(){
  const m=missionData[Math.min(mission,missionData.length-1)];
  document.querySelector("#missionTitle").textContent=m.title;
  document.querySelector("#missionText").textContent=m.text;
}
function toast(t){const e=document.querySelector("#toast");e.textContent=t;e.style.opacity=1;clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.opacity=0,2600)}
function completeMission(){mission=Math.min(mission+1,missionData.length-1);followTimer=0;toast("MISSIE VOLTOOID");updateMissionUI();saveGame(false)}

function nearestCar(){
  let best=null,d=1e9;
  for(const c of [heroCar,...traffic]){const x=c.position.distanceTo(player.position);if(x<d){d=x;best=c}}
  return {car:best,d};
}
function interact(){
  if(inVehicle){inVehicle=false;player.visible=true;player.position.copy(heroCar.position).add(new THREE.Vector3(2.2,0,0));toast("Uitgestapt");return}
  const n=nearestCar();
  if(n.car===heroCar && n.d<4.2){inVehicle=true;player.visible=false;if(mission===0)completeMission();toast("Voertuig gestart")}
}
addEventListener("keydown",e=>{keys[e.code]=true;if(e.code==="KeyE")interact();if(e.code==="KeyP")saveGame(true);if(e.code==="KeyL")loadGame(true)});
addEventListener("keyup",e=>keys[e.code]=false);

canvas.addEventListener("click",()=>{if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.()});
addEventListener("mousemove",e=>{
  if(document.pointerLockElement===canvas){camYaw-=e.movementX*.0024;camPitch=THREE.MathUtils.clamp(camPitch-e.movementY*.0018,-.58,.18)}
});

document.querySelectorAll("[data-key]").forEach(b=>{
  const k=b.dataset.key;
  const on=e=>{e.preventDefault();keys[k]=true},off=e=>{e.preventDefault();keys[k]=false};
  b.addEventListener("touchstart",on,{passive:false});b.addEventListener("touchend",off,{passive:false});
});
document.querySelector("#mobileAction").addEventListener("touchstart",e=>{e.preventDefault();interact()},{passive:false});
document.querySelector("#mobileSprint").addEventListener("touchstart",e=>{e.preventDefault();keys.ShiftLeft=true},{passive:false});
document.querySelector("#mobileSprint").addEventListener("touchend",e=>{e.preventDefault();keys.ShiftLeft=false},{passive:false});

function movePlayer(dt){
  const forward=new THREE.Vector3(Math.sin(camYaw),0,-Math.cos(camYaw));
  const right=new THREE.Vector3(Math.cos(camYaw),0,Math.sin(camYaw));
  tempV.set(0,0,0);
  if(keys.KeyW)tempV.add(forward);if(keys.KeyS)tempV.sub(forward);if(keys.KeyD)tempV.add(right);if(keys.KeyA)tempV.sub(right);
  if(tempV.lengthSq()>0){
    tempV.normalize();const sp=keys.ShiftLeft?8.3:4.7;player.position.addScaledVector(tempV,sp*dt);
    player.rotation.y=Math.atan2(tempV.x,tempV.z);
  }
  player.position.x=THREE.MathUtils.clamp(player.position.x,-205,205);
  player.position.z=THREE.MathUtils.clamp(player.position.z,-205,205);
}
function driveHero(dt){
  const car=heroCar;let accel=0;
  if(keys.KeyW)accel=11;if(keys.KeyS)accel=-8;
  car.userData.speed+=accel*dt;
  if(!keys.KeyW&&!keys.KeyS)car.userData.speed*=Math.pow(.45,dt);
  car.userData.speed=THREE.MathUtils.clamp(car.userData.speed,-8,25);
  const steer=(keys.KeyA?1:0)-(keys.KeyD?1:0);
  car.userData.heading+=steer*dt*(car.userData.speed>=0?1:-1)*1.35*Math.min(1,Math.abs(car.userData.speed)/5);
  car.rotation.y=car.userData.heading;
  car.position.x+=Math.sin(car.userData.heading)*car.userData.speed*dt;
  car.position.z+=Math.cos(car.userData.heading)*car.userData.speed*dt;
  car.position.x=THREE.MathUtils.clamp(car.position.x,-205,205);car.position.z=THREE.MathUtils.clamp(car.position.z,-205,205);
  for(const t of traffic){
    if(t.position.distanceTo(car.position)<3.0 && Math.abs(car.userData.speed)>7){wanted=Math.min(5,wanted+1);wantedCooldown=14;car.userData.speed*=-.15;toast("Botsing gemeld — politie onderweg")}
  }
}
function updateTraffic(dt){
  for(const c of traffic){
    const prev=c.position.clone();c.userData.t=(c.userData.t+c.userData.routeSpeed*dt*8)%1;
    const p=pathPoint(c.userData.route,c.userData.t);c.position.copy(p);
    const next=pathPoint(c.userData.route,c.userData.t+.003);c.rotation.y=Math.atan2(next.x-p.x,next.z-p.z);
  }
}
function updatePeds(dt){
  for(const p of pedestrians){
    tempV.copy(p.userData.target).sub(p.position);tempV.y=0;
    if(tempV.length()<2){p.userData.target.set((rnd()-.5)*260,0,(rnd()-.5)*220)}
    else{tempV.normalize();p.position.addScaledVector(tempV,p.userData.speed*dt);p.rotation.y=Math.atan2(tempV.x,tempV.z)}
  }
}
function updatePolice(dt,elapsed){
  if(wanted<=0){police.visible=false;blueLight.intensity=redLight.intensity=0;return}
  const target=inVehicle?heroCar.position:player.position;
  if(!police.visible){police.position.copy(target).add(new THREE.Vector3(36,0,36));police.visible=true}
  tempV.copy(target).sub(police.position);tempV.y=0;
  if(tempV.length()>1){const dir=tempV.normalize();police.position.addScaledVector(dir,(10+wanted*1.8)*dt);police.rotation.y=Math.atan2(dir.x,dir.z)}
  const flash=Math.sin(elapsed*13)>0;blueLight.intensity=flash?8:0;redLight.intensity=flash?0:8;
  if(police.position.distanceTo(target)<4.5){toast("Politiecontact — wanted niveau daalt");wanted=Math.max(0,wanted-1);police.position.add(new THREE.Vector3(20,0,20))}
  wantedCooldown-=dt;if(wantedCooldown<=0){wanted=Math.max(0,wanted-dt*.06)}
}

const rainCount=1100, rainPos=new Float32Array(rainCount*3);
for(let i=0;i<rainCount;i++){rainPos[i*3]=(rnd()-.5)*160;rainPos[i*3+1]=rnd()*55+3;rainPos[i*3+2]=(rnd()-.5)*160}
const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute("position",new THREE.BufferAttribute(rainPos,3));
const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xb9d7e6,size:.09,transparent:true,opacity:.6}));
scene.add(rain);
function updateRain(dt,target){
  rain.position.x=target.x;rain.position.z=target.z;
  const a=rain.geometry.attributes.position.array;
  for(let i=0;i<rainCount;i++){a[i*3+1]-=30*dt;if(a[i*3+1]<0)a[i*3+1]=55+rnd()*8}
  rain.geometry.attributes.position.needsUpdate=true;
}

function updateDay(dt){
  day=(day+dt*.035)%24;
  const daylight=THREE.MathUtils.clamp(Math.sin((day-6)/24*Math.PI*2)*.75+.35,.08,1);
  sun.intensity=.25+daylight*3.3;hemi.intensity=.25+daylight*1.5;
  const dayC=new THREE.Color(0x91a3ad),nightC=new THREE.Color(0x101722);
  scene.background.copy(nightC).lerp(dayC,daylight);scene.fog.color.copy(scene.background);
  const hh=Math.floor(day).toString().padStart(2,"0"),mm=Math.floor((day%1)*60).toString().padStart(2,"0");
  document.querySelector("#clock").textContent=hh+":"+mm;
}
function updateMission(dt){
  const m=missionData[Math.min(mission,missionData.length-1)],t=m.target();
  if(t){marker.visible=true;marker.position.x=t.x;marker.position.z=t.z;marker.rotation.z+=dt*.9}
  else marker.visible=false;
  const actor=inVehicle?heroCar.position:player.position;
  if(mission===1&&actor.distanceTo(t)<8)completeMission();
  else if(mission===2&&inVehicle&&actor.distanceTo(t)<8)completeMission();
  else if(mission===3){
    const d=actor.distanceTo(t);
    if(d<28&&d>5)followTimer+=dt;else followTimer=Math.max(0,followTimer-dt*.8);
    document.querySelector("#missionText").textContent="Volg de blauwe wagen: "+Math.floor(followTimer)+"/15 sec • afstand "+Math.floor(d)+" m";
    if(followTimer>=15)completeMission();
  }
}
function updateCamera(dt){
  const target=(inVehicle?heroCar.position:player.position).clone().add(new THREE.Vector3(0,inVehicle?1.5:1.7,0));
  if(inVehicle)camYaw=THREE.MathUtils.lerp(camYaw,heroCar.userData.heading+Math.PI,.012);
  const dist=inVehicle?10:6.5, h=inVehicle?4.4:3.2;
  const off=new THREE.Vector3(Math.sin(camYaw)*Math.cos(camPitch)*dist,h+Math.sin(camPitch)*dist,Math.cos(camYaw)*Math.cos(camPitch)*dist);
  const desired=target.clone().add(off);
  camera.position.lerp(desired,1-Math.pow(.001,dt));camera.lookAt(target);
}
function updatePrompt(){
  const n=nearestCar();
  const p=document.querySelector("#prompt");
  if(inVehicle)p.textContent="E • uitstappen";
  else if(n.car===heroCar&&n.d<4.2)p.textContent="E • instappen";
  else p.textContent="Klik/tik voor camera • P opslaan • L laden";
  document.querySelector("#speed").textContent=inVehicle?Math.round(Math.abs(heroCar.userData.speed)*4)+" km/u":"";
  document.querySelector("#wanted").textContent=Array.from({length:5},(_,i)=>i<Math.ceil(wanted)?"●":"○").join(" ");
}
function districtName(pos){
  if(pos.x<-60)return "LEDE";if(pos.x>55)return "ERPE-MERE";if(pos.z<-80)return "AALST-ZUID";if(pos.z>90)return "DENDERZONE";return "AALST / RAND";
}

const map=document.querySelector("#minimap"),ctx=map.getContext("2d");
function drawMap(){
  const S=180,scale=S/WORLD,conv=(x,z)=>[S/2+x*scale,S/2+z*scale];
  ctx.clearRect(0,0,S,S);ctx.fillStyle="#15201a";ctx.fillRect(0,0,S,S);
  ctx.strokeStyle="#555b5e";ctx.lineWidth=6;
  for(const r of roads){const [x,z]=conv(r.x,r.z);ctx.save();ctx.translate(x,z);ctx.rotate(-r.rot);ctx.strokeRect(-r.w*scale/2,-r.d*scale/2,r.w*scale,r.d*scale);ctx.restore()}
  const m=missionData[Math.min(mission,missionData.length-1)].target();if(m){const [x,z]=conv(m.x,m.z);ctx.fillStyle="#ffd36b";ctx.beginPath();ctx.arc(x,z,5,0,Math.PI*2);ctx.fill()}
  for(const t of traffic.slice(0,10)){const [x,z]=conv(t.position.x,t.position.z);ctx.fillStyle="#98a6af";ctx.fillRect(x-1.5,z-1.5,3,3)}
  if(police.visible){const [x,z]=conv(police.position.x,police.position.z);ctx.fillStyle="#3388ff";ctx.beginPath();ctx.arc(x,z,3,0,Math.PI*2);ctx.fill()}
  const actor=inVehicle?heroCar:player,[x,z]=conv(actor.position.x,actor.position.z);
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x,z,4,0,Math.PI*2);ctx.fill();
}
function saveGame(show=true){
  const d={mission,day,wanted,inVehicle,px:player.position.x,pz:player.position.z,cx:heroCar.position.x,cz:heroCar.position.z,ch:heroCar.userData.heading};
  localStorage.setItem("denderCountySave",JSON.stringify(d));if(show)toast("Spel opgeslagen")
}
function loadGame(show=true){
  try{const d=JSON.parse(localStorage.getItem("denderCountySave"));if(!d)return;
    mission=d.mission??0;day=d.day??8.25;wanted=d.wanted??0;inVehicle=!!d.inVehicle;
    player.position.set(d.px??0,0,d.pz??18);heroCar.position.set(d.cx??8,0,d.cz??18);heroCar.userData.heading=d.ch??0;heroCar.rotation.y=heroCar.userData.heading;player.visible=!inVehicle;
    updateMissionUI();if(show)toast("Opgeslagen spel geladen");
  }catch{}
}

function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
addEventListener("resize",resize);

let running=false;
document.querySelector("#startBtn").addEventListener("click",()=>{
  document.querySelector("#loading").classList.add("hidden");document.querySelector("#hud").classList.remove("hidden");
  running=true;loadGame(false);updateMissionUI();clock.start();
});

let mapTimer=0;
function animate(){
  requestAnimationFrame(animate);if(!running)return;
  const dt=Math.min(clock.getDelta(),.033),elapsed=performance.now()/1000;
  if(inVehicle)driveHero(dt);else movePlayer(dt);
  updateTraffic(dt);updatePeds(dt);updatePolice(dt,elapsed);updateDay(dt);
  const actor=inVehicle?heroCar.position:player.position;updateRain(dt,actor);updateMission(dt);updateCamera(dt);updatePrompt();
  document.querySelector("#district").textContent=districtName(actor);
  mapTimer-=dt;if(mapTimer<=0){drawMap();mapTimer=.08}
  renderer.render(scene,camera);
}
animate();


// ===== DENDER COUNTY 0.2 GAMEPLAY / WORLD UPGRADE =====
const v02 = {
  playerPrev: player.position.clone(),
  carPrev: heroCar.position.clone(),
  lastCarSpeed: 0,
  touchX: null,
  touchY: null,
  audioReady: false,
  audio: null,
  trafficCycle: 0
};

function hitsBuilding(pos, radius=1.1){
  for(const b of buildingBoxes){
    if(pos.x > b.x-b.w/2-radius && pos.x < b.x+b.w/2+radius &&
       pos.z > b.z-b.d/2-radius && pos.z < b.z+b.d/2+radius) return true;
  }
  return false;
}

function installCollisions(){
  if(!inVehicle){
    if(hitsBuilding(player.position,.65)){
      player.position.copy(v02.playerPrev);
    }else{
      v02.playerPrev.copy(player.position);
    }
  }else{
    if(hitsBuilding(heroCar.position,1.35)){
      heroCar.position.copy(v02.carPrev);
      if(Math.abs(heroCar.userData.speed)>5){
        heroCar.userData.speed *= -.22;
        wanted=Math.min(5,wanted+.5);
        wantedCooldown=10;
        toast("Botsing met eigendom — schade gemeld");
      }else heroCar.userData.speed=0;
    }else{
      v02.carPrev.copy(heroCar.position);
    }
  }
}

function addStreetLight(x,z,rot=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;
  const poleMat=new THREE.MeshStandardMaterial({color:0x34373a,metalness:.65,roughness:.45});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.11,.14,5.5,8),poleMat);
  pole.position.y=2.75;pole.castShadow=true;g.add(pole);
  const arm=meshBox(1.3,.11,.11,poleMat,.55,5.25,0);g.add(arm);
  const bulbMat=new THREE.MeshStandardMaterial({color:0xf1d99f,emissive:0xf1bd5b,emissiveIntensity:0});
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.16,10,8),bulbMat);bulb.position.set(1.12,5.18,0);g.add(bulb);
  const light=new THREE.PointLight(0xffd48c,0,19,2);light.position.copy(bulb.position);g.add(light);
  g.userData.light=light;g.userData.bulbMat=bulbMat;scene.add(g);return g;
}
const streetLights=[];
for(let x=-165;x<=165;x+=33){streetLights.push(addStreetLight(x,11,Math.PI));streetLights.push(addStreetLight(x,-11,0))}
for(let z=-145;z<=145;z+=36){streetLights.push(addStreetLight(-67,z,Math.PI/2));streetLights.push(addStreetLight(97,z,-Math.PI/2))}

function addTrafficLight(x,z,dir=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=dir;
  const poleMat=new THREE.MeshStandardMaterial({color:0x303234,metalness:.55,roughness:.5});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,3.5,8),poleMat);pole.position.y=1.75;g.add(pole);
  const housing=meshBox(.55,1.6,.55,new THREE.MeshStandardMaterial({color:0x17191a,roughness:.8}),0,3.45,0);g.add(housing);
  const redMat=new THREE.MeshStandardMaterial({color:0x441010,emissive:0xff1100,emissiveIntensity:2});
  const amberMat=new THREE.MeshStandardMaterial({color:0x443410,emissive:0xffaa00,emissiveIntensity:.05});
  const greenMat=new THREE.MeshStandardMaterial({color:0x103a1c,emissive:0x22ff55,emissiveIntensity:.05});
  const make=(y,m)=>{const s=new THREE.Mesh(new THREE.SphereGeometry(.15,12,8),m);s.scale.z=.45;s.position.set(0,y,.3);g.add(s);return s};
  make(3.9,redMat);make(3.45,amberMat);make(3.0,greenMat);
  g.userData={redMat,amberMat,greenMat};scene.add(g);return g;
}
const trafficLights=[
  addTrafficLight(-70,-6,0),addTrafficLight(-86,6,Math.PI),
  addTrafficLight(80,-6,0),addTrafficLight(92,6,Math.PI)
];

function addShopInterior(){
  const g=new THREE.Group();g.position.set(-106,0,-55);
  const wall=new THREE.MeshStandardMaterial({color:0xd7d1c5,roughness:.95});
  const wood=new THREE.MeshStandardMaterial({color:0x6b4933,roughness:.9});
  addBox(g,12,.3,10,mat.concrete,0,.15,0);
  addBox(g,12,4,.3,wall,0,2,-5);
  addBox(g,.3,4,10,wall,-6,2,0);
  addBox(g,.3,4,10,wall,6,2,0);
  addBox(g,12,.25,10,mat.roof,0,4,0);
  addBox(g,5,1,1.3,wood,1,1,-2.2);
  for(let i=-2;i<=2;i++) addBox(g,.7,1.4,.7,new THREE.MeshStandardMaterial({color:0xb58243+(i+2)*3000,roughness:.7}),i*1.3,.9,1.8);
  const signMat=new THREE.MeshStandardMaterial({color:0xefe6cf,emissive:0x66522b,emissiveIntensity:.35});
  addBox(g,7,.8,.18,signMat,0,3.1,5.05);
  scene.add(g);
}
addShopInterior();

const heroHeadlights=[];
for(const sx of [-.65,.65]){
  const lamp=new THREE.SpotLight(0xfff1d2,0,48,Math.PI/8,.45,1.6);
  lamp.position.set(sx,1.02,2.05);
  lamp.target.position.set(sx,.35,20);
  heroCar.add(lamp);heroCar.add(lamp.target);heroHeadlights.push(lamp);
}

function updateNightHardware(){
  const night=day<6.5||day>19.0;
  for(const l of streetLights){
    l.userData.light.intensity=night?2.4:0;
    l.userData.bulbMat.emissiveIntensity=night?1.8:0;
  }
  for(const h of heroHeadlights) h.intensity=night?5.5:0;
}

function updateTrafficSignals(elapsed){
  const phase=Math.floor(elapsed/8)%3;
  trafficLights.forEach((t,i)=>{
    const offset=(i%2);
    const p=(phase+offset)%3;
    t.userData.redMat.emissiveIntensity=p===0?3:.06;
    t.userData.amberMat.emissiveIntensity=p===1?2.5:.04;
    t.userData.greenMat.emissiveIntensity=p===2?3:.04;
  });
}

function animateCharacter(g, moving, elapsed, phase=0){
  if(!g.visible)return;
  const children=g.children.filter(o=>o.isMesh);
  if(children.length<4)return;
  const leftLeg=children[2],rightLeg=children[3];
  const swing=moving?Math.sin(elapsed*8+phase)*.42:0;
  leftLeg.rotation.x=swing;rightLeg.rotation.x=-swing;
  g.position.y=moving?Math.abs(Math.sin(elapsed*8+phase))*.035:0;
}
function updateCharacterAnimation(elapsed){
  const playerMoving=!inVehicle&&(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD);
  animateCharacter(player,playerMoving,elapsed);
  pedestrians.forEach((p,i)=>animateCharacter(p,true,elapsed,i*.6));
}

let touchActive=false;
canvas.addEventListener("touchstart",e=>{
  if(e.touches.length===1){touchActive=true;v02.touchX=e.touches[0].clientX;v02.touchY=e.touches[0].clientY}
},{passive:true});
canvas.addEventListener("touchmove",e=>{
  if(!touchActive||e.touches.length!==1)return;
  const x=e.touches[0].clientX,y=e.touches[0].clientY;
  const dx=x-v02.touchX,dy=y-v02.touchY;
  v02.touchX=x;v02.touchY=y;
  camYaw-=dx*.006;camPitch=THREE.MathUtils.clamp(camPitch-dy*.004,-.58,.18);
},{passive:true});
canvas.addEventListener("touchend",()=>{touchActive=false});

function startAudio(){
  if(v02.audioReady)return;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;
  const ac=new AC();
  const master=ac.createGain();master.gain.value=.11;master.connect(ac.destination);

  const engineOsc=ac.createOscillator();engineOsc.type="sawtooth";
  const engineGain=ac.createGain();engineGain.gain.value=0;
  engineOsc.connect(engineGain);engineGain.connect(master);engineOsc.start();

  const rainBuffer=ac.createBuffer(1,ac.sampleRate*2,ac.sampleRate);
  const data=rainBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.22;
  const rainSrc=ac.createBufferSource();rainSrc.buffer=rainBuffer;rainSrc.loop=true;
  const rainFilter=ac.createBiquadFilter();rainFilter.type="lowpass";rainFilter.frequency.value=5000;
  const rainGain=ac.createGain();rainGain.gain.value=.22;
  rainSrc.connect(rainFilter);rainFilter.connect(rainGain);rainGain.connect(master);rainSrc.start();

  v02.audio={ac,engineOsc,engineGain,rainGain};v02.audioReady=true;
}
document.querySelector("#startBtn").addEventListener("click",startAudio);
function updateAudio(){
  if(!v02.audioReady)return;
  const s=Math.abs(heroCar.userData.speed);
  v02.audio.engineGain.gain.setTargetAtTime(inVehicle?.08:0,v02.audio.ac.currentTime,.08);
  v02.audio.engineOsc.frequency.setTargetAtTime(55+s*9,v02.audio.ac.currentTime,.06);
}

const originalMissionCount=missionData.length;
missionData.splice(originalMissionCount-1,0,
  {title:"Nachtcontrole",text:"Rij naar de kanaalzone en test de koplampen bij valavond.",target:()=>new THREE.Vector3(40,0,145)},
  {title:"Buurtwinkel",text:"Ga te voet naar de buurtwinkel bij Lede en bereik de ingang.",target:()=>new THREE.Vector3(-106,0,-50)}
);
function v02MissionCheck(){
  const actor=inVehicle?heroCar.position:player.position;
  if(mission===4 && actor.distanceTo(new THREE.Vector3(40,0,145))<9){day=20.4;completeMission()}
  if(mission===5 && !inVehicle && actor.distanceTo(new THREE.Vector3(-106,0,-50))<5){completeMission()}
}

let v02Last=performance.now();
function v02Loop(now){
  requestAnimationFrame(v02Loop);
  if(!running){v02Last=now;return}
  const dt=Math.min((now-v02Last)/1000,.04);v02Last=now;
  installCollisions();
  updateNightHardware();
  updateTrafficSignals(now/1000);
  updateCharacterAnimation(now/1000);
  updateAudio();
  v02MissionCheck();
}
requestAnimationFrame(v02Loop);


// ===== DENDER COUNTY 0.4 — VISUAL / DRIVING / STREET LIFE UPGRADE =====
window.__DENDER_VERSION__="0.4";

const v04={
  cameraMode:0,
  qualityHigh:true,
  signalPhase:0,
  lastHorn:0,
  rainIntensity:.72
};

function pointInRoad04(pos){
  for(const r of roads){
    const dx=pos.x-r.x,dz=pos.z-r.z;
    const c=Math.cos(-r.rot),s=Math.sin(-r.rot);
    const lx=dx*c-dz*s,lz=dx*s+dz*c;
    if(Math.abs(lx)<=r.w/2+1.2 && Math.abs(lz)<=r.d/2+1.2)return true;
  }
  return false;
}

function textureSign04(text,border="#d62121",bg="#f8f8f3",fg="#151515"){
  const c=document.createElement("canvas");c.width=c.height=256;
  const x=c.getContext("2d");x.clearRect(0,0,256,256);
  x.fillStyle=border;x.beginPath();x.arc(128,128,116,0,Math.PI*2);x.fill();
  x.fillStyle=bg;x.beginPath();x.arc(128,128,91,0,Math.PI*2);x.fill();
  x.fillStyle=fg;x.font="900 92px system-ui";x.textAlign="center";x.textBaseline="middle";x.fillText(text,128,134);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function addRoadSign04(x,z,text="50",rot=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;
  const pm=new THREE.MeshStandardMaterial({color:0x777b7d,metalness:.7,roughness:.35});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.07,2.8,8),pm);pole.position.y=1.4;g.add(pole);
  const sm=new THREE.MeshBasicMaterial({map:textureSign04(text),side:THREE.DoubleSide});
  const sign=new THREE.Mesh(new THREE.CircleGeometry(.48,32),sm);sign.position.set(0,2.55,.02);g.add(sign);
  scene.add(g);return g;
}
[
  [-32,-11,"50",0],[35,11,"50",Math.PI],[-90,-58,"30",Math.PI/2],
  [98,55,"50",-Math.PI/2],[69,-96,"30",0],[-132,101,"50",Math.PI]
].forEach(a=>addRoadSign04(...a));

function addZebra04(x,z,axis="x",rot=0){
  const g=new THREE.Group();g.position.set(x,.17,z);g.rotation.y=rot;
  const white=new THREE.MeshStandardMaterial({color:0xf1efe8,roughness:.82});
  for(let i=-4;i<=4;i++){
    const stripe=meshBox(axis==="x"?1.15:7,.025,axis==="x"?7:1.15,white,
      axis==="x"?i*1.55:0,.012,axis==="z"?i*1.55:0);
    g.add(stripe);
  }
  scene.add(g);
}
addZebra04(-78,-22,"x");addZebra04(86,24,"x");addZebra04(-25,0,"z");

function addBusStop04(x,z,rot=0,name="LIJN"){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;
  const metal=new THREE.MeshStandardMaterial({color:0x4b5054,metalness:.6,roughness:.4});
  const glass=new THREE.MeshStandardMaterial({color:0x9fc0ce,transparent:true,opacity:.28,roughness:.15,metalness:.05});
  addBox(g,4,.18,1.8,metal,0,2.6,0);
  addBox(g,.12,2.6,1.8,metal,-2,1.3,0);addBox(g,.12,2.6,1.8,metal,2,1.3,0);
  addBox(g,4,2.2,.08,glass,0,1.25,-.85);
  addBox(g,2.3,.45,.6,new THREE.MeshStandardMaterial({color:0x43484b,roughness:.8}),0,.55,0);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,2.8,8),metal);pole.position.set(2.6,1.4,0);g.add(pole);
  const tex=textureSign04("H","#f5d429","#f5d429","#171717");
  const s=new THREE.Mesh(new THREE.CircleGeometry(.32,24),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
  s.position.set(2.6,2.55,.02);g.add(s);scene.add(g);
}
addBusStop04(-42,12,Math.PI);addBusStop04(103,-55,-Math.PI/2);addBusStop04(-91,75,Math.PI/2);

function addRoundabout04(x,z,r=10){
  const roadM=new THREE.MeshStandardMaterial({color:0x24282b,roughness:.9});
  const ring=new THREE.Mesh(new THREE.RingGeometry(r-3.2,r+3.2,64),roadM);
  ring.rotation.x=-Math.PI/2;ring.position.set(x,.16,z);ring.receiveShadow=true;scene.add(ring);
  const island=new THREE.Mesh(new THREE.CylinderGeometry(r-3.5,r-3.5,.45,48),new THREE.MeshStandardMaterial({color:0x537645,roughness:1}));
  island.position.set(x,.22,z);island.receiveShadow=true;scene.add(island);
  const curb=new THREE.Mesh(new THREE.TorusGeometry(r-3.4,.22,8,64),new THREE.MeshStandardMaterial({color:0xbdb8aa,roughness:.9}));
  curb.rotation.x=Math.PI/2;curb.position.set(x,.46,z);scene.add(curb);
  for(let a=0;a<Math.PI*2;a+=Math.PI/3){
    const shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(1.05,1),new THREE.MeshStandardMaterial({color:0x365b32,roughness:1}));
    shrub.scale.y=.7;shrub.position.set(x+Math.cos(a)*4,.95,z+Math.sin(a)*4);shrub.castShadow=true;scene.add(shrub);
  }
}
addRoundabout04(20,96,9);

const puddleMat04=new THREE.MeshStandardMaterial({color:0x43545b,metalness:.45,roughness:.16,transparent:true,opacity:.5});
for(let i=0;i<22;i++){
  const p=new THREE.Mesh(new THREE.CircleGeometry(1.2+rnd()*2.4,20),puddleMat04);
  p.rotation.x=-Math.PI/2;p.scale.y=.4+rnd()*.5;p.position.set((rnd()-.5)*320,.175,(rnd()-.5)*260);
  scene.add(p);
}

function decorateHuman04(g,i=0){
  if(g.userData.v04)return;g.userData.v04=true;
  const skin=new THREE.MeshStandardMaterial({color:0xc58e69,roughness:.9});
  const shirt=(g.children.find(o=>o.isMesh)?.material)||new THREE.MeshStandardMaterial({color:0x405a72});
  const armL=meshBox(.22,1.22,.26,shirt,-.56,1.55,0);
  const armR=meshBox(.22,1.22,.26,shirt,.56,1.55,0);
  armL.geometry.translate(0,-.45,0);armR.geometry.translate(0,-.45,0);
  g.add(armL,armR);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.355,16,10,0,Math.PI*2,0,Math.PI*.52),new THREE.MeshStandardMaterial({color:i%3===0?0x342820:i%3===1?0x1a1817:0x6a4b2d,roughness:.95}));
  hair.position.y=2.78;hair.castShadow=true;g.add(hair);
  g.userData.armL=armL;g.userData.armR=armR;
}
decorateHuman04(player,0);pedestrians.forEach((p,i)=>decorateHuman04(p,i+1));

function decorateCar04(c,i=0){
  if(c.userData.v04)return;c.userData.v04=true;
  const chrome=new THREE.MeshStandardMaterial({color:0xaaaeb0,metalness:.82,roughness:.22});
  const red=new THREE.MeshStandardMaterial({color:0x4b0909,emissive:0xff1400,emissiveIntensity:.18});
  const white=new THREE.MeshStandardMaterial({color:0xdfe7df,emissive:0xfff3d7,emissiveIntensity:.08});
  addBox(c,2.05,.15,.15,chrome,0,.53,-2.24);
  addBox(c,2.05,.15,.15,chrome,0,.53,2.24);
  const bl=meshBox(.42,.2,.09,red,-.72,.83,-2.24);const br=meshBox(.42,.2,.09,red,.72,.83,-2.24);c.add(bl,br);
  const fl=meshBox(.4,.2,.09,white,-.72,.83,2.24);const fr=meshBox(.4,.2,.09,white,.72,.83,2.24);c.add(fl,fr);
  const mirrorM=new THREE.MeshStandardMaterial({color:0x262a2e,metalness:.55,roughness:.35});
  addBox(c,.28,.16,.42,mirrorM,-1.23,1.23,.45);addBox(c,.28,.16,.42,mirrorM,1.23,1.23,.45);
  c.userData.brakeLights=[bl,br];
  c.userData.wheels=c.children.filter(o=>o.geometry?.type==="CylinderGeometry");
}
decorateCar04(heroCar,0);traffic.forEach((c,i)=>decorateCar04(c,i));decorateCar04(police,99);

function animateHuman04(g,moving,elapsed,phase=0){
  if(!g.userData.v04)return;
  const swing=moving?Math.sin(elapsed*8+phase)*.5:0;
  if(g.userData.armL)g.userData.armL.rotation.x=-swing;
  if(g.userData.armR)g.userData.armR.rotation.x=swing;
}
function animateCar04(c,dt,steer=0,braking=false){
  const speed=c.userData.speed||0;
  if(c.userData.wheels){
    for(const w of c.userData.wheels)w.rotation.x+=speed*dt*2.4;
  }
  if(c.userData.brakeLights){
    for(const l of c.userData.brakeLights)l.material.emissiveIntensity=braking?3:.18;
  }
  c.rotation.z=THREE.MathUtils.lerp(c.rotation.z,-steer*Math.min(Math.abs(speed)/28,1)*.055,.12);
}

function driveHero04(dt){
  const car=heroCar;
  const throttle=keys.KeyW?1:0;
  const brake=keys.KeyS?1:0;
  const handbrake=keys.Space?1:0;
  const onRoad=pointInRoad04(car.position);
  const maxForward=onRoad?31:13;
  const maxReverse=9;

  if(throttle)car.userData.speed+=13.5*dt;
  if(brake){
    if(car.userData.speed>1)car.userData.speed-=22*dt;
    else car.userData.speed-=8*dt;
  }
  const drag=onRoad?.62:.36;
  if(!throttle&&!brake)car.userData.speed*=Math.pow(drag,dt);
  if(handbrake)car.userData.speed*=Math.pow(.055,dt);

  car.userData.speed=THREE.MathUtils.clamp(car.userData.speed,-maxReverse,maxForward);
  const rawSteer=(keys.KeyA?1:0)-(keys.KeyD?1:0);
  const speedAbs=Math.abs(car.userData.speed);
  const steerAuthority=THREE.MathUtils.lerp(1.7,.72,Math.min(speedAbs/30,1));
  if(speedAbs>.25)car.userData.heading+=rawSteer*dt*(car.userData.speed>=0?1:-1)*steerAuthority;
  if(handbrake&&speedAbs>7)car.userData.heading+=rawSteer*dt*1.1;

  car.rotation.y=car.userData.heading;
  car.position.x+=Math.sin(car.userData.heading)*car.userData.speed*dt;
  car.position.z+=Math.cos(car.userData.heading)*car.userData.speed*dt;
  car.position.x=THREE.MathUtils.clamp(car.position.x,-205,205);
  car.position.z=THREE.MathUtils.clamp(car.position.z,-205,205);

  for(const t of traffic){
    if(t.position.distanceTo(car.position)<3.0 && speedAbs>5){
      wanted=Math.min(5,wanted+1);wantedCooldown=14;car.userData.speed*=-.12;toast("Verkeersongeval gemeld — politie onderweg");
    }
  }
  animateCar04(car,dt,rawSteer,brake||handbrake);
}
driveHero=driveHero04;

function trafficMustStop04(c,elapsed){
  const p=c.position;
  const nearMain=(Math.abs(p.x+78)<10||Math.abs(p.x-86)<10)&&Math.abs(p.z)<14;
  if(!nearMain)return false;
  const phase=Math.floor(elapsed/8)%2;
  const horizontal=c.userData.route===routeA;
  return horizontal?phase===0:phase===1;
}
function updateTraffic04(dt){
  const elapsed=performance.now()/1000;
  for(const c of traffic){
    const stop=trafficMustStop04(c,elapsed);
    c.userData.displaySpeed=stop?0:8*c.userData.routeSpeed*28;
    if(!stop)c.userData.t=(c.userData.t+c.userData.routeSpeed*dt*8)%1;
    const p=pathPoint(c.userData.route,c.userData.t);c.position.copy(p);
    const next=pathPoint(c.userData.route,c.userData.t+.003);c.rotation.y=Math.atan2(next.x-p.x,next.z-p.z);
    c.userData.speed=c.userData.displaySpeed;
    animateCar04(c,dt,0,stop);
  }
}
updateTraffic=updateTraffic04;

function updateCamera04(dt){
  const targetObject=inVehicle?heroCar:player;
  if(v04.cameraMode===1&&inVehicle){
    const forward=new THREE.Vector3(Math.sin(heroCar.userData.heading),0,Math.cos(heroCar.userData.heading));
    const eye=heroCar.position.clone().add(new THREE.Vector3(0,1.55,0)).addScaledVector(forward,.15);
    camera.position.lerp(eye,1-Math.pow(.0001,dt));
    camera.lookAt(eye.clone().addScaledVector(forward,25));
    return;
  }
  if(v04.cameraMode===2&&inVehicle){
    const forward=new THREE.Vector3(Math.sin(heroCar.userData.heading),0,Math.cos(heroCar.userData.heading));
    const eye=heroCar.position.clone().add(new THREE.Vector3(0,1.05,0)).addScaledVector(forward,2.7);
    camera.position.lerp(eye,1-Math.pow(.0001,dt));
    camera.lookAt(eye.clone().addScaledVector(forward,30));
    return;
  }
  const target=targetObject.position.clone().add(new THREE.Vector3(0,inVehicle?1.5:1.7,0));
  if(inVehicle)camYaw=THREE.MathUtils.lerp(camYaw,heroCar.userData.heading+Math.PI,.018);
  const dist=inVehicle?10:6.5,h=inVehicle?4.35:3.2;
  const off=new THREE.Vector3(Math.sin(camYaw)*Math.cos(camPitch)*dist,h+Math.sin(camPitch)*dist,Math.cos(camYaw)*Math.cos(camPitch)*dist);
  camera.position.lerp(target.clone().add(off),1-Math.pow(.001,dt));camera.lookAt(target);
}
updateCamera=updateCamera04;

function horn04(){
  if(!v02.audioReady||performance.now()-v04.lastHorn<450)return;
  v04.lastHorn=performance.now();
  const ac=v02.audio.ac,o=ac.createOscillator(),g=ac.createGain();
  o.type="square";o.frequency.value=285;g.gain.setValueAtTime(.12,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.35);
  o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.36);
}
addEventListener("keydown",e=>{
  if(e.code==="KeyC"&&!e.repeat){v04.cameraMode=(v04.cameraMode+1)%3;toast(["CHASE CAMERA","FIRST PERSON","BUMPER CAMERA"][v04.cameraMode])}
  if(e.code==="KeyH")horn04();
  if(e.code==="KeyQ"&&!e.repeat){
    v04.qualityHigh=!v04.qualityHigh;renderer.setPixelRatio(v04.qualityHigh?Math.min(devicePixelRatio,1.7):Math.min(devicePixelRatio,1));
    sun.castShadow=v04.qualityHigh;toast(v04.qualityHigh?"KWALITEITSMODUS":"PERFORMANCEMODUS");
  }
});

function v04MissionLayer(){
  if(!missionData.some(m=>m.title==="Rotondeproef")){
    missionData.splice(missionData.length-1,0,
      {title:"Rotondeproef",text:"Rij door de nieuwe rotonde en bereik het controlepunt.",target:()=>new THREE.Vector3(20,0,96)},
      {title:"Rustige aftocht",text:"Raak de politie kwijt en breng het wanted-niveau terug naar nul.",target:()=>new THREE.Vector3(86,0,120)}
    );
  }
}
v04MissionLayer();

function v04MissionCheck(){
  const actor=inVehicle?heroCar.position:player.position;
  if(mission===6&&inVehicle&&actor.distanceTo(new THREE.Vector3(20,0,96))<8)completeMission();
  if(mission===7){
    if(wanted<1){wanted=2;wantedCooldown=12;toast("POLITIEZOEKING GESTART")}
    if(wanted<=0.05&&actor.distanceTo(new THREE.Vector3(86,0,120))<20)completeMission();
  }
}

let v04Prev=performance.now();
function v04Loop04(now){
  requestAnimationFrame(v04Loop04);
  if(!running){v04Prev=now;return}
  const dt=Math.min((now-v04Prev)/1000,.04);v04Prev=now;
  const elapsed=now/1000;
  animateHuman04(player,!inVehicle&&(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD),elapsed,0);
  pedestrians.forEach((p,i)=>animateHuman04(p,true,elapsed,i*.45));
  if(police.visible){police.userData.speed=12+wanted*2;animateCar04(police,dt,0,false)}
  v04MissionCheck();
}
requestAnimationFrame(v04Loop04);
