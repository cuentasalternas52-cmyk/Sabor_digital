import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,collection,doc,onSnapshot,addDoc,updateDoc,deleteDoc,setDoc,writeBatch,increment,query,where} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {firebaseConfig as FC,restaurante as R} from "./firebase-config.js";

const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cop=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),3000)};
let D={products:[],ing:[]},admin=false,tab='productos',editing=null,ready=false,msg='',pend=false,unsub=[];
const ingOf=i=>D.ing.find(x=>x.id===i);
const calc=(p,m)=>!(p.r&&p.r.length)||p.r.every(r=>m[r.i]&&m[r.i].s>=r.q);
const portions=p=>p.r&&p.r.length?Math.min(...p.r.map(r=>{const g=ingOf(r.i);return g?Math.floor(g.s/r.q):0})):Infinity;
const mapOf=l=>Object.fromEntries(l.map(g=>[g.id,g]));

$('#brand').textContent=R.nombre;$('#city').textContent=R.ciudad;document.title=R.nombre+' · Menú';
const configured=FC.apiKey&&!String(FC.apiKey).startsWith('PEGA');
let db,auth;
if(configured){const app=initializeApp(FC);db=getFirestore(app);auth=getAuth(app)}

function menuHTML(){
  if(!configured)return'<p class="note">Falta configurar Firebase: pega los datos de tu proyecto en js/firebase-config.js.</p>';
  if(msg)return`<p class="note">${esc(msg)}</p>`;
  if(!ready)return'<p class="note">Cargando menú…</p>';
  const list=D.products.filter(p=>p.on);
  const cats=[...new Set(list.map(p=>p.c||'Otros'))];
  return cats.map(c=>`<section><h2 class="cat">${esc(c)}</h2><div class="grid">${list.filter(p=>(p.c||'Otros')===c).map(p=>{const out=p.disponible===false;
    return`<article class="card ${out?'out':''}"><h3>${esc(p.n)}</h3>${p.d?`<p class="note">${esc(p.d)}</p>`:''}<div class="row"><span class="price">${cop(p.p)}</span><span class="tag ${out?'bad':''}">${out?'Agotado':'Disponible'}</span></div></article>`}).join('')}</div></section>`).join('')||'<p class="note">Aún no hay productos en el menú.</p>';
}
const ingOpts=sel=>D.ing.map(g=>`<option value="${g.id}" ${g.id===sel?'selected':''}>${esc(g.n)} (${esc(g.u)})</option>`).join('');
const rrow=(r={})=>`<div class="rrow"><label>Ingrediente<select name="ri">${ingOpts(r.i)}</select></label><label>Cantidad por porción<input name="rq" type="number" min="0" step="any" value="${r.q||''}"></label><button type="button" class="btn ghost sm" data-a="rowdel">Quitar</button></div>`;
function adminHTML(){
  const tabs=`<div class="tabs" role="tablist">${[['productos','Productos'],['inventario','Inventario']].map(([k,l])=>`<button role="tab" aria-selected="${tab===k}" data-a="tab" data-id="${k}">${l}</button>`).join('')}</div>`;
  const empty=!D.products.length&&!D.ing.length?'<p class="note">Aún no hay datos. <button class="btn ghost sm" data-a="seed">Cargar menú e inventario de ejemplo</button></p>':'';
  let body='';
  if(tab==='productos'){
    const e=D.products.find(p=>p.id===editing)||{r:[],on:true};
    const rows=D.products.map(p=>{const m=portions(p);return`<tr><td>${esc(p.n)}<br><span class="note">${esc(p.c||'Otros')} · ${cop(p.p)}</span></td><td>${!p.on?'<span class="tag bad">Oculto</span>':m===Infinity?'<span class="tag">Sin receta</span>':m<=0?'<span class="tag bad">Agotado</span>':'<span class="tag">'+m+' porciones</span>'}</td><td><button class="btn ghost sm" data-a="sell" data-id="${p.id}">Vender 1</button> <button class="btn ghost sm" data-a="edit" data-id="${p.id}">Editar</button> <button class="btn ghost sm" data-a="del" data-id="${p.id}">Eliminar</button></td></tr>`}).join('');
    body=`<div class="cols"><form id="pf"><h3>${editing?'Editar producto':'Agregar producto'}</h3>
    <label>Nombre<input name="n" required value="${esc(e.n)}"></label><label>Categoría<input name="c" list="cats" placeholder="Ej. Bowls, Bebidas" value="${esc(e.c)}"></label><datalist id="cats">${[...new Set(D.products.map(p=>p.c))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
    <label>Precio (COP)<input name="p" type="number" min="0" step="500" required value="${e.p??''}"></label><label>Descripción (opcional)<input name="d" value="${esc(e.d)}"></label>
    <label><input type="checkbox" name="on" ${e.on?'checked':''}>Mostrar en el menú</label>
    <h3 style="margin-top:14px">Receta (opcional)</h3><p class="note">Si la agregas, el producto se marca como agotado cuando falte algún ingrediente.</p>
    <div id="rows">${(e.r||[]).map(rrow).join('')}</div>
    ${D.ing.length?'<button type="button" class="btn ghost sm" data-a="rowadd" style="margin-top:8px">Agregar ingrediente</button>':'<p class="note">Primero crea ingredientes en la pestaña Inventario.</p>'}
    <div class="actions">${editing?'<button type="button" class="btn ghost" data-a="cancel">Cancelar</button>':''}<button class="btn">${editing?'Guardar cambios':'Agregar producto'}</button></div></form>
    <div class="wrap"><table><tr><th>Producto</th><th>Estado</th><th></th></tr>${rows||'<tr><td colspan="3" class="note">Sin productos.</td></tr>'}</table></div></div>`;
  }else{
    const rows=D.ing.map(g=>`<tr><td>${esc(g.n)}</td><td>${Math.round(g.s*100)/100} ${esc(g.u)} ${g.s<=g.m?'<span class="tag bad">Reponer</span>':''}</td><td>${g.m} ${esc(g.u)}</td><td><div class="mv"><input type="number" min="0" step="any" aria-label="Cantidad de ${esc(g.n)}" data-q="${g.id}"><button class="btn ghost sm" data-a="in" data-id="${g.id}">Entrada</button><button class="btn ghost sm" data-a="out" data-id="${g.id}">Merma</button><button class="btn ghost sm" data-a="delIng" data-id="${g.id}">Borrar</button></div></td></tr>`).join('');
    body=`<div class="cols"><form id="if"><h3>Agregar ingrediente</h3><label>Nombre<input name="n" required></label>
    <label>Unidad<select name="u">${['g','kg','ml','l','und'].map(u=>`<option>${u}</option>`).join('')}</select></label>
    <label>Existencia inicial<input name="s" type="number" min="0" step="any" required value="0"></label><label>Mínimo antes de reponer<input name="m" type="number" min="0" step="any" required value="0"></label>
    <div class="actions"><button class="btn">Agregar ingrediente</button></div></form>
    <div class="wrap"><table><tr><th>Ingrediente</th><th>Existencia</th><th>Mínimo</th><th>Movimiento</th></tr>${rows||'<tr><td colspan="4" class="note">Sin ingredientes.</td></tr>'}</table></div></div>`;
  }
  return`<section class="panel"><h2>Panel del restaurante</h2><p class="note">Los cambios se guardan en Firebase y el menú público se actualiza al instante.</p>${empty}${tabs}${body}</section>`;
}
function render(){
  const a=document.activeElement;
  if(a&&/INPUT|SELECT/.test(a.tagName)&&$('#admin').contains(a)){pend=true;return}
  pend=false;
  $('#acc').innerHTML=!configured?'':admin?'<button class="btn ghost sm" data-a="logout">Cerrar sesión</button>':'<button class="btn ghost sm" data-a="openLogin">Acceso restaurante</button>';
  $('#admin').innerHTML=admin?adminHTML():'';$('#menu').innerHTML=menuHTML();
}
document.addEventListener('focusout',()=>{if(pend)setTimeout(render,50)});

function listen(){
  unsub.forEach(f=>f());unsub=[];ready=false;msg='';
  const sortP=l=>l.sort((a,b)=>(a.c||'').localeCompare(b.c||'')||a.n.localeCompare(b.n));
  const pq=admin?collection(db,'productos'):query(collection(db,'productos'),where('on','==',true));
  unsub.push(onSnapshot(pq,s=>{D.products=sortP(s.docs.map(d=>({id:d.id,...d.data()})));ready=true;render()},e=>{msg='No se pudo cargar el menú ('+e.code+'). Revisa la configuración de Firebase y las reglas.';render()}));
  if(admin)unsub.push(onSnapshot(collection(db,'ingredientes'),s=>{D.ing=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.n.localeCompare(b.n));render()},e=>{toast('Tu cuenta no tiene permiso de administrador. Revisa el correo en firestore.rules.')}));
}
async function syncAvail(list){
  const m=mapOf(list),b=writeBatch(db);let n=0;
  D.products.forEach(p=>{const v=calc(p,m);if(p.disponible!==v){b.update(doc(db,'productos',p.id),{disponible:v});n++}});
  if(n)await b.commit();
}
const run=async f=>{try{await f()}catch(e){toast('No se pudo guardar: '+(e.code||e.message))}};

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=b.dataset.id;
  const g=ingOf(id),p=D.products.find(x=>x.id===id);
  if(a==='openLogin'){$('#loginErr').textContent='';$('#login').showModal();return}
  if(a==='closeLogin'){$('#login').close();return}
  if(a==='logout')return run(()=>signOut(auth));
  if(a==='tab'){tab=id;editing=null}
  else if(a==='rowadd'){$('#rows').insertAdjacentHTML('beforeend',rrow());return}
  else if(a==='rowdel'){b.closest('.rrow').remove();return}
  else if(a==='edit'){editing=id;render();$('#pf').scrollIntoView({behavior:'smooth'});return}
  else if(a==='cancel')editing=null;
  else if(a==='del'){if(!confirm('¿Eliminar «'+p.n+'»?'))return;return run(()=>deleteDoc(doc(db,'productos',id)))}
  else if(a==='sell')return run(async()=>{
    if(!p.on||portions(p)<=0)return toast('No hay ingredientes suficientes.');
    const b=writeBatch(db);(p.r||[]).forEach(r=>b.update(doc(db,'ingredientes',r.i),{s:increment(-r.q)}));await b.commit();
    const l=D.ing.map(x=>({...x,s:x.s-((p.r||[]).find(r=>r.i===x.id)?.q||0)}));await syncAvail(l);toast('Venta registrada: '+p.n)});
  else if(a==='in'||a==='out')return run(async()=>{
    const q=parseFloat($(`[data-q="${id}"]`).value);if(!(q>0))return toast('Escribe una cantidad mayor que cero.');
    const nv=a==='in'?g.s+q:Math.max(0,g.s-q);await updateDoc(doc(db,'ingredientes',id),{s:nv});
    await syncAvail(D.ing.map(x=>x.id===id?{...x,s:nv}:x))});
  else if(a==='delIng'){if(!confirm('¿Borrar «'+g.n+'»? También se quitará de las recetas.'))return;
    return run(async()=>{const b=writeBatch(db);b.delete(doc(db,'ingredientes',id));
      D.products.filter(x=>(x.r||[]).some(r=>r.i===id)).forEach(x=>b.update(doc(db,'productos',x.id),{r:x.r.filter(r=>r.i!==id)}));await b.commit();
      D.products.forEach(x=>x.r=(x.r||[]).filter(r=>r.i!==id));await syncAvail(D.ing.filter(x=>x.id!==id))})}
  else if(a==='seed')return run(seed);
  render();
});
document.addEventListener('submit',e=>{
  const f=e.target;e.preventDefault();const v=new FormData(f);
  if(f.id==='loginForm'){
    signInWithEmailAndPassword(auth,v.get('u'),v.get('p')).then(()=>{$('#login').close();f.reset()}).catch(()=>{$('#loginErr').textContent='Correo o contraseña incorrectos.'});
  }else if(f.id==='pf')run(async()=>{
    const r=[...f.querySelectorAll('.rrow')].map(x=>({i:x.querySelector('[name=ri]').value,q:parseFloat(x.querySelector('[name=rq]').value)})).filter(x=>x.i&&x.q>0);
    const o={n:v.get('n').trim(),c:v.get('c').trim()||'Otros',p:+v.get('p'),d:v.get('d').trim(),on:!!v.get('on'),r};o.disponible=calc(o,mapOf(D.ing));
    if(editing)await updateDoc(doc(db,'productos',editing),o);else await addDoc(collection(db,'productos'),o);
    editing=null;toast('Producto guardado.');render()});
  else if(f.id==='if')run(async()=>{await addDoc(collection(db,'ingredientes'),{n:v.get('n').trim(),u:v.get('u'),s:+v.get('s'),m:+v.get('m')});toast('Ingrediente agregado.')});
});
async function seed(){
  const I=[['arroz','Arroz','g',9000,2000],['pollo','Pollo','g',7000,1500],['res','Res','g',5000,1200],['bagre','Bagre','g',4000,1000],['queso','Queso costeño','g',3000,800],['platano','Plátano verde','und',40,12],['yuca','Yuca','g',6000,1500],['mango','Pulpa de mango','g',5000,1000],['limon','Limón','und',60,15]];
  const P=[['Bowl de pollo desmechado','Bowls',24000,{arroz:150,pollo:160,platano:.5}],['Bowl de res a la plancha','Bowls',27000,{arroz:150,res:170,platano:.5}],['Arroz con coco y bagre','Arroces',29000,{arroz:150,bagre:170}],['Arroz con coco y queso costeño','Arroces',22000,{arroz:150,queso:80}],['Pechuga a la parrilla','Proteínas',21000,{pollo:200}],['Yuca frita','Acompañamientos',8000,{yuca:200}],['Patacones con queso','Acompañamientos',9000,{platano:1,queso:40}],['Jugo de mango','Bebidas',6000,{mango:250}],['Limonada de coco','Bebidas',7000,{limon:3}]];
  const b=writeBatch(db);
  I.forEach(([k,n,u,s,m])=>b.set(doc(db,'ingredientes',k),{n,u,s,m}));
  P.forEach(([n,c,p,r],i)=>b.set(doc(db,'productos','p'+(i+1)),{n,c,p,d:'',on:true,disponible:true,r:Object.entries(r).map(([i,q])=>({i,q}))}));
  await b.commit();toast('Datos de ejemplo cargados.');
}
if(configured){onAuthStateChanged(auth,u=>{admin=!!u;listen();render()})}else render();
