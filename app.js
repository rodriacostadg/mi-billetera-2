const KEY='mi-billetera-2-v1';
const CLOUD_URL='https://mi-billetera-2-sync.rodriacostadg.workers.dev/state';
const GOOGLE_CLIENT_ID='264539287566-sm1gq6j2e09vjejogrrpjopdcrd7atem.apps.googleusercontent.com';
const USD_WALLETS=new Set(['ARQ','Dólares']);
const defaults={hide:false,wallets:[{id:1,name:'Efectivo',balance:0,icon:'$'},{id:2,name:'Mercado Pago',balance:0,icon:'MP'},{id:3,name:'Naranja X',balance:0,icon:'NX'},{id:4,name:'Cocos TNA',balance:0,icon:'CT'},{id:5,name:'Cocos Pesos Plus',balance:0,icon:'CP'},{id:6,name:'Personal Pay',balance:0,icon:'PP'},{id:7,name:'Banco de Corrientes',balance:0,icon:'BC'},{id:8,name:'ARQ',balance:0,icon:'AR'},{id:9,name:'Dólares',balance:0,icon:'US'}],movements:[],bills:[],cards:[]};
function cardDebt(card){return Array.isArray(card.charges)&&card.charges.length?card.charges.filter(c=>!c.cancelled).reduce((sum,c)=>sum+Number(c.currentAmount??c.amount??0),0):Number(card.debt)||0}
function normalizeState(value){const state=value&&typeof value==='object'?value:{};return {...defaults,...state,wallets:Array.isArray(state.wallets)?state.wallets:defaults.wallets,movements:Array.isArray(state.movements)?state.movements:[],bills:Array.isArray(state.bills)?state.bills:[],cards:Array.isArray(state.cards)?state.cards:[]}}
let data=normalizeState(JSON.parse(localStorage.getItem(KEY)||'null'));
let googleToken='';
let cloudActive=false;
let syncTimer;
let syncing=false;
let usdRate=Number(localStorage.getItem('mi-billetera-2-usd-rate'))||1540;
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(Math.abs(Number(n)||0));
const usdMoney=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Math.abs(Number(n)||0));
function save(){
  localStorage.setItem(KEY,JSON.stringify(data));
  if(cloudActive){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(uploadCloud,450);
  }
}
function setSyncStatus(text,state=''){
  const status=$('#syncStatus');
  if(status){status.textContent=text;status.dataset.state=state;}
}
async function cloudRequest(method,payload){
  const response=await fetch(CLOUD_URL,{method,headers:{'Content-Type':'application/json','Authorization':`Bearer ${googleToken}`},body:payload?JSON.stringify(payload):undefined});
  if(!response.ok)throw new Error('No se pudo conectar con la nube');
  return response.json();
}
async function uploadCloud(){
  if(!cloudActive||!googleToken||syncing)return;
  try{
    syncing=true;setSyncStatus('Guardando…','working');
    await cloudRequest('PUT',{payload:JSON.stringify(data)});
    setSyncStatus('Nube al día','ok');
  }catch(error){setSyncStatus('Sin conexión','error');}
  finally{syncing=false;}
}
async function handleGoogleCredential(response){
  googleToken=response.credential;
  try{
    syncing=true;setSyncStatus('Conectando…','working');
    const remote=await cloudRequest('GET');
    const shouldUpload=!remote.payload;
    if(remote.payload){
      data=JSON.parse(remote.payload);
      localStorage.setItem(KEY,JSON.stringify(data));
    }
    render();
    cloudActive=true;
    $('#googleSignIn').innerHTML='<span class="sync-live">☁ Nube</span>';
    if(shouldUpload){
      syncing=false;
      await uploadCloud();
      syncing=true;
    }
    setSyncStatus('Nube al día','ok');
  }catch(error){
    setSyncStatus('No se pudo sincronizar','error');
  }finally{syncing=false;}
}
function initGoogle(){
  if(!window.google?.accounts?.id){setTimeout(initGoogle,120);return;}
  window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:handleGoogleCredential,auto_select:false,cancel_on_tap_outside:true});
  window.google.accounts.id.renderButton($('#googleSignIn'),{theme:'outline',size:'medium',text:'signin_with',shape:'pill',width:160});
}
async function updateDollarRate(){
  try{
    const response=await fetch('https://dolarapi.com/v1/dolares/oficial',{cache:'no-store'});
    if(!response.ok)throw new Error('Cotización no disponible');
    const quote=await response.json();
    if(Number(quote.venta)>0){
      usdRate=Number(quote.venta);
      localStorage.setItem('mi-billetera-2-usd-rate',String(usdRate));
      render();
    }
  }catch(error){/* Se conserva la última cotización disponible. */}
}
const today=new Date(); $('#today').textContent=today.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
function display(n){return data.hide?'••••••':money(n)}
function walletIcon(name){
  const icons={
    'Efectivo':'<span class="wallet-emoji">💵</span>',
    'Mercado Pago':'<span class="brand-logo mp">🤝</span>',
    'Naranja X':'<span class="brand-logo nx">NX</span>',
    'Cocos TNA':'<span class="brand-logo cocos">↪</span>',
    'Cocos Pesos Plus':'<span class="brand-logo cocos">↪</span>',
    'Personal Pay':'<span class="brand-logo personal">✓</span>',
    'Banco de Corrientes':'<span class="brand-logo banco">♞</span>',
    'ARQ':'<span class="brand-logo arq">ARQ<small>USD</small></span>',
    'Dólares':'<span class="wallet-emoji">💸</span>'
  };
  return icons[name]||`<span class="brand-logo generic">${name.slice(0,2).toUpperCase()}</span>`;
}
function render(){const total=data.wallets.reduce((a,w)=>a+Number(w.balance)*(USD_WALLETS.has(w.name)?usdRate:1),0);$('#capitalTotal').textContent=display(total);$('#capitalHint').textContent=data.hide?'Capital oculto':`Incluye USD al oficial: ${money(usdRate)}`;$('#toggleCapital').textContent=data.hide?'◌':'◉';
$('#wallets').innerHTML=data.wallets.map(w=>`<article class="wallet"><b class="wallet-mark">${walletIcon(w.name)}</b><div class="wallet-info"><strong>${w.name}</strong><span>${USD_WALLETS.has(w.name)?`Dólar oficial: ${money(usdRate)}`:(w.name.includes('MP')?'Rendimiento diario disponible':'')}</span></div><strong>${data.hide?'••••••':(USD_WALLETS.has(w.name)?usdMoney(w.balance):money(w.balance))}</strong><button data-edit-wallet="${w.id}" aria-label="Editar saldo">✎</button></article>`).join('');
const search=$('#movementSearch')?.value?.toLowerCase()||''; const ms=data.movements.filter(m=>m.name.toLowerCase().includes(search)).sort((a,b)=>new Date(b.date)-new Date(a.date));$('#movements').innerHTML=ms.length?ms.map(m=>`<article class="movement ${m.type}"><b class="movement-icon">${m.type==='in'?'↙':'↗'}</b><div class="movement-info"><p>${m.name}</p><small>${new Date(m.date+'T12:00').toLocaleDateString('es-AR')} · ${m.wallet}</small></div><strong>${m.type==='in'?'+':'-'}${display(m.amount)}</strong></article>`).join(''):'<p class="eyebrow">Todavía no registraste movimientos.</p>';
const start=new Date();start.setHours(0,0,0,0);const week=new Date(start);week.setDate(week.getDate()-6);const spent=(from)=>data.movements.filter(m=>m.type==='out'&&new Date(m.date+'T12:00')>=from).reduce((a,m)=>a+Number(m.amount),0);$('#todaySpent').textContent=display(spent(start));$('#weekSpent').textContent=display(spent(week));
$('#bills').innerHTML=data.bills.length?data.bills.map(b=>`<article class="card-item"><div><section><h3>${b.name}</h3><span>Vence el ${b.day} de cada mes</span></section><strong class="${b.paid?'paid':'pending'}">${b.paid?'Pagado':display(b.amount)}</strong></div></article>`).join(''):'<p class="eyebrow">Sin pagos mensuales cargados.</p>';
$('#cards').innerHTML=data.cards.length?data.cards.map(c=>{const charges=Array.isArray(c.charges)?c.charges.filter(x=>!x.cancelled):[];const debt=cardDebt(c);const detail=charges.length?`${charges.length} cuota${charges.length===1?'':'s'} pendientes${c.dueDay?` · vence ${c.dueDay}`:''}`:(c.detail||'Sin cuotas cargadas');return `<article class="card-item"><div><section><h3>${c.name}</h3><span>${detail}</span></section><strong>${display(debt)}</strong></div>${charges.length?`<p class="card-note">${charges.slice(0,2).map(x=>`${x.name||'Compra'} · ${x.installment||'—'}`).join('<br>')}</p>`:''}</article>`}).join(''):'<p class="eyebrow">Sin tarjetas cargadas.</p>';
const monthStart=new Date(today.getFullYear(),today.getMonth(),1);$('#monthSpent').textContent=display(spent(monthStart));$('#pendingBills').textContent=display(data.bills.filter(b=>!b.paid).reduce((a,b)=>a+Number(b.amount),0));$('#cardDebt').textContent=display(data.cards.reduce((a,c)=>a+cardDebt(c),0));const cat={};data.movements.filter(m=>m.type==='out'&&new Date(m.date+'T12:00')>=week).forEach(m=>cat[m.category||'Otros']=(cat[m.category||'Otros']||0)+Number(m.amount));const top=Object.entries(cat).sort((a,b)=>b[1]-a[1])[0];$('#insightText').textContent=top?`Esta semana gastaste más en ${top[0]}: ${money(top[1])}.`:'Cuando registres movimientos, acá vas a ver en qué se fue tu plata.';save();}
function openModal(kind,item){let title='',body='';if(kind==='movement'){title='Nuevo movimiento';body=`<label>Compra o ingreso<input name="name" required placeholder="Ej. Supermercado"></label><label>Monto<input name="amount" type="number" inputmode="decimal" required></label><label>Medio de pago<select name="wallet">${data.wallets.map(w=>`<option>${w.name}</option>`).join('')}</select></label><label>Tipo<select name="type"><option value="out">Gasto</option><option value="in">Ingreso</option></select></label><label>Categoría<input name="category" placeholder="Ej. Comida"></label><label>Fecha<input name="date" type="date" value="${today.toISOString().slice(0,10)}"></label>`} if(kind==='wallet'){title=item?'Editar billetera':'Nueva billetera';const unit=USD_WALLETS.has(item?.name)?'Saldo (USD)':'Saldo';body=`<label>Nombre<input name="name" required value="${item?.name||''}"></label><label>${unit}<input name="balance" type="number" inputmode="decimal" required value="${item?.balance||0}"></label>`} if(kind==='transfer'){title='Transferir dinero';body=`<label>Desde<select name="from">${data.wallets.map(w=>`<option>${w.name}</option>`).join('')}</select></label><label>Hacia<select name="to">${data.wallets.map(w=>`<option>${w.name}</option>`).join('')}</select></label><label>Monto<input name="amount" type="number" required></label>`} if(kind==='bill'){title='Nuevo pago mensual';body=`<label>Servicio<input name="name" required></label><label>Monto<input name="amount" type="number" required></label><label>Día de vencimiento<input name="day" type="number" min="1" max="31" required></label>`} if(kind==='card'){title='Nueva tarjeta';body=`<label>Nombre<input name="name" required placeholder="Ej. Santander"></label><label>Deuda actual<input name="debt" type="number" required></label><label>Detalle<input name="detail" placeholder="Ej. 3 cuotas pendientes"></label>`};$('#modalContent').innerHTML=`<h3 class="modal-title">${title}</h3><div class="fields">${body}</div><div class="modal-actions"><button class="cancel" value="cancel">Cancelar</button><button class="primary" value="default">Guardar</button></div>`;const form=$('#modalForm');form.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(form));if(kind==='movement'){data.movements.push({...v,id:Date.now(),amount:+v.amount})}if(kind==='wallet'){if(item){Object.assign(item,{name:v.name,balance:+v.balance})}else data.wallets.push({id:Date.now(),name:v.name,balance:+v.balance,icon:v.name.slice(0,2).toUpperCase()})}if(kind==='transfer'){const a=data.wallets.find(w=>w.name===v.from),b=data.wallets.find(w=>w.name===v.to),n=+v.amount;if(a&&b&&a!==b&&n>0){a.balance-=n;b.balance+=n;data.movements.push({id:Date.now(),name:`Transferencia a ${b.name}`,amount:n,wallet:a.name,type:'out',category:'Transferencia',date:today.toISOString().slice(0,10)});data.movements.push({id:Date.now()+1,name:`Transferencia desde ${a.name}`,amount:n,wallet:b.name,type:'in',category:'Transferencia',date:today.toISOString().slice(0,10)})}}if(kind==='bill')data.bills.push({...v,id:Date.now(),amount:+v.amount,paid:false});if(kind==='card')data.cards.push({...v,id:Date.now(),debt:+v.debt});$('#modal').close();render()};$('#modal').showModal()}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===nav.dataset.nav));document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n===nav));$('#title').textContent=nav.dataset.nav==='home'?'Hola, Rodri':nav.dataset.nav[0].toUpperCase()+nav.dataset.nav.slice(1);window.scrollTo({top:0,behavior:'smooth'})}if(e.target.id==='toggleCapital'){data.hide=!data.hide;render()}if(e.target.id==='newMovement')openModal('movement');if(e.target.dataset.action==='new-wallet')openModal('wallet');if(e.target.dataset.action==='transfer')openModal('transfer');if(e.target.dataset.action==='new-bill')openModal('bill');if(e.target.dataset.action==='new-card')openModal('card');const id=e.target.dataset.editWallet;if(id)openModal('wallet',data.wallets.find(w=>w.id===+id))});$('#movementSearch').addEventListener('input',render);render();updateDollarRate();initGoogle();
