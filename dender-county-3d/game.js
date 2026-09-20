import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

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
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
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
  runMasterExtras70(performance.now());
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
  if(!running){v02Last=now;return}
  const dt=Math.min((now-v02Last)/1000,.04);v02Last=now;
  installCollisions();
  updateNightHardware();
  updateTrafficSignals(now/1000);
  updateCharacterAnimation(now/1000);
  updateAudio();
  v02MissionCheck();
}


// ===== DENDER COUNTY 0.4 — VISUAL / DRIVING / STREET LIFE UPGRADE =====
window.__DENDER_VERSION__="0.4";

const v04={
  cameraMode:0,
  qualityHigh:true,
  signalPhase:0,
  lastHorn:0,
  rainIntensity:.72,
  escapeStarted:false
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
    if(!v04.escapeStarted){
      v04.escapeStarted=true;wanted=2;wantedCooldown=12;toast("POLITIEZOEKING GESTART");
    }
    if(wanted<=0.05&&actor.distanceTo(new THREE.Vector3(86,0,120))<20)completeMission();
  }
}

let v04Prev=performance.now();
function v04Loop04(now){
  if(!running){v04Prev=now;return}
  const dt=Math.min((now-v04Prev)/1000,.04);v04Prev=now;
  const elapsed=now/1000;
  animateHuman04(player,!inVehicle&&(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD),elapsed,0);
  pedestrians.forEach((p,i)=>animateHuman04(p,true,elapsed,i*.45));
  if(police.visible){police.userData.speed=12+wanted*2;animateCar04(police,dt,0,false)}
  v04MissionCheck();
}


document.querySelector("#mobileBrake")?.addEventListener("touchstart",e=>{e.preventDefault();keys.Space=true},{passive:false});
document.querySelector("#mobileBrake")?.addEventListener("touchend",e=>{e.preventDefault();keys.Space=false},{passive:false});
document.querySelector("#mobileCam")?.addEventListener("touchstart",e=>{e.preventDefault();v04.cameraMode=(v04.cameraMode+1)%3;toast(["CHASE CAMERA","FIRST PERSON","BUMPER CAMERA"][v04.cameraMode])},{passive:false});
document.querySelector("#mobileHorn")?.addEventListener("touchstart",e=>{e.preventDefault();horn04()},{passive:false});



// ===== DENDER COUNTY 0.5 — FLEMISH STREETSCAPE PASS =====
window.__DENDER_VERSION__="0.5";

const bikeMat05=new THREE.MeshStandardMaterial({color:0x9d4639,roughness:.9});
function bikeLane05(x,z,w,d,rot=0){
  const m=meshBox(w,.035,d,bikeMat05,x,.175,z);m.rotation.y=rot;scene.add(m);
}
bikeLane05(0,8.1,370,1.8);bikeLane05(0,-8.1,370,1.8);
bikeLane05(-69,0,1.8,310);bikeLane05(97,-20,1.8,330);

function rowHouse05(x,z,faceDir=1,brick=0){
  const g=new THREE.Group();g.position.set(x,0,z);
  const w=8.8,d=7.4,h=7.2;
  const body=meshBox(w,h,d,mat.brick[brick%mat.brick.length],0,h/2,0);g.add(body);
  const roofGeo=new THREE.ConeGeometry(5.7,2.5,4);
  const roof=new THREE.Mesh(roofGeo,mat.roof);roof.position.y=h+1.15;roof.rotation.y=Math.PI/4;roof.scale.z=.78;roof.castShadow=true;g.add(roof);
  const frontZ=faceDir*(d/2+.055);
  const doorM=new THREE.MeshStandardMaterial({color:brick%2?0x25384a:0x44362b,roughness:.75});
  addBox(g,1.25,2.25,.08,doorM,-2.4,1.15,frontZ);
  for(const fy of [1.55,4.45]){
    for(const fx of [-.45,2.35]){
      const wm=new THREE.MeshStandardMaterial({color:0x8eb0bd,emissive:0xc7a86e,emissiveIntensity:.08,metalness:.05,roughness:.18});
      addBox(g,1.55,1.45,.07,wm,fx,fy,frontZ);
    }
  }
  const sill=new THREE.MeshStandardMaterial({color:0xc2b7a5,roughness:.9});
  addBox(g,8.9,.18,.25,sill,0,3.05,frontZ);
  scene.add(g);buildingBoxes.push({x,z,w,d});return g;
}

const rowHouses05=[];
for(let x=-158,i=0;x<=158;x+=11.2,i++){
  if(Math.abs(x+78)<20||Math.abs(x-86)<20||Math.abs(x-20)<18)continue;
  rowHouses05.push(rowHouse05(x,20, -1,i));
  rowHouses05.push(rowHouse05(x,-20, 1,i+2));
}
for(let z=-128,i=0;z<=128;z+=12.5,i++){
  if(Math.abs(z)<20||Math.abs(z-96)<18)continue;
  const a=rowHouse05(-58,z,1,i+1);a.rotation.y=Math.PI/2;
  const b=rowHouse05(-98,z,-1,i+3);b.rotation.y=Math.PI/2;
}

function shopSignTexture05(text,bg="#151b24",fg="#f3d99a"){
  const c=document.createElement("canvas");c.width=512;c.height=128;
  const x=c.getContext("2d");x.fillStyle=bg;x.fillRect(0,0,c.width,c.height);
  x.fillStyle=fg;x.font="900 52px system-ui";x.textAlign="center";x.textBaseline="middle";x.fillText(text,256,67);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function facadeSign05(x,z,text,rot=0,bg="#161b21",fg="#f3d899"){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(7.2,1.6),new THREE.MeshBasicMaterial({map:shopSignTexture05(text,bg,fg),side:THREE.DoubleSide}));
  m.position.set(x,3.7,z);m.rotation.y=rot;scene.add(m);return m;
}
facadeSign05(-42,-16.25,"FRITUUR DE DENDER",0,"#8f2622","#fff1c2");
facadeSign05(42,16.25,"CAFÉ 'T PLEIN",Math.PI,"#20364e","#f0d487");
facadeSign05(111,-16.25,"BUURTMARKT",0,"#28553a","#f4e7b4");

function directionalTexture05(lines){
  const c=document.createElement("canvas");c.width=512;c.height=256;const x=c.getContext("2d");
  x.fillStyle="#185b87";x.fillRect(0,0,512,256);x.strokeStyle="#fff";x.lineWidth=8;x.strokeRect(8,8,496,240);
  x.fillStyle="#fff";x.font="800 44px system-ui";x.textAlign="left";x.textBaseline="middle";
  lines.forEach((t,i)=>x.fillText("→  "+t,34,55+i*66));const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function directional05(x,z,lines,rot=0){
  const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;
  const poleM=new THREE.MeshStandardMaterial({color:0x85898a,metalness:.65,roughness:.35});
  for(const px of [-1.6,1.6]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,3.2,8),poleM);p.position.set(px,1.6,0);g.add(p)}
  const s=new THREE.Mesh(new THREE.PlaneGeometry(4.4,2.2),new THREE.MeshBasicMaterial({map:directionalTexture05(lines),side:THREE.DoubleSide}));
  s.position.y=3.15;g.add(s);scene.add(g);
}
directional05(-10,-12,["AALST","LEDE","ERPE-MERE"],0);
directional05(105,9,["ERPE-MERE","BURST"],Math.PI);

const parkedCars05=[];
function parkCar05(x,z,heading,color){
  const c=createCar(color);decorateCar04(c,40+parkedCars05.length);c.position.set(x,0,z);c.userData.heading=heading;c.rotation.y=heading;scene.add(c);parkedCars05.push(c);
}
const parkColors05=[0x272c31,0x8a8e90,0x314e68,0x7b3e35,0xd0d0ca];
for(let x=-145,i=0;x<145;x+=31,i++){
  if(Math.abs(x+78)<18||Math.abs(x-86)<18)continue;
  parkCar05(x,13.1,Math.PI/2,parkColors05[i%parkColors05.length]);
  parkCar05(x+13,-13.1,-Math.PI/2,parkColors05[(i+2)%parkColors05.length]);
}

function addBollards05(x,z,count=6,axis="x"){
  const bm=new THREE.MeshStandardMaterial({color:0xd7d6cf,roughness:.75});
  for(let i=0;i<count;i++){
    const b=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,.85,8),bm);
    b.position.set(x+(axis==="x"?i*1.5:0),.43,z+(axis==="z"?i*1.5:0));b.castShadow=true;scene.add(b);
    const black=meshBox(.24,.12,.24,new THREE.MeshStandardMaterial({color:0x202224}),b.position.x,.62,b.position.z);scene.add(black);
  }
}
addBollards05(-121,-58,8,"x");addBollards05(61,-48,7,"z");

function updateWetRoad05(){
  const wet=.55+.35*v04.rainIntensity;
  mat.road.roughness=1-wet*.62;
  mat.road.metalness=.08+wet*.12;
  puddleMat04.opacity=.28+.38*v04.rainIntensity;
}

let v05Last=performance.now();
function v05Loop(now){
  if(!running){v05Last=now;return}
  const dt=Math.min((now-v05Last)/1000,.04);v05Last=now;
  v04.rainIntensity=.58+.28*(Math.sin(now/26000)*.5+.5);
  rain.material.opacity=.32+.48*v04.rainIntensity;
  updateWetRoad05();
}


// ===== DENDER COUNTY 0.6 — PRODUCTION GLB ASSET PIPELINE =====
window.__DENDER_VERSION__="0.6";
const assetManager06={
  loader:null,
  draco:null,
  cache:new Map(),
  status:new Map(),
  init(){
    this.draco=new DRACOLoader();
    this.draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/");
    this.loader=new GLTFLoader();
    this.loader.setDRACOLoader(this.draco);
  },
  async loadGLB(id,url){
    if(this.cache.has(id))return this.cache.get(id);
    this.status.set(id,"loading");
    try{
      const gltf=await this.loader.loadAsync(url);
      gltf.scene.traverse(o=>{
        if(o.isMesh){
          o.castShadow=true;o.receiveShadow=true;
          if(o.material){
            const mats=Array.isArray(o.material)?o.material:[o.material];
            mats.forEach(m=>{
              if("envMapIntensity" in m)m.envMapIntensity=1.25;
              m.needsUpdate=true;
            });
          }
        }
      });
      this.cache.set(id,gltf);this.status.set(id,"ready");return gltf;
    }catch(err){
      console.warn("Asset load failed",id,err);
      this.status.set(id,"failed");return null;
    }
  }
};
assetManager06.init();

const ASSETS06={
  heroCar:{
    id:"khronos-toycar-cc0",
    url:"https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@c6a6bd13ab2b3c685c7903d03561b8a9392f38b8/Models/ToyCar/glTF-Binary/ToyCar.glb",
    license:"CC0-1.0",
    credit:"Guido Odendahl / Eric Chadwick, Khronos glTF Sample Assets"
  }
};

function fitModel06(model,targetSize=4.35){
  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const max=Math.max(size.x,size.y,size.z)||1;
  const scale=targetSize/max;
  model.scale.setScalar(scale);
  box.setFromObject(model);
  const center=box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  box.setFromObject(model);
  model.position.y-=box.min.y;
  return model;
}

function hidePrimitiveCarShell06(car){
  for(const ch of car.children){
    if(!ch.userData.asset06 && ch.isMesh){
      ch.visible=false;
    }
  }
}

async function installHeroCarAsset06(){
  const gltf=await assetManager06.loadGLB(ASSETS06.heroCar.id,ASSETS06.heroCar.url);
  if(!gltf)return;
  const visual=fitModel06(gltf.scene.clone(true),4.45);
  visual.userData.asset06=true;
  visual.rotation.y=Math.PI;
  heroCar.add(visual);
  hidePrimitiveCarShell06(heroCar);
  // Preserve gameplay lights and externally added world helpers.
  heroCar.userData.productionVisual=visual;
  toast("HD 3D-voertuig geladen");
}
installHeroCarAsset06();

async function installTrafficAssetClones06(){
  const gltf=await assetManager06.loadGLB(ASSETS06.heroCar.id,ASSETS06.heroCar.url);
  if(!gltf)return;
  traffic.slice(0,6).forEach((car,i)=>{
    const visual=fitModel06(gltf.scene.clone(true),4.15);
    visual.userData.asset06=true;visual.rotation.y=Math.PI;
    const tint=[0xffffff,0xc7d4df,0xe3b2a7,0xa8b597,0xb8b8bb,0x9daec4][i];
    visual.traverse(o=>{
      if(o.isMesh&&o.material){
        o.material=o.material.clone();
        if(o.material.color)o.material.color.multiply(new THREE.Color(tint));
      }
    });
    car.add(visual);hidePrimitiveCarShell06(car);car.userData.productionVisual=visual;
  });
}
installTrafficAssetClones06();

function assetDebug06(){
  return [...assetManager06.status.entries()].map(([k,v])=>k+":"+v).join(" • ");
}


// ===== DENDER COUNTY 0.7 — RIGGED CHARACTER ASSET PIPELINE =====
window.__DENDER_VERSION__="0.7";
ASSETS06.player={
  id:"khronos-riggedfigure-ccby4",
  url:"https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@c6a6bd13ab2b3c685c7903d03561b8a9392f38b8/Models/RiggedFigure/glTF-Binary/RiggedFigure.glb",
  license:"CC-BY-4.0",
  credit:"© 2017 Cesium — Khronos glTF Sample Assets"
};

let playerMixer07=null;
let playerAction07=null;

function fitModelHeight07(model,targetHeight=2.9){
  let box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const scale=targetHeight/(size.y||1);
  model.scale.setScalar(scale);
  box=new THREE.Box3().setFromObject(model);
  const center=box.getCenter(new THREE.Vector3());
  model.position.x-=center.x;
  model.position.z-=center.z;
  model.position.y-=box.min.y;
  return model;
}

function hidePrimitiveHuman07(g){
  for(const ch of g.children){
    if(ch.userData.asset07)continue;
    if(ch.isMesh)ch.visible=false;
  }
}

async function installPlayerAsset07(){
  const gltf=await assetManager06.loadGLB(ASSETS06.player.id,ASSETS06.player.url);
  if(!gltf)return;
  const visual=fitModelHeight07(gltf.scene,2.9);
  visual.userData.asset07=true;
  visual.rotation.y=Math.PI;
  player.add(visual);
  hidePrimitiveHuman07(player);
  player.userData.productionVisual07=visual;

  if(gltf.animations&&gltf.animations.length){
    playerMixer07=new THREE.AnimationMixer(visual);
    playerAction07=playerMixer07.clipAction(gltf.animations[0]);
    playerAction07.play();
  }
  toast("Rigged 3D-personage geladen");
}
installPlayerAsset07();

let v07Prev=performance.now();
function v07Loop(now){
  const dt=Math.min((now-v07Prev)/1000,.04);v07Prev=now;
  if(!running)return;
  if(playerMixer07){
    const moving=!inVehicle&&(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD);
    playerMixer07.timeScale=moving?(keys.ShiftLeft?1.45:1):.16;
    playerMixer07.update(dt);
  }
}


// ===== DENDER COUNTY 0.8 — FREE POLY HAVEN PBR / MODEL PIPELINE =====
window.__DENDER_VERSION__="0.8";

const textureLoader08=new THREE.TextureLoader();
function loadTex08(url,{srgb=false,repeat=[1,1]}={}){
  const t=textureLoader08.load(url);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(repeat[0],repeat[1]);
  if(srgb)t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  return t;
}

const PH08={
  asphalt:{
    diff:"https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/asphalt_01/asphalt_01_diff_1k.png",
    normal:"https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/asphalt_01/asphalt_01_nor_gl_1k.png",
    arm:"https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/asphalt_01/asphalt_01_arm_1k.png"
  },
  brick:{
    diff:"https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/brick_wall_07/brick_wall_07_diff_1k.png",
    normal:"https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/brick_wall_07/brick_wall_07_nor_gl_1k.png",
    arm:"https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/brick_wall_07/brick_wall_07_arm_1k.png"
  },
  coveredCar:{
    gltf:"https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/covered_car/covered_car_1k.gltf"
  }
};

function applyPolyHavenPBR08(){
  const aDiff=loadTex08(PH08.asphalt.diff,{srgb:true,repeat:[18,3]});
  const aNorm=loadTex08(PH08.asphalt.normal,{repeat:[18,3]});
  const aArm=loadTex08(PH08.asphalt.arm,{repeat:[18,3]});
  mat.road.map=aDiff;
  mat.road.normalMap=aNorm;
  mat.road.roughnessMap=aArm;
  mat.road.metalnessMap=aArm;
  mat.road.normalScale.set(.65,.65);
  mat.road.color.set(0xffffff);
  mat.road.roughness=.92;
  mat.road.metalness=.02;
  mat.road.needsUpdate=true;

  const bDiff=loadTex08(PH08.brick.diff,{srgb:true,repeat:[3,2]});
  const bNorm=loadTex08(PH08.brick.normal,{repeat:[3,2]});
  const bArm=loadTex08(PH08.brick.arm,{repeat:[3,2]});
  mat.brick.forEach((m,i)=>{
    m.map=bDiff.clone();m.map.needsUpdate=true;
    m.normalMap=bNorm.clone();m.normalMap.needsUpdate=true;
    m.roughnessMap=bArm.clone();m.roughnessMap.needsUpdate=true;
    m.metalnessMap=bArm.clone();m.metalnessMap.needsUpdate=true;
    m.normalScale.set(.45,.45);
    m.color.set([0xe4d1c5,0xd5c0b6,0xc5aa9f,0xe0c9bc,0xbda69d][i%5]);
    m.roughness=.9;m.metalness=.0;m.needsUpdate=true;
  });
}
applyPolyHavenPBR08();

async function installCoveredCar08(){
  try{
    const gltf=await assetManager06.loadGLB(ASSETS06.heroCar.id,ASSETS06.heroCar.url);
    if(!gltf)throw new Error("parked vehicle asset unavailable");
    const model=gltf.scene.clone(true);
    model.traverse(o=>{
      if(o.isMesh){
        o.castShadow=true;o.receiveShadow=true;
        if(o.material)o.material=o.material.clone();
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.filter(Boolean).forEach(m=>{if("envMapIntensity" in m)m.envMapIntensity=1.15;});
      }
    });
    fitModel06(model,4.15);
    model.position.set(68,0,-63);
    model.rotation.y=-Math.PI*.18;
    scene.add(model);

    const second=model.clone(true);
    second.position.set(-132,0,28);
    second.rotation.y=Math.PI*.58;
    second.scale.multiplyScalar(.96);
    scene.add(second);

    toast("Gevalideerde CC0 parkeerassets geladen");
  }catch(err){
    console.warn("Parked vehicle fallback",err);
  }
}
installCoveredCar08();

const polyHavenBadge08=document.createElement("div");
polyHavenBadge08.textContent="PBR & environment assets: Poly Haven • CC0";
polyHavenBadge08.style.cssText="position:fixed;right:14px;top:48px;z-index:11;font:600 10px system-ui;color:#d5d9df;background:rgba(8,10,14,.55);padding:5px 8px;border-radius:4px;pointer-events:none";
document.body.appendChild(polyHavenBadge08);


// ===== DENDER COUNTY 0.9 — REAL BURST / OFFICIAL WEGENREGISTER 1:1 PILOT =====
window.__DENDER_VERSION__="0.9";
const GEO09={
  active:false,
  origin:{lat:50.91365,lon:3.92037},
  bbox:{south:50.895,west:3.895,north:50.932,east:3.947},
  metersLat:111320,
  metersLon:111320*Math.cos(50.91365*Math.PI/180),
  group:new THREE.Group(),
  segments:[],
  boundaries:null,
  currentStreet:"",
  missionIndex:0,
  missionTargets:[],
  station:null,
  lastStreetCheck:0
};
GEO09.group.userData.realGeo09=true;
scene.add(GEO09.group);

function geoToLocal09(coord){
  return new THREE.Vector3(
    (coord[0]-GEO09.origin.lon)*GEO09.metersLon,
    0,
    -(coord[1]-GEO09.origin.lat)*GEO09.metersLat
  );
}
function localToGeo09(pos){
  return [
    GEO09.origin.lon+pos.x/GEO09.metersLon,
    GEO09.origin.lat-pos.z/GEO09.metersLat
  ];
}
function widthForRoad09(p){
  const s=((p.road_class||"")+" "+(p.road_category||"")).toLowerCase();
  if(s.includes("autosnel")||s.includes("hoofdweg"))return 11;
  if(s.includes("gescheiden rijban"))return 8;
  if(s.includes("verkeersplein"))return 7;
  if(s.includes("wandel")||s.includes("fietsweg"))return 2.2;
  if(s.includes("lokale")||s.includes("één rijbaan")||s.includes("een rijbaan"))return 5.6;
  return 4.8;
}
function linesFromGeometry09(g){
  if(!g)return [];
  if(g.type==="LineString")return [g.coordinates];
  if(g.type==="MultiLineString")return g.coordinates;
  return [];
}
function makeInstancedSegments09(items,material){
  if(!items.length)return;
  const geo=new THREE.BoxGeometry(1,1,1);
  const mesh=new THREE.InstancedMesh(geo,material,items.length);
  mesh.receiveShadow=true;
  const pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3(),mat4=new THREE.Matrix4();
  const yAxis=new THREE.Vector3(0,1,0);
  items.forEach((s,i)=>{
    const dx=s.x2-s.x1,dz=s.z2-s.z1,len=Math.hypot(dx,dz);
    pos.set((s.x1+s.x2)/2,.08,(s.z1+s.z2)/2);
    quat.setFromAxisAngle(yAxis,Math.atan2(dx,dz));
    scale.set(s.width,.12,len+.35);
    mat4.compose(pos,quat,scale);mesh.setMatrixAt(i,mat4);
  });
  mesh.instanceMatrix.needsUpdate=true;
  GEO09.group.add(mesh);
}
function buildRealRoads09(fc){
  const buckets=new Map();
  const railSegments=[];
  const stationFeature=(fc.features||[]).find(f=>f.properties?.kind==="station");
  if(stationFeature)GEO09.station=geoToLocal09(stationFeature.geometry.coordinates);

  for(const ft of fc.features||[]){
    const p=ft.properties||{};
    if(p.kind==="road"){
      const width=widthForRoad09(p);
      const bucket=width<=2.3?2.2:width<=5?4.8:width<=6?5.6:width<=8?8:11;
      if(!buckets.has(bucket))buckets.set(bucket,[]);
      for(const line of linesFromGeometry09(ft.geometry)){
        for(let i=1;i<line.length;i++){
          const a=geoToLocal09(line[i-1]),b=geoToLocal09(line[i]);
          const seg={x1:a.x,z1:a.z,x2:b.x,z2:b.z,width,name:p.name||"",props:p};
          buckets.get(bucket).push(seg);GEO09.segments.push(seg);
        }
      }
    }else if(p.kind==="railway"){
      for(const line of linesFromGeometry09(ft.geometry)){
        for(let i=1;i<line.length;i++){
          const a=geoToLocal09(line[i-1]),b=geoToLocal09(line[i]);
          railSegments.push({x1:a.x,z1:a.z,x2:b.x,z2:b.z,width:1.8,name:p.name||"Spoorlijn",props:p});
        }
      }
    }
  }
  const roadMaterial=mat.road.clone();roadMaterial.color.set(0xffffff);roadMaterial.roughness=.86;
  for(const [width,items] of buckets){
    const m=roadMaterial.clone();
    if(width<=2.3)m.color.set(0x6e6e69);
    makeInstancedSegments09(items,m);
  }
  const railMat=new THREE.MeshStandardMaterial({color:0x3d3d3d,metalness:.48,roughness:.55});
  makeInstancedSegments09(railSegments,railMat);

  const west=geoToLocal09([GEO09.bbox.west,GEO09.origin.lat]).x;
  const east=geoToLocal09([GEO09.bbox.east,GEO09.origin.lat]).x;
  const north=geoToLocal09([GEO09.origin.lon,GEO09.bbox.north]).z;
  const south=geoToLocal09([GEO09.origin.lon,GEO09.bbox.south]).z;
  GEO09.bounds={minX:Math.min(west,east),maxX:Math.max(west,east),minZ:Math.min(north,south),maxZ:Math.max(north,south)};

  const groundW=GEO09.bounds.maxX-GEO09.bounds.minX+300;
  const groundH=GEO09.bounds.maxZ-GEO09.bounds.minZ+300;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(groundW,groundH),mat.grass.clone());
  ground.rotation.x=-Math.PI/2;ground.position.set((GEO09.bounds.minX+GEO09.bounds.maxX)/2,-.02,(GEO09.bounds.minZ+GEO09.bounds.maxZ)/2);
  ground.receiveShadow=true;GEO09.group.add(ground);
}
function hideLegacyWorld09(){
  world.visible=false;
  const keep=new Set([camera,hemi,sun,player,heroCar,police,rain,GEO09.group]);
  for(const ch of scene.children){
    if(keep.has(ch)||ch.userData?.realGeo09)continue;
    ch.visible=false;
  }
  traffic.forEach(x=>x.visible=false);
  pedestrians.forEach(x=>x.visible=false);
  marker.visible=true;
  buildingBoxes.length=0;
}
function pointSegDistSq09(px,pz,s){
  const vx=s.x2-s.x1,vz=s.z2-s.z1,wx=px-s.x1,wz=pz-s.z1;
  const vv=vx*vx+vz*vz||1;
  const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/vv));
  const dx=px-(s.x1+t*vx),dz=pz-(s.z1+t*vz);
  return dx*dx+dz*dz;
}
function nearestStreet09(pos){
  let best="",bd=Infinity;
  for(const s of GEO09.segments){
    if(!s.name)continue;
    const d=pointSegDistSq09(pos.x,pos.z,s);
    if(d<bd){bd=d;best=s.name}
  }
  return {name:best,dist:Math.sqrt(bd)};
}
function pointInRing09(lon,lat,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    const hit=((yi>lat)!=(yj>lat))&&(lon<(xj-xi)*(lat-yi)/(yj-yi+1e-15)+xi);
    if(hit)inside=!inside;
  }
  return inside;
}
function inBoundary09(name,pos){
  if(!GEO09.boundaries)return false;
  const [lon,lat]=localToGeo09(pos);
  const ft=GEO09.boundaries.features.find(f=>(f.properties?.display_name||"").startsWith(name+","));
  const g=ft?.geometry;if(!g)return false;
  if(g.type==="Polygon")return pointInRing09(lon,lat,g.coordinates[0]);
  if(g.type==="MultiPolygon")return g.coordinates.some(p=>pointInRing09(lon,lat,p[0]));
  return false;
}
function realDistrict09(pos){
  if(inBoundary09("Burst",pos))return "BURST • ERPE-MERE";
  if(inBoundary09("Erpe-Mere",pos))return "ERPE-MERE";
  return "OOST-VLAANDEREN";
}
function roadTargetByName09(name){
  const s=GEO09.segments.find(x=>x.name===name);
  return s?new THREE.Vector3((s.x1+s.x2)/2,0,(s.z1+s.z2)/2):null;
}
function setupRealMissions09(){
  const names=["Stationsplein","Burstdorp","Stationsstraat","Ninovestraat"];
  GEO09.missionTargets=names.map(n=>({name:n,pos:roadTargetByName09(n)})).filter(x=>x.pos);
  GEO09.missionIndex=0;
}
function updateRealMissionUI09(){
  const t=GEO09.missionTargets[GEO09.missionIndex];
  document.querySelector("#missionTitle").textContent="REAL-WORLD BURST";
  document.querySelector("#missionText").textContent=t
    ? "Rij via het echte wegennet naar "+t.name+"."
    : "Vrije verkenning op officiële Burst-geometrie.";
}
function updateMission09(){
  const t=GEO09.missionTargets[GEO09.missionIndex];
  if(!t){marker.visible=false;return}
  marker.visible=true;marker.position.set(t.pos.x,.22,t.pos.z);
  const actor=inVehicle?heroCar.position:player.position;
  if(actor.distanceTo(t.pos)<12){
    toast(t.name+" bereikt");
    GEO09.missionIndex++;
    updateRealMissionUI09();
  }
}
function movePlayer09(dt){
  const forward=new THREE.Vector3(Math.sin(camYaw),0,-Math.cos(camYaw));
  const right=new THREE.Vector3(Math.cos(camYaw),0,Math.sin(camYaw));
  tempV.set(0,0,0);
  if(keys.KeyW)tempV.add(forward);if(keys.KeyS)tempV.sub(forward);if(keys.KeyD)tempV.add(right);if(keys.KeyA)tempV.sub(right);
  if(tempV.lengthSq()>0){
    tempV.normalize();player.position.addScaledVector(tempV,(keys.ShiftLeft?8.3:4.7)*dt);player.rotation.y=Math.atan2(tempV.x,tempV.z);
  }
  if(GEO09.bounds){
    player.position.x=THREE.MathUtils.clamp(player.position.x,GEO09.bounds.minX,GEO09.bounds.maxX);
    player.position.z=THREE.MathUtils.clamp(player.position.z,GEO09.bounds.minZ,GEO09.bounds.maxZ);
  }
}
function driveHero09(dt){
  const car=heroCar,throttle=keys.KeyW?1:0,brake=keys.KeyS?1:0,handbrake=keys.Space?1:0;
  if(throttle)car.userData.speed+=13.5*dt;
  if(brake){if(car.userData.speed>1)car.userData.speed-=22*dt;else car.userData.speed-=8*dt}
  if(!throttle&&!brake)car.userData.speed*=Math.pow(.62,dt);
  if(handbrake)car.userData.speed*=Math.pow(.055,dt);
  car.userData.speed=THREE.MathUtils.clamp(car.userData.speed,-9,31);
  const steer=(keys.KeyA?1:0)-(keys.KeyD?1:0),sa=Math.abs(car.userData.speed);
  if(sa>.25)car.userData.heading+=steer*dt*(car.userData.speed>=0?1:-1)*THREE.MathUtils.lerp(1.7,.72,Math.min(sa/30,1));
  if(handbrake&&sa>7)car.userData.heading+=steer*dt*1.1;
  car.rotation.y=car.userData.heading;
  car.position.x+=Math.sin(car.userData.heading)*car.userData.speed*dt;
  car.position.z+=Math.cos(car.userData.heading)*car.userData.speed*dt;
  if(GEO09.bounds){
    car.position.x=THREE.MathUtils.clamp(car.position.x,GEO09.bounds.minX,GEO09.bounds.maxX);
    car.position.z=THREE.MathUtils.clamp(car.position.z,GEO09.bounds.minZ,GEO09.bounds.maxZ);
  }
  animateCar04(car,dt,steer,brake||handbrake);
}
function drawMap09(){
  const S=180,ctx09=ctx,radius=720,scale=S/(radius*2),actor=inVehicle?heroCar:player;
  ctx09.clearRect(0,0,S,S);ctx09.fillStyle="#111a15";ctx09.fillRect(0,0,S,S);
  ctx09.lineCap="round";
  for(const s of GEO09.segments){
    const x1=S/2+(s.x1-actor.position.x)*scale,z1=S/2+(s.z1-actor.position.z)*scale;
    const x2=S/2+(s.x2-actor.position.x)*scale,z2=S/2+(s.z2-actor.position.z)*scale;
    if((x1<0&&x2<0)||(x1>S&&x2>S)||(z1<0&&z2<0)||(z1>S&&z2>S))continue;
    ctx09.strokeStyle=s.width<=2.3?"#777a72":"#555b5e";
    ctx09.lineWidth=Math.max(1,s.width*scale);
    ctx09.beginPath();ctx09.moveTo(x1,z1);ctx09.lineTo(x2,z2);ctx09.stroke();
  }
  const t=GEO09.missionTargets[GEO09.missionIndex];
  if(t){
    const x=S/2+(t.pos.x-actor.position.x)*scale,z=S/2+(t.pos.z-actor.position.z)*scale;
    ctx09.fillStyle="#ffd36b";ctx09.beginPath();ctx09.arc(x,z,5,0,Math.PI*2);ctx09.fill();
  }
  ctx09.fillStyle="#fff";ctx09.beginPath();ctx09.arc(S/2,S/2,4,0,Math.PI*2);ctx09.fill();
}
function installGeoHUD09(){
  let street=document.querySelector("#streetName09");
  if(!street){
    street=document.createElement("div");street.id="streetName09";
    street.style.cssText="font-size:12px;color:#fff;margin-top:3px;font-weight:750;letter-spacing:.04em";
    document.querySelector("#clock").after(street);
  }
  let credit=document.querySelector("#geoCredit09");
  if(!credit){
    credit=document.createElement("div");credit.id="geoCredit09";
    credit.textContent="Wegen & gebouwen: © Digitaal Vlaanderen • spoor, plaatsen, water & groen: © OpenStreetMap contributors (ODbL)";
    credit.style.cssText="position:fixed;left:14px;bottom:8px;z-index:11;font:600 9px system-ui;color:#ccd1d6;background:rgba(8,10,14,.58);padding:4px 7px;border-radius:4px;pointer-events:none";
    document.body.appendChild(credit);
  }
}
async function activateRealBurst09(){
  try{
    const [fc,bounds]=await Promise.all([
      fetch("./geodata/burst_runtime.geojson?v=0.9").then(r=>{if(!r.ok)throw new Error("runtime geodata "+r.status);return r.json()}),
      fetch("./geodata/burst_boundaries.geojson?v=0.9").then(r=>{if(!r.ok)throw new Error("boundary geodata "+r.status);return r.json()})
    ]);
    GEO09.boundaries=bounds;
    buildRealRoads09(fc);
    setupRealMissions09();
    installGeoHUD09();
    hideLegacyWorld09();

    const spawn=GEO09.station||new THREE.Vector3(0,0,0);
    player.position.copy(spawn).add(new THREE.Vector3(5,0,5));
    heroCar.position.copy(spawn).add(new THREE.Vector3(12,0,4));
    heroCar.userData.speed=0;heroCar.userData.heading=0;heroCar.rotation.y=0;
    v02.playerPrev.copy(player.position);v02.carPrev.copy(heroCar.position);

    mission=999;wanted=0;police.visible=false;
    movePlayer=movePlayer09;driveHero=driveHero09;
    updateTraffic=()=>{};updatePeds=()=>{};
    updateMission=updateMission09;drawMap=drawMap09;
    districtName=realDistrict09;
    installCollisions=()=>{};
    GEO09.active=true;
    updateRealMissionUI09();
    toast("Echte Burst-geografie geladen • 1:1 schaal");
  }catch(err){
    console.error("Real Burst geography failed; legacy fallback stays active",err);
    toast("Geodata kon niet laden — fallbackwereld actief");
  }
}
activateRealBurst09();

let geoLoopPrev09=performance.now();
function geoLoop09(now){
  if(!running||!GEO09.active)return;
  if(now-GEO09.lastStreetCheck>300){
    GEO09.lastStreetCheck=now;
    const actor=inVehicle?heroCar.position:player.position;
    const n=nearestStreet09(actor);
    GEO09.currentStreet=n.dist<45?n.name:"";
    const el=document.querySelector("#streetName09");
    if(el)el.textContent=GEO09.currentStreet||"Onbenoemde/openbare weg";
  }
}


// ===== DENDER COUNTY 1.0 — FULL ERPE-MERE / OFFICIAL ROUTING GRAPH =====
window.__DENDER_VERSION__="1.0";
const GEO10={
  active:false,group:new THREE.Group(),origin:null,bbox:null,bounds:null,boundary:null,
  nodes:new Map(),adj:new Map(),edges:[],driveEdges:[],places:[],station:null,
  chunks:new Map(),chunkSize:800,lastStream:0,lastStreet:0,lastPoliceRoute:0,
  trafficAgents:[],policePath:[],policePathIndex:0,missionIndex:0,
  missionNames:["Burst","Mere","Erpe","Bambrugge","Erondegem","Ottergem","Aaigem","Vlekkem"],
  missionTargets:[]
};
GEO10.group.userData.realGeo09=true;
GEO10.group.userData.realGeo10=true;
scene.add(GEO10.group);

function geoToLocal10(coord){
  const lat=GEO10.origin.lat,mlat=111320,mlon=111320*Math.cos(lat*Math.PI/180);
  return new THREE.Vector3((coord[0]-GEO10.origin.lon)*mlon,0,-(coord[1]-GEO10.origin.lat)*mlat);
}
function localToGeo10(pos){
  const lat=GEO10.origin.lat,mlat=111320,mlon=111320*Math.cos(lat*Math.PI/180);
  return [GEO10.origin.lon+pos.x/mlon,GEO10.origin.lat-pos.z/mlat];
}
function lines10(g){
  if(!g)return[];
  if(g.type==="LineString")return[g.coordinates];
  if(g.type==="MultiLineString")return g.coordinates;
  return[];
}
function roadWidth10(p){
  const s=((p.road_class||"")+" "+(p.road_category||"")).toLowerCase();
  if(s.includes("autosnel"))return 12;
  if(s.includes("primaire")||s.includes("hoofdweg"))return 9;
  if(s.includes("secundaire"))return 7.5;
  if(s.includes("wandel")||s.includes("fietsweg"))return 2.2;
  if(s.includes("plaatselijke")||s.includes("lokale"))return 5.2;
  return 5.8;
}
function drivable10(p){
  const s=((p.road_class||"")+" "+(p.access||"")).toLowerCase();
  if(s.includes("wandel")||s.includes("fietsweg")||s.includes("niet toegankelijk voor andere voertuigen"))return false;
  return true;
}
function ensureNode10(id,pos){
  if(id==null)return null;
  const key=String(id);
  if(!GEO10.nodes.has(key))GEO10.nodes.set(key,{id:key,pos:pos.clone()});
  if(!GEO10.adj.has(key))GEO10.adj.set(key,[]);
  return key;
}
function pathLength10(points){
  let n=0;for(let i=1;i<points.length;i++)n+=points[i].distanceTo(points[i-1]);return n;
}
function chunkKey10(x,z){
  return Math.floor(x/GEO10.chunkSize)+":"+Math.floor(z/GEO10.chunkSize);
}
function addSegmentToChunk10(seg){
  const key=chunkKey10((seg.x1+seg.x2)/2,(seg.z1+seg.z2)/2);
  let c=GEO10.chunks.get(key);
  if(!c){c={key,group:new THREE.Group(),buckets:new Map(),x:(seg.x1+seg.x2)/2,z:(seg.z1+seg.z2)/2};c.group.userData.realGeo09=true;GEO10.group.add(c.group);GEO10.chunks.set(key,c)}
  const bucket=seg.width<=2.4?2.2:seg.width<=5.4?5.2:seg.width<=6.3?5.8:seg.width<=8?7.5:12;
  if(!c.buckets.has(bucket))c.buckets.set(bucket,[]);
  c.buckets.get(bucket).push(seg);
}
function finalizeChunks10(){
  const yAxis=new THREE.Vector3(0,1,0);
  for(const c of GEO10.chunks.values()){
    for(const [width,items] of c.buckets){
      const geo=new THREE.BoxGeometry(1,1,1);
      const m=mat.road.clone();
      if(width<=2.4){m.color.set(0x6d6d68);m.map=null;m.normalMap=null;m.roughnessMap=null;m.metalnessMap=null;m.needsUpdate=true}
      const inst=new THREE.InstancedMesh(geo,m,items.length);
      inst.receiveShadow=true;
      const p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),mx=new THREE.Matrix4();
      items.forEach((s,i)=>{
        const dx=s.x2-s.x1,dz=s.z2-s.z1,len=Math.hypot(dx,dz);
        p.set((s.x1+s.x2)/2,.08,(s.z1+s.z2)/2);
        q.setFromAxisAngle(yAxis,Math.atan2(dx,dz));
        sc.set(s.width,.12,len+.25);mx.compose(p,q,sc);inst.setMatrixAt(i,mx);
      });
      inst.instanceMatrix.needsUpdate=true;c.group.add(inst);
    }
  }
}
function buildGraph10(fc){
  for(const ft of fc.features||[]){
    const p=ft.properties||{};
    if(p.kind==="place"&&ft.geometry?.type==="Point"){
      GEO10.places.push({name:p.name||"Plaats",pos:geoToLocal10(ft.geometry.coordinates)});
      continue;
    }
    if(p.kind==="station"&&ft.geometry?.type==="Point"){
      const pt=geoToLocal10(ft.geometry.coordinates);
      if((p.name||"").toLowerCase().includes("burst"))GEO10.station=pt;
      continue;
    }
    if(p.kind==="railway"){
      for(const line of lines10(ft.geometry)){
        for(let i=1;i<line.length;i++){
          const a=geoToLocal10(line[i-1]),b=geoToLocal10(line[i]);
          const rail=meshBox(1.6,.12,a.distanceTo(b),new THREE.MeshStandardMaterial({color:0x3d3d3d,metalness:.5,roughness:.55}),0,.1,0);
          rail.position.set((a.x+b.x)/2,.09,(a.z+b.z)/2);rail.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);
          rail.userData.realGeo09=true;GEO10.group.add(rail);
        }
      }continue;
    }
    if(p.kind!=="road")continue;
    for(const line of lines10(ft.geometry)){
      if(line.length<2)continue;
      const pts=line.map(geoToLocal10);
      const aKey=ensureNode10(p.begin_node,pts[0]);
      const bKey=ensureNode10(p.end_node,pts[pts.length-1]);
      const edge={a:aKey,b:bKey,points:pts,name:p.name||"",props:p,width:roadWidth10(p),drive:drivable10(p),length:pathLength10(pts)};
      GEO10.edges.push(edge);if(edge.drive)GEO10.driveEdges.push(edge);
      if(aKey&&bKey){
        GEO10.adj.get(aKey).push({to:bKey,edge,points:pts});
        GEO10.adj.get(bKey).push({to:aKey,edge,points:[...pts].reverse()});
      }
      for(let i=1;i<pts.length;i++)addSegmentToChunk10({x1:pts[i-1].x,z1:pts[i-1].z,x2:pts[i].x,z2:pts[i].z,width:edge.width,name:edge.name,edge});
    }
  }
  finalizeChunks10();
}
function setupBounds10(){
  const west=geoToLocal10([GEO10.bbox.west,GEO10.origin.lat]).x,east=geoToLocal10([GEO10.bbox.east,GEO10.origin.lat]).x;
  const north=geoToLocal10([GEO10.origin.lon,GEO10.bbox.north]).z,south=geoToLocal10([GEO10.origin.lon,GEO10.bbox.south]).z;
  GEO10.bounds={minX:Math.min(west,east),maxX:Math.max(west,east),minZ:Math.min(north,south),maxZ:Math.max(north,south)};
  const w=GEO10.bounds.maxX-GEO10.bounds.minX+500,h=GEO10.bounds.maxZ-GEO10.bounds.minZ+500;
  const g=new THREE.Mesh(new THREE.PlaneGeometry(w,h),mat.grass.clone());g.rotation.x=-Math.PI/2;g.position.y=-.03;g.receiveShadow=true;g.userData.realGeo09=true;GEO10.group.add(g);
}
function nearestNode10(pos,driveOnly=false){
  let best=null,bd=Infinity;
  const source=driveOnly?GEO10.driveEdges:GEO10.edges;
  const seen=new Set();
  for(const e of source){
    for(const id of [e.a,e.b]){
      if(!id||seen.has(id))continue;seen.add(id);
      const n=GEO10.nodes.get(id);if(!n)continue;
      const d=n.pos.distanceToSquared(pos);if(d<bd){bd=d;best=id}
    }
  }
  return best;
}
function nearestStreet10(pos){
  let best="",bd=Infinity;
  for(const e of GEO10.edges){
    if(!e.name)continue;
    for(let i=1;i<e.points.length;i++){
      const s={x1:e.points[i-1].x,z1:e.points[i-1].z,x2:e.points[i].x,z2:e.points[i].z};
      const d=pointSegDistSq09(pos.x,pos.z,s);if(d<bd){bd=d;best=e.name}
    }
  }
  return{name:best,dist:Math.sqrt(bd)};
}
function nearestPlace10(pos){
  let best=null,bd=Infinity;
  for(const p of GEO10.places){const d=p.pos.distanceToSquared(pos);if(d<bd){bd=d;best=p}}
  return best;
}
function stream10(actor){
  for(const c of GEO10.chunks.values()){
    const dx=c.x-actor.x,dz=c.z-actor.z;
    c.group.visible=(dx*dx+dz*dz)<2600*2600;
  }
}
function chooseNext10(nodeId,prevId=null){
  const opts=(GEO10.adj.get(nodeId)||[]).filter(x=>x.edge.drive&&x.to!==prevId);
  if(!opts.length)return (GEO10.adj.get(nodeId)||[]).find(x=>x.edge.drive)||null;
  return opts[Math.floor(rnd()*opts.length)];
}
function setupTraffic10(){
  GEO10.trafficAgents.length=0;
  const usable=GEO10.driveEdges.filter(e=>e.a&&e.b&&e.length>15);
  traffic.forEach((car,i)=>{
    if(i>=14){car.visible=false;return}
    const e=usable[Math.floor((i/14)*usable.length)%usable.length]||usable[i%usable.length];
    if(!e)return;
    car.visible=true;const start=i%2?e.a:e.b,end=i%2?e.b:e.a;
    const entry=(GEO10.adj.get(start)||[]).find(x=>x.to===end&&x.edge===e);
    if(!entry)return;
    car.position.copy(entry.points[0]);car.position.y=0;
    car.userData.speed=7+(i%5)*.8;
    GEO10.trafficAgents.push({car,node:start,prev:null,next:end,entry,pts:entry.points,index:1});
  });
}
function updateTraffic10(dt){
  for(const a of GEO10.trafficAgents){
    if(!a.pts||a.index>=a.pts.length){
      const next=chooseNext10(a.next,a.node);
      if(!next){a.car.userData.speed=0;continue}
      a.prev=a.node;a.node=a.next;a.next=next.to;a.entry=next;a.pts=next.points;a.index=1;
    }
    const target=a.pts[a.index];if(!target)continue;
    const dir=target.clone().sub(a.car.position);dir.y=0;const dist=dir.length();
    const speed=a.car.userData.speed||8;
    if(dist<1.4){a.index++;continue}
    dir.normalize();a.car.position.addScaledVector(dir,Math.min(dist,speed*dt));
    a.car.rotation.y=Math.atan2(dir.x,dir.z);animateCar04(a.car,dt,0,false);
  }
}
class MinHeap10{
  constructor(){this.a=[]}
  push(x){this.a.push(x);let i=this.a.length-1;while(i){let p=(i-1)>>1;if(this.a[p][0]<=x[0])break;this.a[i]=this.a[p];i=p}this.a[i]=x}
  pop(){if(!this.a.length)return null;const root=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(true){let l=i*2+1,r=l+1;if(l>=this.a.length)break;let c=r<this.a.length&&this.a[r][0]<this.a[l][0]?r:l;if(this.a[c][0]>=last[0])break;this.a[i]=this.a[c];i=c}this.a[i]=last}return root}
  get length(){return this.a.length}
}
function route10(start,goal){
  if(!start||!goal)return[];
  const pq=new MinHeap10(),dist=new Map([[start,0]]),prev=new Map();pq.push([0,start]);
  while(pq.length){
    const [d,u]=pq.pop();if(u===goal)break;if(d!==(dist.get(u)??Infinity))continue;
    for(const x of GEO10.adj.get(u)||[]){if(!x.edge.drive)continue;const nd=d+x.edge.length;if(nd<(dist.get(x.to)??Infinity)){dist.set(x.to,nd);prev.set(x.to,u);pq.push([nd,x.to])}}
  }
  if(!dist.has(goal))return[];
  const out=[];let u=goal;while(u){out.push(u);if(u===start)break;u=prev.get(u)}return out.reverse();
}
function updatePolice10(dt,elapsed){
  if(wanted<=0){police.visible=false;blueLight.intensity=redLight.intensity=0;return}
  police.visible=true;const target=inVehicle?heroCar.position:player.position;
  if(!police.userData.spawned10){
    const near=nearestNode10(target,true),n=GEO10.nodes.get(near);
    police.position.copy(n?n.pos:target).add(new THREE.Vector3(30,0,30));police.userData.spawned10=true;
  }
  if(performance.now()-GEO10.lastPoliceRoute>1800||GEO10.policePathIndex>=GEO10.policePath.length){
    GEO10.lastPoliceRoute=performance.now();
    const s=nearestNode10(police.position,true),g=nearestNode10(target,true);
    GEO10.policePath=route10(s,g).map(id=>GEO10.nodes.get(id)?.pos.clone()).filter(Boolean);GEO10.policePathIndex=0;
  }
  const p=GEO10.policePath[GEO10.policePathIndex];
  if(p){
    tempV.copy(p).sub(police.position);tempV.y=0;
    if(tempV.length()<2.5)GEO10.policePathIndex++;
    else{tempV.normalize();police.position.addScaledVector(tempV,(11+wanted*1.7)*dt);police.rotation.y=Math.atan2(tempV.x,tempV.z)}
  }
  const flash=Math.sin(elapsed*13)>0;blueLight.intensity=flash?8:0;redLight.intensity=flash?0:8;
  if(police.position.distanceTo(target)<5){wanted=Math.max(0,wanted-1);toast("Politie heeft contact gemaakt");GEO10.lastPoliceRoute=0}
  wantedCooldown-=dt;if(wantedCooldown<=0)wanted=Math.max(0,wanted-dt*.045);
}
function setupMissions10(){
  GEO10.missionTargets=GEO10.missionNames.map(n=>{
    const p=GEO10.places.find(x=>x.name===n);return p?{name:n,pos:p.pos.clone()}:null
  }).filter(Boolean);GEO10.missionIndex=0;
}
function updateMission10(){
  const t=GEO10.missionTargets[GEO10.missionIndex];
  const title=document.querySelector("#missionTitle"),txt=document.querySelector("#missionText");
  if(!t){marker.visible=false;title.textContent="ERPE-MERE ONTGRENDELD";txt.textContent="Vrije verkenning op het officiële wegennet.";return}
  marker.visible=true;marker.position.set(t.pos.x,.2,t.pos.z);
  title.textContent="RONDE VAN ERPE-MERE";
  txt.textContent="Bereik "+t.name+" via het echte wegennet • "+(GEO10.missionIndex+1)+"/"+GEO10.missionTargets.length;
  const actor=inVehicle?heroCar.position:player.position;
  if(actor.distanceTo(t.pos)<70){toast(t.name+" bereikt");GEO10.missionIndex++}
}
function district10(pos){
  const p=nearestPlace10(pos);return p?(p.name.toUpperCase()+" • ERPE-MERE"):"ERPE-MERE";
}
function drawMap10(){
  const S=180,actor=inVehicle?heroCar:player,radius=900,sc=S/(radius*2);
  ctx.clearRect(0,0,S,S);ctx.fillStyle="#111a15";ctx.fillRect(0,0,S,S);ctx.lineCap="round";
  for(const e of GEO10.edges){
    for(let i=1;i<e.points.length;i++){
      const a=e.points[i-1],b=e.points[i];
      const x1=S/2+(a.x-actor.x)*sc,z1=S/2+(a.z-actor.z)*sc,x2=S/2+(b.x-actor.x)*sc,z2=S/2+(b.z-actor.z)*sc;
      if((x1<0&&x2<0)||(x1>S&&x2>S)||(z1<0&&z2<0)||(z1>S&&z2>S))continue;
      ctx.strokeStyle=e.drive?"#5d6467":"#777a72";ctx.lineWidth=Math.max(1,e.width*sc);
      ctx.beginPath();ctx.moveTo(x1,z1);ctx.lineTo(x2,z2);ctx.stroke();
    }
  }
  const t=GEO10.missionTargets[GEO10.missionIndex];
  if(t){const x=S/2+(t.pos.x-actor.x)*sc,z=S/2+(t.pos.z-actor.z)*sc;ctx.fillStyle="#ffd36b";ctx.beginPath();ctx.arc(x,z,5,0,Math.PI*2);ctx.fill()}
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(S/2,S/2,4,0,Math.PI*2);ctx.fill();
}
function clampActor10(obj){
  if(!GEO10.bounds)return;
  obj.position.x=THREE.MathUtils.clamp(obj.position.x,GEO10.bounds.minX,GEO10.bounds.maxX);
  obj.position.z=THREE.MathUtils.clamp(obj.position.z,GEO10.bounds.minZ,GEO10.bounds.maxZ);
}
function movePlayer10(dt){movePlayer09(dt);clampActor10(player)}
function driveHero10(dt){driveHero09(dt);clampActor10(heroCar)}
async function activateErpeMere10(){
  try{
    const [fc,meta,bounds]=await Promise.all([
      fetch("./geodata/erpe_mere_runtime.geojson?v=1.0").then(r=>{if(!r.ok)throw new Error("Erpe-Mere runtime "+r.status);return r.json()}),
      fetch("./geodata/erpe_mere_meta.json?v=1.0").then(r=>r.json()),
      fetch("./geodata/erpe_mere_boundaries.geojson?v=1.0").then(r=>r.json())
    ]);
    GEO10.origin=meta.center_wgs84;GEO10.bbox=meta.bbox_wgs84;GEO10.boundary=bounds;
    buildGraph10(fc);setupBounds10();setupTraffic10();setupMissions10();
    GEO09.active=false;GEO09.group.visible=false;GEO10.active=true;
    scene.fog.density=.00055;camera.far=3200;camera.updateProjectionMatrix();
    hideLegacyWorld09();GEO10.group.visible=true;
    const spawn=GEO10.station||GEO10.places.find(p=>p.name==="Burst")?.pos||new THREE.Vector3();
    player.position.copy(spawn).add(new THREE.Vector3(5,0,5));heroCar.position.copy(spawn).add(new THREE.Vector3(13,0,3));
    heroCar.userData.speed=0;heroCar.userData.heading=0;heroCar.rotation.y=0;player.visible=!inVehicle;
    v02.playerPrev.copy(player.position);v02.carPrev.copy(heroCar.position);
    movePlayer=movePlayer10;driveHero=driveHero10;updateTraffic=updateTraffic10;updatePeds=()=>{};
    updatePolice=updatePolice10;updateMission=updateMission10;drawMap=drawMap10;districtName=district10;installCollisions=()=>{};
    mission=1000;wanted=0;police.visible=false;police.userData.spawned10=false;
    installGeoHUD09();
    toast("Heel Erpe-Mere geladen • officiële wegen • 1:1");
  }catch(err){console.error("Erpe-Mere 1.0 activation failed",err);toast("Erpe-Mere kon niet laden — Burst fallback blijft actief")}
}
setTimeout(activateErpeMere10,250);

function geoLoop10(now){
  if(!running||!GEO10.active)return;
  const actor=inVehicle?heroCar.position:player.position;
  if(now-GEO10.lastStream>450){GEO10.lastStream=now;stream10(actor);sun.position.set(actor.x+80,120,actor.z+30)}
  if(now-GEO10.lastStreet>320){
    GEO10.lastStreet=now;const n=nearestStreet10(actor),el=document.querySelector("#streetName09");
    if(el)el.textContent=n.dist<55&&n.name?n.name:"Onbenoemde/openbare weg";
  }
}


// ===== DENDER COUNTY 2.0 — INTEGRATED WORLD BUILD =====
window.__DENDER_VERSION__="2.0";

const GAME20={
  cash:Number(localStorage.getItem("dc20_cash")||250),
  completed:Number(localStorage.getItem("dc20_completed")||0),
  phoneOpen:false,
  fps:60,
  fpsFrames:0,
  fpsAccum:0,
  quality:"AUTO",
  lastAutoSave:0
};

const ENV20={
  ready:false,
  features:[],
  chunks:new Map(),
  collisionChunks:new Map(),
  chunkSize:500,
  loadRadius:900,
  unloadRadius:1700,
  retryTimer:null,
  wallMats:mat.brick,
  roofMat:mat.roof,
  waterMat:mat.water.clone(),
  vegMat:new THREE.MeshStandardMaterial({color:0x365d35,roughness:1})
};
ENV20.waterMat.transparent=true;ENV20.waterMat.opacity=.82;

function envChunkKey20(x,z){
  return Math.floor(x/ENV20.chunkSize)+":"+Math.floor(z/ENV20.chunkSize);
}
function featurePoints20(ft){
  const g=ft.geometry;if(!g)return[];
  if(g.type==="Polygon"&&g.coordinates?.[0])return g.coordinates[0].map(geoToLocal10);
  if(g.type==="LineString")return g.coordinates.map(geoToLocal10);
  return[];
}
function centroid20(points){
  if(!points.length)return new THREE.Vector3();
  const c=new THREE.Vector3();for(const p of points)c.add(p);return c.multiplyScalar(1/points.length);
}
function hash20(s){
  let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0;
}
function bounds20(points){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z)}
  return {minX,maxX,minZ,maxZ};
}
function preprocessEnvironment20(fc){
  ENV20.features=fc.features||[];
  for(const ft of ENV20.features){
    const pts=featurePoints20(ft);if(pts.length<2)continue;
    const c=centroid20(pts),key=envChunkKey20(c.x,c.z);
    let ch=ENV20.chunks.get(key);
    if(!ch){ch={key,cx:c.x,cz:c.z,features:[],group:null,built:false};ENV20.chunks.set(key,ch)}
    ch.features.push({ft,pts,c});
    if(ft.properties?.kind==="building"&&pts.length>=4){
      let arr=ENV20.collisionChunks.get(key);
      if(!arr){arr=[];ENV20.collisionChunks.set(key,arr)}
      const b=bounds20(pts);arr.push({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,w:Math.max(1,b.maxX-b.minX),d:Math.max(1,b.maxZ-b.minZ)});
    }
  }
  ENV20.ready=true;
}
function makeShape20(points,c){
  const sh=new THREE.Shape();
  points.forEach((p,i)=>{
    const x=p.x-c.x,y=-(p.z-c.z);
    if(i===0)sh.moveTo(x,y);else sh.lineTo(x,y);
  });
  sh.closePath();return sh;
}
function buildBuilding20(item,parent){
  const p=item.ft.properties||{},h=THREE.MathUtils.clamp(Number(p.height_m)||6,2.8,32);
  const shape=makeShape20(item.pts,item.c);
  let geo;
  try{geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1,curveSegments:1})}catch{return}
  geo.rotateX(-Math.PI/2);
  const wall=ENV20.wallMats[hash20(p.source_id||"b")%ENV20.wallMats.length];
  const mesh=new THREE.Mesh(geo,[ENV20.roofMat,wall]);
  mesh.position.set(item.c.x,0,item.c.z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
}
function buildArea20(item,parent,kind){
  const shape=makeShape20(item.pts,item.c);
  let geo;try{geo=new THREE.ShapeGeometry(shape)}catch{return}
  geo.rotateX(-Math.PI/2);
  const material=kind==="water"?ENV20.waterMat:ENV20.vegMat;
  const mesh=new THREE.Mesh(geo,material);mesh.position.set(item.c.x,kind==="water"?.045:.025,item.c.z);mesh.receiveShadow=true;parent.add(mesh);
}
function buildWaterway20(item,parent){
  const pts=item.pts.map(p=>new THREE.Vector3(p.x,.05,p.z));
  if(pts.length<2)return;
  const geo=new THREE.BufferGeometry().setFromPoints(pts);
  const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x4e8191,transparent:true,opacity:.82}));
  parent.add(line);
}
function buildEnvChunk20(ch){
  if(ch.built)return;
  const group=new THREE.Group();group.userData.realGeo10=true;group.userData.environment20=true;
  for(const item of ch.features){
    const kind=item.ft.properties?.kind;
    if(kind==="building"&&item.pts.length>=4)buildBuilding20(item,group);
    else if(kind==="water"&&item.pts.length>=4)buildArea20(item,group,"water");
    else if(kind==="vegetation"&&item.pts.length>=4)buildArea20(item,group,"vegetation");
    else if(kind==="waterway")buildWaterway20(item,group);
  }
  ch.group=group;ch.built=true;GEO10.group.add(group);
}
function destroyEnvChunk20(ch){
  if(!ch.built||!ch.group)return;
  ch.group.traverse(o=>{if(o.geometry)o.geometry.dispose()});
  GEO10.group.remove(ch.group);ch.group=null;ch.built=false;
}
function streamEnvironment20(actor){
  if(!ENV20.ready)return;
  const load2=ENV20.loadRadius*ENV20.loadRadius,unload2=ENV20.unloadRadius*ENV20.unloadRadius;
  for(const ch of ENV20.chunks.values()){
    const dx=ch.cx-actor.x,dz=ch.cz-actor.z,d2=dx*dx+dz*dz;
    if(d2<load2&&!ch.built)buildEnvChunk20(ch);
    else if(d2>unload2&&ch.built)destroyEnvChunk20(ch);
  }
}
function nearbyCollisionBoxes20(pos){
  const cx=Math.floor(pos.x/ENV20.chunkSize),cz=Math.floor(pos.z/ENV20.chunkSize),out=[];
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    const a=ENV20.collisionChunks.get((cx+dx)+":"+(cz+dz));if(a)out.push(...a);
  }
  return out;
}
function collidesBuildings20(pos,radius){
  for(const b of nearbyCollisionBoxes20(pos)){
    if(pos.x>b.x-b.w/2-radius&&pos.x<b.x+b.w/2+radius&&pos.z>b.z-b.d/2-radius&&pos.z<b.z+b.d/2+radius)return true;
  }
  return false;
}
function installCollisions20(){
  if(!ENV20.ready)return;
  if(inVehicle){
    if(collidesBuildings20(heroCar.position,1.25)){
      heroCar.position.copy(v02.carPrev);heroCar.userData.speed*=-.18;
    }else v02.carPrev.copy(heroCar.position);
  }else{
    if(collidesBuildings20(player.position,.55))player.position.copy(v02.playerPrev);
    else v02.playerPrev.copy(player.position);
  }
}

async function loadEnvironment20(){
  if(ENV20.ready||!GEO10.active)return false;
  try{
    const r=await fetch("./geodata/erpe_mere_environment.geojson?v=2.0");
    if(!r.ok)throw new Error("environment "+r.status);
    const fc=await r.json();preprocessEnvironment20(fc);
    toast("Echte gebouwen, water en groen geladen");
    return true;
  }catch(err){console.warn("Environment not ready yet",err);return false}
}
const envWait20=setInterval(async()=>{if(GEO10.active&&await loadEnvironment20())clearInterval(envWait20)},1800);

// Pedestrians follow the same official graph.
const PED20={agents:[]};
function choosePedEdge20(node,prev){
  const opts=(GEO10.adj.get(node)||[]).filter(x=>x.to!==prev);
  if(!opts.length)return (GEO10.adj.get(node)||[])[0]||null;
  return opts[Math.floor(rnd()*opts.length)];
}
function setupPeds20(){
  if(!GEO10.active||PED20.agents.length)return;
  const edges=GEO10.edges.filter(e=>e.a&&e.b&&e.length>8);
  pedestrians.forEach((p,i)=>{
    const e=edges[(i*37)%Math.max(1,edges.length)];if(!e)return;
    p.visible=true;
    const start=i%2?e.a:e.b,end=i%2?e.b:e.a;
    const entry=(GEO10.adj.get(start)||[]).find(x=>x.to===end&&x.edge===e);if(!entry)return;
    p.position.copy(entry.points[0]);p.userData.speed=1.15+(i%4)*.13;
    PED20.agents.push({p,node:start,prev:null,next:end,pts:entry.points,index:1});
  });
}
function updatePeds20(dt){
  for(const a of PED20.agents){
    if(!a.pts||a.index>=a.pts.length){
      const n=choosePedEdge20(a.next,a.node);if(!n)continue;
      a.prev=a.node;a.node=a.next;a.next=n.to;a.pts=n.points;a.index=1;
    }
    const t=a.pts[a.index];if(!t)continue;
    tempV.copy(t).sub(a.p.position);tempV.y=0;
    if(tempV.length()<.75){a.index++;continue}
    tempV.normalize();a.p.position.addScaledVector(tempV,a.p.userData.speed*dt);a.p.rotation.y=Math.atan2(tempV.x,tempV.z);
  }
}

// Thirty real-world jobs generated from actual villages and official streets.
const JOB20={jobs:[],index:GAME20.completed,started:false,deadline:0,escapeStarted:false};
function edgeMid20(e){
  const p=e.points[Math.floor(e.points.length/2)]||e.points[0];return p.clone();
}
function setupJobs20(){
  if(JOB20.jobs.length||!GEO10.active)return;
  const villageJobs=GEO10.missionTargets.map((t,i)=>({
    id:"village-"+i,type:i%2?"delivery":"inspection",name:"Gemeenterit: "+t.name,target:t.pos.clone(),reward:90+i*15
  }));
  const named=[];const seen=new Set();
  for(const e of GEO10.driveEdges){
    if(!e.name||seen.has(e.name)||e.length<18)continue;seen.add(e.name);
    named.push(e);if(named.length>=22)break;
  }
  const types=["delivery","timed","courier","night","inspection","escape"];
  const streetJobs=named.map((e,i)=>({
    id:"street-"+i,type:types[i%types.length],name:(types[i%types.length]==="courier"?"Koerier: ":"Opdracht: ")+e.name,
    target:edgeMid20(e),street:e.name,reward:110+(i%6)*25
  }));
  JOB20.jobs=[...villageJobs,...streetJobs].slice(0,30);
  JOB20.index=Math.min(GAME20.completed,JOB20.jobs.length);
}
function startJob20(j){
  JOB20.started=true;JOB20.escapeStarted=false;
  if(j.type==="timed")JOB20.deadline=performance.now()+120000;
  else JOB20.deadline=0;
  if(j.type==="night"&&day>6&&day<19)day=20.2;
  if(j.type==="escape"){wanted=Math.max(wanted,2);wantedCooldown=14;JOB20.escapeStarted=true}
}
function completeJob20(j){
  GAME20.cash+=j.reward;GAME20.completed=Math.min(JOB20.jobs.length,JOB20.index+1);
  localStorage.setItem("dc20_cash",GAME20.cash);localStorage.setItem("dc20_completed",GAME20.completed);
  toast("OPDRACHT VOLTOOID +€"+j.reward);JOB20.index++;JOB20.started=false;JOB20.deadline=0;JOB20.escapeStarted=false;
}
function updateMission20(){
  const j=JOB20.jobs[JOB20.index],title=document.querySelector("#missionTitle"),txt=document.querySelector("#missionText");
  if(!j){marker.visible=false;title.textContent="30 OPDRACHTEN VOLTOOID";txt.textContent="Vrije verkenning in Erpe-Mere • €"+GAME20.cash;return}
  if(!JOB20.started)startJob20(j);
  marker.visible=true;marker.position.set(j.target.x,.22,j.target.z);
  const actor=inVehicle?heroCar.position:player.position,dist=actor.distanceTo(j.target);
  let extra="";
  if(j.type==="courier")extra=" • te voet afleveren";
  if(j.type==="delivery")extra=" • voertuig vereist";
  if(j.type==="timed"){
    const left=Math.max(0,Math.ceil((JOB20.deadline-performance.now())/1000));extra=" • "+left+" sec";
    if(left<=0){JOB20.started=false;toast("Tijd verstreken — opdracht herstart");return}
  }
  if(j.type==="escape")extra=" • raak politie kwijt";
  if(j.type==="night")extra=" • nachtrit";
  title.textContent=j.name.toUpperCase();
  txt.textContent=j.type.toUpperCase()+" • "+Math.round(dist)+" m"+extra+" • beloning €"+j.reward;
  let ok=dist<30;
  if(j.type==="courier")ok=ok&&!inVehicle;
  if(j.type==="delivery"||j.type==="night"||j.type==="timed")ok=ok&&inVehicle;
  if(j.type==="escape")ok=ok&&wanted<=.05;
  if(ok)completeJob20(j);
}

// Phone / status UI.
function buildPhone20(){
  if(document.querySelector("#phone20"))return;
  const p=document.createElement("div");p.id="phone20";
  p.style.cssText="display:none;position:fixed;z-index:30;right:24px;top:70px;width:min(340px,calc(100vw - 30px));max-height:72vh;overflow:auto;background:rgba(7,10,14,.95);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:18px;padding:18px;box-shadow:0 22px 70px rgba(0,0,0,.55);font:14px system-ui";
  p.innerHTML='<div style="font-weight:900;font-size:20px;letter-spacing:.08em">DENDER PHONE</div><div style="color:#c7aa68;margin:4px 0 14px">ERPE-MERE NETWORK</div><div id="phoneStats20"></div><hr style="border:0;border-top:1px solid #303640;margin:14px 0"><div><b>Apps</b></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px"><div>🗺️ Kaart</div><div>💼 Jobs</div><div>🚗 Garage</div><div>⚙️ Settings</div></div><div style="margin-top:16px;color:#9199a3;font-size:11px">T = sluiten • Q = quality/performance • P = opslaan</div>';
  document.body.appendChild(p);
}
function updatePhone20(){
  const p=document.querySelector("#phone20"),s=document.querySelector("#phoneStats20");if(!p||!s)return;
  p.style.display=GAME20.phoneOpen?"block":"none";if(!GAME20.phoneOpen)return;
  const actor=inVehicle?heroCar.position:player.position,place=GEO10.active?nearestPlace10(actor):null,street=GEO10.active?nearestStreet10(actor):{name:""};
  s.innerHTML="<b>Saldo:</b> €"+GAME20.cash+"<br><b>Opdrachten:</b> "+GAME20.completed+"/30<br><b>Locatie:</b> "+(place?.name||"Erpe-Mere")+"<br><b>Straat:</b> "+(street.name||"—")+"<br><b>Wanted:</b> "+Math.ceil(wanted)+"/5<br><b>FPS:</b> "+Math.round(GAME20.fps)+"<br><b>Kwaliteit:</b> "+GAME20.quality;
}
buildPhone20();
addEventListener("keydown",e=>{if(e.code==="KeyT"&&!e.repeat){GAME20.phoneOpen=!GAME20.phoneOpen;updatePhone20()}});

// Weather states layered on top of existing day/night.
const WEATHER20={states:["CLEAR","OVERCAST","RAIN","HEAVY RAIN","MIST"],index:2,target:2,lastChange:performance.now()};
function updateWeather20(dt,now){
  if(now-WEATHER20.lastChange>150000){WEATHER20.lastChange=now;WEATHER20.target=Math.floor(rnd()*WEATHER20.states.length)}
  WEATHER20.index=THREE.MathUtils.lerp(WEATHER20.index,WEATHER20.target,dt*.08);
  const rainLevel=THREE.MathUtils.clamp((WEATHER20.index-1.2)/2,0,1);
  v04.rainIntensity=rainLevel;rain.material.opacity=.06+.62*rainLevel;
  const mist=THREE.MathUtils.clamp((WEATHER20.index-3.2),0,1);
  scene.fog.density=.00045+rainLevel*.00016+mist*.00075;
}

// Adaptive quality, conservative to protect phones.
function adaptiveQuality20(dt){
  GAME20.fpsFrames++;GAME20.fpsAccum+=dt;
  if(GAME20.fpsAccum<5)return;
  GAME20.fps=GAME20.fpsFrames/GAME20.fpsAccum;
  GAME20.fpsFrames=0;GAME20.fpsAccum=0;
  if(GAME20.fps<32&&renderer.getPixelRatio()>1.01){
    renderer.setPixelRatio(Math.max(1,renderer.getPixelRatio()-.2));GAME20.quality="AUTO PERFORMANCE";
  }else if(GAME20.fps>54&&renderer.getPixelRatio()<Math.min(devicePixelRatio,1.7)-.05){
    renderer.setPixelRatio(Math.min(Math.min(devicePixelRatio,1.7),renderer.getPixelRatio()+.1));GAME20.quality="AUTO QUALITY";
  }
}
function saveMeta20(){
  localStorage.setItem("dc20_cash",GAME20.cash);localStorage.setItem("dc20_completed",GAME20.completed);
  const actor=inVehicle?heroCar:player;
  localStorage.setItem("dc20_geo",JSON.stringify({x:actor.position.x,z:actor.position.z,inVehicle,heading:heroCar.userData.heading,day,wanted}));
}
function restoreMeta20(){
  try{
    const s=JSON.parse(localStorage.getItem("dc20_geo")||"null");if(!s||!GEO10.active)return;
    if(s.inVehicle){inVehicle=true;player.visible=false;heroCar.position.set(s.x,0,s.z);heroCar.userData.heading=s.heading||0;heroCar.rotation.y=heroCar.userData.heading}
    else{inVehicle=false;player.visible=true;player.position.set(s.x,0,s.z)}
    day=s.day??day;wanted=s.wanted??wanted;v02.playerPrev.copy(player.position);v02.carPrev.copy(heroCar.position);
  }catch{}
}
addEventListener("keydown",e=>{if(e.code==="KeyP")saveMeta20()});

const integrateWait20=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(integrateWait20);
  setupPeds20();setupJobs20();
  updatePeds=updatePeds20;updateMission=updateMission20;installCollisions=installCollisions20;
  restoreMeta20();
},350);

let last20=performance.now();
function megaLoop20(now){
  const dt=Math.min((now-last20)/1000,.04);last20=now;
  if(!running)return;
  if(GEO10.active){
    const actor=inVehicle?heroCar.position:player.position;
    streamEnvironment20(actor);adaptiveQuality20(dt);updateWeather20(dt,now);
    if(now-GAME20.lastAutoSave>12000){GAME20.lastAutoSave=now;saveMeta20()}
    if(GAME20.phoneOpen)updatePhone20();
  }
}


// ===== DENDER COUNTY 2.0 — RELEASE NAVIGATION / TRAFFIC / SURFACE POLISH =====
const NAV20={path:[],last:0,targetKey:""};
const ROAD20={distance:0,onRoad:true,last:0,width:6};

function nearestDriveSegment20(pos){
  let bd=Infinity,best=null;
  for(const e of GEO10.driveEdges){
    for(let i=1;i<e.points.length;i++){
      const s={x1:e.points[i-1].x,z1:e.points[i-1].z,x2:e.points[i].x,z2:e.points[i].z};
      const d=pointSegDistSq09(pos.x,pos.z,s);
      if(d<bd){bd=d;best=e}
    }
  }
  return {distance:Math.sqrt(bd),edge:best};
}
function updateRoadState20(now){
  if(!GEO10.active||now-ROAD20.last<280)return;
  ROAD20.last=now;
  const r=nearestDriveSegment20(heroCar.position);
  ROAD20.distance=r.distance;
  ROAD20.width=r.edge?.width||6;
  ROAD20.onRoad=r.distance<(ROAD20.width*.62+2.2);
}
function driveHeroRelease20(dt){
  const car=heroCar,throttle=keys.KeyW?1:0,brake=keys.KeyS?1:0,handbrake=keys.Space?1:0;
  const wet=THREE.MathUtils.clamp(v04.rainIntensity,0,1);
  const onRoad=ROAD20.onRoad;
  const maxForward=onRoad?31:13;
  const accel=onRoad?13.5:7.0;
  if(throttle)car.userData.speed+=accel*dt;
  if(brake){if(car.userData.speed>1)car.userData.speed-=(21-wet*2)*dt;else car.userData.speed-=7*dt}
  if(!throttle&&!brake)car.userData.speed*=Math.pow(onRoad?.62:.34,dt);
  if(handbrake)car.userData.speed*=Math.pow(onRoad?.075:.12,dt);
  car.userData.speed=THREE.MathUtils.clamp(car.userData.speed,-8,maxForward);
  const steer=(keys.KeyA?1:0)-(keys.KeyD?1:0),speed=Math.abs(car.userData.speed);
  const grip=(onRoad?(1-wet*.16):.62);
  if(speed>.2)car.userData.heading+=steer*dt*(car.userData.speed>=0?1:-1)*THREE.MathUtils.lerp(1.62,.70,Math.min(speed/30,1))*grip;
  if(handbrake&&speed>7)car.userData.heading+=steer*dt*(1.12+wet*.28);
  car.rotation.y=car.userData.heading;
  car.position.x+=Math.sin(car.userData.heading)*car.userData.speed*dt;
  car.position.z+=Math.cos(car.userData.heading)*car.userData.speed*dt;
  clampActor10(car);animateCar04(car,dt,steer,brake||handbrake);
}
function trafficBlocked20(agent){
  const car=agent.car;
  const forward=new THREE.Vector3(Math.sin(car.rotation.y),0,Math.cos(car.rotation.y));
  for(const other of GEO10.trafficAgents){
    if(other===agent)continue;
    const v=other.car.position.clone().sub(car.position),d=v.length();
    if(d<7&&d>.01&&forward.dot(v.normalize())>.45)return true;
  }
  if(player.visible){
    const v=player.position.clone().sub(car.position),d=v.length();
    if(d<5&&d>.01&&forward.dot(v.normalize())>.35)return true;
  }
  return false;
}
function updateTrafficRelease20(dt){
  for(const a of GEO10.trafficAgents){
    if(!a.pts||a.index>=a.pts.length){
      const next=chooseNext10(a.next,a.node);if(!next){a.car.userData.speed=0;continue}
      a.prev=a.node;a.node=a.next;a.next=next.to;a.entry=next;a.pts=next.points;a.index=1;
    }
    const target=a.pts[a.index];if(!target)continue;
    tempV.copy(target).sub(a.car.position);tempV.y=0;const dist=tempV.length();
    if(dist<1.4){a.index++;continue}
    const blocked=trafficBlocked20(a),base=7+(Number(a.car.id)%5)*.7,speed=blocked?Math.min(1.3,base):base;
    a.car.userData.speed=THREE.MathUtils.lerp(a.car.userData.speed||0,speed,blocked?.12:.045);
    tempV.normalize();a.car.position.addScaledVector(tempV,Math.min(dist,a.car.userData.speed*dt));
    a.car.rotation.y=Math.atan2(tempV.x,tempV.z);animateCar04(a.car,dt,0,blocked);
  }
}
function currentJobTarget20(){
  const j=JOB20.jobs[JOB20.index];return j?.target||null;
}
function updateNavigation20(now){
  if(!GEO10.active||now-NAV20.last<1500)return;
  NAV20.last=now;
  const target=currentJobTarget20();if(!target){NAV20.path=[];return}
  const actor=inVehicle?heroCar.position:player.position;
  const s=nearestNode10(actor,true),g=nearestNode10(target,true);
  const key=s+":"+g;
  if(key===NAV20.targetKey&&NAV20.path.length)return;
  NAV20.targetKey=key;
  NAV20.path=route10(s,g).map(id=>GEO10.nodes.get(id)?.pos.clone()).filter(Boolean);
}
function drawMapRelease20(){
  drawMap10();
  if(!NAV20.path.length)return;
  const S=180,actor=inVehicle?heroCar:player,radius=900,sc=S/(radius*2);
  ctx.strokeStyle="#e5c066";ctx.lineWidth=2.4;ctx.beginPath();
  let started=false;
  for(const p of NAV20.path){
    const x=S/2+(p.x-actor.position.x)*sc,z=S/2+(p.z-actor.position.z)*sc;
    if(!started){ctx.moveTo(x,z);started=true}else ctx.lineTo(x,z);
  }
  ctx.stroke();
}
const releaseWait20=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(releaseWait20);
  driveHero=driveHeroRelease20;
  updateTraffic=updateTrafficRelease20;
  drawMap=drawMapRelease20;
},500);

let releaseLast20=performance.now();
function releaseLoop20(now){
  if(!running||!GEO10.active){releaseLast20=now;return}
  const dt=Math.min((now-releaseLast20)/1000,.04);releaseLast20=now;
  updateRoadState20(now);updateNavigation20(now);
}


// Full-region on-foot controller: never inherit the old Burst-only clamp.
function movePlayerRelease20(dt){
  const forward=new THREE.Vector3(Math.sin(camYaw),0,-Math.cos(camYaw));
  const right=new THREE.Vector3(Math.cos(camYaw),0,Math.sin(camYaw));
  tempV.set(0,0,0);
  if(keys.KeyW)tempV.add(forward);
  if(keys.KeyS)tempV.sub(forward);
  if(keys.KeyD)tempV.add(right);
  if(keys.KeyA)tempV.sub(right);
  if(tempV.lengthSq()>0){
    tempV.normalize();
    player.position.addScaledVector(tempV,(keys.ShiftLeft?8.3:4.7)*dt);
    player.rotation.y=Math.atan2(tempV.x,tempV.z);
  }
  clampActor10(player);
}
const movementFixWait20=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(movementFixWait20);
  movePlayer=movePlayerRelease20;
},550);


// ===== DENDER COUNTY 3.0 — ERPE-MERE + LEDE + AALST CONTIGUOUS WORLD =====
window.__DENDER_VERSION__="3.0";

const REG30={
  loaded:new Set(),
  chunks:new Map(),
  seenRoads:new Set(),
  lastStream:0,
  retryTimer:null,
  allReady:false,
  crossJobsAdded:false,
  municipalities:["lede","aalst"]
};

function regChunkKey30(x,z){
  return Math.floor(x/GEO10.chunkSize)+":"+Math.floor(z/GEO10.chunkSize);
}
function addRegSeg30(seg){
  const key=regChunkKey30((seg.x1+seg.x2)/2,(seg.z1+seg.z2)/2);
  let c=REG30.chunks.get(key);
  if(!c){
    c={key,group:new THREE.Group(),items:[],cx:(seg.x1+seg.x2)/2,cz:(seg.z1+seg.z2)/2,built:false};
    c.group.userData.realGeo10=true;c.group.userData.region30=true;
    REG30.chunks.set(key,c);GEO10.group.add(c.group);
  }
  c.items.push(seg);
}
function buildRegChunk30(c){
  if(c.built||!c.items.length)return;
  const yAxis=new THREE.Vector3(0,1,0);
  const buckets=new Map();
  for(const s of c.items){
    const w=s.width<=2.4?2.2:s.width<=5.4?5.2:s.width<=6.3?5.8:s.width<=8?7.5:12;
    if(!buckets.has(w))buckets.set(w,[]);
    buckets.get(w).push(s);
  }
  for(const [width,items] of buckets){
    const geo=new THREE.BoxGeometry(1,1,1),m=mat.road.clone();
    if(width<=2.4){m.map=null;m.normalMap=null;m.roughnessMap=null;m.metalnessMap=null;m.color.set(0x6c6c67);m.needsUpdate=true}
    const inst=new THREE.InstancedMesh(geo,m,items.length);inst.receiveShadow=true;
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3(),mx=new THREE.Matrix4();
    items.forEach((s,i)=>{
      const dx=s.x2-s.x1,dz=s.z2-s.z1,len=Math.hypot(dx,dz);
      p.set((s.x1+s.x2)/2,.08,(s.z1+s.z2)/2);
      q.setFromAxisAngle(yAxis,Math.atan2(dx,dz));
      sc.set(s.width,.12,len+.25);mx.compose(p,q,sc);inst.setMatrixAt(i,mx);
    });
    inst.instanceMatrix.needsUpdate=true;c.group.add(inst);
  }
  c.built=true;
}
function streamReg30(actor){
  const show2=2800*2800;
  for(const c of REG30.chunks.values()){
    const dx=c.cx-actor.x,dz=c.cz-actor.z,d2=dx*dx+dz*dz;
    if(d2<show2&&!c.built)buildRegChunk30(c);
    c.group.visible=d2<show2;
  }
}
function extendBounds30(meta,key){
  const b=meta.bbox_wgs84;
  const a=geoToLocal10([b.west,b.south]),c=geoToLocal10([b.east,b.north]);
  const minX=Math.min(a.x,c.x),maxX=Math.max(a.x,c.x),minZ=Math.min(a.z,c.z),maxZ=Math.max(a.z,c.z);
  if(!GEO10.bounds)GEO10.bounds={minX,maxX,minZ,maxZ};
  else{
    GEO10.bounds.minX=Math.min(GEO10.bounds.minX,minX);GEO10.bounds.maxX=Math.max(GEO10.bounds.maxX,maxX);
    GEO10.bounds.minZ=Math.min(GEO10.bounds.minZ,minZ);GEO10.bounds.maxZ=Math.max(GEO10.bounds.maxZ,maxZ);
  }
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(maxX-minX+120,maxZ-minZ+120),mat.grass.clone());
  ground.rotation.x=-Math.PI/2;ground.position.set((minX+maxX)/2,-.035,(minZ+maxZ)/2);
  ground.receiveShadow=true;ground.userData.realGeo10=true;ground.userData.region30=true;GEO10.group.add(ground);
}
function addRegionGraph30(fc,meta,key){
  extendBounds30(meta,key);
  const municipality=meta.municipality||meta.sector||key;
  for(const ft of fc.features||[]){
    const p=ft.properties||{};
    if(p.kind==="place"&&ft.geometry?.type==="Point"){
      const pos=geoToLocal10(ft.geometry.coordinates);
      if(!GEO10.places.some(x=>x.name===p.name&&x.municipality===municipality))
        GEO10.places.push({name:p.name||municipality,pos,municipality});
      continue;
    }
    if(p.kind==="station"&&ft.geometry?.type==="Point"){
      const pos=geoToLocal10(ft.geometry.coordinates);
      GEO10.places.push({name:p.name||"Station",pos,municipality,station:true});
      continue;
    }
    if(p.kind==="railway"){
      for(const line of lines10(ft.geometry)){
        for(let i=1;i<line.length;i++){
          const a=geoToLocal10(line[i-1]),b=geoToLocal10(line[i]);
          const rail=meshBox(1.6,.12,a.distanceTo(b),new THREE.MeshStandardMaterial({color:0x3d3d3d,metalness:.5,roughness:.55}),0,.1,0);
          rail.position.set((a.x+b.x)/2,.09,(a.z+b.z)/2);rail.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);
          rail.userData.realGeo10=true;rail.userData.region30=true;GEO10.group.add(rail);
        }
      }
      continue;
    }
    if(p.kind!=="road")continue;
    const sid=p.source_id||ft.id;
    if(sid&&REG30.seenRoads.has(sid))continue;
    if(sid)REG30.seenRoads.add(sid);
    for(const line of lines10(ft.geometry)){
      if(line.length<2)continue;
      const pts=line.map(geoToLocal10),aKey=ensureNode10(p.begin_node,pts[0]),bKey=ensureNode10(p.end_node,pts[pts.length-1]);
      const edge={a:aKey,b:bKey,points:pts,name:p.name||"",props:{...p,municipality},width:roadWidth10(p),drive:drivable10(p),length:pathLength10(pts)};
      GEO10.edges.push(edge);if(edge.drive)GEO10.driveEdges.push(edge);
      if(aKey&&bKey){
        GEO10.adj.get(aKey).push({to:bKey,edge,points:pts});
        GEO10.adj.get(bKey).push({to:aKey,edge,points:[...pts].reverse()});
      }
      for(let i=1;i<pts.length;i++)addRegSeg30({x1:pts[i-1].x,z1:pts[i-1].z,x2:pts[i].x,z2:pts[i].z,width:edge.width,name:edge.name,edge});
    }
  }
}
async function loadMunicipality30(key){
  if(REG30.loaded.has(key)||!GEO10.active)return false;
  try{
    const [fcR,metaR]=await Promise.all([
      fetch("./geodata/"+key+"_runtime.geojson?v=3.0"),
      fetch("./geodata/"+key+"_meta.json?v=3.0")
    ]);
    if(!fcR.ok||!metaR.ok)return false;
    const [fc,meta]=await Promise.all([fcR.json(),metaR.json()]);
    addRegionGraph30(fc,meta,key);REG30.loaded.add(key);
    toast((meta.municipality||key)+" toegevoegd aan open wereld");
    return true;
  }catch(err){console.warn("region load pending",key,err);return false}
}
function addCrossRegionJobs30(){
  if(REG30.crossJobsAdded||REG30.loaded.size<2||!JOB20.jobs.length)return;
  REG30.crossJobsAdded=true;
  const places=GEO10.places.filter(p=>p.municipality&&p.municipality!=="Erpe-Mere");
  const selected=[];
  const seen=new Set();
  for(const p of places){
    const k=p.municipality+":"+p.name;if(seen.has(k))continue;seen.add(k);selected.push(p);
    if(selected.length>=10)break;
  }
  selected.forEach((p,i)=>JOB20.jobs.push({
    id:"regional-place-"+i,type:i%3===0?"timed":i%3===1?"delivery":"inspection",
    name:"Regiorit: "+p.name,target:p.pos.clone(),reward:180+i*20
  }));
  const roads=GEO10.driveEdges.filter(e=>e.props?.municipality&&e.props.municipality!=="Erpe-Mere"&&e.name);
  const roadSeen=new Set();let n=0;
  for(const e of roads){
    if(roadSeen.has(e.name))continue;roadSeen.add(e.name);
    JOB20.jobs.push({id:"regional-road-"+n,type:n%2?"courier":"delivery",name:"Regio-opdracht: "+e.name,target:edgeMid20(e),street:e.name,reward:210+(n%5)*25});
    if(++n>=10)break;
  }
}
function district30(pos){
  const p=nearestPlace10(pos);
  if(!p)return "OOST-VLAANDEREN";
  return (p.name||"REGIO").toUpperCase()+" • "+(p.municipality||"ERPE-MERE").toUpperCase();
}
function updatePhone30(){
  const p=document.querySelector("#phone20"),s=document.querySelector("#phoneStats20");if(!p||!s)return;
  p.style.display=GAME20.phoneOpen?"block":"none";if(!GAME20.phoneOpen)return;
  const actor=inVehicle?heroCar.position:player.position,place=nearestPlace10(actor),street=nearestStreet10(actor);
  s.innerHTML="<b>Saldo:</b> €"+GAME20.cash+"<br><b>Opdrachten:</b> "+GAME20.completed+"/"+JOB20.jobs.length+
    "<br><b>Locatie:</b> "+(place?.name||"Oost-Vlaanderen")+"<br><b>Gemeente:</b> "+(place?.municipality||"Erpe-Mere")+
    "<br><b>Straat:</b> "+(street.name||"—")+"<br><b>Wanted:</b> "+Math.ceil(wanted)+"/5"+
    "<br><b>FPS:</b> "+Math.round(GAME20.fps)+"<br><b>Kwaliteit:</b> "+GAME20.quality+
    "<br><b>Wereld:</b> Erpe-Mere"+(REG30.loaded.has("lede")?" + Lede":"")+(REG30.loaded.has("aalst")?" + Aalst":"");
}
const regionStart30=setInterval(async()=>{
  if(!GEO10.active)return;
  GEO10.places.forEach(p=>{if(!p.municipality)p.municipality="Erpe-Mere"});
  const results=await Promise.all(REG30.municipalities.map(loadMunicipality30));
  if(REG30.loaded.size===REG30.municipalities.length){
    clearInterval(regionStart30);REG30.allReady=true;
    districtName=district30;updatePhone20=updatePhone30;addCrossRegionJobs30();
    camera.far=4200;camera.updateProjectionMatrix();
    toast("REGIOWERELD ACTIEF • ERPE-MERE + LEDE + AALST");
  }
},3000);

let regLast30=performance.now();
function regionLoop30(now){
  if(!running||!GEO10.active){regLast30=now;return}
  if(now-REG30.lastStream>500){
    REG30.lastStream=now;
    const actor=inVehicle?heroCar.position:player.position;streamReg30(actor);
    if(REG30.loaded.size) addCrossRegionJobs30();
  }
}


// ===== DENDER COUNTY 3.0 — MULTI-MUNICIPALITY ENVIRONMENT STREAMING =====
REG30.environmentLoaded=new Set();
ENV20.seenFeatureIds=ENV20.seenFeatureIds||new Set(
  (ENV20.features||[]).map(f=>f.properties?.source_id||f.id).filter(Boolean)
);

function appendEnvironment30(fc,key){
  for(const ft of fc.features||[]){
    const fid=ft.properties?.source_id||ft.id;
    if(fid&&ENV20.seenFeatureIds.has(fid))continue;
    if(fid)ENV20.seenFeatureIds.add(fid);
    const pts=featurePoints20(ft);if(pts.length<2)continue;
    const c=centroid20(pts),ck=envChunkKey20(c.x,c.z);
    let ch=ENV20.chunks.get(ck);
    if(!ch){ch={key:ck,cx:c.x,cz:c.z,features:[],group:null,built:false};ENV20.chunks.set(ck,ch)}
    ch.features.push({ft,pts,c,region:key});
    if(ft.properties?.kind==="building"&&pts.length>=4){
      let arr=ENV20.collisionChunks.get(ck);
      if(!arr){arr=[];ENV20.collisionChunks.set(ck,arr)}
      const b=bounds20(pts);arr.push({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,w:Math.max(1,b.maxX-b.minX),d:Math.max(1,b.maxZ-b.minZ)});
    }
  }
}
async function loadRegionEnvironment30(key){
  if(REG30.environmentLoaded.has(key)||!GEO10.active)return false;
  try{
    const r=await fetch("./geodata/"+key+"_environment.geojson?v=3.0");
    if(!r.ok)return false;
    const fc=await r.json();appendEnvironment30(fc,key);
    REG30.environmentLoaded.add(key);
    toast(key.toUpperCase()+" gebouwen/water/groen geladen");
    return true;
  }catch(err){console.warn("regional environment pending",key,err);return false}
}
const regionEnvironmentPoll30=setInterval(async()=>{
  if(!GEO10.active)return;
  await Promise.all(REG30.municipalities.map(loadRegionEnvironment30));
  if(REG30.environmentLoaded.size===REG30.municipalities.length)clearInterval(regionEnvironmentPoll30);
},5000);


// ===== DENDER COUNTY 3.1 — ON-DEMAND REGIONAL ENVIRONMENT CHUNKS =====
window.__DENDER_VERSION__="3.1";

const CHUNK31={
  manifests:new Map(),
  loaded:new Map(),
  loading:new Set(),
  municipalities:["erpe_mere","lede","aalst"],
  radius:1,
  maxVisitedChunks:36,
  last:0,
  ready:false
};

function manifestLocalChunk31(actor,manifest){
  const origin=manifest.origin_wgs84;
  const lat0=origin.lat,lon0=origin.lon;
  const mlon=111320*Math.cos(lat0*Math.PI/180),mlat=111320;
  const geo=localToGeo10(actor);
  const x=(geo[0]-lon0)*mlon;
  const z=-(geo[1]-lat0)*mlat;
  return {
    cx:Math.floor(x/manifest.chunk_size_m),
    cz:Math.floor(z/manifest.chunk_size_m)
  };
}

async function loadManifest31(key){
  if(CHUNK31.manifests.has(key))return CHUNK31.manifests.get(key);
  try{
    const r=await fetch("./geodata/chunks/"+key+"/manifest.json?v=3.1");
    if(!r.ok)return null;
    const m=await r.json();
    m.index=new Map(m.chunks.map(c=>[c.cx+":"+c.cz,c]));
    CHUNK31.manifests.set(key,m);
    return m;
  }catch(err){
    console.warn("chunk manifest pending",key,err);
    return null;
  }
}

async function fetchChunk31(key,manifest,entry){
  const id=key+":"+entry.cx+":"+entry.cz;
  if(CHUNK31.loaded.has(id)||CHUNK31.loading.has(id))return;
  CHUNK31.loading.add(id);
  try{
    const r=await fetch("./geodata/chunks/"+key+"/"+entry.file+"?v=3.1");
    if(!r.ok)throw new Error("chunk "+r.status);
    const fc=await r.json();
    appendEnvironment30(fc,key);
    CHUNK31.loaded.set(id,{id,key,cx:entry.cx,cz:entry.cz,lastUsed:performance.now()});
  }catch(err){
    console.warn("environment chunk failed",id,err);
  }finally{
    CHUNK31.loading.delete(id);
  }
}

function touchNearbyChunks31(key,manifest,actor){
  const c=manifestLocalChunk31(actor,manifest);
  for(let dx=-CHUNK31.radius;dx<=CHUNK31.radius;dx++){
    for(let dz=-CHUNK31.radius;dz<=CHUNK31.radius;dz++){
      const entry=manifest.index.get((c.cx+dx)+":"+(c.cz+dz));
      if(!entry)continue;
      const id=key+":"+entry.cx+":"+entry.cz;
      const loaded=CHUNK31.loaded.get(id);
      if(loaded)loaded.lastUsed=performance.now();
      else fetchChunk31(key,manifest,entry);
    }
  }
}

function pruneVisitedChunks31(){
  if(CHUNK31.loaded.size<=CHUNK31.maxVisitedChunks)return;
  const arr=[...CHUNK31.loaded.values()].sort((a,b)=>a.lastUsed-b.lastUsed);
  const remove=arr.slice(0,CHUNK31.loaded.size-CHUNK31.maxVisitedChunks);
  // Geometry is already managed by ENV20 distance streaming. Here we only
  // release loader bookkeeping so distant chunks can be fetched again later.
  for(const item of remove)CHUNK31.loaded.delete(item.id);
}

async function initializeChunkStreaming31(){
  if(!GEO10.active)return false;
  const list=await Promise.all(CHUNK31.municipalities.map(async key=>[key,await loadManifest31(key)]));
  let count=0;
  for(const [key,m] of list)if(m)count++;
  if(!count)return false;
  ENV20.ready=true;
  // Disable legacy whole-municipality downloads once chunk manifests exist.
  loadEnvironment20=async()=>false;
  loadRegionEnvironment30=async()=>false;
  CHUNK31.ready=true;
  toast("Sectorstreaming actief • "+count+" regio's");
  return true;
}

const chunkInitPoll31=setInterval(async()=>{
  if(CHUNK31.ready){clearInterval(chunkInitPoll31);return}
  if(await initializeChunkStreaming31())clearInterval(chunkInitPoll31);
},1800);

function chunkLoop31(now){
  if(!running||!GEO10.active||!CHUNK31.ready)return;
  if(now-CHUNK31.last<550)return;
  CHUNK31.last=now;
  const actor=inVehicle?heroCar.position:player.position;
  for(const [key,m] of CHUNK31.manifests)touchNearbyChunks31(key,m,actor);
  pruneVisitedChunks31();
}

// 3.1 loader priority: prefer streamed manifests before legacy whole-file fetches.
const legacyEnvironmentLoader31=loadEnvironment20;
const legacyRegionEnvironmentLoader31=loadRegionEnvironment30;
loadEnvironment20=async function(){
  if(GEO10.active){
    const m=await loadManifest31("erpe_mere");
    if(m){
      CHUNK31.manifests.set("erpe_mere",m);
      ENV20.ready=true;CHUNK31.ready=true;
      return true;
    }
  }
  return legacyEnvironmentLoader31();
};
loadRegionEnvironment30=async function(key){
  if(GEO10.active){
    const m=await loadManifest31(key);
    if(m){
      CHUNK31.manifests.set(key,m);
      ENV20.ready=true;CHUNK31.ready=true;
      REG30.environmentLoaded.add(key);
      return true;
    }
  }
  return legacyRegionEnvironmentLoader31(key);
};


// ===== DENDER COUNTY 4.0 — AAA-STYLE QUALITY PASS =====
window.__DENDER_VERSION__="4.0";

const VIS40={
  facadeMats:[],
  npcMixers:[],
  streetLast:0,
  treeLast:0,
  npcInstalled:false,
  vehiclesInstalled:false,
  truckAsset:null
};

function facadeTextures40(seed){
  const c=document.createElement("canvas");c.width=512;c.height=512;
  const x=c.getContext("2d");
  const palettes=[
    ["#9c5d49","#d1a18c"],["#b77a5a","#deb39a"],["#d7c6b2","#f0e5d5"],
    ["#7c4c3f","#b57a67"],["#c6b49a","#e4d5bf"],["#9a8b7a","#d2c3b0"]
  ];
  const pal=palettes[seed%palettes.length];
  x.fillStyle=pal[0];x.fillRect(0,0,512,512);
  x.globalAlpha=.22;x.strokeStyle=pal[1];x.lineWidth=2;
  for(let y=0;y<512;y+=24){
    x.beginPath();x.moveTo(0,y);x.lineTo(512,y);x.stroke();
    const off=((y/24)%2)*28;
    for(let xx=-off;xx<512;xx+=56){x.beginPath();x.moveTo(xx,y);x.lineTo(xx,y+24);x.stroke()}
  }
  x.globalAlpha=1;
  const floors=3,cols=4;
  const lit=[];
  for(let fy=0;fy<floors;fy++){
    for(let fx=0;fx<cols;fx++){
      const wx=52+fx*116,wy=62+fy*145;
      x.fillStyle="#252b2e";x.fillRect(wx,wy,66,78);
      x.fillStyle=(seed+fx+fy)%3===0?"#e4c386":"#88a4ad";
      x.globalAlpha=(seed+fx+fy)%3===0?.9:.6;x.fillRect(wx+5,wy+5,56,68);x.globalAlpha=1;
      x.strokeStyle="#e7e0d5";x.lineWidth=5;x.strokeRect(wx,wy,66,78);
      x.beginPath();x.moveTo(wx+33,wy);x.lineTo(wx+33,wy+78);x.stroke();
      lit.push({wx,wy,on:(seed+fx+fy)%3===0});
    }
  }
  const e=document.createElement("canvas");e.width=e.height=512;
  const ex=e.getContext("2d");ex.fillStyle="#000";ex.fillRect(0,0,512,512);
  for(const w of lit)if(w.on){ex.fillStyle="#fff";ex.fillRect(w.wx+5,w.wy+5,56,68)}
  const map=new THREE.CanvasTexture(c),em=new THREE.CanvasTexture(e);
  map.colorSpace=THREE.SRGBColorSpace;em.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=em.wrapS=em.wrapT=THREE.RepeatWrapping;
  map.repeat.set(1,1);em.repeat.set(1,1);
  return{map,em};
}

function facadeMaterial40(seed){
  if(VIS40.facadeMats[seed])return VIS40.facadeMats[seed];
  const base=mat.brick[seed%mat.brick.length].clone();
  const t=facadeTextures40(seed);
  base.map=t.map;base.emissiveMap=t.em;base.emissive=new THREE.Color(0xffc56d);
  base.emissiveIntensity=.08;base.roughness=.82;base.metalness=0;
  base.needsUpdate=true;VIS40.facadeMats[seed]=base;return base;
}

const legacyBuildBuilding40=buildBuilding20;
buildBuilding20=function(item,parent){
  const p=item.ft.properties||{},h=THREE.MathUtils.clamp(Number(p.height_m)||6,2.8,34);
  const shape=makeShape20(item.pts,item.c);let geo;
  try{geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,steps:1,curveSegments:1})}catch{return}
  geo.rotateX(-Math.PI/2);
  const seed=hash20(p.source_id||"building")%6,wall=facadeMaterial40(seed);
  const roof=ENV20.roofMat.clone();roof.color.offsetHSL(0,0,(seed%3-1)*.04);
  const mesh=new THREE.Mesh(geo,[roof,wall]);
  mesh.position.set(item.c.x,0,item.c.z);mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.userData.facade40=true;parent.add(mesh);
};

function updateFacadeNight40(){
  const daylight=day>=7&&day<=19;
  for(const m of VIS40.facadeMats)if(m)m.emissiveIntensity=daylight?.015:.32;
}

// Road markings around player.
const MARK40={
  max:900,lastActor:new THREE.Vector3(1e9,0,1e9),
  mesh:null
};
(function initMarkings40(){
  const geo=new THREE.BoxGeometry(.12,.025,2.6);
  const m=new THREE.MeshStandardMaterial({color:0xf1eee5,roughness:.74});
  MARK40.mesh=new THREE.InstancedMesh(geo,m,MARK40.max);
  MARK40.mesh.count=0;MARK40.mesh.receiveShadow=true;MARK40.mesh.userData.realGeo10=true;
  GEO10.group.add(MARK40.mesh);
})();
function refreshMarkings40(actor){
  if(!GEO10.active||actor.distanceToSquared(MARK40.lastActor)<140*140)return;
  MARK40.lastActor.copy(actor);
  const q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(1,1,1),mx=new THREE.Matrix4(),yAxis=new THREE.Vector3(0,1,0);
  let n=0;
  for(const e of GEO10.driveEdges){
    if(e.width<5.7)continue;
    for(let i=1;i<e.points.length&&n<MARK40.max;i++){
      const a=e.points[i-1],b=e.points[i];
      const mid=a.clone().add(b).multiplyScalar(.5);
      if(mid.distanceToSquared(actor)>850*850)continue;
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),ang=Math.atan2(dx,dz);
      const dashes=Math.max(1,Math.floor(len/8));
      for(let k=0;k<dashes&&n<MARK40.max;k++){
        if(k%2)continue;
        const t=(k+.5)/dashes;
        p.lerpVectors(a,b,t);p.y=.155;
        q.setFromAxisAngle(yAxis,ang);mx.compose(p,q,sc);
        MARK40.mesh.setMatrixAt(n++,mx);
      }
    }
    if(n>=MARK40.max)break;
  }
  MARK40.mesh.count=n;MARK40.mesh.instanceMatrix.needsUpdate=true;
}

// Street-light pool; only eight actual PointLights, all bulbs emissive.
const LAMP40={groups:[],lastActor:new THREE.Vector3(1e9,0,1e9)};
(function initLamps40(){
  const metal=new THREE.MeshStandardMaterial({color:0x5b6064,metalness:.7,roughness:.36});
  const bulb=new THREE.MeshStandardMaterial({color:0xe8e0c8,emissive:0xffd88f,emissiveIntensity:.5});
  for(let i=0;i<28;i++){
    const g=new THREE.Group();g.visible=false;g.userData.realGeo10=true;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,5.4,8),metal);pole.position.y=2.7;g.add(pole);
    const arm=meshBox(1.15,.07,.07,metal,.5,5.15,0);g.add(arm);
    const b=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),bulb.clone());b.position.set(1.03,5.02,0);g.add(b);
    if(i<8){const light=new THREE.PointLight(0xffd7a0,0,20,2);light.position.set(1.03,4.8,0);g.add(light);g.userData.light=light}
    g.userData.bulb=b;GEO10.group.add(g);LAMP40.groups.push(g);
  }
})();
function refreshLamps40(actor){
  if(!GEO10.active||actor.distanceToSquared(LAMP40.lastActor)<120*120)return;
  LAMP40.lastActor.copy(actor);
  const candidates=[];
  for(const n of GEO10.nodes.values()){
    const d=n.pos.distanceToSquared(actor);
    if(d<720*720)candidates.push({n,d});
  }
  candidates.sort((a,b)=>a.d-b.d);
  for(let i=0;i<LAMP40.groups.length;i++){
    const g=LAMP40.groups[i],c=candidates[i*2];
    if(!c){g.visible=false;continue}
    g.visible=true;g.position.copy(c.n.pos);g.position.y=0;
    const adj=GEO10.adj.get(c.n.id)||[];
    if(adj[0]&&adj[0].points.length>1){
      const a=adj[0].points[0],b=adj[0].points[1];
      g.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+Math.PI/2;
    }
  }
}
function updateLamps40(){
  const night=day<6.5||day>19;
  LAMP40.groups.forEach(g=>{
    if(g.userData.bulb)g.userData.bulb.material.emissiveIntensity=night?3:.08;
    if(g.userData.light)g.userData.light.intensity=night?3.8:0;
  });
}

// Instanced trees from real vegetation polygons in currently loaded chunks.
const TREE40={max:260,trunks:null,crowns:null,lastActor:new THREE.Vector3(1e9,0,1e9)};
(function initTrees40(){
  TREE40.trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.2,2.4,7),new THREE.MeshStandardMaterial({color:0x5b4430,roughness:1}),TREE40.max);
  TREE40.crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.35,1),new THREE.MeshStandardMaterial({color:0x315a31,roughness:1}),TREE40.max);
  TREE40.trunks.count=TREE40.crowns.count=0;TREE40.trunks.castShadow=TREE40.crowns.castShadow=true;
  TREE40.trunks.userData.realGeo10=TREE40.crowns.userData.realGeo10=true;GEO10.group.add(TREE40.trunks,TREE40.crowns);
})();
function pointInPoly40(x,z,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i].x,zi=pts[i].z,xj=pts[j].x,zj=pts[j].z;
    const hit=((zi>z)!=(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi+1e-9)+xi);if(hit)inside=!inside;
  }
  return inside;
}
function refreshTrees40(actor){
  if(!ENV20.ready||actor.distanceToSquared(TREE40.lastActor)<180*180)return;
  TREE40.lastActor.copy(actor);
  const trunkM=new THREE.Matrix4(),crownM=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
  let n=0;
  for(const ch of ENV20.chunks.values()){
    if(n>=TREE40.max)break;
    if((ch.cx-actor.x)**2+(ch.cz-actor.z)**2>950*950)continue;
    for(const item of ch.features){
      if(item.ft.properties?.kind!=="vegetation"||item.pts.length<4)continue;
      const b=bounds20(item.pts),seed=hash20(item.ft.properties?.source_id||"veg");
      const tries=Math.min(10,2+Math.floor((b.maxX-b.minX)*(b.maxZ-b.minZ)/1800));
      for(let i=0;i<tries&&n<TREE40.max;i++){
        const rx=((seed+i*73)%997)/997,rz=((seed+i*137)%991)/991;
        const x=THREE.MathUtils.lerp(b.minX,b.maxX,rx),z=THREE.MathUtils.lerp(b.minZ,b.maxZ,rz);
        if(!pointInPoly40(x,z,item.pts))continue;
        const h=.8+((seed+i*19)%40)/100;
        sc.set(1,h,1);trunkM.compose(new THREE.Vector3(x,1.2*h,z),q,sc);
        crownM.compose(new THREE.Vector3(x,3.0*h,z),q,new THREE.Vector3(.8+h*.25,.8+h*.25,.8+h*.25));
        TREE40.trunks.setMatrixAt(n,trunkM);TREE40.crowns.setMatrixAt(n,crownM);n++;
      }
    }
  }
  TREE40.trunks.count=TREE40.crowns.count=n;TREE40.trunks.instanceMatrix.needsUpdate=TREE40.crowns.instanceMatrix.needsUpdate=true;
}

// Rigged NPC crowd, cloned safely through SkeletonUtils.
async function installRiggedNPCs40(){
  if(VIS40.npcInstalled)return;
  const gltf=await assetManager06.loadGLB(ASSETS06.player.id,ASSETS06.player.url);if(!gltf)return;
  const target=pedestrians.slice(0,12);
  target.forEach((p,i)=>{
    const visual=fitModelHeight07(SkeletonUtils.clone(gltf.scene),2.75+(i%4)*.08);
    visual.userData.asset07=true;visual.rotation.y=Math.PI;
    visual.traverse(o=>{
      if(o.isMesh&&o.material){
        o.material=o.material.clone();
        if(o.material.color)o.material.color.offsetHSL((i%6-.3)*.02,(i%3)*.03,(i%5-2)*.035);
      }
    });
    p.add(visual);hidePrimitiveHuman07(p);p.userData.rig40=visual;
    if(gltf.animations?.length){
      const mixer=new THREE.AnimationMixer(visual),action=mixer.clipAction(gltf.animations[0]);action.play();
      VIS40.npcMixers.push({mixer,p,phase:i*.13});
    }
  });
  VIS40.npcInstalled=true;toast("Rigged NPC-populatie geladen");
}
installRiggedNPCs40();

// Additional free CC-BY delivery-truck visual, stripped of obvious logo nodes and covered by blank side panels.
ASSETS06.deliveryTruck={
  id:"khronos-cesium-milktruck-ccby4",
  url:"https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@c6a6bd13ab2b3c685c7903d03561b8a9392f38b8/Models/CesiumMilkTruck/glTF-Binary/CesiumMilkTruck.glb",
  license:"CC-BY-4.0",
  credit:"© 2017 Cesium — Khronos glTF Sample Assets"
};
async function installTrafficVariety40(){
  if(VIS40.vehiclesInstalled)return;
  const toy=await assetManager06.loadGLB(ASSETS06.heroCar.id,ASSETS06.heroCar.url);
  if(toy){
    traffic.forEach((car,i)=>{
      if(car.userData.productionVisual)return;
      const visual=fitModel06(toy.scene.clone(true),4.05+(i%3)*.16);visual.userData.asset06=true;visual.rotation.y=Math.PI;
      visual.traverse(o=>{if(o.isMesh&&o.material){o.material=o.material.clone();if(o.material.color)o.material.color.offsetHSL((i%7)*.04,0,(i%5-2)*.04)}});
      car.add(visual);hidePrimitiveCarShell06(car);car.userData.productionVisual=visual;
    });
  }
  const truck=await assetManager06.loadGLB(ASSETS06.deliveryTruck.id,ASSETS06.deliveryTruck.url);
  if(truck){
    for(const [idx,car] of [[2,traffic[2]],[9,traffic[9]]]){
      if(!car)continue;
      if(car.userData.productionVisual)car.remove(car.userData.productionVisual);
      const visual=fitModel06(truck.scene.clone(true),5.7);visual.userData.asset06=true;visual.rotation.y=Math.PI;
      visual.traverse(o=>{if(/logo|cesium/i.test(o.name||""))o.visible=false});
      const blank=new THREE.MeshStandardMaterial({color:idx===2?0xe8e1d5:0x546b77,roughness:.62,metalness:.12});
      addBox(visual,2.2,1.3,.045,blank,-1.42,1.8,0);addBox(visual,2.2,1.3,.045,blank,1.42,1.8,0);
      car.add(visual);hidePrimitiveCarShell06(car);car.userData.productionVisual=visual;car.userData.vehicleClass="delivery";
    }
  }
  VIS40.vehiclesInstalled=true;toast("Verkeersvariatie geladen");
}
installTrafficVariety40();

// More believable headway and weather-sensitive speeds on the official graph.
const legacyUpdateTraffic40=updateTraffic10;
updateTraffic10=function(dt){
  for(const a of GEO10.trafficAgents){
    if(!a.pts||a.index>=a.pts.length){
      const next=chooseNext10(a.next,a.node);
      if(!next){a.car.userData.speed=0;continue}
      a.prev=a.node;a.node=a.next;a.next=next.to;a.entry=next;a.pts=next.points;a.index=1;
    }
    const target=a.pts[a.index];if(!target)continue;
    const dir=target.clone().sub(a.car.position);dir.y=0;const dist=dir.length();
    let desired=a.car.userData.vehicleClass==="delivery"?6.4:8.4;
    const edge=a.entry?.edge;
    if(edge?.width>=7.5)desired+=2.2;
    if(edge?.width<=5.2)desired-=1.3;
    desired*=THREE.MathUtils.lerp(1,.78,v04.rainIntensity||0);
    for(const b of GEO10.trafficAgents){
      if(a===b)continue;
      const d=a.car.position.distanceTo(b.car.position);
      if(d<8){desired=Math.min(desired,Math.max(0,(d-3)*1.1))}
    }
    for(const ped of PED20.agents){
      const d=a.car.position.distanceTo(ped.p.position);
      if(d<5.5){desired=Math.min(desired,Math.max(0,(d-2.2)*.9))}
    }
    a.car.userData.speed=THREE.MathUtils.lerp(a.car.userData.speed||0,desired,Math.min(1,dt*2.4));
    if(dist<1.4){a.index++;continue}
    dir.normalize();a.car.position.addScaledVector(dir,Math.min(dist,a.car.userData.speed*dt));
    a.car.rotation.y=THREE.MathUtils.lerp(a.car.rotation.y,Math.atan2(dir.x,dir.z),Math.min(1,dt*5));
    animateCar04(a.car,dt,0,desired<2);
  }
};

let last40=performance.now();
function qualityLoop40(now){
  const dt=Math.min((now-last40)/1000,.04);last40=now;
  if(!running||!GEO10.active)return;
  const actor=inVehicle?heroCar.position:player.position;
  if(now-VIS40.streetLast>900){
    VIS40.streetLast=now;refreshMarkings40(actor);refreshLamps40(actor);updateFacadeNight40();updateLamps40();
  }
  if(now-VIS40.treeLast>1700){VIS40.treeLast=now;refreshTrees40(actor)}
  for(const x of VIS40.npcMixers)x.mixer.update(dt*(.85+x.phase*.15));
}

// ===== DENDER COUNTY 5.0 — ROAD RULES / VEHICLE DAMAGE / PREDICTIVE POLICE =====
window.__DENDER_VERSION__="5.0";

const SIM50={
  damage:0,
  steer:0,
  brakePitch:0,
  bodyRoll:0,
  lastSpeed:0,
  lastCollision:0,
  roadCache:{edge:null,pos:new THREE.Vector3(1e9,0,1e9)},
  policeLastKnown:new THREE.Vector3(),
  policeSearchUntil:0,
  ui:null
};

function roadProfile50(e){
  const s=((e?.props?.road_class||"")+" "+(e?.props?.road_category||"")+" "+(e?.props?.access||"")).toLowerCase();
  const bike=s.includes("fiets")||s.includes("wandel");
  const major=s.includes("hoofd")||s.includes("primaire")||s.includes("secundaire")||e?.width>=7.5;
  const local=!major&&!bike;
  return{bike,major,local};
}

const ROAD50={
  maxCenter:1300,maxEdge:1500,maxBike:900,maxJunction:450,
  lastActor:new THREE.Vector3(1e9,0,1e9),
  center:null,edge:null,bike:null,junction:null
};
(function initRoadRules50(){
  const white=new THREE.MeshStandardMaterial({color:0xf4f1e9,roughness:.76});
  const red=new THREE.MeshStandardMaterial({color:0xa44539,roughness:.9});
  ROAD50.center=new THREE.InstancedMesh(new THREE.BoxGeometry(.13,.025,2.8),white,ROAD50.maxCenter);
  ROAD50.edge=new THREE.InstancedMesh(new THREE.BoxGeometry(.11,.025,4.2),white.clone(),ROAD50.maxEdge);
  ROAD50.bike=new THREE.InstancedMesh(new THREE.BoxGeometry(1.7,.022,4.5),red,ROAD50.maxBike);
  ROAD50.junction=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.03,.22),white.clone(),ROAD50.maxJunction);
  for(const m of [ROAD50.center,ROAD50.edge,ROAD50.bike,ROAD50.junction]){
    m.count=0;m.receiveShadow=true;m.userData.realGeo10=true;GEO10.group.add(m);
  }
})();

function composeBox50(mesh,index,pos,ang,sx,sz){
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),ang);
  const mx=new THREE.Matrix4();
  mx.compose(new THREE.Vector3(pos.x,.158,pos.z),q,new THREE.Vector3(sx,1,sz));
  mesh.setMatrixAt(index,mx);
}

function refreshRoadRules50(actor){
  if(!GEO10.active||actor.distanceToSquared(ROAD50.lastActor)<110*110)return;
  ROAD50.lastActor.copy(actor);
  let nc=0,ne=0,nb=0,nj=0;
  const radius2=950*950;
  for(const e of GEO10.edges){
    const profile=roadProfile50(e);
    for(let i=1;i<e.points.length;i++){
      const a=e.points[i-1],b=e.points[i],mid=a.clone().add(b).multiplyScalar(.5);
      if(mid.distanceToSquared(actor)>radius2)continue;
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),ang=Math.atan2(dx,dz);
      if(profile.bike&&nb<ROAD50.maxBike){
        const pieces=Math.max(1,Math.ceil(len/6));
        for(let k=0;k<pieces&&nb<ROAD50.maxBike;k++){
          const p=a.clone().lerp(b,(k+.5)/pieces);
          composeBox50(ROAD50.bike,nb++,p,ang,1,Math.min(1.25,len/(pieces*4.5)));
        }
        continue;
      }
      if(e.width>=5.6&&nc<ROAD50.maxCenter){
        const dashes=Math.max(1,Math.floor(len/7));
        for(let k=0;k<dashes&&nc<ROAD50.maxCenter;k+=2){
          const p=a.clone().lerp(b,(k+.5)/dashes);
          composeBox50(ROAD50.center,nc++,p,ang,1,1);
        }
      }
      if(profile.major&&ne+2<ROAD50.maxEdge){
        const pieces=Math.max(1,Math.ceil(len/5));
        const side=e.width*.43;
        const nx=Math.cos(ang),nz=-Math.sin(ang);
        for(let k=0;k<pieces&&ne+2<ROAD50.maxEdge;k++){
          const p=a.clone().lerp(b,(k+.5)/pieces);
          composeBox50(ROAD50.edge,ne++,new THREE.Vector3(p.x+nx*side,0,p.z+nz*side),ang,1,1);
          composeBox50(ROAD50.edge,ne++,new THREE.Vector3(p.x-nx*side,0,p.z-nz*side),ang,1,1);
        }
      }
    }
    for(const endpoint of [e.a,e.b]){
      if(!endpoint||nj>=ROAD50.maxJunction)continue;
      const degree=(GEO10.adj.get(endpoint)||[]).filter(x=>x.edge.drive).length;
      if(degree<3)continue;
      const pts=endpoint===e.b?[...e.points].reverse():e.points;
      if(pts.length<2)continue;
      const node=pts[0],next=pts[1],dir=next.clone().sub(node).setY(0);
      const len=dir.length();if(len<1)continue;dir.normalize();
      const bar=node.clone().addScaledVector(dir,4.2);
      const ang=Math.atan2(dir.x,dir.z)+Math.PI/2;
      composeBox50(ROAD50.junction,nj++,bar,ang,Math.max(2.8,e.width*.72),1);
    }
  }
  ROAD50.center.count=nc;ROAD50.edge.count=ne;ROAD50.bike.count=nb;ROAD50.junction.count=nj;
  ROAD50.center.instanceMatrix.needsUpdate=ROAD50.edge.instanceMatrix.needsUpdate=
  ROAD50.bike.instanceMatrix.needsUpdate=ROAD50.junction.instanceMatrix.needsUpdate=true;
}

function nearestDriveEdge50(pos){
  if(SIM50.roadCache.edge&&pos.distanceToSquared(SIM50.roadCache.pos)<12*12)return SIM50.roadCache.edge;
  let best=null,bd=Infinity;
  for(const e of GEO10.driveEdges){
    for(let i=1;i<e.points.length;i++){
      const a=e.points[i-1],b=e.points[i];
      const d=pointSegDistSq09(pos.x,pos.z,{x1:a.x,z1:a.z,x2:b.x,z2:b.z});
      if(d<bd){bd=d;best=e}
    }
  }
  SIM50.roadCache={edge:best,pos:pos.clone()};return best;
}

function buildVehicleConditionUI50(){
  if(document.querySelector("#vehicleCondition50"))return;
  const el=document.createElement("div");el.id="vehicleCondition50";
  el.style.cssText="position:fixed;right:14px;top:82px;z-index:12;width:150px;padding:8px 10px;border-radius:8px;background:rgba(8,10,14,.62);color:#fff;font:700 10px system-ui;letter-spacing:.05em;pointer-events:none";
  el.innerHTML='<div style="display:flex;justify-content:space-between"><span>VOERTUIG</span><span id="damageText50">100%</span></div><div style="height:5px;background:#30343a;border-radius:4px;margin-top:5px;overflow:hidden"><div id="damageBar50" style="height:100%;width:100%;background:#e4ddd0"></div></div>';
  document.body.appendChild(el);SIM50.ui=el;
}
buildVehicleConditionUI50();

function updateVehicleConditionUI50(){
  const t=document.querySelector("#damageText50"),b=document.querySelector("#damageBar50");
  if(!t||!b)return;
  const condition=Math.max(0,Math.round(100-SIM50.damage));
  t.textContent=condition+"%";b.style.width=condition+"%";
  b.style.background=condition>65?"#e4ddd0":condition>30?"#d7a64a":"#c84b43";
  SIM50.ui.style.display=inVehicle?"block":"none";
}

const SMOKE50={points:null,vel:[],life:[]};
(function initSmoke50(){
  const n=34,pos=new Float32Array(n*3);SMOKE50.vel.length=n;SMOKE50.life.length=n;
  for(let i=0;i<n;i++){SMOKE50.vel[i]=.35+rnd()*.55;SMOKE50.life[i]=rnd()}
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(pos,3));
  const m=new THREE.PointsMaterial({color:0xb7b8b4,size:.23,transparent:true,opacity:.0,depthWrite:false});
  SMOKE50.points=new THREE.Points(g,m);SMOKE50.points.visible=false;heroCar.add(SMOKE50.points);
})();
function updateSmoke50(dt){
  const active=SIM50.damage>58&&inVehicle;SMOKE50.points.visible=active;if(!active)return;
  SMOKE50.points.material.opacity=THREE.MathUtils.clamp((SIM50.damage-55)/45,.08,.58);
  const a=SMOKE50.points.geometry.attributes.position.array;
  for(let i=0;i<SMOKE50.life.length;i++){
    SMOKE50.life[i]+=dt*SMOKE50.vel[i];
    if(SMOKE50.life[i]>1)SMOKE50.life[i]=0;
    const t=SMOKE50.life[i],ang=i*2.399;
    a[i*3]=Math.cos(ang)*(.08+t*.28);a[i*3+1]=1.6+t*2.2;a[i*3+2]=.55+Math.sin(ang)*(.08+t*.25);
  }
  SMOKE50.points.geometry.attributes.position.needsUpdate=true;
}

function applyDamageVisual50(){
  const visual=heroCar.userData.productionVisual;if(!visual)return;
  const factor=THREE.MathUtils.clamp(SIM50.damage/100,0,1);
  visual.traverse(o=>{
    if(!o.isMesh||!o.material)return;
    if(!o.userData.damageMat50){
      o.material=o.material.clone();
      if(o.material.color)o.userData.originalColor50=o.material.color.clone();
      o.userData.damageMat50=true;
    }
    if(o.material.color&&o.userData.originalColor50){
      o.material.color.copy(o.userData.originalColor50).lerp(new THREE.Color(0x343331),factor*.42);
      o.material.roughness=THREE.MathUtils.clamp((o.material.roughness??.5)+factor*.22,0,1);
    }
  });
}

function addDamage50(amount,reason){
  if(performance.now()-SIM50.lastCollision<400)return;
  SIM50.lastCollision=performance.now();
  SIM50.damage=THREE.MathUtils.clamp(SIM50.damage+amount,0,100);
  applyDamageVisual50();updateVehicleConditionUI50();
  if(reason)toast(reason+" • voertuig "+Math.round(100-SIM50.damage)+"%");
}

function driveHero50(dt){
  const car=heroCar,edge=nearestDriveEdge50(car.position),profile=roadProfile50(edge);
  const rain=v04.rainIntensity||0,condition=1-SIM50.damage/100;
  const throttle=keys.KeyW?1:0,reverse=keys.KeyS?1:0,handbrake=keys.Space?1:0;
  const rawSteer=(keys.KeyA?1:0)-(keys.KeyD?1:0);
  SIM50.steer=THREE.MathUtils.lerp(SIM50.steer,rawSteer,Math.min(1,dt*6.5));
  let max=profile.major?32:profile.bike?9:24;
  max*=THREE.MathUtils.lerp(.72,1,condition);
  const wetGrip=THREE.MathUtils.lerp(1,.72,rain);
  const accel=(10.5+4.5*condition)*(1-Math.min(Math.abs(car.userData.speed)/Math.max(max,1),1)*.42);
  if(throttle)car.userData.speed+=accel*dt;
  if(reverse){
    if(car.userData.speed>1)car.userData.speed-=24*dt;
    else car.userData.speed-=7.5*dt;
  }
  if(!throttle&&!reverse)car.userData.speed*=Math.pow(profile.bike?.3:.57,dt);
  if(handbrake)car.userData.speed*=Math.pow(.06,dt);
  car.userData.speed=THREE.MathUtils.clamp(car.userData.speed,-8,max);
  const speed=Math.abs(car.userData.speed);
  const steerGain=THREE.MathUtils.lerp(1.7,.58,Math.min(speed/32,1))*wetGrip;
  if(speed>.22)car.userData.heading+=SIM50.steer*dt*(car.userData.speed>=0?1:-1)*steerGain;
  if(handbrake&&speed>7)car.userData.heading+=SIM50.steer*dt*.9*wetGrip;
  car.rotation.y=car.userData.heading;
  car.position.x+=Math.sin(car.userData.heading)*car.userData.speed*dt;
  car.position.z+=Math.cos(car.userData.heading)*car.userData.speed*dt;
  clampActor10(car);

  const braking=reverse&&SIM50.lastSpeed>2;
  SIM50.brakePitch=THREE.MathUtils.lerp(SIM50.brakePitch,braking?.055:throttle?-.025:0,Math.min(1,dt*5));
  SIM50.bodyRoll=THREE.MathUtils.lerp(SIM50.bodyRoll,-SIM50.steer*Math.min(speed/25,1)*.075,Math.min(1,dt*4));
  const visual=car.userData.productionVisual;
  if(visual){
    visual.position.y=THREE.MathUtils.lerp(visual.position.y,Math.sin(performance.now()*.012)*Math.min(speed/28,.035),Math.min(1,dt*6));
    visual.rotation.x=SIM50.brakePitch;
    visual.rotation.z=SIM50.bodyRoll;
  }
  SIM50.lastSpeed=speed;
  animateCar04(car,dt,SIM50.steer,braking||handbrake);
}

function installCollisions50(){
  if(!GEO10.active||!ENV20.ready){installCollisions20();return}
  if(!inVehicle){
    if(collidesBuildings20(player.position,.55))player.position.copy(v02.playerPrev);
    else v02.playerPrev.copy(player.position);
    return;
  }
  const speed=Math.abs(heroCar.userData.speed);
  if(collidesBuildings20(heroCar.position,1.22)){
    heroCar.position.copy(v02.carPrev);
    addDamage50(Math.min(24,3+speed*1.15),"Botsing met gebouw");
    heroCar.userData.speed*=-.16;
    wanted=Math.min(5,wanted+(speed>8?.6:.15));wantedCooldown=12;
    return;
  }
  for(const a of GEO10.trafficAgents){
    if(a.car===heroCar)continue;
    if(heroCar.position.distanceTo(a.car.position)<2.65){
      addDamage50(Math.min(20,2+speed*.85),"Verkeersbotsing");
      heroCar.position.copy(v02.carPrev);heroCar.userData.speed*=-.11;
      wanted=Math.min(5,wanted+.55);wantedCooldown=14;return;
    }
  }
  v02.carPrev.copy(heroCar.position);
}

function chooseNextVehicle50(agent){
  const opts=(GEO10.adj.get(agent.next)||[]).filter(x=>x.edge.drive&&x.to!==agent.node);
  if(!opts.length)return chooseNext10(agent.next,agent.node);
  let total=0;const weighted=opts.map(x=>{
    const p=roadProfile50(x.edge);
    const w=(p.major?2.4:p.bike?.05:1.2)*(x.edge.width>=5.6?1.25:1);
    total+=w;return{x,w};
  });
  let pick=rnd()*total;
  for(const e of weighted){pick-=e.w;if(pick<=0)return e.x}
  return weighted[weighted.length-1].x;
}

function updateTraffic50(dt){
  for(const a of GEO10.trafficAgents){
    if(!a.pts||a.index>=a.pts.length){
      const next=chooseNextVehicle50(a);
      if(!next){a.car.userData.speed=0;continue}
      a.prev=a.node;a.node=a.next;a.next=next.to;a.entry=next;a.pts=next.points;a.index=1;
    }
    const target=a.pts[a.index];if(!target)continue;
    const dir=target.clone().sub(a.car.position);dir.y=0;const dist=dir.length();
    const edge=a.entry?.edge,profile=roadProfile50(edge);
    let desired=a.car.userData.vehicleClass==="delivery"?6.6:profile.major?10.8:7.8;
    const remaining=(a.pts.length-a.index);
    const junctionDegree=(GEO10.adj.get(a.next)||[]).filter(x=>x.edge.drive).length;
    if(remaining<=1&&junctionDegree>=3)desired=Math.min(desired,3.4);
    desired*=THREE.MathUtils.lerp(1,.76,v04.rainIntensity||0);
    for(const b of GEO10.trafficAgents){
      if(a===b)continue;
      const d=a.car.position.distanceTo(b.car.position);
      if(d<9)desired=Math.min(desired,Math.max(0,(d-3.1)*1.05));
    }
    for(const ped of PED20.agents){
      const d=a.car.position.distanceTo(ped.p.position);
      if(d<5.2)desired=Math.min(desired,Math.max(0,(d-2)*.8));
    }
    if(wanted>0&&police.visible&&a.car.position.distanceTo(police.position)<18)desired*=.55;
    a.car.userData.speed=THREE.MathUtils.lerp(a.car.userData.speed||0,desired,Math.min(1,dt*2.7));
    if(dist<1.25){a.index++;continue}
    dir.normalize();a.car.position.addScaledVector(dir,Math.min(dist,a.car.userData.speed*dt));
    const targetYaw=Math.atan2(dir.x,dir.z);
    let dy=((targetYaw-a.car.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
    a.car.rotation.y+=dy*Math.min(1,dt*4.2);
    animateCar04(a.car,dt,dy,desired<1.5);
  }
}

function updatePeds50(dt){
  for(const a of PED20.agents){
    a.wait50=Math.max(0,(a.wait50||0)-dt);
    if(a.wait50>0)continue;
    if(!a.pts||a.index>=a.pts.length){
      const n=choosePedEdge20(a.next,a.node);if(!n)continue;
      const degree=(GEO10.adj.get(a.next)||[]).length;
      if(degree>=3&&rnd()<.38)a.wait50=.6+rnd()*1.8;
      a.prev=a.node;a.node=a.next;a.next=n.to;a.pts=n.points;a.index=1;
    }
    const t=a.pts[a.index];if(!t)continue;
    tempV.copy(t).sub(a.p.position);tempV.y=0;
    if(tempV.length()<.72){a.index++;continue}
    let slow=1;
    for(const b of PED20.agents){
      if(a===b)continue;const d=a.p.position.distanceTo(b.p.position);if(d<1.05)slow=.35;
    }
    tempV.normalize();a.p.position.addScaledVector(tempV,a.p.userData.speed*slow*dt);
    a.p.rotation.y=THREE.MathUtils.lerp(a.p.rotation.y,Math.atan2(tempV.x,tempV.z),Math.min(1,dt*6));
  }
}

function routePolice50(start,goal){
  if(!start||!goal)return[];
  const pq=new MinHeap10(),dist=new Map([[start,0]]),prev=new Map();pq.push([0,start]);
  while(pq.length){
    const [d,u]=pq.pop();if(u===goal)break;if(d!==(dist.get(u)??Infinity))continue;
    for(const x of GEO10.adj.get(u)||[]){
      if(!x.edge.drive)continue;
      const p=roadProfile50(x.edge),factor=p.major?.72:p.bike?2.8:1;
      const nd=d+x.edge.length*factor;
      if(nd<(dist.get(x.to)??Infinity)){dist.set(x.to,nd);prev.set(x.to,u);pq.push([nd,x.to])}
    }
  }
  if(!dist.has(goal))return[];
  const out=[];let u=goal;while(u){out.push(u);if(u===start)break;u=prev.get(u)}return out.reverse();
}

function predictiveTarget50(){
  const target=inVehicle?heroCar.position:player.position;
  const result=target.clone();
  if(inVehicle){
    const lead=THREE.MathUtils.clamp(Math.abs(heroCar.userData.speed)*1.4,12,70);
    result.x+=Math.sin(heroCar.userData.heading)*lead;
    result.z+=Math.cos(heroCar.userData.heading)*lead;
  }
  return result;
}

function updatePolice50(dt,elapsed){
  if(wanted<=0){
    police.visible=false;police.userData.spawned10=false;blueLight.intensity=redLight.intensity=0;SIM50.policeSearchUntil=0;return;
  }
  const target=inVehicle?heroCar.position:player.position;
  SIM50.policeLastKnown.copy(target);
  police.visible=true;
  if(!police.userData.spawned10){
    let best=null,score=Infinity;
    for(const n of GEO10.nodes.values()){
      const d=n.pos.distanceTo(target);
      if(d>180&&d<420&&Math.abs(d-280)<score){score=Math.abs(d-280);best=n}
    }
    police.position.copy(best?best.pos:target.clone().add(new THREE.Vector3(220,0,180)));
    police.userData.spawned10=true;GEO10.lastPoliceRoute=0;
  }
  if(performance.now()-GEO10.lastPoliceRoute>1050||GEO10.policePathIndex>=GEO10.policePath.length){
    GEO10.lastPoliceRoute=performance.now();
    const intercept=predictiveTarget50();
    const s=nearestNode10(police.position,true),g=nearestNode10(intercept,true);
    GEO10.policePath=routePolice50(s,g).map(id=>GEO10.nodes.get(id)?.pos.clone()).filter(Boolean);
    GEO10.policePathIndex=0;
  }
  const p=GEO10.policePath[GEO10.policePathIndex];
  if(p){
    tempV.copy(p).sub(police.position);tempV.y=0;
    if(tempV.length()<2.2)GEO10.policePathIndex++;
    else{
      tempV.normalize();
      const speed=(12.2+wanted*1.45)*THREE.MathUtils.lerp(1,.86,v04.rainIntensity||0);
      police.position.addScaledVector(tempV,speed*dt);
      police.rotation.y=THREE.MathUtils.lerp(police.rotation.y,Math.atan2(tempV.x,tempV.z),Math.min(1,dt*5));
    }
  }
  const flash=Math.sin(elapsed*15)>0;blueLight.intensity=flash?8:0;redLight.intensity=flash?0:8;
  const d=police.position.distanceTo(target);
  if(d<5){wanted=Math.max(0,wanted-.75);wantedCooldown=8;toast("Politie onderschept voertuig");GEO10.lastPoliceRoute=0}
  else if(d>650&&wanted<2.1){
    wantedCooldown-=dt*1.5;
  }else wantedCooldown-=dt;
  if(wantedCooldown<=0)wanted=Math.max(0,wanted-dt*.055);
}

const hook50=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(hook50);
  driveHero=driveHero50;
  updateTraffic=updateTraffic50;
  updatePeds=updatePeds50;
  updatePolice=updatePolice50;
  installCollisions=installCollisions50;
  toast("5.0 simulatie actief");
},350);

let last50=performance.now();
function simLoop50(now){
  const dt=Math.min((now-last50)/1000,.04);last50=now;
  if(!running||!GEO10.active)return;
  const actor=inVehicle?heroCar.position:player.position;
  refreshRoadRules50(actor);
  updateSmoke50(dt);updateVehicleConditionUI50();
  for(const x of VIS40.npcMixers){
    const moving=!x.p.wait50;
    x.mixer.timeScale=moving?.92:.08;
  }
}

// ===== DENDER COUNTY 6.0 — CAMERA COLLISION / GRAPH SIGNALS / INTERIORS =====
window.__DENDER_VERSION__="6.0";

const CAM60={
  lastSafe:new THREE.Vector3(),
  vel:new THREE.Vector3(),
  fovTarget:65
};

function segmentAabbHit60(a,b,box,pad=.35){
  const minX=box.x-box.w/2-pad,maxX=box.x+box.w/2+pad,minZ=box.z-box.d/2-pad,maxZ=box.z+box.d/2+pad;
  let tmin=0,tmax=1;
  const dx=b.x-a.x,dz=b.z-a.z;
  for(const [p,d,min,max] of [[a.x,dx,minX,maxX],[a.z,dz,minZ,maxZ]]){
    if(Math.abs(d)<1e-8){if(p<min||p>max)return null}
    else{
      let t1=(min-p)/d,t2=(max-p)/d;if(t1>t2)[t1,t2]=[t2,t1];
      tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);if(tmin>tmax)return null;
    }
  }
  return tmin;
}

function cameraCollision60(target,desired){
  if(!ENV20.ready)return desired;
  let best=1;
  const boxes=nearbyCollisionBoxes20(target);
  for(const box of boxes){
    const hit=segmentAabbHit60(target,desired,box,.45);
    if(hit!=null&&hit<best)best=hit;
  }
  if(best<1){
    const dir=desired.clone().sub(target);
    return target.clone().addScaledVector(dir,Math.max(.08,best-.055));
  }
  return desired;
}

function updateCamera60(dt){
  const targetObject=inVehicle?heroCar:player;
  const target=targetObject.position.clone().add(new THREE.Vector3(0,inVehicle?1.45:1.72,0));
  const speed=inVehicle?Math.abs(heroCar.userData.speed):0;
  CAM60.fovTarget=inVehicle?THREE.MathUtils.lerp(64,72,Math.min(speed/32,1)):64;
  camera.fov=THREE.MathUtils.lerp(camera.fov,CAM60.fovTarget,Math.min(1,dt*3.5));camera.updateProjectionMatrix();

  if(v04.cameraMode===1&&inVehicle){
    const forward=new THREE.Vector3(Math.sin(heroCar.userData.heading),0,Math.cos(heroCar.userData.heading));
    const eye=heroCar.position.clone().add(new THREE.Vector3(0,1.52,0)).addScaledVector(forward,.2);
    camera.position.lerp(eye,1-Math.pow(.0001,dt));camera.lookAt(eye.clone().addScaledVector(forward,28));return;
  }
  if(v04.cameraMode===2&&inVehicle){
    const forward=new THREE.Vector3(Math.sin(heroCar.userData.heading),0,Math.cos(heroCar.userData.heading));
    const eye=heroCar.position.clone().add(new THREE.Vector3(0,1.06,0)).addScaledVector(forward,2.6);
    camera.position.lerp(eye,1-Math.pow(.0001,dt));camera.lookAt(eye.clone().addScaledVector(forward,32));return;
  }
  if(inVehicle)camYaw=THREE.MathUtils.lerp(camYaw,heroCar.userData.heading+Math.PI,.022);
  const dist=inVehicle?THREE.MathUtils.lerp(8.8,11.2,Math.min(speed/30,1)):6.2;
  const h=inVehicle?4.15:3.05;
  const off=new THREE.Vector3(Math.sin(camYaw)*Math.cos(camPitch)*dist,h+Math.sin(camPitch)*dist,Math.cos(camYaw)*Math.cos(camPitch)*dist);
  const desired=target.clone().add(off);
  const safe=cameraCollision60(target,desired);
  camera.position.lerp(safe,1-Math.pow(.0007,dt));camera.lookAt(target);
}

// Graph-derived junction control. This does not invent roads: it only
// controls traffic at existing official nodes.
const SIG60={
  nodes:new Map(),
  pool:[],
  lastRefresh:0,
  max:18
};

function classifySignalNode60(id){
  const adj=(GEO10.adj.get(id)||[]).filter(x=>x.edge.drive);
  if(adj.length<3)return null;
  const majors=adj.filter(x=>roadProfile50(x.edge).major).length;
  const score=adj.length*2+majors*2;
  if(score<7)return null;
  return{id,adj,score,signal:adj.length>=4||majors>=2};
}

function signalPhase60(nodeId,elapsed){
  const info=SIG60.nodes.get(nodeId);if(!info||!info.signal)return null;
  const cycle=18,phase=(elapsed+hash20(nodeId)%7)%cycle;
  return phase<8?0:phase<10?2:phase<16?1:2; // 0 axis A, 1 axis B, 2 all-red
}

function edgeAxis60(entry){
  const pts=entry?.points;if(!pts||pts.length<2)return 0;
  const a=pts[Math.max(0,pts.length-2)],b=pts[pts.length-1];
  const dx=Math.abs(b.x-a.x),dz=Math.abs(b.z-a.z);
  return dx>=dz?0:1;
}

function shouldStopAtNode60(agent,elapsed){
  const info=SIG60.nodes.get(agent.next);if(!info)return false;
  const remaining=(agent.pts?.length||0)-agent.index;
  if(remaining>1)return false;
  if(info.signal){
    const phase=signalPhase60(agent.next,elapsed);
    return phase===2||phase!==edgeAxis60(agent.entry);
  }
  // Priority-to-the-major-road approximation using official road hierarchy.
  const own=roadProfile50(agent.entry?.edge);
  if(!own.major&&info.adj.some(x=>roadProfile50(x.edge).major))return true;
  return false;
}

function createSignalVisual60(){
  const g=new THREE.Group();g.userData.realGeo10=true;g.visible=false;
  const poleM=new THREE.MeshStandardMaterial({color:0x3e4347,metalness:.65,roughness:.42});
  const dark=new THREE.MeshStandardMaterial({color:0x141617,roughness:.55});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,3.2,8),poleM);pole.position.y=1.6;g.add(pole);
  const head=meshBox(.42,1.15,.34,dark,0,3.05,0);g.add(head);
  const mk=(y,c)=>{const m=new THREE.MeshStandardMaterial({color:0x171717,emissive:c,emissiveIntensity:.05});const s=new THREE.Mesh(new THREE.SphereGeometry(.105,10,8),m);s.position.set(0,y,.19);g.add(s);return s};
  g.userData.red=mk(3.38,0xff2211);g.userData.amber=mk(3.05,0xffa000);g.userData.green=mk(2.72,0x33ff55);
  GEO10.group.add(g);return g;
}
for(let i=0;i<SIG60.max;i++)SIG60.pool.push(createSignalVisual60());

function refreshSignals60(actor){
  SIG60.nodes.clear();
  const cand=[];
  for(const [id,n] of GEO10.nodes){
    if(n.pos.distanceToSquared(actor)>900*900)continue;
    const info=classifySignalNode60(id);if(info)cand.push({...info,pos:n.pos});
  }
  cand.sort((a,b)=>b.score-a.score);
  for(let i=0;i<SIG60.pool.length;i++){
    const g=SIG60.pool[i],c=cand[i];
    if(!c){g.visible=false;continue}
    SIG60.nodes.set(c.id,c);g.visible=c.signal;g.position.copy(c.pos);
    if(c.adj[0]?.points?.length>1){
      const pts=c.adj[0].points,a=pts[0],b=pts[1];
      g.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+Math.PI/2;
    }
  }
}

function updateSignalVisuals60(elapsed){
  for(const g of SIG60.pool){
    if(!g.visible)continue;
    const nearest=[...SIG60.nodes.values()].find(x=>x.pos.distanceToSquared(g.position)<1);
    if(!nearest)continue;
    const p=signalPhase60(nearest.id,elapsed);
    g.userData.red.material.emissiveIntensity=p===2?3.5:p===0||p===1?.18:3.5;
    g.userData.amber.material.emissiveIntensity=p===2?2.8:.05;
    g.userData.green.material.emissiveIntensity=p===0||p===1?2.4:.05;
  }
}

function updateTraffic60(dt){
  const elapsed=performance.now()/1000;
  for(const a of GEO10.trafficAgents){
    if(!a.pts||a.index>=a.pts.length){
      const next=chooseNextVehicle50(a);
      if(!next){a.car.userData.speed=0;continue}
      a.prev=a.node;a.node=a.next;a.next=next.to;a.entry=next;a.pts=next.points;a.index=1;
    }
    const target=a.pts[a.index];if(!target)continue;
    const dir=target.clone().sub(a.car.position);dir.y=0;const dist=dir.length();
    const edge=a.entry?.edge,profile=roadProfile50(edge);
    let desired=a.car.userData.vehicleClass==="delivery"?6.5:profile.major?10.5:7.6;
    const stop=shouldStopAtNode60(a,elapsed);
    if(stop)desired=0;
    desired*=THREE.MathUtils.lerp(1,.76,v04.rainIntensity||0);
    for(const b of GEO10.trafficAgents){
      if(a===b)continue;
      const d=a.car.position.distanceTo(b.car.position);
      if(d<9)desired=Math.min(desired,Math.max(0,(d-3.2)*1.05));
    }
    for(const ped of PED20.agents){
      const d=a.car.position.distanceTo(ped.p.position);
      if(d<5.3)desired=Math.min(desired,Math.max(0,(d-2.1)*.82));
    }
    if(wanted>0&&police.visible&&a.car.position.distanceTo(police.position)<20)desired*=.5;
    a.car.userData.speed=THREE.MathUtils.lerp(a.car.userData.speed||0,desired,Math.min(1,dt*2.8));
    if(dist<1.22){a.index++;continue}
    dir.normalize();a.car.position.addScaledVector(dir,Math.min(dist,a.car.userData.speed*dt));
    const targetYaw=Math.atan2(dir.x,dir.z);
    let dy=((targetYaw-a.car.rotation.y+Math.PI*3)%(Math.PI*2))-Math.PI;
    a.car.rotation.y+=dy*Math.min(1,dt*4.4);
    animateCar04(a.car,dt,dy,stop||desired<1.4);
  }
}

// A small set of modular interiors anchored to real public-location nodes.
// Their internal layout is fictional; geographic entry position remains tied to the real world.
const INT60={
  hubs:[],
  inside:null,
  returnPos:new THREE.Vector3(),
  group:new THREE.Group(),
  prompt:null
};
INT60.group.userData.realGeo10=true;scene.add(INT60.group);

function makeInterior60(label,kind){
  const g=new THREE.Group();g.visible=false;
  const floor=new THREE.MeshStandardMaterial({color:kind==="station"?0x767b80:0x5b5a56,roughness:.82});
  const wall=new THREE.MeshStandardMaterial({color:0xd2c8b8,roughness:.92});
  const metal=new THREE.MeshStandardMaterial({color:0x34383b,metalness:.55,roughness:.42});
  addBox(g,18,.3,14,floor,0,.15,0);
  addBox(g,18,5,.35,wall,0,2.5,-7);addBox(g,.35,5,14,wall,-9,2.5,0);addBox(g,.35,5,14,wall,9,2.5,0);
  addBox(g,18,.35,14,metal,0,5,0);
  if(kind==="station"){
    for(let i=-2;i<=2;i++)addBox(g,2.6,.45,.8,metal,i*3.2,.5,-1.8);
    addBox(g,5.8,1.1,.3,new THREE.MeshStandardMaterial({color:0x1d2430,emissive:0x21395a,emissiveIntensity:.8}),0,3.6,-6.75);
  }else{
    addBox(g,6,.75,2.4,metal,0,.7,-1);
    addBox(g,4,2.4,.6,wall,-4.8,1.4,3.7);
  }
  g.userData.label=label;g.userData.kind=kind;INT60.group.add(g);return g;
}

function setupInteriors60(){
  if(INT60.hubs.length||!GEO10.active)return;
  const burst=GEO10.station||GEO10.places.find(p=>(p.name||"").toLowerCase().includes("burst"))?.pos;
  const aalst=GEO10.places.find(p=>p.station&&(p.name||"").toLowerCase().includes("aalst"))?.pos||
              GEO10.places.find(p=>(p.name||"").toLowerCase()==="aalst")?.pos;
  const mere=GEO10.places.find(p=>(p.name||"").toLowerCase()==="mere")?.pos;
  const defs=[
    burst?{label:"Burst mobiliteitshub",kind:"station",pos:burst.clone().add(new THREE.Vector3(6,0,6))}:null,
    aalst?{label:"Aalst mobiliteitshub",kind:"station",pos:aalst.clone().add(new THREE.Vector3(8,0,8))}:null,
    mere?{label:"Dender Workshop",kind:"workshop",pos:mere.clone().add(new THREE.Vector3(10,0,5))}:null
  ].filter(Boolean);
  defs.forEach((d,i)=>{const interior=makeInterior60(d.label,d.kind);interior.position.set(0,-50-i*20,0);INT60.hubs.push({...d,interior})});
}

function nearestInteriorHub60(){
  const actor=inVehicle?heroCar.position:player.position;
  let best=null,bd=Infinity;
  for(const h of INT60.hubs){
    const d=actor.distanceToSquared(h.pos);if(d<bd){bd=d;best=h}
  }
  return{hub:best,d:Math.sqrt(bd)};
}

const legacyInteract60=interact;
const legacyUpdatePrompt60=updatePrompt;
interact=function(){
  if(INT60.inside){
    player.position.copy(INT60.returnPos);INT60.inside.interior.visible=false;INT60.inside=null;toast("Terug naar buiten");return;
  }
  if(!inVehicle){
    const n=nearestInteriorHub60();
    if(n.hub&&n.d<5){
      INT60.returnPos.copy(player.position);
      INT60.inside=n.hub;inVehicle=false;player.visible=true;
      n.hub.interior.visible=true;player.position.set(0,n.hub.interior.position.y,2.5);
      toast(n.hub.label+" • interieur");return;
    }
  }
  legacyInteract60();
};

function updatePrompt60(){
  const p=document.querySelector("#prompt");
  if(INT60.inside){p.textContent="E • verlaat interieur";return}
  if(!inVehicle){
    const n=nearestInteriorHub60();
    if(n.hub&&n.d<5){p.textContent="E • betreed "+n.hub.label;return}
  }
  legacyUpdatePrompt60();
}

// Damage adds handling pull and light failure.
function applyDamageSystems60(){
  const d=SIM50.damage;
  heroCar.userData.damagePull=(d>35?((hash20("hero-damage")%2)?1:-1)*(d-35)/65*.08:0);
  if(heroCar.userData.brakeLights){
    heroCar.userData.brakeLights.forEach((l,i)=>{l.visible=!(d>72&&i===1)});
  }
}
const oldAddDamage60=addDamage50;
addDamage50=function(amount,reason){oldAddDamage60(amount,reason);applyDamageSystems60()};

const oldDriveHero60=driveHero50;
driveHero50=function(dt){
  oldDriveHero60(dt);
  if(heroCar.userData.damagePull&&Math.abs(heroCar.userData.speed)>4){
    heroCar.userData.heading+=heroCar.userData.damagePull*dt;
  }
};

// Override camera/prompt after 6.0 becomes active.
const hook60=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(hook60);
  setupInteriors60();
  updateCamera=updateCamera60;
  updateTraffic=updateTraffic60;
  updatePrompt=updatePrompt60;
  toast("6.0 cinematic + junction systems actief");
},450);

let last60=performance.now();
function loop60(now){
  const dt=Math.min((now-last60)/1000,.04);last60=now;
  if(!running||!GEO10.active)return;
  const actor=inVehicle?heroCar.position:player.position;
  if(now-SIG60.lastRefresh>1200){SIG60.lastRefresh=now;refreshSignals60(actor)}
  updateSignalVisuals60(now/1000);
}


// ===== DENDER COUNTY 7.0 — SINGLE MASTER FRAME LOOP =====
window.__DENDER_VERSION__="7.0";
const MASTER70={last:performance.now(),frames:0};
function runMasterExtras70(now){
  // Deterministic update order; these functions no longer self-schedule.
  // This replaces 13 independent requestAnimationFrame loops.
  v02Loop(now);
  v04Loop04(now);
  v05Loop(now);
  v07Loop(now);
  geoLoop09(now);
  geoLoop10(now);
  megaLoop20(now);
  releaseLoop20(now);
  regionLoop30(now);
  chunkLoop31(now);
  qualityLoop40(now);
  simLoop50(now);
  loop60(now);
  systems71(now);
  systems80(now);
  systems81(now);
  systems82(now);
  systems90(now);
  systems91(now);
  systems92(now);
  MASTER70.last=now;MASTER70.frames++;
}

// ===== DENDER COUNTY 7.1 — POLICE SEARCH / ROADBLOCKS / RAIL WORLD EVENT =====
const SYS71={
  policeState:"PATROL",
  lastSeen:new THREE.Vector3(),
  lastSeenAt:0,
  searchUntil:0,
  roadblocks:[],
  policeHud:null,
  railLoaded:false,
  railLoading:false,
  railPath:null,
  railCum:null,
  train:null,
  trainDistance:0,
  trainDir:1,
  trainStop:0,
  visibilityWasRunning:false
};

function makePoliceHud71(){
  if(SYS71.policeHud)return;
  const el=document.createElement("div");
  el.id="policeState71";
  el.style.cssText="position:fixed;left:14px;top:105px;z-index:13;padding:6px 9px;border-radius:6px;background:rgba(7,10,14,.62);color:#dfe8f2;font:800 10px system-ui;letter-spacing:.08em;pointer-events:none;display:none";
  document.body.appendChild(el);SYS71.policeHud=el;
}
makePoliceHud71();

function lineBlocked71(a,b){
  if(!ENV20.ready)return false;
  const mid=a.clone().add(b).multiplyScalar(.5);
  const boxes=[...nearbyCollisionBoxes20(a),...nearbyCollisionBoxes20(mid),...nearbyCollisionBoxes20(b)];
  const seen=new Set();
  for(const box of boxes){
    const key=box.x.toFixed(1)+":"+box.z.toFixed(1)+":"+box.w.toFixed(1)+":"+box.d.toFixed(1);
    if(seen.has(key))continue;seen.add(key);
    const t=segmentAabbHit60(a,b,box,.15);
    if(t!=null&&t>.015&&t<.985)return true;
  }
  return false;
}

function clearRoadblocks71(){
  for(const rb of SYS71.roadblocks)rb.group.visible=false;
}
function ensureRoadblocks71(){
  if(SYS71.roadblocks.length)return;
  for(let i=0;i<2;i++){
    const g=createCar(0x173f68);g.visible=false;g.userData.roadblock71=true;
    const blue=new THREE.PointLight(0x3388ff,0,10);blue.position.set(-.55,1.9,0);g.add(blue);
    const red=new THREE.PointLight(0xff3322,0,10);red.position.set(.55,1.9,0);g.add(red);
    g.userData.blue=blue;g.userData.red=red;scene.add(g);
    SYS71.roadblocks.push({group:g,node:null});
  }
}
ensureRoadblocks71();

function placeRoadblocks71(target){
  if(wanted<3){clearRoadblocks71();return}
  const start=nearestNode10(target,true),lead=predictiveTarget50(),goal=nearestNode10(lead,true);
  let path=routePolice50(start,goal);
  if(path.length<7){
    const far=lead.clone();
    far.x+=Math.sin(heroCar.userData.heading||0)*180;
    far.z+=Math.cos(heroCar.userData.heading||0)*180;
    path=routePolice50(start,nearestNode10(far,true));
  }
  const picks=[path[Math.min(path.length-1,3)],path[Math.min(path.length-1,6)]];
  picks.forEach((id,i)=>{
    const rb=SYS71.roadblocks[i],node=GEO10.nodes.get(id);
    if(!node){rb.group.visible=false;return}
    const adj=(GEO10.adj.get(id)||[]).filter(x=>x.edge.drive);
    rb.group.visible=true;rb.group.position.copy(node.pos);rb.node=id;
    if(adj[0]?.points?.length>1){
      const pts=adj[0].points,a=pts[0],b=pts[1];
      rb.group.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+Math.PI/2;
    }
  });
}

function updateRoadblockLights71(elapsed){
  const flash=Math.sin(elapsed*16)>0;
  for(const rb of SYS71.roadblocks){
    if(!rb.group.visible)continue;
    rb.group.userData.blue.intensity=flash?7:0;
    rb.group.userData.red.intensity=flash?0:7;
  }
}

function updatePolice71(dt,elapsed){
  if(wanted<=0){
    SYS71.policeState="PATROL";SYS71.searchUntil=0;
    police.visible=false;police.userData.spawned10=false;
    blueLight.intensity=redLight.intensity=0;clearRoadblocks71();
    if(SYS71.policeHud)SYS71.policeHud.style.display="none";
    return;
  }
  const target=inVehicle?heroCar.position:player.position;
  const dist=police.visible?police.position.distanceTo(target):9999;
  const visibleTarget=police.visible&&dist<210&&!lineBlocked71(police.position,target);

  if(visibleTarget||!SYS71.lastSeenAt){
    SYS71.lastSeen.copy(target);SYS71.lastSeenAt=performance.now();
    SYS71.searchUntil=performance.now()+9000+Math.ceil(wanted)*2500;
    SYS71.policeState="PURSUIT";
  }else if(performance.now()<SYS71.searchUntil){
    SYS71.policeState="SEARCH";
  }else{
    SYS71.policeState="LOST";
  }

  police.visible=true;
  if(!police.userData.spawned10){
    let best=null,score=Infinity;
    for(const n of GEO10.nodes.values()){
      const d=n.pos.distanceTo(target);
      if(d>190&&d<460&&Math.abs(d-310)<score){score=Math.abs(d-310);best=n}
    }
    police.position.copy(best?best.pos:target.clone().add(new THREE.Vector3(260,0,180)));
    police.userData.spawned10=true;GEO10.lastPoliceRoute=0;
  }

  const routeTarget=SYS71.policeState==="PURSUIT"?predictiveTarget50():SYS71.lastSeen;
  if(performance.now()-GEO10.lastPoliceRoute>950||GEO10.policePathIndex>=GEO10.policePath.length){
    GEO10.lastPoliceRoute=performance.now();
    const s=nearestNode10(police.position,true),g=nearestNode10(routeTarget,true);
    GEO10.policePath=routePolice50(s,g).map(id=>GEO10.nodes.get(id)?.pos.clone()).filter(Boolean);GEO10.policePathIndex=0;
  }
  const p=GEO10.policePath[GEO10.policePathIndex];
  if(p){
    tempV.copy(p).sub(police.position);tempV.y=0;
    if(tempV.length()<2.1)GEO10.policePathIndex++;
    else{
      tempV.normalize();
      const stateMul=SYS71.policeState==="PURSUIT"?1:SYS71.policeState==="SEARCH"?.8:.55;
      police.position.addScaledVector(tempV,(12.4+wanted*1.45)*stateMul*dt);
      police.rotation.y=THREE.MathUtils.lerp(police.rotation.y,Math.atan2(tempV.x,tempV.z),Math.min(1,dt*5));
    }
  }

  const flash=Math.sin(elapsed*15)>0;blueLight.intensity=flash?8:0;redLight.intensity=flash?0:8;
  if(dist<5&&visibleTarget){
    wanted=Math.max(0,wanted-.8);wantedCooldown=8;toast("Politie onderschept voertuig");GEO10.lastPoliceRoute=0;
  }
  if(SYS71.policeState==="LOST")wanted=Math.max(0,wanted-dt*.16);
  else if(SYS71.policeState==="SEARCH"&&dist>280)wanted=Math.max(0,wanted-dt*.085);
  else{wantedCooldown-=dt;if(wantedCooldown<=0)wanted=Math.max(0,wanted-dt*.04)}

  placeRoadblocks71(routeTarget);updateRoadblockLights71(elapsed);
  if(SYS71.policeHud){
    SYS71.policeHud.style.display="block";
    SYS71.policeHud.textContent=SYS71.policeState+(wanted>=3?" • ROADBLOCKS":"");
  }
}

const oldInstallCollisions71=installCollisions50;
function installCollisions71(){
  oldInstallCollisions71();
  if(!inVehicle)return;
  for(const rb of SYS71.roadblocks){
    if(!rb.group.visible)continue;
    const d=heroCar.position.distanceTo(rb.group.position);
    if(d<2.8){
      heroCar.position.copy(v02.carPrev);
      addDamage50(Math.min(24,5+Math.abs(heroCar.userData.speed)),"Botsing met wegversperring");
      heroCar.userData.speed*=-.18;
      wanted=Math.min(5,wanted+.35);wantedCooldown=14;
      break;
    }
  }
}

// --- Rail world event ---
function railLength71(pts){
  let n=0;for(let i=1;i<pts.length;i++)n+=pts[i].distanceTo(pts[i-1]);return n;
}
async function loadRailPath71(){
  if(SYS71.railLoaded||SYS71.railLoading||!GEO10.active)return;
  SYS71.railLoading=true;
  try{
    const files=["erpe_mere","lede","aalst"];
    const all=[];
    for(const key of files){
      const r=await fetch("./geodata/"+key+"_runtime.geojson?v=7.1");
      if(!r.ok)continue;
      const fc=await r.json();
      for(const ft of fc.features||[]){
        if(ft.properties?.kind!=="railway")continue;
        for(const line of lines10(ft.geometry)){
          if(line.length>1)all.push(line.map(geoToLocal10));
        }
      }
    }
    all.sort((a,b)=>railLength71(b)-railLength71(a));
    SYS71.railPath=all[0]||null;
    if(!SYS71.railPath)throw new Error("no railway line");
    SYS71.railCum=[0];
    for(let i=1;i<SYS71.railPath.length;i++)SYS71.railCum[i]=SYS71.railCum[i-1]+SYS71.railPath[i].distanceTo(SYS71.railPath[i-1]);
    createTrain71();SYS71.railLoaded=true;
    toast("Treinverkeer actief op echte spoorgeometrie");
  }catch(err){console.warn("rail event unavailable",err)}
  finally{SYS71.railLoading=false}
}
function createTrain71(){
  if(SYS71.train)return;
  const g=new THREE.Group();g.userData.realGeo10=true;g.userData.train71=true;
  const body=new THREE.MeshStandardMaterial({color:0x394b58,metalness:.35,roughness:.46});
  const accent=new THREE.MeshStandardMaterial({color:0xd4c46f,metalness:.12,roughness:.52});
  const glass=new THREE.MeshStandardMaterial({color:0x1c2c36,metalness:.3,roughness:.18});
  const makeCar=(z,engine=false)=>{
    const c=new THREE.Group();c.position.z=z;
    addBox(c,2.8,2.7,8.6,body,0,1.75,0);
    addBox(c,2.86,.35,8.0,accent,0,1.55,0);
    for(let w=-3;w<=3;w+=2){addBox(c,2.9,.72,1.15,glass,0,2.25,w)}
    if(engine)addBox(c,2.3,.72,1.0,glass,0,2.35,4.1);
    g.add(c);
  };
  makeCar(0,true);makeCar(-9.1,false);makeCar(-18.2,false);
  const front=new THREE.PointLight(0xfff0cc,2.2,24,2);front.position.set(0,1.4,4.6);g.add(front);
  scene.add(g);SYS71.train=g;
}
function sampleRail71(distance){
  const cum=SYS71.railCum,pts=SYS71.railPath,total=cum[cum.length-1];
  distance=THREE.MathUtils.clamp(distance,0,total);
  let hi=1;while(hi<cum.length&&cum[hi]<distance)hi++;
  hi=Math.min(hi,cum.length-1);const lo=Math.max(0,hi-1);
  const seg=Math.max(.001,cum[hi]-cum[lo]),t=(distance-cum[lo])/seg;
  const p=pts[lo].clone().lerp(pts[hi],t);
  const dir=pts[hi].clone().sub(pts[lo]).setY(0).normalize();
  return{p,dir,total};
}
function updateTrain71(dt){
  if(!SYS71.railLoaded||!SYS71.train)return;
  if(SYS71.trainStop>0){SYS71.trainStop-=dt;return}
  const speed=16;
  SYS71.trainDistance+=speed*dt*SYS71.trainDir;
  const s=sampleRail71(SYS71.trainDistance);
  if(SYS71.trainDistance<=0){SYS71.trainDistance=0;SYS71.trainDir=1;SYS71.trainStop=4}
  if(SYS71.trainDistance>=s.total){SYS71.trainDistance=s.total;SYS71.trainDir=-1;SYS71.trainStop=4}
  const cur=sampleRail71(SYS71.trainDistance);
  SYS71.train.position.copy(cur.p);
  SYS71.train.rotation.y=Math.atan2(cur.dir.x,cur.dir.z)+(SYS71.trainDir<0?Math.PI:0);
  const actor=inVehicle?heroCar.position:player.position;
  SYS71.train.visible=actor.distanceToSquared(SYS71.train.position)<2600*2600;
}

const railPoll71=setInterval(()=>{if(GEO10.active){clearInterval(railPoll71);loadRailPath71()}},1800);

// Pause all simulation cleanly when the tab/app is backgrounded.
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    SYS71.visibilityWasRunning=running;
    if(running){saveMeta20();running=false}
  }else if(SYS71.visibilityWasRunning){
    running=true;clock.start();SYS71.visibilityWasRunning=false;
  }
});

function systems71(now){
  if(!running||!GEO10.active)return;
  const dt=Math.min((now-(systems71.last||now))/1000,.04);systems71.last=now;
  updateTrain71(dt);
}

const hook71=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(hook71);
  updatePolice=updatePolice71;
  installCollisions=installCollisions71;
},550);

// ===== DENDER COUNTY 8.0 — GPS / ROUTINES / AMBIENCE / DIAGNOSTICS =====
window.__DENDER_VERSION__="8.0";

const NAV80={
  nodePath:[],
  points:[],
  target:null,
  lastRefresh:0,
  line:null,
  hud:null,
  drawWrapped:false
};

function currentMissionTarget80(){
  const j=JOB20.jobs[JOB20.index];
  if(j?.target)return j.target;
  const t=GEO10.missionTargets?.[GEO10.missionIndex];
  return t?.pos||null;
}
function buildRoutePoints80(ids){
  const pts=[];
  for(let i=1;i<ids.length;i++){
    const a=ids[i-1],b=ids[i];
    const entry=(GEO10.adj.get(a)||[]).find(x=>x.to===b&&x.edge.drive);
    if(entry?.points){
      for(const p of entry.points){
        if(!pts.length||pts[pts.length-1].distanceToSquared(p)>.5)pts.push(p.clone());
      }
    }
  }
  return pts;
}
function routeDistance80(points){
  let d=0;for(let i=1;i<points.length;i++)d+=points[i].distanceTo(points[i-1]);return d;
}
function ensureNavHud80(){
  if(NAV80.hud)return;
  const el=document.createElement("div");el.id="navHud80";
  el.style.cssText="position:fixed;left:50%;transform:translateX(-50%);top:14px;z-index:16;min-width:210px;max-width:72vw;padding:7px 12px;border-radius:8px;background:rgba(7,10,14,.66);color:#f2f5f7;font:800 11px system-ui;text-align:center;letter-spacing:.05em;pointer-events:none";
  document.body.appendChild(el);NAV80.hud=el;
}
ensureNavHud80();

function refreshRoute80(force=false){
  if(!GEO10.active)return;
  const target=currentMissionTarget80();
  if(!target){NAV80.nodePath=[];NAV80.points=[];if(NAV80.line)NAV80.line.visible=false;return}
  const actor=inVehicle?heroCar.position:player.position;
  if(!force&&performance.now()-NAV80.lastRefresh<1700&&NAV80.target&&NAV80.target.distanceToSquared(target)<25)return;
  NAV80.lastRefresh=performance.now();NAV80.target=target.clone();
  const s=nearestNode10(actor,true),g=nearestNode10(target,true);
  NAV80.nodePath=route10(s,g);NAV80.points=buildRoutePoints80(NAV80.nodePath);
  if(!NAV80.line){
    NAV80.line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x57a9ff,transparent:true,opacity:.62}));
    NAV80.line.userData.realGeo10=true;GEO10.group.add(NAV80.line);
  }
  if(NAV80.points.length){
    const elevated=NAV80.points.map(p=>new THREE.Vector3(p.x,.24,p.z));
    NAV80.line.geometry.dispose();NAV80.line.geometry=new THREE.BufferGeometry().setFromPoints(elevated);NAV80.line.visible=true;
  }else NAV80.line.visible=false;
}

function nextNavPoint80(actor){
  if(!NAV80.points.length)return null;
  let best=0,bd=Infinity;
  for(let i=0;i<NAV80.points.length;i++){
    const d=actor.distanceToSquared(NAV80.points[i]);if(d<bd){bd=d;best=i}
  }
  return NAV80.points[Math.min(NAV80.points.length-1,best+Math.min(6,NAV80.points.length-best-1))];
}
function arrow80(actor,next){
  if(!next)return"•";
  const v=next.clone().sub(actor);const targetAng=Math.atan2(v.x,v.z);
  const heading=inVehicle?heroCar.userData.heading:(camYaw+Math.PI);
  let d=((targetAng-heading+Math.PI*3)%(Math.PI*2))-Math.PI;
  if(Math.abs(d)<.32)return"↑";
  if(d>.32&&d<1.15)return"↗";
  if(d>=1.15)return"→";
  if(d<-.32&&d>-1.15)return"↖";
  return"←";
}
function updateNavHud80(){
  const actor=inVehicle?heroCar.position:player.position,target=currentMissionTarget80();
  if(!target||!NAV80.hud){if(NAV80.hud)NAV80.hud.style.display="none";return}
  NAV80.hud.style.display="block";
  const next=nextNavPoint80(actor),street=nearestStreet10(next||actor);
  NAV80.hud.textContent=arrow80(actor,next)+"  "+(street.name||"VOLG ROUTE")+"  •  "+Math.round(routeDistance80(NAV80.points))+" m";
}

function wrapMinimap80(){
  if(NAV80.drawWrapped)return;NAV80.drawWrapped=true;
  const base=drawMap;
  drawMap=function(){
    base();
    if(!NAV80.points.length)return;
    const S=180,actor=inVehicle?heroCar:player,radius=900,sc=S/(radius*2);
    ctx.strokeStyle="#57a9ff";ctx.lineWidth=2.4;ctx.globalAlpha=.85;ctx.beginPath();
    let started=false;
    for(const p of NAV80.points){
      const x=S/2+(p.x-actor.position.x)*sc,z=S/2+(p.z-actor.position.z)*sc;
      if(x<-20||x>S+20||z<-20||z>S+20)continue;
      if(!started){ctx.moveTo(x,z);started=true}else ctx.lineTo(x,z);
    }
    if(started)ctx.stroke();ctx.globalAlpha=1;
  };
}

// NPC routines respond to real game time and rain.
const legacyPeds80=updatePeds50;
function updatePeds80(dt){
  const night=day<6.5||day>22,commute=(day>7&&day<9)||(day>16&&day<19);
  const rain=v04.rainIntensity||0;
  PED20.agents.forEach((a,i)=>{
    const activeScore=(i%10)/10;
    const threshold=night?.45:commute?.95:.72;
    a.p.visible=activeScore<threshold*(1-rain*.28);
    if(a.p.visible)a.p.userData.speed=THREE.MathUtils.lerp(1.0,1.65,commute?.7:.35)*(1-rain*.12);
  });
  legacyPeds80(dt);
}

// Low-cost procedural ambience that starts only after user audio activation.
const AUDIO80={ready:false,trainOsc:null,trainGain:null,cityOsc:null,cityGain:null};
function initAudio80(){
  if(AUDIO80.ready||!v02.audioReady||!v02.audio?.ac)return;
  const ac=v02.audio.ac;
  const make=(freq,type="sine")=>{
    const o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.value=freq;g.gain.value=.0001;o.connect(g);g.connect(ac.destination);o.start();return{o,g};
  };
  const t=make(42,"triangle"),c=make(71,"sine");
  AUDIO80.trainOsc=t.o;AUDIO80.trainGain=t.g;AUDIO80.cityOsc=c.o;AUDIO80.cityGain=c.g;AUDIO80.ready=true;
}
function updateAmbience80(){
  initAudio80();if(!AUDIO80.ready)return;
  const ac=v02.audio.ac,actor=inVehicle?heroCar.position:player.position;
  let train=.0001;
  if(SYS71.train?.visible){
    const d=actor.distanceTo(SYS71.train.position);train=THREE.MathUtils.clamp(1-d/900,0,1)*.025+.0001;
  }
  const urban=nearestPlace10(actor)?.name?1:0;
  const city=(.0025+.0035*urban)*(1-(v04.rainIntensity||0)*.2);
  AUDIO80.trainGain.gain.setTargetAtTime(train,ac.currentTime,.18);
  AUDIO80.cityGain.gain.setTargetAtTime(city,ac.currentTime,.4);
  AUDIO80.trainOsc.frequency.setTargetAtTime(38+(SYS71.trainDir>0?4:0),ac.currentTime,.25);
}

// Diagnostics overlay: F3 toggles live runtime state.
const DIAG80={open:false,el:null,last:0};
function ensureDiag80(){
  if(DIAG80.el)return;
  const e=document.createElement("pre");e.id="diag80";
  e.style.cssText="display:none;position:fixed;left:12px;bottom:12px;z-index:50;max-width:72vw;max-height:42vh;overflow:auto;margin:0;padding:9px 11px;border-radius:7px;background:rgba(0,0,0,.82);color:#b9f6ca;font:10px/1.45 ui-monospace,monospace;pointer-events:none";
  document.body.appendChild(e);DIAG80.el=e;
}
ensureDiag80();
addEventListener("keydown",e=>{
  if(e.code==="F3"&&!e.repeat){e.preventDefault();DIAG80.open=!DIAG80.open;DIAG80.el.style.display=DIAG80.open?"block":"none"}
});
function updateDiag80(now){
  if(!DIAG80.open||now-DIAG80.last<500)return;DIAG80.last=now;
  const actor=inVehicle?heroCar.position:player.position;
  DIAG80.el.textContent=[
    "DENDER COUNTY "+window.__DENDER_VERSION__,
    "FPS            "+Math.round(GAME20.fps),
    "single RAF     yes",
    "master frames  "+MASTER70.frames,
    "roads          "+GEO10.edges.length,
    "graph nodes    "+GEO10.nodes.size,
    "loaded regions "+[...REG30.loaded].join(", "),
    "geo chunks     "+CHUNK31.loaded.size,
    "env chunks     "+[...ENV20.chunks.values()].filter(c=>c.built).length,
    "rigged NPCs    "+VIS40.npcMixers.length,
    "traffic        "+GEO10.trafficAgents.length,
    "police         "+SYS71.policeState+" / wanted "+wanted.toFixed(2),
    "route nodes    "+NAV80.nodePath.length,
    "route metres   "+Math.round(routeDistance80(NAV80.points)),
    "train          "+(SYS71.railLoaded?"active":"loading"),
    "position       "+actor.x.toFixed(1)+", "+actor.z.toFixed(1)
  ].join("\n");
}

const hook80=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(hook80);
  updatePeds=updatePeds80;wrapMinimap80();refreshRoute80(true);
},650);

function systems80(now){
  if(!running||!GEO10.active)return;
  refreshRoute80(false);updateNavHud80();updateAmbience80();updateDiag80(now);
}

// ===== DENDER COUNTY 8.1 — RUNTIME HEALTH / SELF-RECOVERY =====
window.__DENDER_VERSION__="8.1";
const HEALTH81={
  errors:[],
  recoveries:0,
  lastError:"",
  lastRouteRecovery:0,
  lastCheck:0
};
window.__DENDER_HEALTH__={
  version:"8.1",started:false,geoActive:false,masterFrames:0,roads:0,nodes:0,
  regions:0,chunks:0,errors:0,recoveries:0,fps:0
};
function recordHealthError81(msg){
  const s=String(msg||"unknown").slice(0,240);
  HEALTH81.lastError=s;HEALTH81.errors.push({time:Date.now(),message:s});
  if(HEALTH81.errors.length>20)HEALTH81.errors.shift();
}
addEventListener("error",e=>recordHealthError81(e.message||e.error));
addEventListener("unhandledrejection",e=>recordHealthError81(e.reason));

function finitePos81(v){return Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z)}
function recoverActor81(){
  const spawn=GEO10.station||GEO10.places.find(p=>p.name==="Burst")?.pos||new THREE.Vector3();
  if(inVehicle){
    heroCar.position.copy(spawn).add(new THREE.Vector3(12,0,4));heroCar.userData.speed=0;heroCar.userData.heading=0;heroCar.rotation.y=0;
  }else player.position.copy(spawn).add(new THREE.Vector3(5,0,5));
  v02.playerPrev.copy(player.position);v02.carPrev.copy(heroCar.position);
  HEALTH81.recoveries++;toast("Runtimepositie automatisch hersteld");
}
function runtimeHealth81(now){
  const h=window.__DENDER_HEALTH__;
  h.version=window.__DENDER_VERSION__;h.started=running;h.geoActive=!!GEO10.active;
  h.masterFrames=MASTER70.frames;h.roads=GEO10.edges.length;h.nodes=GEO10.nodes.size;
  h.regions=REG30.loaded.size;h.chunks=CHUNK31.loaded.size;h.errors=HEALTH81.errors.length;
  h.recoveries=HEALTH81.recoveries;h.fps=Math.round(GAME20.fps||0);
  if(!running||!GEO10.active||now-HEALTH81.lastCheck<1000)return;
  HEALTH81.lastCheck=now;
  const actor=inVehicle?heroCar.position:player.position;
  if(!finitePos81(actor)){recordHealthError81("non-finite actor position");recoverActor81()}
  if(!finitePos81(camera.position)){
    recordHealthError81("non-finite camera position");
    camera.position.copy(actor).add(new THREE.Vector3(0,6,8));HEALTH81.recoveries++;
  }
  if(!Number.isFinite(heroCar.userData.speed)){recordHealthError81("non-finite vehicle speed");heroCar.userData.speed=0;HEALTH81.recoveries++}
  const target=currentMissionTarget80();
  if(target&&NAV80.nodePath.length===0&&now-HEALTH81.lastRouteRecovery>4000){
    HEALTH81.lastRouteRecovery=now;recordHealthError81("navigation route recovered");refreshRoute80(true);HEALTH81.recoveries++;
  }
}
function systems81(now){runtimeHealth81(now)}

// ===== DENDER COUNTY 8.2 — SPATIAL ROAD GRAPH PERFORMANCE =====
window.__DENDER_VERSION__="8.2";
const SP82={
  size:600,
  edges:new Map(),
  nodes:new Map(),
  edgeCount:-1,
  nodeCount:-1,
  lastBuild:0
};
function spKey82(cx,cz){return cx+":"+cz}
function spCell82(x,z){return[Math.floor(x/SP82.size),Math.floor(z/SP82.size)]}
function spPush82(map,key,value){
  let a=map.get(key);if(!a){a=[];map.set(key,a)}a.push(value);
}
function rebuildSpatial82(){
  SP82.edges.clear();SP82.nodes.clear();
  for(const e of GEO10.edges){
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of e.points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z)}
    const [a,b]=spCell82(minX,minZ),[c,d]=spCell82(maxX,maxZ);
    for(let x=a;x<=c;x++)for(let z=b;z<=d;z++)spPush82(SP82.edges,spKey82(x,z),e);
  }
  for(const [id,n] of GEO10.nodes){
    const [x,z]=spCell82(n.pos.x,n.pos.z);spPush82(SP82.nodes,spKey82(x,z),n);
  }
  SP82.edgeCount=GEO10.edges.length;SP82.nodeCount=GEO10.nodes.size;SP82.lastBuild=performance.now();
}
function localEdges82(pos,radius=1000){
  const [cx,cz]=spCell82(pos.x,pos.z),r=Math.ceil(radius/SP82.size),set=new Set(),out=[];
  for(let x=cx-r;x<=cx+r;x++)for(let z=cz-r;z<=cz+r;z++){
    for(const e of SP82.edges.get(spKey82(x,z))||[])if(!set.has(e)){set.add(e);out.push(e)}
  }
  return out;
}
function localNodes82(pos,radius=1200){
  const [cx,cz]=spCell82(pos.x,pos.z),r=Math.ceil(radius/SP82.size),set=new Set(),out=[];
  for(let x=cx-r;x<=cx+r;x++)for(let z=cz-r;z<=cz+r;z++){
    for(const n of SP82.nodes.get(spKey82(x,z))||[])if(!set.has(n.id)){set.add(n.id);out.push(n)}
  }
  return out;
}

const legacyNearestNode82=nearestNode10;
nearestNode10=function(pos,driveOnly=false){
  let best=null,bd=Infinity;
  const list=localNodes82(pos,1500);
  for(const n of list){
    if(driveOnly&&!(GEO10.adj.get(n.id)||[]).some(x=>x.edge.drive))continue;
    const d=n.pos.distanceToSquared(pos);if(d<bd){bd=d;best=n.id}
  }
  return best||legacyNearestNode82(pos,driveOnly);
};

const legacyNearestStreet82=nearestStreet10;
nearestStreet10=function(pos){
  let best="",bd=Infinity;
  const list=localEdges82(pos,550);
  for(const e of list){
    if(!e.name)continue;
    for(let i=1;i<e.points.length;i++){
      const a=e.points[i-1],b=e.points[i];
      const d=pointSegDistSq09(pos.x,pos.z,{x1:a.x,z1:a.z,x2:b.x,z2:b.z});
      if(d<bd){bd=d;best=e.name}
    }
  }
  return best?{name:best,dist:Math.sqrt(bd)}:legacyNearestStreet82(pos);
};

NAV80.lastRouteActor82=new THREE.Vector3(1e9,0,1e9);
NAV80.lastRouteTarget82=new THREE.Vector3(1e9,0,1e9);
const legacyRefreshRoute82=refreshRoute80;
refreshRoute80=function(force=false){
  const target=currentMissionTarget80(),actor=inVehicle?heroCar.position:player.position;
  if(!target)return legacyRefreshRoute82(force);
  const sameTarget=NAV80.lastRouteTarget82.distanceToSquared(target)<25;
  const moved=NAV80.lastRouteActor82.distanceToSquared(actor)>85*85;
  if(!force&&sameTarget&&!moved&&NAV80.nodePath.length)return;
  NAV80.lastRouteActor82.copy(actor);NAV80.lastRouteTarget82.copy(target);
  legacyRefreshRoute82(true);
};

function drawMap82(){
  const S=180,actor=inVehicle?heroCar:player,radius=900,sc=S/(radius*2);
  ctx.clearRect(0,0,S,S);ctx.fillStyle="#111a15";ctx.fillRect(0,0,S,S);ctx.lineCap="round";
  const edges=localEdges82(actor.position,1050);
  for(const e of edges){
    for(let i=1;i<e.points.length;i++){
      const a=e.points[i-1],b=e.points[i];
      const x1=S/2+(a.x-actor.position.x)*sc,z1=S/2+(a.z-actor.position.z)*sc;
      const x2=S/2+(b.x-actor.position.x)*sc,z2=S/2+(b.z-actor.position.z)*sc;
      if((x1<0&&x2<0)||(x1>S&&x2>S)||(z1<0&&z2<0)||(z1>S&&z2>S))continue;
      ctx.strokeStyle=e.drive?"#5d6467":"#777a72";ctx.lineWidth=Math.max(1,e.width*sc);
      ctx.beginPath();ctx.moveTo(x1,z1);ctx.lineTo(x2,z2);ctx.stroke();
    }
  }
  if(NAV80.points.length){
    ctx.strokeStyle="#57a9ff";ctx.lineWidth=2.4;ctx.globalAlpha=.9;ctx.beginPath();let started=false;
    for(const p of NAV80.points){
      const x=S/2+(p.x-actor.position.x)*sc,z=S/2+(p.z-actor.position.z)*sc;
      if(x<-20||x>S+20||z<-20||z>S+20)continue;
      if(!started){ctx.moveTo(x,z);started=true}else ctx.lineTo(x,z);
    }
    if(started)ctx.stroke();ctx.globalAlpha=1;
  }
  const t=currentMissionTarget80();
  if(t){const x=S/2+(t.x-actor.position.x)*sc,z=S/2+(t.z-actor.position.z)*sc;ctx.fillStyle="#ffd36b";ctx.beginPath();ctx.arc(x,z,5,0,Math.PI*2);ctx.fill()}
  for(const a of GEO10.trafficAgents){
    if(a.car.position.distanceToSquared(actor.position)>radius*radius)continue;
    const x=S/2+(a.car.position.x-actor.position.x)*sc,z=S/2+(a.car.position.z-actor.position.z)*sc;
    ctx.fillStyle="#9aa6af";ctx.fillRect(x-1.5,z-1.5,3,3);
  }
  if(police.visible){
    const x=S/2+(police.position.x-actor.position.x)*sc,z=S/2+(police.position.z-actor.position.z)*sc;
    ctx.fillStyle="#3388ff";ctx.beginPath();ctx.arc(x,z,3,0,Math.PI*2);ctx.fill();
  }
  ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(S/2,S/2,4,0,Math.PI*2);ctx.fill();
}

function refreshRoadRules82(actor){
  if(!GEO10.active||actor.distanceToSquared(ROAD50.lastActor)<110*110)return;
  ROAD50.lastActor.copy(actor);
  let nc=0,ne=0,nb=0,nj=0;const edges=localEdges82(actor,1050);
  for(const e of edges){
    const profile=roadProfile50(e);
    for(let i=1;i<e.points.length;i++){
      const a=e.points[i-1],b=e.points[i],mid=a.clone().add(b).multiplyScalar(.5);
      if(mid.distanceToSquared(actor)>950*950)continue;
      const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),ang=Math.atan2(dx,dz);
      if(profile.bike&&nb<ROAD50.maxBike){
        const pieces=Math.max(1,Math.ceil(len/6));
        for(let k=0;k<pieces&&nb<ROAD50.maxBike;k++)composeBox50(ROAD50.bike,nb++,a.clone().lerp(b,(k+.5)/pieces),ang,1,Math.min(1.25,len/(pieces*4.5)));
        continue;
      }
      if(e.width>=5.6&&nc<ROAD50.maxCenter){
        const dashes=Math.max(1,Math.floor(len/7));
        for(let k=0;k<dashes&&nc<ROAD50.maxCenter;k+=2)composeBox50(ROAD50.center,nc++,a.clone().lerp(b,(k+.5)/dashes),ang,1,1);
      }
      if(profile.major&&ne+2<ROAD50.maxEdge){
        const pieces=Math.max(1,Math.ceil(len/5)),side=e.width*.43,nx=Math.cos(ang),nz=-Math.sin(ang);
        for(let k=0;k<pieces&&ne+2<ROAD50.maxEdge;k++){
          const p=a.clone().lerp(b,(k+.5)/pieces);
          composeBox50(ROAD50.edge,ne++,new THREE.Vector3(p.x+nx*side,0,p.z+nz*side),ang,1,1);
          composeBox50(ROAD50.edge,ne++,new THREE.Vector3(p.x-nx*side,0,p.z-nz*side),ang,1,1);
        }
      }
    }
    for(const endpoint of [e.a,e.b]){
      if(!endpoint||nj>=ROAD50.maxJunction)continue;
      const degree=(GEO10.adj.get(endpoint)||[]).filter(x=>x.edge.drive).length;if(degree<3)continue;
      const pts=endpoint===e.b?[...e.points].reverse():e.points;if(pts.length<2)continue;
      const node=pts[0],next=pts[1],dir=next.clone().sub(node).setY(0);if(dir.length()<1)continue;dir.normalize();
      const bar=node.clone().addScaledVector(dir,4.2),ang=Math.atan2(dir.x,dir.z)+Math.PI/2;
      composeBox50(ROAD50.junction,nj++,bar,ang,Math.max(2.8,e.width*.72),1);
    }
  }
  ROAD50.center.count=nc;ROAD50.edge.count=ne;ROAD50.bike.count=nb;ROAD50.junction.count=nj;
  ROAD50.center.instanceMatrix.needsUpdate=ROAD50.edge.instanceMatrix.needsUpdate=ROAD50.bike.instanceMatrix.needsUpdate=ROAD50.junction.instanceMatrix.needsUpdate=true;
}

function refreshSignals82(actor){
  SIG60.nodes.clear();const cand=[];
  for(const n of localNodes82(actor,1000)){
    const info=classifySignalNode60(n.id);if(info)cand.push({...info,pos:n.pos});
  }
  cand.sort((a,b)=>b.score-a.score);
  for(let i=0;i<SIG60.pool.length;i++){
    const g=SIG60.pool[i],c=cand[i];
    if(!c){g.visible=false;continue}
    SIG60.nodes.set(c.id,c);g.visible=c.signal;g.position.copy(c.pos);
    if(c.adj[0]?.points?.length>1){const pts=c.adj[0].points,a=pts[0],b=pts[1];g.rotation.y=Math.atan2(b.x-a.x,b.z-a.z)+Math.PI/2}
  }
}

const hook82=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(hook82);rebuildSpatial82();
  drawMap=drawMap82;refreshRoadRules50=refreshRoadRules82;refreshSignals60=refreshSignals82;
  NAV80.drawWrapped=true;
  toast("8.2 spatial index actief");
},900);

function systems82(now){
  if(!GEO10.active)return;
  if((SP82.edgeCount!==GEO10.edges.length||SP82.nodeCount!==GEO10.nodes.size)&&now-SP82.lastBuild>2500)rebuildSpatial82();
}

// ===== DENDER COUNTY 9.0 — ADAPTIVE WORLD QUALITY =====
window.__DENDER_VERSION__="9.0";
const PERF90={
  sampleStart:performance.now(),
  frames:0,
  fps:60,
  tier:"QUALITY",
  lastTierChange:0
};
function applyTier90(tier){
  if(PERF90.tier===tier&&PERF90.lastTierChange)return;
  PERF90.tier=tier;PERF90.lastTierChange=performance.now();
  const dpr=Math.max(1,devicePixelRatio||1);
  if(tier==="PERFORMANCE"){
    renderer.setPixelRatio(Math.min(dpr,.9));
    renderer.shadowMap.enabled=false;sun.castShadow=false;
    ENV20.loadRadius=540;ENV20.unloadRadius=920;CHUNK31.radius=0;
    TREE40.trunks.visible=false;TREE40.crowns.visible=false;
    ROAD50.edge.visible=false;ROAD50.junction.visible=true;ROAD50.center.visible=true;ROAD50.bike.visible=true;
    rain.visible=false;camera.far=2600;
    LAMP40.groups.forEach((g,i)=>{if(g.userData.light)g.userData.light.visible=i<2});
  }else if(tier==="BALANCED"){
    renderer.setPixelRatio(Math.min(dpr,1.15));
    renderer.shadowMap.enabled=true;sun.castShadow=true;
    ENV20.loadRadius=720;ENV20.unloadRadius=1250;CHUNK31.radius=1;
    TREE40.trunks.visible=true;TREE40.crowns.visible=true;
    ROAD50.edge.visible=true;ROAD50.junction.visible=true;ROAD50.center.visible=true;ROAD50.bike.visible=true;
    rain.visible=true;camera.far=3400;
    LAMP40.groups.forEach((g,i)=>{if(g.userData.light)g.userData.light.visible=i<5});
  }else{
    renderer.setPixelRatio(Math.min(dpr,1.7));
    renderer.shadowMap.enabled=true;sun.castShadow=true;
    ENV20.loadRadius=900;ENV20.unloadRadius=1700;CHUNK31.radius=1;
    TREE40.trunks.visible=true;TREE40.crowns.visible=true;
    ROAD50.edge.visible=true;ROAD50.junction.visible=true;ROAD50.center.visible=true;ROAD50.bike.visible=true;
    rain.visible=true;camera.far=4200;
    LAMP40.groups.forEach(g=>{if(g.userData.light)g.userData.light.visible=true});
  }
  camera.updateProjectionMatrix();
  GAME20.quality="AUTO "+tier;
}
function systems90(now){
  if(!running)return;
  PERF90.frames++;
  const elapsed=now-PERF90.sampleStart;
  if(elapsed<3000)return;
  PERF90.fps=PERF90.frames*1000/elapsed;
  GAME20.fps=PERF90.fps;
  PERF90.frames=0;PERF90.sampleStart=now;
  const current=PERF90.tier;
  let next=current;
  if(PERF90.fps<24)next="PERFORMANCE";
  else if(PERF90.fps<46)next="BALANCED";
  else if(PERF90.fps>54)next="QUALITY";
  if(next!==current&&now-PERF90.lastTierChange>5000)applyTier90(next);
  if(window.__DENDER_HEALTH__){
    window.__DENDER_HEALTH__.fps=Math.round(PERF90.fps);
    window.__DENDER_HEALTH__.quality=PERF90.tier;
  }
}
const perfHook90=setInterval(()=>{
  if(!GEO10.active)return;
  clearInterval(perfHook90);
  adaptiveQuality20=()=>{};
  applyTier90("QUALITY");
},700);

// ===== DENDER COUNTY 9.1 — INSTANCED BUILDING LOD =====
window.__DENDER_VERSION__="9.1";
const ENV91={queue:[],targetMode:"FULL",lastMode:"FULL"};
const legacyBuildEnvChunk91=buildEnvChunk20;

function buildEnvChunk91(ch){
  const performance=PERF90.tier==="PERFORMANCE";
  if(!performance){
    legacyBuildEnvChunk91(ch);ch.lod91="FULL";return;
  }
  if(ch.built)return;
  const group=new THREE.Group();group.userData.realGeo10=true;group.userData.environment20=true;group.userData.lod91="PERFORMANCE";
  const buckets=[[],[],[],[]];
  for(const item of ch.features){
    const kind=item.ft.properties?.kind;
    if(kind==="building"&&item.pts.length>=4){
      const b=bounds20(item.pts),p=item.ft.properties||{};
      const h=THREE.MathUtils.clamp(Number(p.height_m)||6,2.8,34);
      const w=Math.max(1.5,b.maxX-b.minX),d=Math.max(1.5,b.maxZ-b.minZ);
      buckets[hash20(p.source_id||"b")%buckets.length].push({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,w,d,h});
    }else if(kind==="water"&&item.pts.length>=4)buildArea20(item,group,"water");
    else if(kind==="waterway")buildWaterway20(item,group);
  }
  buckets.forEach((items,bi)=>{
    if(!items.length)return;
    const geo=new THREE.BoxGeometry(1,1,1),mat91=facadeMaterial40(bi+1);
    const mesh=new THREE.InstancedMesh(geo,mat91,items.length);
    mesh.receiveShadow=false;mesh.castShadow=false;
    const q=new THREE.Quaternion(),mx=new THREE.Matrix4();
    items.forEach((b,i)=>{
      mx.compose(new THREE.Vector3(b.x,b.h/2,b.z),q,new THREE.Vector3(b.w,b.h,b.d));
      mesh.setMatrixAt(i,mx);
    });
    mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
  });
  ch.group=group;ch.built=true;ch.lod91="PERFORMANCE";GEO10.group.add(group);
}
buildEnvChunk20=buildEnvChunk91;

function queueLodRebuild91(mode){
  ENV91.targetMode=mode;
  ENV91.queue=[...ENV20.chunks.values()].filter(ch=>ch.built&&ch.lod91!==mode);
}
function processLodQueue91(){
  const ch=ENV91.queue.shift();if(!ch)return;
  destroyEnvChunk20(ch);buildEnvChunk20(ch);
}
const legacyApplyTier91=applyTier90;
applyTier90=function(tier){
  const before=PERF90.tier;
  legacyApplyTier91(tier);
  const mode=tier==="PERFORMANCE"?"PERFORMANCE":"FULL";
  if(mode!==ENV91.lastMode||before!==tier){
    ENV91.lastMode=mode;queueLodRebuild91(mode);
  }
};
function systems91(now){
  if(!GEO10.active)return;
  if(ENV91.queue.length)processLodQueue91();
  if(window.__DENDER_HEALTH__){
    window.__DENDER_HEALTH__.buildingLod=PERF90.tier==="PERFORMANCE"?"INSTANCED":"FULL";
    window.__DENDER_HEALTH__.lodQueue=ENV91.queue.length;
  }
}

// ===== DENDER COUNTY 9.2 — EXACT LEVEL CROSSINGS + VERSIONED SAVE =====
window.__DENDER_VERSION__="9.2";

const CROSS92={
  ready:false,
  loading:false,
  crossings:[],
  retryAt:0,
  activeCount:0
};

function crossingVisual92(pos,roadDir,width){
  const g=new THREE.Group();g.position.copy(pos);g.userData.realGeo10=true;
  const side=new THREE.Vector3(roadDir.z,0,-roadDir.x).normalize();
  const theta=Math.atan2(-side.z,side.x);g.rotation.y=theta;
  const poleM=new THREE.MeshStandardMaterial({color:0x4b4f52,metalness:.65,roughness:.42});
  const armM=new THREE.MeshStandardMaterial({color:0xe9e4d9,roughness:.68});
  const redM=new THREE.MeshStandardMaterial({color:0x1d1d1d,emissive:0xff1d16,emissiveIntensity:.08});
  const off=Math.max(2.5,width*.62),armLen=Math.min(5.8,off*1.65);
  const pivots=[];
  for(const sign of [-1,1]){
    const root=new THREE.Group();root.position.set(sign*off,0,0);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.085,2.2,8),poleM);pole.position.y=1.1;root.add(pole);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.12,10,8),redM.clone());lamp.position.set(0,1.75,.12);root.add(lamp);
    const pivot=new THREE.Group();pivot.position.y=1.55;
    const arm=meshBox(armLen,.12,.12,armM,sign<0?armLen/2:-armLen/2,0,0);pivot.add(arm);
    root.add(pivot);g.add(root);pivots.push({pivot,lamp,sign});
  }
  scene.add(g);
  return{group:g,pivots,open:1};
}

function nearestRoadDirection92(pos){
  let best=null,bd=Infinity,dir=new THREE.Vector3(1,0,0),width=5.6;
  for(const e of localEdges82(pos,90)){
    if(!e.drive)continue;
    for(let i=1;i<e.points.length;i++){
      const a=e.points[i-1],b=e.points[i];
      const d=pointSegDistSq09(pos.x,pos.z,{x1:a.x,z1:a.z,x2:b.x,z2:b.z});
      if(d<bd){bd=d;best=e;dir.copy(b).sub(a).setY(0).normalize();width=e.width||5.6}
    }
  }
  return{edge:best,dir,width,dist:Math.sqrt(bd)};
}

function nearestRailDistance92(pos){
  if(!SYS71.railPath||!SYS71.railCum)return null;
  let bestD=Infinity,bestDist=0;
  for(let i=1;i<SYS71.railPath.length;i++){
    const a=SYS71.railPath[i-1],b=SYS71.railPath[i];
    const vx=b.x-a.x,vz=b.z-a.z,wx=pos.x-a.x,wz=pos.z-a.z;
    const vv=vx*vx+vz*vz||1,t=THREE.MathUtils.clamp((wx*vx+wz*vz)/vv,0,1);
    const px=a.x+t*vx,pz=a.z+t*vz,d=(pos.x-px)**2+(pos.z-pz)**2;
    if(d<bestD){bestD=d;bestDist=SYS71.railCum[i-1]+t*(SYS71.railCum[i]-SYS71.railCum[i-1])}
  }
  return{distance:bestDist,offset:Math.sqrt(bestD)};
}

async function loadCrossings92(){
  if(CROSS92.ready||CROSS92.loading||!GEO10.active||!SP82.edgeCount)return false;
  CROSS92.loading=true;
  try{
    const r=await fetch("./geodata/level_crossings.geojson?v=9.2");
    if(!r.ok)throw new Error("crossing layer "+r.status);
    const fc=await r.json();
    for(const ft of fc.features||[]){
      if(ft.geometry?.type!=="Point")continue;
      const pos=geoToLocal10(ft.geometry.coordinates);
      const road=nearestRoadDirection92(pos);
      if(!road.edge||road.dist>35)continue;
      const rail=nearestRailDistance92(pos);
      if(!rail||rail.offset>45)continue;
      if(CROSS92.crossings.some(c=>c.pos.distanceToSquared(pos)<18*18))continue;
      const visual=crossingVisual92(pos,road.dir,road.width);
      CROSS92.crossings.push({
        id:ft.properties?.source_id||ft.id||("cross-"+CROSS92.crossings.length),
        pos,roadEdge:road.edge,railDistance:rail.distance,visual,active:false
      });
    }
    CROSS92.ready=true;
    toast("Echte spoorwegovergangen geladen • "+CROSS92.crossings.length);
    return true;
  }catch(err){
    console.warn("level crossings pending",err);
    CROSS92.retryAt=performance.now()+8000;
    return false;
  }finally{CROSS92.loading=false}
}

function crossingAhead92(agent,c){
  const target=agent.pts?.[agent.index];if(!target)return false;
  const dir=target.clone().sub(agent.car.position).setY(0);
  const to=c.pos.clone().sub(agent.car.position).setY(0);
  return dir.dot(to)>0;
}

const legacyShouldStop92=shouldStopAtNode60;
shouldStopAtNode60=function(agent,elapsed){
  for(const c of CROSS92.crossings){
    if(!c.active)continue;
    const d=agent.car.position.distanceTo(c.pos);
    if(d<42&&crossingAhead92(agent,c))return true;
  }
  return legacyShouldStop92(agent,elapsed);
};

function updateCrossings92(dt,now){
  if(!CROSS92.ready){
    if(!CROSS92.loading&&now>CROSS92.retryAt)loadCrossings92();
    return;
  }
  const actor=inVehicle?heroCar.position:player.position;
  CROSS92.activeCount=0;
  for(const c of CROSS92.crossings){
    const trainGap=SYS71.railLoaded?Math.abs(SYS71.trainDistance-c.railDistance):99999;
    c.active=trainGap<240;
    if(c.active)CROSS92.activeCount++;
    c.visual.group.visible=actor.distanceToSquared(c.pos)<1500*1500;
    const targetOpen=c.active?0:1;
    c.visual.open=THREE.MathUtils.lerp(c.visual.open,targetOpen,Math.min(1,dt*1.8));
    for(const p of c.visual.pivots){
      p.pivot.rotation.z=p.sign*(c.visual.open*Math.PI*.48);
      p.lamp.material.emissiveIntensity=c.active&&(Math.sin(now*.015)>0)?4:.08;
    }
  }
  if(inVehicle&&SYS71.train){
    const td=heroCar.position.distanceTo(SYS71.train.position);
    if(td<4.2&&Math.abs(heroCar.userData.speed)>1){
      heroCar.position.copy(v02.carPrev);heroCar.userData.speed=0;
      addDamage50(45,"Botsing met trein");
      wanted=Math.max(wanted,1);wantedCooldown=10;
    }
  }
}

const SAVE92={key:"denderCountySaveV3",version:3,restored:false,lastSave:0};

function snapshot92(){
  return{
    version:SAVE92.version,
    gameVersion:window.__DENDER_VERSION__,
    savedAt:new Date().toISOString(),
    day,wanted,inVehicle,
    cash:GAME20.cash,
    completed:GAME20.completed,
    jobIndex:JOB20.index,
    damage:SIM50.damage,
    player:{x:player.position.x,y:player.position.y,z:player.position.z,yaw:player.rotation.y},
    car:{x:heroCar.position.x,y:heroCar.position.y,z:heroCar.position.z,heading:heroCar.userData.heading,speed:heroCar.userData.speed},
    quality:PERF90.tier
  };
}
function saveUnified92(show=false){
  try{
    localStorage.setItem(SAVE92.key,JSON.stringify(snapshot92()));
    SAVE92.lastSave=performance.now();
    if(show)toast("Savegame v3 opgeslagen");
  }catch(err){console.warn("save v3 failed",err)}
}
function validNum92(v){return typeof v==="number"&&Number.isFinite(v)}
function restoreUnified92(show=false){
  if(SAVE92.restored||!GEO10.active||!JOB20.jobs.length)return false;
  let data=null;
  try{data=JSON.parse(localStorage.getItem(SAVE92.key)||"null")}catch{}
  if(!data){
    try{
      const legacy=JSON.parse(localStorage.getItem("dc20_geo")||"null");
      if(legacy){
        data={version:2,day:legacy.day,wanted:legacy.wanted,inVehicle:legacy.inVehicle,
          cash:Number(localStorage.getItem("dc20_cash")||GAME20.cash),
          completed:Number(localStorage.getItem("dc20_completed")||GAME20.completed),
          jobIndex:Number(localStorage.getItem("dc20_completed")||0),
          damage:SIM50.damage,
          player:{x:legacy.x,y:0,z:legacy.z,yaw:0},
          car:{x:legacy.x,y:0,z:legacy.z,heading:legacy.heading||0,speed:0}};
      }
    }catch{}
  }
  SAVE92.restored=true;
  if(!data)return false;
  const clamp=(v,min,max)=>THREE.MathUtils.clamp(validNum92(v)?v:0,min,max);
  const bounds=GEO10.bounds||{minX:-1e5,maxX:1e5,minZ:-1e5,maxZ:1e5};
  day=validNum92(data.day)?data.day:day;wanted=validNum92(data.wanted)?data.wanted:wanted;
  GAME20.cash=validNum92(data.cash)?data.cash:GAME20.cash;
  GAME20.completed=Math.max(0,Math.floor(validNum92(data.completed)?data.completed:GAME20.completed));
  JOB20.index=Math.max(0,Math.min(JOB20.jobs.length,Math.floor(validNum92(data.jobIndex)?data.jobIndex:GAME20.completed)));
  SIM50.damage=THREE.MathUtils.clamp(validNum92(data.damage)?data.damage:0,0,100);
  if(data.player){
    player.position.set(clamp(data.player.x,bounds.minX,bounds.maxX),validNum92(data.player.y)?data.player.y:0,clamp(data.player.z,bounds.minZ,bounds.maxZ));
    player.rotation.y=validNum92(data.player.yaw)?data.player.yaw:0;
  }
  if(data.car){
    heroCar.position.set(clamp(data.car.x,bounds.minX,bounds.maxX),validNum92(data.car.y)?data.car.y:0,clamp(data.car.z,bounds.minZ,bounds.maxZ));
    heroCar.userData.heading=validNum92(data.car.heading)?data.car.heading:0;heroCar.rotation.y=heroCar.userData.heading;
    heroCar.userData.speed=THREE.MathUtils.clamp(validNum92(data.car.speed)?data.car.speed:0,-8,34);
  }
  inVehicle=!!data.inVehicle;player.visible=!inVehicle;
  applyDamageVisual50();updateVehicleConditionUI50();
  v02.playerPrev.copy(player.position);v02.carPrev.copy(heroCar.position);
  refreshRoute80(true);saveUnified92(false);
  if(show)toast(data.version===SAVE92.version?"Savegame geladen":"Oude savegame gemigreerd naar v3");
  return true;
}

const legacySaveMeta92=saveMeta20;
saveMeta20=function(){legacySaveMeta92();saveUnified92(false)};
const legacySaveGame92=saveGame;
saveGame=function(show=true){legacySaveGame92(false);saveUnified92(show)};
const legacyLoadGame92=loadGame;
loadGame=function(show=true){if(!restoreUnified92(show))legacyLoadGame92(show)};

const restorePoll92=setInterval(()=>{
  if(!GEO10.active||!JOB20.jobs.length)return;
  clearInterval(restorePoll92);restoreUnified92(false);
},500);

function systems92(now){
  if(!running||!GEO10.active)return;
  const dt=Math.min((now-(systems92.last||now))/1000,.04);systems92.last=now;
  updateCrossings92(dt,now);
  if(now-SAVE92.lastSave>15000)saveUnified92(false);
  if(window.__DENDER_HEALTH__){
    window.__DENDER_HEALTH__.crossings=CROSS92.crossings.length;
    window.__DENDER_HEALTH__.activeCrossings=CROSS92.activeCount;
    window.__DENDER_HEALTH__.saveVersion=SAVE92.version;
  }
}
