import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signInAnonymously,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,initializeFirestore,persistentLocalCache,persistentMultipleTabManager,collection,doc,getDoc,getDocs,onSnapshot,addDoc,updateDoc,deleteDoc,setDoc,writeBatch,increment,query,where,orderBy,limit} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {initializeAppCheck,ReCaptchaV3Provider} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import {firebaseConfig as FC,restaurante as R,recaptchaSiteKey as RK} from "./firebase-config.js";
 
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cop=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
const hm=t=>new Date(t).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
const fdt=t=>new Date(t).toLocaleString('es-CO',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),3200)};
const ST=['Recibido','Preparando','Listo','Entregado'];
const ROL={admin:'Administrador',caja:'Caja',cocina:'Cocina',bodega:'Bodega'};
const TABS=[['pedidos','Pedidos',['admin','caja','cocina']],['productos','Productos',['admin']],['inventario','Inventario',['admin','bodega']],['reportes','Reportes',['admin','caja']],['usuarios','Usuarios',['admin']],['auditoria','Auditoría',['admin']],['respaldo','Respaldo y contingencia',['admin']]];
let D={products:[],ing:[]},P=[],V=[],L=[],U=[],mine=null,knownP=null,uMine=()=>{},rol='',staff=false,verMenu=false,tab='pedidos',editing=null,ready=false,msg='',pend=false,unsub=[];
let C={cart:{},mode:'recoger',name:'',phone:'',addr:'',notes:'',ok:false};
const can=(...r)=>r.includes(rol);
const myTabs=()=>TABS.filter(t=>t[2].includes(rol));
const ingOf=i=>D.ing.find(x=>x.id===i);
const calc=(p,m)=>!(p.r&&p.r.length)||p.r.every(r=>m[r.i]&&m[r.i].s>=r.q);
const portions=p=>p.r&&p.r.length?Math.min(...p.r.map(r=>{const g=ingOf(r.i);return g?Math.floor(g.s/r.q):0})):Infinity;
const mapOf=l=>Object.fromEntries(l.map(g=>[g.id,g]));
const fee0=()=>R.domicilio??4000;
const normPhone=v=>{let d=String(v).replace(/\D/g,'');if(d.length===12&&d.startsWith('57'))d=d.slice(2);return /^3\d{9}$/.test(d)?d:''};
const sub=o=>o.items.reduce((a,i)=>a+i.q*i.p,0);
const curP=o=>o.items.reduce((a,i)=>{const p=D.products.find(x=>x.id===i.id);return a+(p?p.p:i.p)*i.q},0)+(o.fee||0);
const bdg=()=>{const n=P.filter(o=>o.st<3).length;return n?' ('+n+')':''};
 
$('#brand').textContent=R.nombre;$('#city').textContent=R.ciudad;document.title=R.nombre+' · Menú';
const configured=FC.apiKey&&!String(FC.apiKey).startsWith('PEGA');
let db,auth;
if(configured){
  const app=initializeApp(FC);
  if(RK&&!String(RK).startsWith('PEGA'))initializeAppCheck(app,{provider:new ReCaptchaV3Provider(RK),isTokenAutoRefreshEnabled:true});
  try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch(e){db=getFirestore(app)}
  auth=getAuth(app);
}
const log=(accion,detalle='')=>{if(!staff||!auth.currentUser)return;addDoc(collection(db,'auditoria'),{t:Date.now(),uid:auth.currentUser.uid,email:auth.currentUser.email,rol,accion,detalle:String(detalle).slice(0,300)}).catch(()=>{})};
const run=async f=>{try{await f()}catch(e){toast('No se pudo completar: '+(e.code||e.message))}};
 
/* ---------- Vista pública: menú, carrito y seguimiento ---------- */
function menuHTML(){
  if(!configured)return'<p class="note">Falta configurar Firebase en js/firebase-config.js.</p>';
  if(msg)return`<p class="note">${esc(msg)}</p>`;
  if(!ready)return'<p class="note">Cargando menú…</p>';
  const list=D.products.filter(p=>p.on),cats=[...new Set(list.map(p=>p.c||'Otros'))];
  return trackHTML()+(cats.map(c=>`<section><h2 class="cat">${esc(c)}</h2><div class="grid">${list.filter(p=>(p.c||'Otros')===c).map(p=>{const out=p.disponible===false;
    return`<article class="card ${out?'out':''}"><h3>${esc(p.n)}</h3>${p.d?`<p class="note">${esc(p.d)}</p>`:''}<div class="row"><span class="price">${cop(p.p)}</span><span>${out?'<span class="tag bad">Agotado</span>':`<button class="btn sm" data-a="add" data-id="${p.id}">Agregar</button>`}</span></div></article>`}).join('')}</div></section>`).join('')||'<p class="note">Aún no hay productos en el menú.</p>');
}
const cItems=()=>Object.entries(C.cart).filter(([,q])=>q>0).map(([id,q])=>({p:D.products.find(x=>x.id===id),q})).filter(x=>x.p);
const cSub=()=>cItems().reduce((a,x)=>a+x.p.p*x.q,0);
const active=()=>mine&&!mine.gone&&mine.st<3;
function barHTML(){const n=cItems().reduce((a,x)=>a+x.q,0);return n?`<button class="btn" data-a="openCart">Ver pedido · ${n} · ${cop(cSub())}</button>`:''}
function cartHTML(){
  const it=cItems(),fee=C.mode==='domicilio'&&it.length?fee0():0;
  return`<form id="cf"><h2>Tu pedido</h2>${it.map(x=>`<div class="line"><span>${esc(x.p.n)}<br><small class="note">${cop(x.p.p)}</small></span><span><button type="button" class="btn ghost sm" data-a="rem" data-id="${x.p.id}" aria-label="Quitar uno">−</button> ${x.q} <button type="button" class="btn ghost sm" data-a="add" data-id="${x.p.id}" aria-label="Agregar uno">+</button></span></div>`).join('')||'<p class="note">Aún no has agregado productos.</p>'}
  <div class="seg" role="group" aria-label="Modalidad">${[['mesa','En mesa'],['recoger','Recoger'],['domicilio','Domicilio']].map(([k,l])=>`<button type="button" aria-pressed="${C.mode===k}" data-a="mode" data-id="${k}">${l}</button>`).join('')}</div>
  <label>Nombre<input data-f="name" required maxlength="80" value="${esc(C.name)}" autocomplete="name"></label>
  <label>Celular<input data-f="phone" required pattern="[0-9 +]{10,16}" placeholder="3001234567" inputmode="tel" value="${esc(C.phone)}" autocomplete="tel"></label>
  ${C.mode==='domicilio'?`<label>Dirección de entrega<input data-f="addr" required maxlength="200" value="${esc(C.addr)}" autocomplete="street-address"></label>`:''}
  <label>Notas (opcional)<input data-f="notes" maxlength="300" value="${esc(C.notes)}"></label>
  <div class="line"><span>Subtotal</span><span>${cop(cSub())}</span></div><div class="line"><span>Domicilio</span><span>${cop(fee)}</span></div><div class="line"><b>Total</b><b>${cop(cSub()+fee)}</b></div>
  <label style="color:var(--ink)"><input type="checkbox" data-f="ok" required ${C.ok?'checked':''}>Autorizo el tratamiento de mis datos solo para procesar este pedido (Ley 1581 de 2012).</label>
  <div class="actions"><button type="button" class="btn ghost" data-a="closeCart">Seguir viendo el menú</button><button class="btn" ${it.length&&!active()?'':'disabled'}>Enviar pedido</button></div></form>`;
}
async function sendOrder(){
  const all=cItems(),it=all.filter(x=>x.p.on&&x.p.disponible!==false);
  if(!all.length)return;
  if(it.length!==all.length)return toast('Algún producto ya no está disponible. Revisa tu pedido.');
  const ph=normPhone(C.phone);if(!ph)return toast('Escribe un celular colombiano válido (10 dígitos, empieza por 3).');
  if(!auth.currentUser)return toast('Sin conexión con el servicio. Recarga la página.');
  if(active())return toast('Ya tienes un pedido en curso.');
  const fee=C.mode==='domicilio'?fee0():0;
  const o={code:Math.random().toString(36).slice(2,6).toUpperCase(),name:C.name.trim(),phone:ph,addr:C.mode==='domicilio'?C.addr.trim():'',mode:C.mode,notes:C.notes.trim(),items:it.map(x=>({id:x.p.id,n:x.p.n,p:x.p.p,q:x.q})),fee,total:cSub()+fee,st:0,t:Date.now()};
  await setDoc(doc(db,'pedidos',auth.currentUser.uid),o);
  C.cart={};C.ok=false;$('#cart').close();toast('Pedido '+o.code+' enviado.');render();
}
function watchMine(id){uMine();uMine=onSnapshot(doc(db,'pedidos',id),s=>{mine=s.exists()?s.data():(mine&&!mine.gone?{gone:true}:mine);render()},()=>{})}
function trackHTML(){
  if(!mine)return'';
  if(mine.gone)return'<div class="card" style="margin-bottom:14px"><h3>Tu pedido fue anulado</h3><p class="note">Si tienes dudas, comunícate con el restaurante.</p><button class="btn ghost sm" data-a="closeTrack">Cerrar</button></div>';
  return`<div class="card" style="margin-bottom:14px"><h3>Tu pedido ${esc(mine.code)}</h3><div class="steps">${ST.map((s,i)=>`<i class="${i<=mine.st?'on':''}"></i>`).join('')}</div><b>${ST[mine.st]}</b><span class="note"> · ${mine.st===3?'¡Buen provecho!':mine.mode==='domicilio'?'va en camino cuando esté listo':mine.mode==='recoger'?'te avisamos aquí cuando esté listo':'te lo llevamos a la mesa'}</span><div class="note">${mine.items.map(i=>i.q+'× '+esc(i.n)).join(', ')} · ${cop(mine.total)}</div>${mine.st===3?'<button class="btn ghost sm" data-a="closeTrack" style="margin-top:8px">Cerrar</button>':''}</div>`;
}
 
/* ---------- Panel del personal (por rol) ---------- */
function boardHTML(){
  const caja=can('admin','caja'),cook=can('admin','caja','cocina');
  const col=s=>P.filter(o=>o.st===s&&(s<3||(o.td||o.t)>Date.now()-108e5)).sort((a,b)=>a.t-b.t);
  const tk=o=>`<div class="tk"><b>${esc(o.code)} · ${esc(o.mode)}${o.manual?' · manual':''}</b><small>${esc(o.name)} · ${hm(o.t)}${o.phone?` · <a href="tel:${esc(o.phone)}">Llamar</a> · <a href="https://wa.me/57${esc(o.phone)}" target="_blank" rel="noopener">WhatsApp</a>`:''}${o.addr?'<br>'+esc(o.addr):''}${o.notes?'<br>Nota: '+esc(o.notes):''}</small>${o.items.map(i=>`<div>${i.q}× ${esc(i.n)}</div>`).join('')}<div class="line"><span class="note">${cop(curP(o))}</span><span>${o.st===0&&caja?`<button class="btn ghost sm" data-a="void" data-id="${o.id}">Anular</button> ${o.phone?`<button class="btn ghost sm" data-a="block" data-id="${o.id}">Bloquear</button> `:''}`:''}${(o.st===0&&caja)||(o.st===1&&cook)||(o.st===2&&caja)?`<button class="btn sm" data-a="adv" data-id="${o.id}">${['Confirmar','Marcar listo','Entregar'][o.st]}</button>`:''}</span></div></div>`;
  return`<div class="top2"><p class="note" style="max-width:60ch">Los pedidos llegan en vivo. Caja confirma (descuenta inventario) y entrega; cocina marca listo. El total usa los precios actuales del menú.</p>${caja?'<button class="btn sm" data-a="openMan">Pedido manual</button>':''}</div><div class="board">${ST.map((s,i)=>`<div><h3>${s} (${col(i).length})</h3>${col(i).map(tk).join('')||'<p class="note">Sin pedidos.</p>'}</div>`).join('')}</div>`;
}
const ingOpts=sel=>D.ing.map(g=>`<option value="${g.id}" ${g.id===sel?'selected':''}>${esc(g.n)} (${esc(g.u)})</option>`).join('');
const rrow=(r={})=>`<div class="rrow"><label>Ingrediente<select name="ri">${ingOpts(r.i)}</select></label><label>Cantidad por porción<input name="rq" type="number" min="0" step="any" value="${r.q||''}"></label><button type="button" class="btn ghost sm" data-a="rowdel">Quitar</button></div>`;
function prodHTML(){
  const e=D.products.find(p=>p.id===editing)||{r:[],on:true};
  const empty=!D.products.length&&!D.ing.length?'<p class="note">Aún no hay datos. <button class="btn ghost sm" data-a="seed">Cargar menú e inventario de ejemplo</button></p>':'';
  const rows=D.products.map(p=>{const m=portions(p);return`<tr><td>${esc(p.n)}<br><span class="note">${esc(p.c||'Otros')} · ${cop(p.p)}</span></td><td>${!p.on?'<span class="tag bad">Oculto</span>':m===Infinity?'<span class="tag">Sin receta</span>':m<=0?'<span class="tag bad">Agotado</span>':'<span class="tag">'+m+' porciones</span>'}</td><td><button class="btn ghost sm" data-a="edit" data-id="${p.id}">Editar</button> <button class="btn ghost sm" data-a="del" data-id="${p.id}">Eliminar</button></td></tr>`}).join('');
  return`${empty}<div class="cols"><form id="pf"><h3>${editing?'Editar producto':'Agregar producto'}</h3>
  <label>Nombre<input name="n" required value="${esc(e.n)}"></label><label>Categoría<input name="c" list="cats" placeholder="Ej. Bowls, Bebidas" value="${esc(e.c)}"></label><datalist id="cats">${[...new Set(D.products.map(p=>p.c))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
  <label>Precio (COP)<input name="p" type="number" min="0" step="500" required value="${e.p??''}"></label><label>Descripción (opcional)<input name="d" value="${esc(e.d)}"></label>
  <label><input type="checkbox" name="on" ${e.on?'checked':''}>Mostrar en el menú</label>
  <h3 style="margin-top:14px">Receta (parametrizada)</h3><p class="note">Al confirmar un pedido se descuentan estos ingredientes. Si falta alguno, el producto se marca como agotado.</p>
  <div id="rows">${(e.r||[]).map(rrow).join('')}</div>
  ${D.ing.length?'<button type="button" class="btn ghost sm" data-a="rowadd" style="margin-top:8px">Agregar ingrediente</button>':'<p class="note">Primero crea ingredientes en Inventario.</p>'}
  <div class="actions">${editing?'<button type="button" class="btn ghost" data-a="cancel">Cancelar</button>':''}<button class="btn">${editing?'Guardar cambios':'Agregar producto'}</button></div></form>
  <div class="wrap"><table><tr><th>Producto</th><th>Estado</th><th></th></tr>${rows||'<tr><td colspan="3" class="note">Sin productos.</td></tr>'}</table></div></div>`;
}
function invHTML(){
  const rows=D.ing.map(g=>`<tr><td>${esc(g.n)}</td><td>${Math.round(g.s*100)/100} ${esc(g.u)} ${g.s<=g.m?'<span class="tag bad">Reponer</span>':''}</td><td>${g.m} ${esc(g.u)}</td><td><div class="mv"><input type="number" min="0" step="any" aria-label="Cantidad de ${esc(g.n)}" data-q="${g.id}"><button class="btn ghost sm" data-a="in" data-id="${g.id}">Entrada</button><button class="btn ghost sm" data-a="out" data-id="${g.id}">Merma</button><button class="btn ghost sm" data-a="adj" data-id="${g.id}" title="Fija la existencia al valor contado">Conteo</button>${can('admin')?`<button class="btn ghost sm" data-a="delIng" data-id="${g.id}">Borrar</button>`:''}</div></td></tr>`).join('');
  return`<div class="cols"><form id="if"><h3>Agregar ingrediente</h3><label>Nombre<input name="n" required></label>
  <label>Unidad<select name="u">${['g','kg','ml','l','und'].map(u=>`<option>${u}</option>`).join('')}</select></label>
  <label>Existencia inicial<input name="s" type="number" min="0" step="any" required value="0"></label><label>Mínimo antes de reponer<input name="m" type="number" min="0" step="any" required value="0"></label>
  <div class="actions"><button class="btn">Agregar ingrediente</button></div></form>
  <div><p class="note">Entrada: compra. Merma: desperdicio (pide motivo). Conteo: fija la existencia al valor físico contado (pide motivo). Todo queda en la auditoría.</p><div class="wrap"><table><tr><th>Ingrediente</th><th>Existencia</th><th>Mínimo</th><th>Movimiento</th></tr>${rows||'<tr><td colspan="4" class="note">Sin ingredientes.</td></tr>'}</table></div></div></div>`;
}
function repHTML(){
  const d=V,tot=d.reduce((a,o)=>a+o.total,0),canal={},prod={},dia={};
  d.forEach(o=>{canal[o.mode]=(canal[o.mode]||0)+o.total;const k=new Date(o.t).toDateString();dia[k]=dia[k]||{t:o.t,v:0};dia[k].v+=o.total;o.items.forEach(i=>prod[i.n]=(prod[i.n]||0)+i.q)});
  const conf=d.filter(o=>o.tc).map(o=>(o.tc-o.t)/6e4).sort((a,b)=>a-b),med=conf.length?conf[Math.floor(conf.length/2)]:0;
  const days=Object.values(dia).sort((a,b)=>a.t-b.t).slice(-10),avg=Object.keys(dia).length?tot/Object.keys(dia).length:0;
  const bars=(arr,f)=>{const mx=Math.max(1,...arr.map(a=>a[1]));return arr.map(([l,v])=>`<div class="bar"><span>${esc(l)}</span><i style="width:${Math.max(2,v/mx*55)}%"></i><span style="color:var(--ink)">${f(v)}</span></div>`).join('')||'<p class="note">Aún no hay ventas.</p>'};
  const top=Object.entries(prod).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,q])=>[n.slice(0,14),q]);
  const csv='data:text/csv;charset=utf-8,'+encodeURIComponent('pedido,canal,fecha,total\n'+d.map(o=>`${o.code},${o.mode},${new Date(o.t).toISOString()},${o.total}`).join('\n'));
  return`<p class="note">Calculados con los pedidos entregados (últimas 500 ventas).</p><div class="kpis"><div class="card kpi"><b>${cop(tot)}</b><span>Ventas registradas</span></div><div class="card kpi"><b>${d.length}</b><span>Pedidos entregados</span></div><div class="card kpi"><b>${cop(d.length?tot/d.length:0)}</b><span>Ticket promedio</span></div><div class="card kpi"><b>${med.toFixed(1)} min</b><span>Mediana de confirmación (meta ≤ 3)</span></div></div>
  <div class="grid"><div class="card"><h3>Ventas por día</h3>${bars(days.map(x=>[new Date(x.t).toLocaleDateString('es-CO',{weekday:'short',day:'numeric'}),x.v]),cop)}<p class="note">Promedio diario ${cop(avg)}. Equilibrio simplificado del proyecto: ${cop(42857000/26)} por día.</p></div><div class="card"><h3>Pedidos por canal</h3>${bars(Object.entries(canal),cop)}</div><div class="card"><h3>Platos más pedidos</h3>${bars(top,v=>v+' und')}</div></div>
  <p style="margin-top:14px"><a class="btn ghost" href="${csv}" download="ventas.csv" style="text-decoration:none;display:inline-block">Exportar ventas (CSV)</a></p>`;
}
function usrHTML(){
  return`<div class="cols"><form id="uf"><h3>Registrar usuario</h3><p class="note">Primero crea su cuenta en Firebase > Authentication (correo y contraseña) y luego regístrala aquí con su rol.</p>
  <label>Correo<input name="e" type="email" required></label><label>Nombre<input name="n" required></label>
  <label>Rol<select name="r">${Object.entries(ROL).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label><div class="actions"><button class="btn">Guardar usuario</button></div></form>
  <div class="wrap"><table><tr><th>Usuario</th><th>Rol</th><th></th></tr>${U.map(u=>`<tr><td>${esc(u.nombre||'')}<br><span class="note">${esc(u.email)}</span></td><td>${ROL[u.rol]||esc(u.rol)}</td><td><button class="btn ghost sm" data-a="delUser" data-id="${esc(u.id)}">Quitar</button></td></tr>`).join('')||'<tr><td colspan="3" class="note">Sin usuarios registrados. El correo del dueño (en firestore.rules) siempre es administrador.</td></tr>'}</table></div></div>`;
}
const audHTML=()=>`<p class="note">Registro de cambios (últimos 100). No se puede editar ni borrar desde la aplicación.</p><div class="wrap"><table><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr>${L.map(a=>`<tr><td>${fdt(a.t)}</td><td>${esc(a.email)}<br><span class="note">${ROL[a.rol]||''}</span></td><td>${esc(a.accion)}</td><td>${esc(a.detalle)}</td></tr>`).join('')||'<tr><td colspan="4" class="note">Sin registros.</td></tr>'}</table></div>`;
const bkpHTML=()=>`<div class="grid"><div class="card"><h3>Respaldo</h3><p class="note">Descarga una copia de productos, ingredientes, ventas, pedidos y usuarios. Guárdala fuera del equipo (nube, memoria USB). Se recomienda hacerlo al cierre de cada día o semana.</p><div class="actions"><button class="btn" data-a="export">Descargar respaldo (JSON)</button></div></div>
<div class="card"><h3>Restaurar</h3><p class="note">Carga un respaldo para recuperar menú, inventario, ventas y usuarios. Sobrescribe los registros con el mismo identificador.</p><div class="actions"><button class="btn ghost" data-a="import">Restaurar desde archivo</button></div><input type="file" id="file" accept=".json,application/json" hidden></div>
<div class="card"><h3>Contingencia sin internet</h3><p class="note">Si la conexión falla, la aplicación sigue mostrando lo ya cargado y guarda los cambios en este equipo para enviarlos al volver el internet. Si el equipo tampoco funciona, usa el formato manual en papel y luego registra esos pedidos con «Pedido manual».</p><div class="actions"><a class="btn ghost" href="contingencia.html" target="_blank" rel="noopener" style="text-decoration:none">Abrir formato manual (imprimir)</a></div></div></div>`;
function adminHTML(){
  const tabs=myTabs();if(!tabs.some(t=>t[0]===tab))tab=tabs[0][0];
  const body={pedidos:boardHTML,productos:prodHTML,inventario:invHTML,reportes:repHTML,usuarios:usrHTML,auditoria:audHTML,respaldo:bkpHTML}[tab]();
  return`<section class="panel"><div class="top2"><h2>Panel del restaurante</h2><span class="note">${esc(auth.currentUser.email)} · ${ROL[rol]}</span></div><div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${tab===k}" data-a="tab" data-id="${k}">${l}${k==='pedidos'?bdg():''}</button>`).join('')}</div>${body}</section>`;
}
function render(){
  const a=document.activeElement;
  if(a&&/INPUT|SELECT/.test(a.tagName)&&$('#admin').contains(a)){pend=true;return}
  pend=false;
  $('#net').textContent=navigator.onLine?'':'Sin conexión: los cambios se guardan en este equipo y se enviarán al reconectar.';
  $('#acc').innerHTML=!configured?'':staff?`<button class="btn ghost sm" data-a="vista">${verMenu?'Volver al panel':'Ver menú público'}</button> <button class="btn ghost sm" data-a="logout">Cerrar sesión</button>`:'<button class="btn ghost sm" data-a="openLogin">Acceso restaurante</button>';
  const panel=staff&&!verMenu;
  $('#admin').innerHTML=panel?adminHTML():'';$('#menu').innerHTML=panel?'':menuHTML();$('#bar').innerHTML=panel?'':barHTML();
}
document.addEventListener('focusout',()=>{if(pend)setTimeout(render,50)});
addEventListener('online',render);addEventListener('offline',render);
 
/* ---------- Datos en vivo ---------- */
function listen(){
  unsub.forEach(f=>f());unsub=[];ready=false;msg='';knownP=null;
  const on=(q,f,onErr)=>unsub.push(onSnapshot(q,f,onErr||(()=>{})));
  const sortP=l=>l.sort((a,b)=>(a.c||'').localeCompare(b.c||'')||a.n.localeCompare(b.n));
  on(staff?collection(db,'productos'):query(collection(db,'productos'),where('on','==',true)),s=>{D.products=sortP(s.docs.map(d=>({id:d.id,...d.data()})));ready=true;render()},e=>{msg='No se pudo cargar el menú ('+e.code+'). Revisa las reglas de Firestore y el acceso anónimo.';render()});
  if(!staff)return;
  on(collection(db,'ingredientes'),s=>{D.ing=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.n.localeCompare(b.n));render()});
  if(can('admin','caja','cocina'))on(query(collection(db,'pedidos'),orderBy('t','desc'),limit(200)),s=>{
    P=s.docs.map(d=>({...d.data(),id:d.id}));
    if(knownP&&P.some(o=>o.st===0&&!knownP.has(o.id+o.t)))toast('Nuevo pedido recibido');
    knownP=new Set(P.map(o=>o.id+o.t));render()});
  if(can('admin','caja'))on(query(collection(db,'ventas'),orderBy('t','desc'),limit(500)),s=>{V=s.docs.map(d=>d.data());render()});
  if(can('admin')){
    on(query(collection(db,'auditoria'),orderBy('t','desc'),limit(100)),s=>{L=s.docs.map(d=>d.data());render()});
    on(collection(db,'usuarios'),s=>{U=s.docs.map(d=>({id:d.id,...d.data()}));render()});
  }
}
async function syncAvail(list){
  const m=mapOf(list),b=writeBatch(db);let n=0;
  D.products.forEach(p=>{const v=calc(p,m);if(p.disponible!==v){b.update(doc(db,'productos',p.id),{disponible:v});n++}});
  if(n)await b.commit();
}
async function advance(o){
  if(o.st===0){
    const need={};o.items.forEach(i=>{const p=D.products.find(x=>x.id===i.id);(p?.r||[]).forEach(r=>need[r.i]=(need[r.i]||0)+r.q*i.q)});
    const miss=Object.keys(need).filter(k=>!ingOf(k)||ingOf(k).s<need[k]);
    if(miss.length)return toast('Falta '+miss.map(k=>ingOf(k)?.n||k).join(', ')+'. Registra una compra o anula el pedido.');
    const b=writeBatch(db);Object.entries(need).forEach(([k,q])=>b.update(doc(db,'ingredientes',k),{s:increment(-q)}));
    b.update(doc(db,'pedidos',o.id),{st:1,tc:Date.now()});await b.commit();log('Pedido confirmado',o.code);
    return syncAvail(D.ing.map(x=>need[x.id]?{...x,s:x.s-need[x.id]}:x));
  }
  if(o.st===2){const td=Date.now(),b=writeBatch(db);
    b.update(doc(db,'pedidos',o.id),{st:3,td});
    b.set(doc(db,'ventas',o.code+'-'+o.t.toString(36)),{code:o.code,mode:o.mode,manual:!!o.manual,items:o.items.map(i=>({n:i.n,q:i.q,p:(D.products.find(x=>x.id===i.id)||i).p})),fee:o.fee||0,total:curP(o),t:o.t,tc:o.tc||o.t,td});
    log('Pedido entregado',o.code);return b.commit()}
  log('Pedido listo',o.code);await updateDoc(doc(db,'pedidos',o.id),{st:o.st+1});
}
function manHTML(){
  return`<form id="mf"><h2>Pedido manual</h2><p class="note">Para pedidos por teléfono, WhatsApp o del formato en papel (contingencia).</p>
  <label>Nombre<input name="n" required maxlength="80"></label><label>Celular (opcional)<input name="ph" placeholder="3001234567"></label>
  <label>Modalidad<select name="m"><option value="mesa">En mesa</option><option value="recoger">Recoger</option><option value="domicilio">Domicilio</option></select></label>
  <label>Dirección (si es domicilio)<input name="a" maxlength="200"></label><label>Notas<input name="o" maxlength="300"></label>
  <h3 style="margin-top:12px">Productos</h3>${D.products.filter(p=>p.on).map(p=>`<div class="qg"><span>${esc(p.n)} <span class="note">${cop(p.p)}</span></span><input type="number" min="0" max="20" value="0" name="q_${p.id}" aria-label="Cantidad de ${esc(p.n)}"></div>`).join('')}
  <div class="actions"><button type="button" class="btn ghost" data-a="closeMan">Cancelar</button><button class="btn">Registrar pedido</button></div></form>`;
}
async function seed(){
  const I=[['arroz','Arroz','g',9000,2000],['pollo','Pollo','g',7000,1500],['res','Res','g',5000,1200],['bagre','Bagre','g',4000,1000],['queso','Queso costeño','g',3000,800],['platano','Plátano verde','und',40,12],['yuca','Yuca','g',6000,1500],['mango','Pulpa de mango','g',5000,1000],['limon','Limón','und',60,15]];
  const Pd=[['Bowl de pollo desmechado','Bowls',24000,{arroz:150,pollo:160,platano:.5}],['Bowl de res a la plancha','Bowls',27000,{arroz:150,res:170,platano:.5}],['Arroz con coco y bagre','Arroces',29000,{arroz:150,bagre:170}],['Arroz con coco y queso costeño','Arroces',22000,{arroz:150,queso:80}],['Pechuga a la parrilla','Proteínas',21000,{pollo:200}],['Yuca frita','Acompañamientos',8000,{yuca:200}],['Patacones con queso','Acompañamientos',9000,{platano:1,queso:40}],['Jugo de mango','Bebidas',6000,{mango:250}],['Limonada de coco','Bebidas',7000,{limon:3}]];
  const b=writeBatch(db);
  I.forEach(([k,n,u,s,m])=>b.set(doc(db,'ingredientes',k),{n,u,s,m}));
  Pd.forEach(([n,c,p,r],i)=>b.set(doc(db,'productos','p'+(i+1)),{n,c,p,d:'',on:true,disponible:true,r:Object.entries(r).map(([i,q])=>({i,q}))}));
  await b.commit();log('Datos de ejemplo','Menú e inventario');toast('Datos de ejemplo cargados.');
}
async function exportar(){
  const out={app:'sabor-digital',fecha:new Date().toISOString(),colecciones:{}};
  for(const c of ['productos','ingredientes','ventas','pedidos','usuarios']){const s=await getDocs(collection(db,c));out.colecciones[c]=s.docs.map(d=>({id:d.id,...d.data()}))}
  const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'}));l.download='respaldo-sabor-digital-'+new Date().toISOString().slice(0,10)+'.json';l.click();log('Respaldo descargado');
}
async function restaurar(file){
  const j=JSON.parse(await file.text());if(j.app!=='sabor-digital'||!j.colecciones)throw new Error('archivo no válido');
  if(!confirm('¿Restaurar este respaldo? Se sobrescriben los registros con el mismo identificador.'))return;
  const items=[];for(const c of ['productos','ingredientes','ventas','usuarios'])(j.colecciones[c]||[]).forEach(({id,...d})=>items.push([c,id,d]));
  for(let i=0;i<items.length;i+=400){const b=writeBatch(db);items.slice(i,i+400).forEach(([c,id,d])=>b.set(doc(db,c,id),d));await b.commit()}
  log('Respaldo restaurado',items.length+' registros');toast('Respaldo restaurado.');
}
 
/* ---------- Eventos ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a,id=b.dataset.id;
  const g=ingOf(id),p=D.products.find(x=>x.id===id),o=P.find(x=>x.id===id);
  if(a==='openLogin'){$('#loginErr').textContent='';$('#login').showModal();return}
  if(a==='closeLogin'){$('#login').close();return}
  if(a==='logout'){verMenu=false;return run(()=>signOut(auth))}
  if(a==='vista'){verMenu=!verMenu;render();return}
  if(a==='add'||a==='rem'||a==='mode'){
    if(a==='add')C.cart[id]=Math.min(20,(C.cart[id]||0)+1);else if(a==='rem')C.cart[id]=Math.max(0,(C.cart[id]||0)-1);else C.mode=id;
    render();if($('#cart').open)$('#cart').innerHTML=cartHTML();return}
  if(a==='openCart'){$('#cart').innerHTML=cartHTML();$('#cart').showModal();return}
  if(a==='closeCart'){$('#cart').close();return}
  if(a==='closeTrack'){mine=null;render();return}
  if(a==='openMan'){$('#man').innerHTML=manHTML();$('#man').showModal();return}
  if(a==='closeMan'){$('#man').close();return}
  if(a==='adv')return o&&run(()=>advance(o));
  if(a==='void')return o&&run(async()=>{await deleteDoc(doc(db,'pedidos',id));log('Pedido anulado',o.code);toast('Pedido anulado.')});
  if(a==='block')return o&&run(async()=>{if(!confirm('¿Bloquear el celular '+o.phone+' y anular este pedido?'))return;await setDoc(doc(db,'bloqueados',o.phone),{t:Date.now()});await deleteDoc(doc(db,'pedidos',id));log('Número bloqueado',o.phone);toast('Número bloqueado.')});
  if(a==='tab'){tab=id;editing=null}
  else if(a==='rowadd'){$('#rows').insertAdjacentHTML('beforeend',rrow());return}
  else if(a==='rowdel'){b.closest('.rrow').remove();return}
  else if(a==='edit'){editing=id;render();$('#pf').scrollIntoView({behavior:'smooth'});return}
  else if(a==='cancel')editing=null;
  else if(a==='del'){if(!confirm('¿Eliminar «'+p.n+'»?'))return;return run(async()=>{await deleteDoc(doc(db,'productos',id));log('Producto eliminado',p.n)})}
  else if(a==='in'||a==='out'||a==='adj')return run(async()=>{
    const q=parseFloat($(`[data-q="${id}"]`).value);if(isNaN(q)||q<0||(a!=='adj'&&q===0))return toast('Escribe una cantidad válida.');
    let why='';if(a!=='in'){why=(prompt(a==='out'?'Motivo de la merma:':'Motivo del ajuste por conteo físico:')||'').trim();if(!why)return toast('El motivo es obligatorio.')}
    const nv=a==='in'?g.s+q:a==='out'?Math.max(0,g.s-q):q;
    await updateDoc(doc(db,'ingredientes',id),{s:nv});log({in:'Entrada de inventario',out:'Merma',adj:'Ajuste por conteo'}[a],`${g.n}: ${g.s} → ${nv} ${g.u}${why?'. '+why:''}`);
    await syncAvail(D.ing.map(x=>x.id===id?{...x,s:nv}:x))});
  else if(a==='delIng'){if(!confirm('¿Borrar «'+g.n+'»? También se quitará de las recetas.'))return;
    return run(async()=>{const b=writeBatch(db);b.delete(doc(db,'ingredientes',id));
      D.products.filter(x=>(x.r||[]).some(r=>r.i===id)).forEach(x=>b.update(doc(db,'productos',x.id),{r:x.r.filter(r=>r.i!==id)}));await b.commit();log('Ingrediente borrado',g.n);
      D.products.forEach(x=>x.r=(x.r||[]).filter(r=>r.i!==id));await syncAvail(D.ing.filter(x=>x.id!==id))})}
  else if(a==='delUser'){if(!confirm('¿Quitar a '+id+'?'))return;return run(async()=>{await deleteDoc(doc(db,'usuarios',id));log('Usuario quitado',id)})}
  else if(a==='seed')return run(seed);
  else if(a==='export')return run(exportar);
  else if(a==='import'){$('#file').click();return}
  render();
});
document.addEventListener('submit',e=>{
  const f=e.target;e.preventDefault();const v=new FormData(f);
  if(f.id==='loginForm')signInWithEmailAndPassword(auth,v.get('u'),v.get('p')).then(()=>{$('#login').close();f.reset()}).catch(()=>{$('#loginErr').textContent='Correo o contraseña incorrectos.'});
  else if(f.id==='cf')run(sendOrder);
  else if(f.id==='pf')run(async()=>{
    const r=[...f.querySelectorAll('.rrow')].map(x=>({i:x.querySelector('[name=ri]').value,q:parseFloat(x.querySelector('[name=rq]').value)})).filter(x=>x.i&&x.q>0);
    const o={n:v.get('n').trim(),c:v.get('c').trim()||'Otros',p:+v.get('p'),d:v.get('d').trim(),on:!!v.get('on'),r};o.disponible=calc(o,mapOf(D.ing));
    if(editing)await updateDoc(doc(db,'productos',editing),o);else await addDoc(collection(db,'productos'),o);
    log(editing?'Producto editado':'Producto creado',o.n+' · '+cop(o.p));editing=null;toast('Producto guardado.');render()});
  else if(f.id==='if')run(async()=>{const o={n:v.get('n').trim(),u:v.get('u'),s:+v.get('s'),m:+v.get('m')};await addDoc(collection(db,'ingredientes'),o);log('Ingrediente creado',o.n);toast('Ingrediente agregado.')});
  else if(f.id==='uf')run(async()=>{const em=v.get('e').trim().toLowerCase();await setDoc(doc(db,'usuarios',em),{email:em,nombre:v.get('n').trim(),rol:v.get('r'),t:Date.now()});log('Usuario registrado',em+' · '+v.get('r'));f.reset();toast('Usuario guardado.')});
  else if(f.id==='mf')run(async()=>{
    const it=D.products.filter(p=>p.on).map(p=>({id:p.id,n:p.n,p:p.p,q:parseInt(v.get('q_'+p.id))||0})).filter(x=>x.q>0);
    if(!it.length)return toast('Agrega al menos un producto.');
    const ph=v.get('ph').trim()?normPhone(v.get('ph')):'';if(v.get('ph').trim()&&!ph)return toast('Celular no válido.');
    const m=v.get('m'),fee=m==='domicilio'?fee0():0,o={code:Math.random().toString(36).slice(2,6).toUpperCase(),name:v.get('n').trim(),phone:ph,addr:v.get('a').trim(),mode:m,notes:v.get('o').trim(),items:it,fee,total:it.reduce((a,x)=>a+x.p*x.q,0)+fee,st:0,t:Date.now(),manual:true};
    await addDoc(collection(db,'pedidos'),o);log('Pedido manual',o.code);$('#man').close();toast('Pedido manual '+o.code+' registrado.')});
});
document.addEventListener('input',e=>{const f=e.target.dataset.f;if(!f)return;if(f==='ok')C.ok=e.target.checked;else C[f]=e.target.value});
document.addEventListener('change',e=>{if(e.target.id==='file'&&e.target.files[0])run(()=>restaurar(e.target.files[0]))});
 
/* ---------- Sesión y roles ---------- */
async function resolveRol(u){
  const ref=doc(db,'usuarios',u.email.toLowerCase());
  try{const s=await getDoc(ref);if(s.exists())return s.data().rol;
    await setDoc(ref,{email:u.email.toLowerCase(),nombre:'Propietario',rol:'admin',t:Date.now()});return 'admin'}catch(e){return ''}
}
if(configured)onAuthStateChanged(auth,async u=>{
  if(!u){signInAnonymously(auth).catch(e=>{msg='No se pudo iniciar la sesión del visitante ('+e.code+'). Activa el acceso anónimo en Firebase Authentication.';render()});return}
  rol='';staff=false;
  if(!u.isAnonymous){
    rol=await resolveRol(u);staff=!!rol;
    if(!staff){toast('Tu cuenta no tiene un rol asignado. Pide al administrador que te registre en Usuarios.');await signOut(auth);return}
  }
  mine=null;listen();watchMine(u.uid);render();
});else render();
