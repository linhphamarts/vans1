import * as THREE from 'three';
import { firebaseConfig } from './firebase-config.js';

// === TÙY CHỈNH PROTOTYPE ===
const MAX_PLAYERS=6, START_Z=5, FINISH_Z=111, LANES={A:-7,B:7}, COLORS={A:0xf16b65,B:0x55b9f5};
const JOIN_LIMIT=6, MOVE_SPEED=6.1, RUN_SPEED=9.4;
const $=id=>document.getElementById(id), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const THREE_COLOR=(hex)=>new THREE.Color(hex);
let me=null, roomId='', online=false, api=null, db=null, myselfRef=null, roomRef=null, members={}, gameState=null, demoTimer=0, prevTime=performance.now();
let camera, renderer, scene, avatar, clock, vanMeshes={}, remoteAvatars=new Map(), markers=[], bridgeMeshes={}, raftMeshes={}, cableMeshes={}, worldObjects=[];
let lastInput=0,lastPush=0,lastAction=0,lastSabotage=0,lastMessage='',lastDataTime=0, lastForward={x:0,z:1}, fixedTarget=null;
const keys={}, entities=[], stageText=['Lấy ván gỗ về công trường cầu','Giữ F đẩy xe qua cầu','Bật tời kéo ở trên dốc','Giữ F đẩy xe lên dốc','Kích hoạt phà qua sông','Đẩy xe tới đích!'];
let localState=null;
const freshVan=()=>({z:START_Z,planks:0,winch:false,raft:false,finish:false,winchTime:0,lastSabotaged:0});
const initialState=()=>({vans:{A:freshVan(),B:freshVan()},winner:'',joinCount:0,players:{}});
function toast(s){if(s===lastMessage)return;lastMessage=s;$('toast').textContent=s;$('toast').style.opacity='1';setTimeout(()=>{$('toast').style.opacity='0';lastMessage=''},2400)}
function newPlayer(team, name){return {team,name,x:LANES[team]+(team==='A'?-2:2),z:2,rot:0,carrying:false,updated:Date.now()}}
function rref(path){return api.ref(db,path)}
function cleanRoom(s){return (s||'VAN123').toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,18)||'VAN123'}
function codeReady(){return !!(firebaseConfig.apiKey&&firebaseConfig.databaseURL&&firebaseConfig.projectId)}
$('status').textContent=codeReady()?'Đã cấu hình Firebase. Có thể tạo phòng online.':'Chưa cấu hình Firebase. Chế độ offline dùng được ngay.';
$('room').value=new URLSearchParams(location.search).get('room')||'VAN123';
$('demo').onclick=()=>startDemo().catch(e=>showError(e));
$('join').onclick=()=>startOnline().catch(e=>showError(e));
function showError(e){console.error(e);$('status').textContent='Lỗi: '+(e?.message||e);$('join').disabled=false;toast('Không thể kết nối. Xem hướng dẫn Firebase trong README.')}

// Firebase có thể bỏ trống: chỉ tải SDK khi vào chế độ ONLINE.
async function loadFirebase(){const v='11.10.0';const appMod=await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);const authMod=await import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`);const databaseMod=await import(`https://www.gstatic.com/firebasejs/${v}/firebase-database.js`);let app=appMod.initializeApp(firebaseConfig);api={...databaseMod};db=databaseMod.getDatabase(app);await authMod.signInAnonymously(authMod.getAuth(app));return authMod.getAuth(app).currentUser.uid}
async function startOnline(){if(!codeReady())throw Error('Hãy cấu hình Firebase trong firebase-config.js trước.');$('join').disabled=true;const uid=await loadFirebase();const name=($('name').value.trim()||'Player').slice(0,16);roomId=cleanRoom($('room').value);const root=`rooms/${roomId}`;roomRef=rref(root);let assigned=null;
  // Một transaction join phòng đảm bảo mọi người lần lượt nhận đội A/B, kể cả khi vào cùng lúc.
  const tx=await api.runTransaction(roomRef, (raw)=>{let s=raw||initialState();s.players||={};s.vans||={A:freshVan(),B:freshVan()};if(s.players[uid]){assigned=s.players[uid].team;return s}if(Object.keys(s.players).length>=JOIN_LIMIT)return;const team=(s.joinCount||0)%2===0?'A':'B';assigned=team;s.players[uid]=newPlayer(team,name);s.joinCount=(s.joinCount||0)+1;return s},{applyLocally:false});
  if(!tx.committed){throw Error('Phòng đã đủ 6 người (hoặc transaction bị từ chối). Hãy dùng mã phòng mới.')}
  const player=tx.snapshot.val()?.players?.[uid];if(!player)throw Error('Không vào được phòng.');me={id:uid,team:player.team,name};online=true;
  myselfRef=rref(`${root}/players/${uid}`);await api.onDisconnect(myselfRef).remove();
  api.onValue(roomRef,(snap)=>{gameState=snap.val();members=gameState?.players||{};renderUI();reconcilePlayers()});
  api.onValue(rref('.info/connected'),(snap)=>{$('connection').textContent=snap.val()?'🟢 Online':'🔴 Mất kết nối';if(snap.val()&&myselfRef)api.onDisconnect(myselfRef).remove().catch(console.warn)});
  await launch();toast('Đã vào đội '+me.team+' • Phòng '+roomId);}
async function startDemo(){roomId='DEMO';online=false;me={id:'local',team:'A',name:($('name').value.trim()||'Player').slice(0,16)};localState=initialState();localState.players.local=newPlayer('A',me.name);for(let i=0;i<3;i++){let t=i%2?'A':'B';localState.players['bot'+i]=newPlayer(t,'Bot '+(i+1));localState.players['bot'+i].z=4+i*3}localState.players.bot0.team='B';localState.players.bot0.x=LANES.B+2;localState.players.bot1.team='A';localState.players.bot1.x=LANES.A-2;localState.players.bot2.team='B';localState.players.bot2.x=LANES.B+2;gameState=localState;members=localState.players;await launch();toast('Chế độ demo offline • NPC không phải người chơi thật')}
async function launch(){$('menu').classList.add('hidden');$('top').classList.remove('hidden');$('bottom').classList.remove('hidden');$('players').classList.remove('hidden');$('mini').classList.remove('hidden');makeWorld();reconcilePlayers();renderUI();requestAnimationFrame(loop)}

function mat(color,roughness=0.86){return new THREE.MeshStandardMaterial({color,roughness,metalness:0.04})}
function box(w,h,d,color,x,y,z,parent=scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function cylinder(r,h,color,x,y,z,parent=scene){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
function label(text,color,x,y,z,parent=scene){const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#081322d9';ctx.fillRect(0,0,512,96);ctx.font='bold 40px system-ui';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,256,61);const texture=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));s.scale.set(5,0.94,1);s.position.set(x,y,z);parent.add(s);return s}
function makeWorld(){scene=new THREE.Scene();scene.background=new THREE.Color('#89bfd6');scene.fog=new THREE.Fog('#89bfd6',60,185);camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.1,300);camera.position.set(-13,14,-12);renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.prepend(renderer.domElement);window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
 scene.add(new THREE.HemisphereLight('#e6f5ff','#526044',2.1));const sun=new THREE.DirectionalLight('#fff6d5',2.5);sun.position.set(-25,48,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-47;sun.shadow.camera.right=47;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-30;scene.add(sun);
 box(180,.4,260,0x66885b,0,-.45,51);for(let i=0;i<2;i++){let t=i===0?'A':'B',x=LANES[t];const roadColor=i===0?0x926e60:0x5a7c87;for(const [s,e] of [[-8,27],[36,63],[75,118]])box(9,.10,e-s,roadColor,x,.01,(s+e)/2);
 // RIVER & ravine: cầu đầu và phà sau
 box(9,.08,8,0x243c50,x,-.12,31.5);box(9,.08,13,0x277e9f,x,-.12,69);for(let j=0;j<5;j++)box(.18,.015,.9,0xf7df9b,x,-.0,9+j*20);
 // step labels
 label('CẦU GỖ', '#fff1b8',x,2.7,28);label('TỜI KÉO','#fff1b8',x,2.8,48);label('PHÀ','#fff1b8',x,2.8,67);label('FINISH','#baffd0',x,3.5,111);
 // construction plank piles
 box(2.7,.6,2.5,0x654a31,x-3,.35,19);for(let j=0;j<4;j++)box(2.5,.12,.42,0xe8bb77,x-3,.75+j*.16,18.7+(j%2)*.45);
 // bridge models: hidden until built
 bridgeMeshes[t]=[];for(let j=0;j<2;j++){const b=box(7,.22,4.2,0xd1a06a,x,.15,29.4+j*4.2);bridgeMeshes[t].push(b)}
 // pulley + sloping stretch appearance
 box(8,.15,10,0x757f72,x,.14,51).rotation.x=-.08;const post=box(.45,3,.45,0x4a3a31,x+3.3,1.5,46);const reel=cylinder(.6,.8,0xe2b56c,x+3.3,2.35,46);reel.rotation.z=Math.PI/2;
 cableMeshes[t]=box(.08,.08,12,0xebdfbd,x+2,1.6,50);cableMeshes[t].rotation.y=.13;
 // ferry raft visible when activated
 raftMeshes[t]=box(7,.33,13,0x9c7952,x,.13,69);for(let j=0;j<4;j++)box(.15,.1,12,0xceb38a,-2.5+j*1.6,.2,0,raftMeshes[t]);
 // finish banner
 for(let sx of [-3.7,3.7])box(.3,4,.3,0xe9e5da,x+sx,2,111);box(7.5,.7,.3,i===0?0xff837c:0x83d7ff,x,4.2,111);
 // rocks / props around track
 for(let k=0;k<14;k++){const zz=7+k*7;const side=k%2?5.6:-5.7;const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.48+(k%3)*.18),mat(0x78836b));rock.position.set(x+side,.45,zz);rock.castShadow=true;scene.add(rock)}
 }
 box(2,.35,123,0x3f604e,0,-.06,52);box(35,.08,13,0x287e9e,0,-.20,69);
 for(let i=0;i<80;i++){const x=-35+Math.random()*70,z=-15+Math.random()*150;if(Math.abs(x)<14)continue;const trunk=cylinder(.16,1.5,0x654633,x,.75,z);const crown=cylinder(.95,2.2,i%2?0x397c55:0x4a966a,x,2.25,z);crown.geometry.dispose();crown.geometry=new THREE.ConeGeometry(1.4,3.5,7)}
 for(let t of ['A','B'])vanMeshes[t]=createVan(t);avatar=createAvatar(me.team,me.name);scene.add(avatar);}
function createVan(t){const g=new THREE.Group();const color=COLORS[t];box(3.0,1.35,4.4,color,0,1.28,0,g);box(2.7,1.18,2.1,0xf4ebe0,0,2.38,-.68,g);box(2.2,.69,.1,0x2c4151,0,2.44,-1.78,g);for(let x of [-1.48,1.48])for(let z of [-1.40,1.40]){let w=cylinder(.5,.33,0x1c2531,x,.62,z,g);w.rotation.z=Math.PI/2}box(2.7,.25,.3,0x28333d,0,1.0,-2.31,g);box(2.7,.25,.3,0x28333d,0,1.0,2.31,g);box(.3,.3,.08,0xffefbb,-1.07,1.3,-2.25,g);box(.3,.3,.08,0xffefbb,1.07,1.3,-2.25,g);scene.add(g);return g}
function createAvatar(t,name){const g=new THREE.Group();cylinder(.4,.9,COLORS[t],0,1,0,g);const head=new THREE.Mesh(new THREE.SphereGeometry(.38,14,10),mat(0xf2c99d));head.position.y=1.82;g.add(head);box(.58,.15,.4,0x333d45,0,2.1,0,g);for(let x of [-.24,.24])box(.24,.63,.3,0x293b57,x,.37,0,g);label(name,t==='A'?'#ffc2bd':'#b8e9ff',0,3.3,0,g);return g}
function reconcilePlayers(){if(!scene)return;const seen=new Set();for(const [id,p] of Object.entries(members||{})){if(id===me.id)continue;seen.add(id);if(!remoteAvatars.has(id)){const mesh=createAvatar(p.team,p.name||'Player');scene.add(mesh);remoteAvatars.set(id,mesh)} }for(const [id,obj] of remoteAvatars){if(!seen.has(id)){scene.remove(obj);remoteAvatars.delete(id)}}}
function renderUI(){if(!me||!gameState)return;const vs=gameState.vans||{};for(const t of ['A','B']){$('progress'+t).textContent=Math.round(clamp(((vs[t]?.z||START_Z)-START_Z)/(FINISH_Z-START_Z),0,1)*100)+'%';$('members'+t).textContent=Object.values(members).filter(p=>p.team===t).length+' người'}$('myTeam').textContent='BẠN: ĐỘI '+me.team+' • '+me.name;$('myTeam').style.color=me.team==='A'?'#ff928c':'#8bd6ff';$('roomInfo').textContent='Phòng: '+roomId+' • '+Object.keys(members).length+'/6 người';$('connection').textContent=online?'Đang đồng bộ qua Firebase':'Chế độ offline (NPC giả lập)';$('players').innerHTML='<b>NGƯỜI CHƠI</b><br>'+Object.values(members).map(p=>`<span style="color:${p.team==='A'?'#ffaaa4':'#96d6ff'}">● ${escapeText(p.name)} [${p.team}]</span>`).join('<br>');if(gameState.winner){$('result').classList.remove('hidden');$('winText').textContent='ĐỘI '+gameState.winner+' CHIẾN THẮNG!'}}
function escapeText(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function updateVan(team,fn){if(!online){fn(localState.vans[team]);return}const vr=rref(`rooms/${roomId}/vans/${team}`);await api.runTransaction(vr,old=>{if(!old)return;const v={...old};fn(v);return v},{applyLocally:false})}
async function interact(){if(!me||!gameState||gameState.winner)return;const p=members[me.id];if(!p)return;const v=gameState.vans[me.team];const x=LANES[me.team],inLane=Math.abs(p.x-x)<6,z=p.z;if(!inLane)return toast('Hãy quay về đường đua của đội bạn.');if(Math.abs(z-19)<4){if(p.carrying)return toast('Bạn đang cầm ván! Đưa đến điểm xây cầu tại Z=29.');if(online)await api.update(myselfRef,{carrying:true});else p.carrying=true;return toast('Đã lấy ván gỗ • đến cây cầu để đặt (E)')}
 if(Math.abs(z-29.5)<5){if(!p.carrying)return toast('Đi lấy ván ở chồng gỗ phía trước cầu (Z=19).');if(v.planks>=2)return toast('Cầu đã hoàn thành');await updateVan(me.team,v=>v.planks=clamp((v.planks||0)+1,0,2));if(online)await api.update(myselfRef,{carrying:false});else p.carrying=false;return toast('Đã đặt 1 ván. Cần tổng cộng 2 ván.')}
 if(Math.abs(z-46)<5){await updateVan(me.team,v=>v.winch=true);return toast('Đã nối tời kéo! Bây giờ xe có thể vượt dốc.')}
 if(Math.abs(z-65)<5){await updateVan(me.team,v=>v.raft=true);return toast('Đã kích hoạt phà! Đẩy xe qua sông.')}
 return toast('Không có vật thể tương tác gần đây.')}
async function sabotage(){if(!me||!gameState||gameState.winner)return;const other=me.team==='A'?'B':'A';const p=members[me.id],v=gameState.vans[other];if(!p||!v)return;const dz=Math.abs(p.z-v.z),dx=Math.abs(p.x-LANES[other]);if(dx>4.5||dz>5)return toast('Hãy tới gần xe đội đối thủ mới phá được.');if(Date.now()-lastSabotage<8000)return toast('Đợi 8 giây để phá tiếp.');lastSabotage=Date.now();await updateVan(other,v=>{if(Date.now()-(v.lastSabotaged||0)<5000)return;v.z=clamp(v.z-2.5,START_Z,FINISH_Z);v.lastSabotaged=Date.now()});toast('💥 Đã đẩy lùi xe đối thủ 2.5m!')}
function stage(v){if(v.z<25)return 0;if(v.z<38)return 1;if(v.z<46)return 2;if(v.z<59)return 3;if(v.z<76)return 4;return 5}
function obstacle(v,next){if(next>26&&next<36&&(v.planks||0)<2)return 'Cần xây cầu: 2 ván gỗ';if(next>48&&next<58&&!v.winch)return 'Cần bật tời kéo ở Z=46';if(next>64&&next<76&&!v.raft)return 'Cần kích hoạt phà ở Z=65';return null}
function handleKeys(e,down){if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;const key=e.key.toLowerCase();keys[key]=down;if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();if(!down||!me)return;if(key==='e')interact().catch(showError);if(key==='q')sabotage().catch(showError);if(key==='r')fixedTarget=null}
window.addEventListener('keydown',e=>handleKeys(e,true));window.addEventListener('keyup',e=>handleKeys(e,false));window.addEventListener('blur',()=>Object.keys(keys).forEach(k=>keys[k]=false));
let localPosition={x:LANES.A-2,z:2};function loop(time){requestAnimationFrame(loop);if(!me||!scene||!gameState)return;let dt=clamp((time-prevTime)/1000,0,.06);prevTime=time;const p=members[me.id];if(!p)return;if(!avatar.userData.initialized){localPosition={x:p.x,z:p.z};avatar.userData.initialized=true}
 const mx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),mz=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0);let len=Math.hypot(mx,mz)||1,spd=keys.shift?RUN_SPEED:MOVE_SPEED;localPosition.x=clamp(localPosition.x+mx/len*spd*dt,-24,24);localPosition.z=clamp(localPosition.z+mz/len*spd*dt,-2,116);if(mx||mz){lastForward={x:mx/len,z:mz/len};avatar.rotation.y=Math.atan2(mx,mz)}avatar.position.set(localPosition.x,0,localPosition.z);
 if(!online){p.x=localPosition.x;p.z=localPosition.z;p.rot=avatar.rotation.y}
 else if(time-lastInput>125){lastInput=time;api.update(myselfRef,{x:+localPosition.x.toFixed(2),z:+localPosition.z.toFixed(2),rot:+avatar.rotation.y.toFixed(2),updated:Date.now()}).catch(console.warn)}
 for(const [id,a] of remoteAvatars){const remote=members[id];if(!remote)continue;a.position.lerp(new THREE.Vector3(remote.x||0,0,remote.z||0),Math.min(1,dt*9));a.rotation.y=remote.rot||0}
 let myVan=gameState.vans[me.team];let nearVan=Math.abs(localPosition.x-LANES[me.team])<3.5&&Math.abs(localPosition.z-myVan.z)<4.4;
 if(keys.f&&nearVan&&time-lastPush>260&&!gameState.winner){lastPush=time;const amount=.42;const err=obstacle(myVan,myVan.z+amount);if(err)toast(err);else updateVan(me.team,v=>{if(v.finish)return;let next=clamp(v.z+amount,START_Z,FINISH_Z);if(!obstacle(v,next)){v.z=next;if(next>=FINISH_Z)v.finish=true}}).then(()=>{if(!online&&gameState.vans[me.team].finish){localState.winner=me.team;renderUI()}if(online)api.get(rref(`rooms/${roomId}/vans/${me.team}`)).then(s=>{if(s.val()?.finish)return api.runTransaction(rref(`rooms/${roomId}/winner`),old=>old||me.team)}).catch(console.warn)}).catch(console.warn)}
 // Demo bots show multiplayer-like movement (not actual network participants)
 if(!online){demoTimer+=dt;for(let i=0;i<3;i++){let bot=members['bot'+i],v=gameState.vans[bot.team];if(!bot)continue;bot.z=clamp(bot.z+dt*(.6+i*.15),0,110);bot.x=LANES[bot.team]+(i%2?-2:2)+Math.sin(time*.001+i)*.35;bot.rot=0}if(gameState.vans.B.z<23)gameState.vans.B.z+=dt*.17;}
 for(const t of ['A','B']){let v=gameState.vans[t]||freshVan();vanMeshes[t].position.set(LANES[t],0,v.z);bridgeMeshes[t].forEach((b,i)=>b.visible=(v.planks||0)>i);cableMeshes[t].visible=!!v.winch;raftMeshes[t].visible=!!v.raft}
 const camTarget=new THREE.Vector3(localPosition.x+10,13,localPosition.z-14),look=new THREE.Vector3(localPosition.x,1,localPosition.z+8);camera.position.lerp(camTarget,Math.min(1,dt*4));camera.lookAt(look);
 const v=gameState.vans[me.team];let hint=stageText[stage(v)];if(p.carrying)hint='Đang mang ván — đến chỗ cây cầu (Z=29), nhấn E';if(nearVan)hint='GIỮ F để đẩy xe • '+hint;else if(Math.abs(localPosition.z-19)<4)hint='NHẤN E: lấy ván gỗ';else if(Math.abs(localPosition.z-29.5)<5)hint='NHẤN E: đặt ván xây cầu';else if(Math.abs(localPosition.z-46)<5)hint='NHẤN E: bật tời';else if(Math.abs(localPosition.z-65)<5)hint='NHẤN E: bật phà';$('prompt').textContent=hint;
 if(time-lastDataTime>500){renderUI();lastDataTime=time}renderer.render(scene,camera)}
