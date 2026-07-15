
  (()=>{
    "use strict";
    const API_URL=String((window.UTOPIA_CONFIG||{}).apiUrl||"").trim();
    const DEFAULT_RAFFLE="RIFA-UTOPIA-2026";
    const PAGE_SIZE=100;
    const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
    const state={token:localStorage.getItem("utopiaAdminToken")||"",user:null,raffles:[],raffleId:DEFAULT_RAFFLE,currentView:"dashboard",orders:[],participants:[],payments:[],board:[],filteredBoard:[],numberPage:0,selectedNumber:null,results:[],report:null,raffleData:null,liveRaffleId:DEFAULT_RAFFLE,liveSetup:null,liveSession:null,liveDigits:[],liveBurned:[],liveSpinTimer:null,liveMigrationReady:false};
    const views={dashboard:["Resumen","Panel general"],raffles:["Sorteos","Configuración del sorteo"],content:["Contenido público","Textos, reseñas e imágenes"],orders:["Pedidos","Solicitudes por orden de llegada"],participants:["Participantes","Base de datos"],payments:["Pagos","Revisión de comprobantes"],numbers:["Números","Control de números"],liveDraw:["Sorteos en vivo","Selección dinámica de ganadores"],winners:["Ganadores","Sorteo y publicación"],reports:["Reportes","Estadísticas y exportación"],users:["Usuarios","Usuarios y permisos"],settings:["Configuración","Seguridad y auditoría"]};
    const roleViews={ADMINISTRADOR:Object.keys(views),OPERADOR:["dashboard","orders","participants","payments","numbers","liveDraw","winners","settings"],FINANZAS:["dashboard","orders","payments","reports","settings"],COMUNICACION:["dashboard","content","liveDraw","winners","settings"],AUDITOR:["dashboard","orders","participants","payments","numbers","winners","reports","settings"]};
    const statusClass={DISPONIBLE:"available",RESERVADO:"reserved",EN_REVISION:"review",VENDIDO:"sold",BLOQUEADO:"blocked"};
    const BUILD_VERSION="12.0.0-20260715";
    console.info(`[Sorteos Utopía] admin.js ${BUILD_VERSION}`);

    function getElement(selector, required=true){
      const element=qs(selector);
      if(!element&&required){
        throw new Error(`La página administrativa y admin.js no corresponden a la misma versión. Falta el elemento ${selector}. Actualiza admin.html y admin.js juntos.`);
      }
      return element;
    }
    function setFieldValue(selector,value){
      const element=getElement(selector,false);
      if(!element){
        console.warn(`[Sorteos Utopía] Elemento opcional ausente: ${selector}`);
        return;
      }
      element.value=value??"";
    }

    const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

    const money=(v,c="Bs")=>`${new Intl.NumberFormat("es-BO",{maximumFractionDigits:2}).format(Number(v||0))} ${c}`;
    const driveFileId=value=>{const text=String(value||"");for(const re of [/\/d\/([a-zA-Z0-9_-]+)/,/[?&]id=([a-zA-Z0-9_-]+)/,/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/]){const m=text.match(re);if(m)return m[1]}return""};
    const safeImageUrl=(value,fallback="")=>{const text=String(value||"").trim();if(!text)return fallback;if(/^(assets\/|data:image\/|blob:)/i.test(text))return text;const id=driveFileId(text);return id?`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`:text};
    const prizeFallback=(p,index=0)=>({1:"assets/premio-televisor.jpg",2:"assets/premio-parlante.jpg",3:"assets/premio-cafetera.jpg"})[Number(p?.order||index+1)]||"assets/rifa-solidaria-2026.png";
    function installAdminImageFallback(root=document){root.querySelectorAll("img[data-fallback]").forEach(img=>{img.onerror=()=>{if(img.dataset.applied!=="1"){img.dataset.applied="1";img.src=img.dataset.fallback}else img.classList.add("image-error")}})}

    const toast=(message,type="success")=>{const t=qs("#toast");t.textContent=message;t.className=`toast ${type} show`;clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),3500)};
    const badge=status=>{const map={APROBADO:"green",VENDIDO:"green",DISPONIBLE:"green",EN_REVISION:"blue",COMPROBANTE_RECIBIDO:"blue",PENDIENTE:"yellow",RESERVADO:"yellow",RECHAZADO:"red",VENCIDO:"gray",BLOQUEADO:"gray"};return `<span class="badge ${map[status]||"gray"}">${esc(status)}</span>`};
    function download(filename,content,type="text/plain;charset=utf-8"){const blob=new Blob(["\ufeff"+content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
    async function api(action,payload={}){
      if(!API_URL)throw new Error("Falta configurar apiUrl en config.js.");
      const body=new URLSearchParams();body.set("action",action);body.set("clientVersion",BUILD_VERSION);
      if(state.token)body.set("token",state.token);
      Object.entries(payload).forEach(([k,v])=>body.set(k,typeof v==="object"?JSON.stringify(v):String(v??"")));
      let response;
      try{response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:body.toString(),redirect:"follow"})}
      catch{throw new Error("No fue posible conectar con Google Apps Script. Revisa la implementación y el acceso para cualquier persona.")}
      if(!response.ok)throw new Error(`Error ${response.status}`);
      let data;
      if(typeof response.json==="function"&&typeof response.text!=="function")data=await response.json();
      else{const text=await response.text();try{data=JSON.parse(text)}catch{throw new Error("La API no devolvió JSON. Publica Code.gs v12.0 como una implementación nueva.")}}
      if(data.authExpired){logout(false);throw new Error("La sesión venció. Ingresa nuevamente.")}
      return data;
    }
    async function uploadImage(file){if(!file)return"";if(file.size>8*1024*1024)throw new Error("La imagen supera 8 MB.");const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error("No se pudo leer la imagen."));r.onload=()=>resolve(String(r.result).split(",")[1]);r.readAsDataURL(file)});const data=await api("adminUploadImage",{fileName:file.name,fileMime:file.type,fileBase64:base64});if(!data.ok)throw new Error(data.error);return data.url}
    async function uploadMedia(file){if(!file)throw new Error("Selecciona una imagen o video.");if(file.size>40*1024*1024)throw new Error("El archivo supera 40 MB.");const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error("No se pudo leer el archivo."));r.onload=()=>resolve(String(r.result).split(",")[1]);r.readAsDataURL(file)});const data=await api("adminUploadMedia",{fileName:file.name,fileMime:file.type,fileBase64:base64});if(!data.ok)throw new Error(data.error);return data}

    function showLogin(message=""){qs("#loginScreen").hidden=false;qs("#adminShell").hidden=true;qs("#loginMessage").textContent=message}
    function showAdmin(){qs("#loginScreen").hidden=true;qs("#adminShell").hidden=false;qs("#sessionName").textContent=state.user.name;qs("#sessionRole").textContent=state.user.role;applyRoles()}
    function applyRoles(){
      const role=String(state.user?.role||"").trim().toUpperCase();
      state.user.role=role;
      const allowed=role==="ADMINISTRADOR"?Object.keys(views):(roleViews[role]||[]);
      qsa("#adminNav button").forEach(b=>b.hidden=!allowed.includes(b.dataset.view));
      if(!allowed.includes(state.currentView))state.currentView=allowed[0]||"dashboard";
      const passwordButton=qs("#changeOwnPassword");
      if(passwordButton)passwordButton.hidden=role!=="ADMINISTRADOR";
    }

    async function login(e){e.preventDefault();const btn=qs("#loginButton");btn.disabled=true;qs("#loginMessage").textContent="";try{const data=await api("adminLogin",{username:qs("#loginUser").value.trim(),password:qs("#loginPassword").value});if(!data.ok)throw new Error(data.error||"Usuario o contraseña incorrectos.");state.token=data.token;state.user=data.user;localStorage.setItem("utopiaAdminToken",state.token);showAdmin();await loadRaffles();switchView("dashboard")}catch(err){qs("#loginMessage").textContent=err.message}finally{btn.disabled=false}}
    async function restore(){if(!state.token)return showLogin();try{const data=await api("adminSession");if(!data.ok)throw new Error();state.user=data.user;showAdmin();await loadRaffles();switchView("dashboard")}catch(e){logout(false)}}
    async function logout(call=true){if(call&&state.token){try{await api("adminLogout")}catch{}}state.token="";state.user=null;localStorage.removeItem("utopiaAdminToken");showLogin()}
    async function loadRaffles(){
      const data=await api("adminRaffles");
      if(!data?.ok)throw new Error(data?.error||"No se pudieron cargar los sorteos.");
      state.raffles=data.raffles||data.sorteos||[];
      const activeId=data.activeRaffleId||data.raffleId||state.raffles.find(r=>r.status==="ACTIVO")?.id||"";
      if(!state.raffles.some(r=>r.id===state.raffleId))state.raffleId=state.raffles.some(r=>r.id===activeId)?activeId:(state.raffles[0]?.id||"");
      const selector=qs("#adminRaffleSelect");
      if(!state.raffles.length){selector.innerHTML='<option value="">Sin sorteos disponibles</option>';updatePublicPageLink();return;}
      selector.innerHTML=state.raffles.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.status)}</option>`).join("");
      selector.value=state.raffleId;updatePublicPageLink();
      const liveSelector=qs("#liveRaffleSelect");if(liveSelector)liveSelector.innerHTML=selector.innerHTML;
    }

    function updatePublicPageLink(){
      const link=qs("#publicPageLink");
      if(!link)return;
      link.href=`index.html?raffleId=${encodeURIComponent(state.raffleId||DEFAULT_RAFFLE)}`;
    }
    function switchView(view){
      state.currentView=view;
      qsa("#adminNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
      qsa(".admin-view").forEach(section=>section.classList.toggle("active",section.id===`view-${view}`));
      qs("#currentViewLabel").textContent=views[view][0];qs("#currentViewTitle").textContent=views[view][1];
      const headerActions=qs(".header-actions");if(headerActions)headerActions.hidden=["users","settings","liveDraw"].includes(view);
      refreshView(view);
    }
    async function refreshView(view){
      try{
        if(view==="dashboard")await loadDashboard();
        if(view==="raffles")await loadRaffle();
        if(view==="content")await loadContent();
        if(view==="orders")await loadOrders();
        if(view==="participants")await loadParticipants();
        if(view==="payments")await loadPayments();
        if(view==="numbers")await loadBoard();
        if(view==="liveDraw")await loadLiveDraw();
        if(view==="winners")await loadWinners();
        if(view==="reports")await loadReports();
        if(view==="users")await loadUsers();
        if(view==="settings"){await loadAudit();await loadTechnicalStatus()};
      }catch(e){
        if(view==="raffles"&&qs("#raffleMessage")){
          qs("#raffleMessage").textContent=e.message;
        }
        toast(e.message,"error");
      }
    }

    async function loadDashboard(){const d=await api("adminDashboard",{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);const s=d.stats||{},statuses=s.numberStatuses||{};qs("#dashRevenue").textContent=money(s.revenue,s.currency);qs("#dashSold").textContent=s.sold||0;qs("#dashAvailable").textContent=s.available||0;qs("#dashReserved").textContent=statuses.Reservado||0;qs("#dashReview").textContent=statuses["En revisión"]||0;qs("#dashPending").textContent=s.pendingPayments||0;qs("#dashApproved").textContent=s.approvedPayments||0;qs("#dashParticipants").textContent=s.participants||0;qs("#dashPercentMini").textContent=`${s.percent||0}% del total`;qs("#dashProgressText").textContent=`${s.percent||0}%`;qs("#dashProgressBar").style.width=`${s.percent||0}%`;qs("#dashStatusList").innerHTML=Object.entries(statuses).map(([k,v])=>`<div class="status-row"><span>${esc(k)}</span><strong>${v}</strong></div>`).join("")||'<div class="empty">Sin datos</div>';renderBars("#cityStats",d.cities||[]);renderBars("#paymentMethodStats",d.methods||[]);renderAudit("#auditPreview",d.audit||[])}
    function renderBars(sel,items){qs(sel).innerHTML=items.length?items.map(i=>`<div class="bar-row"><span>${esc(i.label)}</span><strong>${i.count}</strong></div>`).join(""):'<div class="empty">Sin datos todavía.</div>'}
    function renderAudit(sel,items){qs(sel).innerHTML=items.length?items.map(i=>`<article class="audit-item"><strong>${esc(i.action)}</strong>${esc(i.user)} · ${esc(i.date)}<br>${esc(i.detail)}</article>`).join(""):'<div class="empty">Sin movimientos.</div>'}
    async function loadRaffle(){
      if(!state.raffleId){newRaffle();return;}
      const d=await api("adminGetRaffle",{raffleId:state.raffleId});
      if(!d?.ok)throw new Error(d?.error||"No se pudo cargar el sorteo.");
      const r=d.raffle||d.sorteo;if(!r)throw new Error("La API no devolvió los datos del sorteo. Publica Code.gs v12.0.");
      state.raffleData={...d,raffle:r,prizes:d.prizes||r.prizes||[]};
      setFieldValue("#raffleId",r.id);setFieldValue("#raffleName",r.name);setFieldValue("#raffleDate",r.drawDateLocal||String(r.drawDate||"").slice(0,16));
      setFieldValue("#rafflePrice",r.ticketPrice);setFieldValue("#raffleCurrency",r.currency);setFieldValue("#raffleTotal",r.totalTickets);setFieldValue("#raffleReservationMinutes",r.reservationMinutes||15);
      setFieldValue("#raffleStatus",["ACTIVO","PAUSADO","FINALIZADO"].includes(r.status)?r.status:"PAUSADO");setFieldValue("#raffleDescription",r.description||"");
      setFieldValue("#raffleImageUrl",r.imageUrl||"");setFieldValue("#rafflePublished",String(r.published!==false));setFieldValue("#contactWhatsApp",r.contactWhatsApp||"");setFieldValue("#facebookUrl",r.facebookUrl||"");setFieldValue("#linkedinUrl",r.linkedinUrl||"");setFieldValue("#tiktokUrl",r.tiktokUrl||"");
      renderDigitPreview();renderPrizes(state.raffleData.prizes);qs("#raffleMessage").textContent="";
    }

    function renderDigitPreview(){const total=Math.max(1,Number(qs("#raffleTotal").value||1)),digits=String(total).length;qs("#digitPreview").innerHTML=Array.from({length:digits},()=>'<span>0</span>').join("")}
    function renderPrizes(prizes){
      qs("#adminPrizeList").innerHTML=prizes.length?prizes.map((p,index)=>{const fallback=prizeFallback(p,index),image=safeImageUrl(p.imageUrl,fallback);return `<article class="prize-card" data-prize="${esc(p.id)}"><header><div><small>Premio ${p.order}</small><h3>${esc(p.name)}</h3></div>${badge(p.status)}</header><img class="card-image" src="${esc(image)}" data-fallback="${esc(fallback)}" alt="${esc(p.name)}"><form class="inline-form prize-form"><input name="name" value="${esc(p.name)}" placeholder="Nombre"><textarea name="description" placeholder="Descripción">${esc(p.description||"")}</textarea><input name="imageUrl" value="${esc(p.imageUrl||"")}" placeholder="URL de imagen"><div class="image-upload"><input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"><button class="btn gray small" type="button" data-upload-prize>Subir imagen</button></div><div class="button-row"><button class="btn green small" type="submit">Guardar premio</button><button class="btn red small" type="button" data-delete-prize="${esc(p.id)}">Desactivar</button></div></form></article>`}).join(""):'<div class="empty">No existen premios.</div>';
      installAdminImageFallback(qs("#adminPrizeList"));
      qsa(".prize-form").forEach(f=>f.addEventListener("submit",savePrize));qsa("[data-upload-prize]").forEach(b=>b.addEventListener("click",uploadPrizeImage));qsa("[data-delete-prize]").forEach(b=>b.onclick=()=>deletePrize(b.dataset.deletePrize))
    }
    async function uploadPrizeImage(e){const card=e.target.closest(".prize-card"),file=card.querySelector('[name="imageFile"]').files[0];if(!file)return toast("Selecciona una imagen.","error");e.target.disabled=true;try{const url=await uploadImage(file);card.querySelector('[name="imageUrl"]').value=url;toast("Imagen subida. Guarda el premio.")}catch(err){toast(err.message,"error")}finally{e.target.disabled=false}}
    async function savePrize(e){e.preventDefault();const card=e.target.closest(".prize-card"),id=card.dataset.prize,p=state.raffleData.prizes.find(x=>x.id===id),form=e.target;const data=await api("adminSavePrize",{prize:{...p,name:form.name.value.trim(),description:form.description.value.trim(),imageUrl:form.imageUrl.value.trim()}});if(!data.ok)throw new Error(data.error);toast("Premio actualizado.");loadRaffle()}
    async function saveRaffle(e){
      e.preventDefault();
      let imageUrl=qs("#raffleImageUrl").value.trim();
      const file=qs("#raffleImageFile").files[0];
      if(file)imageUrl=await uploadImage(file);
      const payload={
        id:qs("#raffleId").value.trim(),
        name:qs("#raffleName").value.trim(),
        drawDate:qs("#raffleDate").value,
        ticketPrice:Number(qs("#rafflePrice").value),
        currency:qs("#raffleCurrency").value.trim(),
        totalTickets:Number(qs("#raffleTotal").value),
        reservationMinutes:Number(qs("#raffleReservationMinutes").value),
        status:qs("#raffleStatus").value,
        published:qs("#rafflePublished").value==="true",
        imageUrl,
        description:qs("#raffleDescription").value.trim(),
        contactWhatsApp:qs("#contactWhatsApp").value.trim(),
        facebookUrl:qs("#facebookUrl").value.trim(),
        linkedinUrl:qs("#linkedinUrl").value.trim(),
        tiktokUrl:qs("#tiktokUrl").value.trim()
      };
      const d=await api("adminSaveRaffle",{raffle:payload});
      qs("#raffleMessage").textContent=d.ok?"Configuración guardada.":d.error;
      if(!d.ok)throw new Error(d.error);
      state.raffleId=d.raffle.id;
      await loadRaffles();
      await loadRaffle();
      toast("Sorteo actualizado.");
    }
    function newRaffle(){qs("#raffleForm").reset();qs("#raffleId").value="";qs("#raffleCurrency").value="Bs";qs("#raffleStatus").value="ACTIVO";qs("#raffleTotal").value=1000;qs("#raffleReservationMinutes").value=15;qs("#rafflePublished").value="true";renderDigitPreview()}
    async function duplicateRaffle(){if(!confirm("¿Duplicar este sorteo?"))return;const d=await api("adminDuplicateRaffle",{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);state.raffleId=d.raffleId;await loadRaffles();await loadRaffle();toast("Sorteo duplicado.")}
    async function deleteRaffle(){if(!state.raffleId)return;if(!confirm("¿Eliminar definitivamente este sorteo y todos sus datos relacionados?"))return;const d=await api("adminDeleteRaffle",{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);state.raffleId=d.activeRaffleId||"";await loadRaffles();if(state.raffleId)await loadRaffle();else newRaffle();toast("Sorteo eliminado y página pública actualizada.")}


    async function setActiveRaffle(){if(!confirm('¿Marcar este como el sorteo principal?'))return;const d=await api('adminSetActiveRaffle',{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);await loadRaffles();toast('Sorteo activo actualizado.')}
    function openNewPrize(){qs('#newPrizeForm').reset();qs('#newPrizeOrder').value=(state.raffleData?.prizes||[]).length+1;qs('#prizeModal').showModal()}
    async function createPrize(e){e.preventDefault();let imageUrl=qs('#newPrizeImageUrl').value.trim();const file=qs('#newPrizeImageFile').files[0];if(file)imageUrl=await uploadImage(file);const prize={raffleId:state.raffleId,order:Number(qs('#newPrizeOrder').value||1),status:qs('#newPrizeStatus').value,name:qs('#newPrizeName').value.trim(),description:qs('#newPrizeDescription').value.trim(),imageUrl};const d=await api('adminSavePrize',{prize});if(!d.ok)throw new Error(d.error);qs('#prizeModal').close();toast('Premio creado.');loadRaffle()}
    async function deletePrize(id){if(!confirm('¿Desactivar este premio?'))return;const d=await api('adminDeletePrize',{prizeId:id});if(!d.ok)throw new Error(d.error);toast('Premio desactivado.');loadRaffle()}
    async function loadSystemConfig(){
      const d=await api('adminSystemConfig',{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);const c=d.config||{};
      qs('#cfgOrganization').value=c.organization||'';qs('#cfgRefresh').value=c.publicRefreshSeconds||15;qs('#cfgReservation').value=c.reservationMinutes||15;qs('#cfgAdminWhatsapp').value=c.adminWhatsApp||'';qs('#cfgWhatsapp').value=c.contactWhatsApp||'';qs('#cfgFacebook').value=c.facebookUrl||'';qs('#cfgLinkedin').value=c.linkedinUrl||'';qs('#cfgTiktok').value=c.tiktokUrl||'';qs('#cfgTerms').value=c.termsText||'';qs('#cfgRepeat').value='NO';qs('#cfgFullData').value=c.showFullData||'NO';qs('#cfgLiveBackgroundUrl').value=c.liveBackgroundUrl||'';if(qs('#cfgLiveBackgroundType'))qs('#cfgLiveBackgroundType').value=c.liveBackgroundType||'IMAGEN';
      const methods=Array.isArray(c.paymentMethods)?c.paymentMethods:[];
      const qr=methods.find(m=>m.type==='QR')||{};const bank=methods.find(m=>m.type==='TRANSFERENCIA_BANCARIA')||{};const cash=methods.find(m=>m.type==='EFECTIVO')||{};
      qs('#cfgQrEnabled').checked=Boolean(qr.id);qs('#cfgQrLabel').value=qr.label||'QR';qs('#cfgQrUrl').value=qr.qrUrl||c.qrPaymentUrl||'';qs('#cfgQrInstructions').value=qr.instructions||'';
      qs('#cfgBankEnabled').checked=Boolean(bank.id);qs('#cfgBankLabel').value=bank.label||'Transferencia bancaria';qs('#cfgBankName').value=bank.bankName||'';qs('#cfgBankHolder').value=bank.accountHolder||'';qs('#cfgBankAccount').value=bank.accountNumber||'';qs('#cfgBankAccountType').value=bank.accountType||'';qs('#cfgBankIdentity').value=bank.identityNumber||'';qs('#cfgBankCurrency').value=bank.currency||'Bs';qs('#cfgBankInstructions').value=bank.instructions||'';
      qs('#cfgCashEnabled').checked=Boolean(cash.id);qs('#cfgCashLabel').value=cash.label||'Efectivo';qs('#cfgCashInstructions').value=cash.instructions||'';
    }
    async function saveSystemConfig(e){
      e.preventDefault();let qrUrl=qs('#cfgQrUrl').value.trim();const qrFile=qs('#cfgQrFile').files[0];if(qrFile)qrUrl=await uploadImage(qrFile);
      const paymentMethods=[];
      if(qs('#cfgQrEnabled').checked)paymentMethods.push({id:'QR',type:'QR',label:qs('#cfgQrLabel').value.trim()||'QR',enabled:true,qrUrl,instructions:qs('#cfgQrInstructions').value.trim()});
      if(qs('#cfgBankEnabled').checked)paymentMethods.push({id:'TRANSFERENCIA_BANCARIA',type:'TRANSFERENCIA_BANCARIA',label:qs('#cfgBankLabel').value.trim()||'Transferencia bancaria',enabled:true,bankName:qs('#cfgBankName').value.trim(),accountHolder:qs('#cfgBankHolder').value.trim(),accountNumber:qs('#cfgBankAccount').value.trim(),accountType:qs('#cfgBankAccountType').value.trim(),identityNumber:qs('#cfgBankIdentity').value.trim(),currency:qs('#cfgBankCurrency').value.trim(),instructions:qs('#cfgBankInstructions').value.trim()});
      if(qs('#cfgCashEnabled').checked)paymentMethods.push({id:'EFECTIVO',type:'EFECTIVO',label:qs('#cfgCashLabel').value.trim()||'Efectivo',enabled:true,instructions:qs('#cfgCashInstructions').value.trim()});
      if(!paymentMethods.length)throw new Error('Habilita al menos un método de pago.');
      const config={organization:qs('#cfgOrganization').value.trim(),publicRefreshSeconds:Number(qs('#cfgRefresh').value||15),reservationMinutes:Number(qs('#cfgReservation').value||15),adminWhatsApp:qs('#cfgAdminWhatsapp').value.trim(),contactWhatsApp:qs('#cfgWhatsapp').value.trim(),facebookUrl:qs('#cfgFacebook').value.trim(),linkedinUrl:qs('#cfgLinkedin').value.trim(),tiktokUrl:qs('#cfgTiktok').value.trim(),termsText:qs('#cfgTerms').value.trim(),paymentMethods,qrPaymentUrl:qrUrl,allowRepeatedWinner:'NO',showFullData:qs('#cfgFullData').value};
      const d=await api('adminSaveSystemConfig',{raffleId:state.raffleId,config});if(!d.ok)throw new Error(d.error);await loadSystemConfig();toast('Configuración pública guardada. Los datos actualizados ya están disponibles en la web.');
    }
    async function loadContent(){const [d]=await Promise.all([api("adminGetRaffle",{raffleId:state.raffleId}),loadSystemConfig()]);if(!d.ok)throw new Error(d.error);state.raffleData=d;renderImpact(d.impactItems||[]);renderFaq(d.faqItems||[])}
    function renderImpact(items){qs("#impactList").innerHTML=items.length?items.map(i=>`<article class="content-card"><header><div><small>Orden ${i.order}</small><h3>${esc(i.title)}</h3></div>${badge(i.active?"ACTIVO":"INACTIVO")}</header>${`<img class="card-image" src="${esc(safeImageUrl(i.imageUrl,"assets/rifa-solidaria-2026.png"))}" data-fallback="assets/rifa-solidaria-2026.png" alt="${esc(i.title)}">`}<p>${esc(i.text)}</p><div class="button-row"><button class="btn small" data-edit-impact="${esc(i.id)}">Editar</button><button class="btn red small" data-delete-impact="${esc(i.id)}">Desactivar</button></div></article>`).join(""):'<div class="empty">No existen reseñas.</div>';qsa("[data-edit-impact]").forEach(b=>b.onclick=()=>openImpact(b.dataset.editImpact));qsa("[data-delete-impact]").forEach(b=>b.onclick=()=>deleteImpact(b.dataset.deleteImpact));installAdminImageFallback(qs("#impactList"))}
    function renderFaq(items){qs("#faqAdminList").innerHTML=items.length?items.map(i=>`<article class="result-card"><header><div><small>Orden ${i.order}</small><h3>${esc(i.question)}</h3></div>${badge(i.active?"ACTIVO":"INACTIVO")}</header><p>${esc(i.answer)}</p><div class="button-row"><button class="btn small" data-edit-faq="${esc(i.id)}">Editar</button><button class="btn red small" data-delete-faq="${esc(i.id)}">Desactivar</button></div></article>`).join(""):'<div class="empty">No existen preguntas.</div>';qsa("[data-edit-faq]").forEach(b=>b.onclick=()=>openFaq(b.dataset.editFaq));qsa("[data-delete-faq]").forEach(b=>b.onclick=()=>deleteFaq(b.dataset.deleteFaq))}
    function openImpact(id=""){const item=(state.raffleData?.impactItems||[]).find(x=>x.id===id);qs("#impactId").value=item?.id||"";qs("#impactOrder").value=item?.order||((state.raffleData?.impactItems||[]).length+1);qs("#impactTitle").value=item?.title||"";qs("#impactText").value=item?.text||"";qs("#impactImageUrl").value=item?.imageUrl||"";qs("#impactActive").value=String(item?.active!==false);qs("#impactImageFile").value="";qs("#impactModal").showModal()}
    async function saveImpact(e){e.preventDefault();let imageUrl=qs("#impactImageUrl").value.trim(),file=qs("#impactImageFile").files[0];if(file)imageUrl=await uploadImage(file);const d=await api("adminSaveImpact",{item:{id:qs("#impactId").value,raffleId:state.raffleId,order:Number(qs("#impactOrder").value),title:qs("#impactTitle").value.trim(),text:qs("#impactText").value.trim(),imageUrl,active:qs("#impactActive").value==="true"}});if(!d.ok)throw new Error(d.error);qs("#impactModal").close();toast("Contenido guardado.");loadContent()}
    async function deleteImpact(id){if(!confirm("¿Desactivar este contenido?"))return;const d=await api("adminDeleteImpact",{id});if(!d.ok)throw new Error(d.error);toast("Contenido desactivado.");loadContent()}
    function openFaq(id=""){const item=(state.raffleData?.faqItems||[]).find(x=>x.id===id);qs("#faqId").value=item?.id||"";qs("#faqOrder").value=item?.order||((state.raffleData?.faqItems||[]).length+1);qs("#faqQuestion").value=item?.question||"";qs("#faqAnswer").value=item?.answer||"";qs("#faqActive").value=String(item?.active!==false);qs("#faqModal").showModal()}
    async function saveFaq(e){e.preventDefault();const d=await api("adminSaveFaq",{item:{id:qs("#faqId").value,raffleId:state.raffleId,order:Number(qs("#faqOrder").value),question:qs("#faqQuestion").value.trim(),answer:qs("#faqAnswer").value.trim(),active:qs("#faqActive").value==="true"}});if(!d.ok)throw new Error(d.error);qs("#faqModal").close();toast("Pregunta guardada.");loadContent()}
    async function deleteFaq(id){if(!confirm("¿Desactivar esta pregunta?"))return;const d=await api("adminDeleteFaq",{id});if(!d.ok)throw new Error(d.error);toast("Pregunta desactivada.");loadContent()}

    function openProof(url,mime=''){
      if(!url)return toast('No existe comprobante adjunto.','error');
      const preview=qs('#proofPreview');const isPdf=String(mime).includes('pdf')||/\.pdf(?:$|\?)/i.test(url);
      preview.innerHTML=isPdf?`<iframe class="proof-frame" src="${esc(url)}"></iframe>`:`<img class="proof-image" src="${esc(url)}" alt="Comprobante adjunto">`;
      qs('#proofOpenLink').href=url;qs('#proofModal').showModal();
    }
    async function loadOrders(){
      const d=await api("adminOrders",{raffleId:state.raffleId,search:qs("#orderSearch").value.trim(),status:qs("#orderStatusFilter").value});if(!d.ok)throw new Error(d.error);state.orders=d.orders||[];
      qs("#orderCards").innerHTML=state.orders.length?state.orders.map(order=>`<article class="order-card"><header><div><small>Fecha y hora: ${esc(order.createdAt)}</small><h3>${esc(order.fullName)}</h3><small>Código: ${esc(order.code)}</small></div>${badge(order.status)}</header><div class="order-meta"><div><strong>WhatsApp</strong><br>${esc(order.phone)}</div><div><strong>Correo</strong><br>${esc(order.email)}</div><div><strong>Documento</strong><br>${esc(order.identityNumber||'Sin dato')}</div><div><strong>Departamento</strong><br>${esc(order.city)}</div><div><strong>Método</strong><br>${esc(order.paymentMethod)}</div><div><strong>Total</strong><br>${money(order.totalAmount,order.currency)}</div><div><strong>Reserva vence</strong><br>${esc(order.reservedUntil||'—')}</div><div><strong>Última actualización</strong><br>${esc(order.updatedAt||'—')}</div></div><div><strong>Números adquiridos</strong><div class="order-tickets">${(order.ticketStatuses||[]).map(t=>`<span class="order-ticket ${statusClass[t.status]||'blocked'}">${esc(t.number)} · ${esc(t.status)}</span>`).join('')}</div></div><p class="help">${esc(order.notes||'Sin observaciones')}</p><div class="order-actions">${order.proofUrl?`<button class="btn dark small" data-order-proof="${esc(order.proofUrl)}" data-proof-mime="${esc(order.proofMime||'')}">Ver comprobante / documento</button>`:'<span class="help">Sin comprobante adjunto</span>'}<button class="btn gray small" data-order-status="DISPONIBLE" data-order-code="${esc(order.code)}">Disponible</button><button class="btn small" data-order-status="EN_REVISION" data-order-code="${esc(order.code)}">En revisión</button><button class="btn green small" data-order-status="VENDIDO" data-order-code="${esc(order.code)}">Vendido</button><button class="btn red small" data-order-status="BLOQUEADO" data-order-code="${esc(order.code)}">Bloqueado</button></div></article>`).join(""):'<div class="empty" style="grid-column:1/-1">No existen pedidos para este sorteo.</div>';
      qsa("[data-order-status]").forEach(button=>button.onclick=()=>changeOrderStatus(button.dataset.orderCode,button.dataset.orderStatus));qsa('[data-order-proof]').forEach(button=>button.onclick=()=>openProof(button.dataset.orderProof,button.dataset.proofMime));
    }

    async function changeOrderStatus(code,status){
      const notes=prompt("Observación del cambio de estado","")??"";
      if(!confirm(`¿Cambiar todos los tickets del pedido ${code} a ${status}?`))return;
      const d=await api("adminOrderStatus",{participationCode:code,status,numberStatus:status,notes});
      if(!d.ok)throw new Error(d.error);
      toast("Pedido actualizado.");
      await loadOrders();
      if(state.currentView==="numbers")await loadBoard();
    }

    async function loadParticipants(){const d=await api("adminParticipants",{raffleId:state.raffleId,search:qs("#participantSearch").value.trim(),status:qs("#participantStatusFilter").value});if(!d.ok)throw new Error(d.error);state.participants=d.participants||[];qs("#participantsTable").innerHTML=state.participants.length?state.participants.map(i=>`<tr><td><strong>${esc(i.code)}</strong></td><td>${esc(i.fullName)}<br><small>${esc(i.city)}</small></td><td>${i.tickets.map(esc).join(", ")}</td><td>${esc(i.phone)}<br>${esc(i.email)}</td><td>${badge(i.status)}</td><td>${esc(i.createdAt)}</td><td><div class="table-actions"><button class="btn small" data-edit-participant="${esc(i.code)}">Editar</button><button class="btn gray small" data-proof="${esc(i.proofUrl||"")}">Comprobante</button></div></td></tr>`).join(""):'<tr><td colspan="7">Sin resultados.</td></tr>';qsa("[data-edit-participant]").forEach(b=>b.onclick=()=>openParticipant(b.dataset.editParticipant));qsa("[data-proof]").forEach(b=>b.onclick=()=>b.dataset.proof?window.open(b.dataset.proof,"_blank"):toast("No existe comprobante.","error"))}
    function openParticipant(code){const i=state.participants.find(x=>x.code===code);qs("#editParticipationCode").value=code;qs("#editName").value=i.fullName;qs("#editPhone").value=i.phone;qs("#editEmail").value=i.email;qs("#editCity").value=i.city;qs("#editIdentity").value=i.identityNumber;qs("#editNotes").value=i.notes||"";qs("#participantModal").showModal()}
    async function saveParticipant(e){e.preventDefault();const d=await api("adminUpdateParticipant",{participant:{code:qs("#editParticipationCode").value,fullName:qs("#editName").value.trim(),phone:qs("#editPhone").value.trim(),email:qs("#editEmail").value.trim(),city:qs("#editCity").value.trim(),identityNumber:qs("#editIdentity").value.trim(),notes:qs("#editNotes").value.trim()}});if(!d.ok)throw new Error(d.error);qs("#participantModal").close();toast("Participante actualizado.");loadParticipants()}
    function exportParticipants(){const rows=[["Código","Nombre","WhatsApp","Correo","Departamento","Cédula","Números","Estado","Fecha"],...state.participants.map(i=>[i.code,i.fullName,i.phone,i.email,i.city,i.identityNumber,i.tickets.join(" "),i.status,i.createdAt])];download("participantes.csv",rows.map(r=>r.map(c=>`"${String(c??"").replaceAll('"','""')}"`).join(",")).join("\n"),"text/csv;charset=utf-8")}
    async function loadPayments(){
      const d=await api("adminParticipants",{raffleId:state.raffleId,search:qs("#paymentSearch").value.trim(),status:qs("#paymentStatusFilter").value});if(!d.ok)throw new Error(d.error);state.payments=d.participants||[];
      qs("#paymentCards").innerHTML=state.payments.length?state.payments.map(i=>`<article class="payment-card"><header><div><h3>${esc(i.fullName)}</h3><small>${esc(i.code)} · ${esc(i.createdAt)}</small></div>${badge(i.status)}</header><p>Números: <strong>${(i.tickets||[]).map(esc).join(', ')}</strong><br>Total: <strong>${money(i.totalAmount,i.currency)}</strong><br>Método: ${esc(i.paymentMethod)}<br>WhatsApp: ${esc(i.phone)}<br>Correo: ${esc(i.email||'')}</p>${i.proofUrl?`<button class="btn gray small" data-payment-proof="${esc(i.proofUrl)}">Ver comprobante</button>`:'<span class="help">Sin comprobante</span>'}</article>`).join(''):'<div class="empty">No hay pagos para mostrar.</div>';
      qsa('[data-payment-proof]').forEach(button=>button.onclick=()=>openProof(button.dataset.paymentProof));
    }
    async function decidePayment(code,decision){const notes=prompt("Observaciones de la operación","")??"";const d=await api("adminPaymentDecision",{raffleId:state.raffleId,participationCode:code,decision,notes});if(!d.ok)throw new Error(d.error);toast(`Pago actualizado: ${decision}.`);loadPayments();loadDashboard()}
    async function cashPayment(e){e.preventDefault();const d=await api("adminCashPayment",{raffleId:state.raffleId,participant:{tickets:qs("#cashTickets").value.split(",").map(v=>v.trim()).filter(Boolean),fullName:qs("#cashName").value.trim(),phone:qs("#cashPhone").value.trim(),email:qs("#cashEmail").value.trim(),city:qs("#cashCity").value.trim(),identityNumber:qs("#cashIdentity").value.trim(),notes:qs("#cashNotes").value.trim()}});qs("#cashMessage").textContent=d.ok?`Registrado: ${d.code} · ${money(d.totalAmount,d.currency)}`:d.error;if(!d.ok)throw new Error(d.error);toast("Pago en efectivo registrado.");setTimeout(()=>{qs("#cashModal").close();qs("#cashForm").reset();loadPayments()},700)}

    async function loadBoard(){const d=await api("adminBoard",{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);state.board=d.tickets||[];filterBoard()}
    function filterBoard(){const status=qs("#numberStatusFilter").value;state.filteredBoard=status?state.board.filter(i=>i.status===status):state.board;state.numberPage=0;renderBoard()}
    function renderBoard(){const pages=Math.max(1,Math.ceil(state.filteredBoard.length/PAGE_SIZE));state.numberPage=Math.max(0,Math.min(state.numberPage,pages-1));const items=state.filteredBoard.slice(state.numberPage*PAGE_SIZE,state.numberPage*PAGE_SIZE+PAGE_SIZE);qs("#adminNumberGrid").innerHTML=items.map(i=>`<button class="number-button ${statusClass[i.status]||"blocked"}" data-number="${esc(i.number)}" title="${esc(i.status)} · ${esc(i.owner||"")}">${esc(i.number)}</button>`).join("")||'<div class="empty">No hay números en este filtro.</div>';qs("#adminNumberPageLabel").textContent=`Página ${state.numberPage+1} de ${pages}`;qs("#adminNumberPrev").disabled=state.numberPage<=0;qs("#adminNumberNext").disabled=state.numberPage>=pages-1;qsa("[data-number]").forEach(b=>b.onclick=()=>openNumber(b.dataset.number))}
    function searchNumber(){const raw=qs("#adminNumberSearch").value.replace(/\D/g,"");const item=state.board.find(i=>Number(i.number)===Number(raw));if(!item)return toast("Número no encontrado.","error");qs("#numberStatusFilter").value="";state.filteredBoard=state.board;const index=state.board.indexOf(item);state.numberPage=Math.floor(index/PAGE_SIZE);renderBoard();openNumber(item.number)}
    function openNumber(number){
      state.selectedNumber=number;const item=state.board.find(x=>x.number===number);const p=item.participant;
      qs("#numberModalTitle").textContent=`Número ${number}`;
      qs("#numberModalInfo").innerHTML=`<p>Estado: ${badge(item.status)}</p><div class="number-detail-grid"><div><strong>Cliente</strong><br>${esc(p?.fullName||item.owner||'Sin participante')}</div><div><strong>WhatsApp</strong><br>${esc(p?.phone||'—')}</div><div><strong>Correo</strong><br>${esc(p?.email||'—')}</div><div><strong>Documento</strong><br>${esc(p?.identityNumber||'—')}</div><div><strong>Departamento</strong><br>${esc(p?.city||'—')}</div><div><strong>Código</strong><br>${esc(p?.code||item.code||'—')}</div><div><strong>Método</strong><br>${esc(p?.paymentMethod||'—')}</div><div><strong>Fecha</strong><br>${esc(p?.createdAt||item.updatedAt||'—')}</div></div>${p?.proofUrl?`<button class="btn dark small" id="numberProofButton">Ver comprobante</button>`:''}<p class="help">${esc(item.notes||'')}</p>`;
      const available=item.status==='DISPONIBLE',blocked=item.status==='BLOQUEADO';qs('#assignNumber').hidden=!available;qs('#blockNumber').hidden=!available;qs('#releaseNumber').hidden=!blocked;
      qs("#numberModal").showModal();if(p?.proofUrl)qs('#numberProofButton').onclick=()=>openProof(p.proofUrl);
    }
    async function numberAction(action){let participant={};if(action==="ASSIGN"){participant={fullName:prompt("Nombre completo")||"",phone:prompt("WhatsApp")||"",email:prompt("Correo")||"",city:prompt("Departamento")||"",identityNumber:prompt("Cédula")||""};if(!participant.fullName||!participant.phone)return}const notes=prompt("Observaciones","")??"";const d=await api("adminNumberAction",{raffleId:state.raffleId,number:state.selectedNumber,numberAction:action,participant,notes});if(!d.ok)throw new Error(d.error);qs("#numberModal").close();toast("Número actualizado.");loadBoard()}


    async function bulkNumberAction(action){const numbers=qs('#bulkNumbers').value.trim();if(!numbers)return toast('Escribe los números.','error');if(!confirm('¿Aplicar la acción masiva?'))return;const d=await api('adminBulkNumberAction',{raffleId:state.raffleId,numbers,numberAction:action,notes:qs('#bulkNotes').value.trim()});if(!d.ok)throw new Error(d.error);qs('#bulkNumbers').value='';qs('#bulkNotes').value='';toast(`${d.changed.length} números actualizados${d.skipped.length?` y ${d.skipped.length} omitidos`:''}.`);loadBoard()}
    async function releaseExpiredReservations(){const d=await api('adminReleaseReservations',{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);toast(`Se liberaron ${d.released} reservas vencidas.`);loadBoard()}

    function liveOrdinal(index){const names=['PRIMER','SEGUNDO','TERCER','CUARTO','QUINTO','SEXTO','SÉPTIMO','OCTAVO'];return names[index]||`${index+1}°`}
    function stopLiveAnimation(){if(state.liveSpinTimer){clearInterval(state.liveSpinTimer);state.liveSpinTimer=null}}
    function randomDigit(){return String(Math.floor(Math.random()*10))}
    function renderLiveReels(){
      const count=state.liveSetup?.raffle?.digitCount||3;const digits=state.liveDigits.length?state.liveDigits:Array.from({length:count},()=>({value:'0',frozen:false}));
      qs('#liveReels').innerHTML=digits.map(d=>`<div class="live-reel ${d.frozen?'frozen':'spinning'}">${esc(d.value)}</div>`).join('');
    }
    function startLiveAnimation(){
      stopLiveAnimation();
      state.liveSpinTimer=setInterval(()=>{
        state.liveDigits=state.liveDigits.map(d=>d.frozen?d:{...d,value:randomDigit()});
        renderLiveReels();
      },75);
    }
    function renderLiveStats(stats){
      const values=[['Tickets aprobados',stats.approvedTickets||0],['Marcados vendidos',stats.soldTickets||0],['Elegibles',stats.eligibleTickets||0],['Participantes',stats.participantRows||0],['Aprobados sin migrar',stats.approvedNotSold||0],['Vendidos sin aprobado',stats.soldWithoutApproved||0]];
      qs('#liveStats').innerHTML=values.map(([label,value])=>`<article class="live-stat"><strong>${esc(value)}</strong><small>${esc(label)}</small></article>`).join('');
    }
    function renderLiveWinners(winners){
      qs('#liveWinnersList').innerHTML=(winners||[]).length?winners.map(w=>`<article class="live-winner-card"><small>Premio ${esc(w.prizeOrder)}</small><strong>${esc(w.prizeName)}</strong><span class="ticket">${esc(w.ticket)}</span><p>${esc(w.fullName)}</p><p>WhatsApp: ${esc(w.maskedPhone||'No registrado')}</p><p>${esc(w.drawDate||'')}</p></article>`).join(''):'<div class="empty" style="grid-column:1/-1">Aún no se registraron ganadores.</div>';
    }
    function renderLivePrizeOptions(prizes,keep=''){
      const available=(prizes||[]).filter(p=>!p.drawn&&p.status!=='DESACTIVADO');const select=qs('#livePrizeSelect');
      select.innerHTML='<option value="">Seleccionar premio</option>'+available.map(p=>`<option value="${esc(p.id)}">${esc(p.order)}. ${esc(p.name)}</option>`).join('');
      if(keep&&available.some(p=>p.id===keep))select.value=keep;select.disabled=!state.liveMigrationReady||Boolean(state.liveSession);qs('#liveWinnerAt').disabled=!state.liveMigrationReady||Boolean(state.liveSession);qs('#liveStartDraw').disabled=!state.liveMigrationReady||!select.value||Boolean(state.liveSession);
    }
    function applyLiveBackground(url,type='IMAGEN'){
      const stage=qs('#liveStage'),video=qs('#liveStageVideo');if(!stage||!video)return;
      if(String(type).toUpperCase()==='VIDEO'&&url){video.src=url;video.hidden=false;video.play().catch(()=>{});stage.style.backgroundImage='linear-gradient(180deg,#031a36,#052f5f)';}
      else{video.pause();video.removeAttribute('src');video.hidden=true;stage.style.backgroundImage=`linear-gradient(180deg,rgba(1,16,39,.55),rgba(1,28,57,.88)),url("${url||'assets/sorteos-en-vivo-utopia.png'}")`;}
    }
    async function saveLiveBackground(){const file=qs('#liveBackgroundFile').files[0];if(!file)throw new Error('Selecciona una imagen o video.');const uploaded=await uploadMedia(file);const d=await api('adminSaveLiveBackground',{raffleId:state.liveRaffleId,liveBackgroundUrl:uploaded.url,liveBackgroundType:uploaded.type});if(!d.ok)throw new Error(d.error);applyLiveBackground(uploaded.url,uploaded.type);toast('Fondo del sorteo actualizado.');}
    async function loadLiveDraw(preserveWinner=false){
      const current=state.liveRaffleId||state.raffleId||state.raffles[0]?.id||'';const selector=qs('#liveRaffleSelect');selector.innerHTML=state.raffles.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.status)}</option>`).join('');if(state.raffles.some(r=>r.id===current))selector.value=current;state.liveRaffleId=selector.value||current;if(!state.liveRaffleId)throw new Error('No existe un sorteo para realizar la dinámica.');
      const previousPrize=qs('#livePrizeSelect').value;const d=await api('adminLiveDrawSetup',{raffleId:state.liveRaffleId});if(!d.ok)throw new Error(d.error);state.liveSetup=d;state.liveMigrationReady=Boolean(d.migrationReady);qs('#liveRaffleTitle').textContent=d.raffle?.name||'Sorteo Utopía';applyLiveBackground(d.raffle?.liveBackgroundUrl,d.raffle?.liveBackgroundType);renderLiveStats(d.stats||{});renderLivePrizeOptions(d.prizes||[],previousPrize);renderLiveWinners(d.winners||[]);
      qs('#liveSaveBackground').disabled=!state.liveMigrationReady;qs('#liveFullscreen').disabled=!state.liveMigrationReady;qs('#liveMigrationMessage').textContent=state.liveMigrationReady?'Tickets válidos listos. Cambia el fondo, amplía la pantalla y selecciona el premio.':'Migra los tickets válidos antes de continuar.';
      if(!state.liveSession){state.liveDigits=Array.from({length:d.raffle.digitCount},()=>({value:'0',frozen:false}));state.liveBurned=[];renderLiveReels();renderLiveBurned();qs('#liveRevealDigit').disabled=true;qs('#liveCancelDraw').disabled=true;qs('#liveRevealDigit').textContent='Selecciona el premio e inicia la dinámica';qs('#liveProgress').textContent=state.liveMigrationReady?'Selecciona el premio y define en qué salida habrá ganador.':'Esperando la migración de tickets válidos.';qs('#liveControlCode').textContent='';if(!preserveWinner)qs('#liveWinnerCard').hidden=true;}
    }
    function renderLiveBurned(){const el=qs('#liveBurnedList');el.innerHTML=state.liveBurned.length?state.liveBurned.map(ticket=>`<span>${esc(ticket)}</span>`).join(''):'<span>Ninguno</span>';}
    async function syncLiveTickets(){
      const button=qs('#liveSyncTickets');button.disabled=true;try{const d=await api('adminLiveDrawSync',{raffleId:state.liveRaffleId});if(!d.ok)throw new Error(d.error);state.liveSetup=d;state.liveMigrationReady=Boolean(d.migrationReady??((d.stats?.eligibleTickets||0)>0&&(d.stats?.approvedNotSold||0)===0));renderLiveStats(d.stats||{});renderLivePrizeOptions(d.prizes||[],'');renderLiveWinners(d.winners||[]);const m=d.migration||{};qs('#liveMigrationMessage').textContent=`Migración completada: ${m.synchronized||0} actualizados, ${m.alreadySold||0} ya estaban vendidos. ${state.liveMigrationReady?'Ya puedes cargar el fondo y continuar.':'No existen tickets elegibles todavía.'}`;qs('#liveSaveBackground').disabled=!state.liveMigrationReady;qs('#liveFullscreen').disabled=!state.liveMigrationReady;toast('Tickets válidos sincronizados.');}finally{button.disabled=false;}
    }
    function lockLiveControls(locked){qs('#liveRaffleSelect').disabled=locked;qs('#livePrizeSelect').disabled=locked||!state.liveMigrationReady;qs('#liveWinnerAt').disabled=locked||!state.liveMigrationReady;qs('#liveSyncTickets').disabled=locked;qs('#liveStartDraw').disabled=locked||!state.liveMigrationReady||!qs('#livePrizeSelect').value;qs('#liveCancelDraw').disabled=!locked;qs('#liveSaveBackground').disabled=locked||!state.liveMigrationReady;}
    async function startLiveDraw(){
      if(!state.liveMigrationReady)throw new Error('Primero migra los tickets válidos.');const prizeId=qs('#livePrizeSelect').value;if(!prizeId)throw new Error('Selecciona un premio.');const winnerAt=Math.max(1,Number(qs('#liveWinnerAt').value||1));if(!confirm(`¿Iniciar la dinámica? El ganador será el número ${winnerAt} que salga.`))return;
      const d=await api('adminLiveDrawStart',{raffleId:state.liveRaffleId,prizeId,winnerAt});if(!d.ok)throw new Error(d.error);state.liveSession={token:d.drawToken,digitCount:d.digitCount,prize:d.prize,controlCode:d.controlCode,winnerAt:d.winnerAt,current:0};state.liveDigits=Array.from({length:d.digitCount},()=>({value:randomDigit(),frozen:false}));state.liveBurned=[];renderLiveBurned();qs('#liveWinnerCard').hidden=true;lockLiveControls(true);qs('#liveRevealDigit').disabled=false;qs('#liveRevealDigit').textContent=`SACAR NÚMERO 1 DE ${d.winnerAt}`;qs('#liveProgress').innerHTML=`Tómbola en proceso · <strong>${d.eligibleCount} tickets elegibles</strong>`;qs('#liveControlCode').textContent=`Código de control: ${d.controlCode}`;startLiveAnimation();toast('Dinámica iniciada.');
    }
    async function revealLiveDigit(){
      if(!state.liveSession)return;const button=qs('#liveRevealDigit');button.disabled=true;stopLiveAnimation();try{const d=await api('adminLiveDrawReveal',{drawToken:state.liveSession.token});if(!d.ok)throw new Error(d.error);state.liveDigits=String(d.ticket).padStart(state.liveSession.digitCount,'0').split('').map(value=>({value,frozen:true}));renderLiveReels();state.liveSession.current=d.drawNumber;
        if(d.completed){const w=d.winner;button.textContent='GANADOR DEFINIDO';button.disabled=true;qs('#liveCancelDraw').disabled=true;qs('#liveWinnerNumber').textContent=w.ticket;qs('#liveWinnerName').textContent=w.fullName;qs('#liveWinnerPrize').textContent=`GANADOR — ${w.prizeName}`;qs('#liveWinnerPhone').textContent=w.maskedPhone;qs('#liveWinnerCity').textContent=w.city?`Departamento / ciudad: ${w.city}`:'';qs('#liveCallWinner').href=w.callPhone?`tel:+${w.callPhone}`:'#';qs('#liveWhatsAppWinner').href=w.callPhone?`https://wa.me/${w.callPhone}?text=${encodeURIComponent(`Hola ${w.fullName}, te contactamos de Fundación Utopía para informarte que ganaste ${w.prizeName} con el ticket ${w.ticket}.`)}`:'#';qs('#liveWinnerCard').hidden=false;qs('#liveProgress').innerHTML='<strong>Ganador registrado. Este ticket queda excluido de los siguientes premios.</strong>';toast('¡Ganador registrado!');const refresh=await api('adminLiveDrawSetup',{raffleId:state.liveRaffleId});if(refresh.ok){state.liveSetup=refresh;renderLiveStats(refresh.stats||{});renderLiveWinners(refresh.winners||[]);} }
        else{state.liveBurned=d.burnedTickets||[...state.liveBurned,d.ticket];renderLiveBurned();qs('#liveProgress').innerHTML=`Ticket <strong>${esc(d.ticket)}</strong> quemado para este premio. Siguiente salida: ${d.nextDraw} de ${d.winnerAt}.`;await new Promise(resolve=>setTimeout(resolve,900));state.liveDigits=state.liveDigits.map(()=>({value:randomDigit(),frozen:false}));renderLiveReels();startLiveAnimation();button.disabled=false;button.textContent=`SACAR NÚMERO ${d.nextDraw} DE ${d.winnerAt}`;}
      }catch(e){startLiveAnimation();button.disabled=false;throw e;}
    }
    async function cancelLiveDraw(){
      if(!state.liveSession)return;if(!confirm('¿Cancelar esta sesión? Aún no se guardará un ganador.'))return;
      await api('adminLiveDrawCancel',{drawToken:state.liveSession.token});stopLiveAnimation();state.liveSession=null;lockLiveControls(false);await loadLiveDraw();toast('Sesión cancelada.','error');
    }
    async function nextLivePrize(){stopLiveAnimation();state.liveSession=null;state.liveBurned=[];lockLiveControls(false);qs('#liveWinnerCard').hidden=true;await loadLiveDraw();toast('Selecciona el siguiente premio y define la nueva dinámica.');}

    async function loadWinners(){
      const d=await api("adminResults",{raffleId:state.raffleId});
      if(!d.ok)throw new Error(d.error);
      state.results=d.results||[];
      renderResults();
    }
    function renderResults(){
      qs("#resultsList").innerHTML=state.results.length?state.results.map(r=>`<article class="result-card"><header><div><small>Premio ${esc(r.order)}</small><h3>${esc(r.prizeName)}</h3></div>${badge(r.published?'PUBLICADO':'REGISTRADO')}</header><p>Número ganador: <strong>${esc(r.ticket)}</strong><br>Ganador: <strong>${esc(r.fullName)}</strong><br>WhatsApp: <strong>${esc(r.maskedPhone||r.phone||'Sin dato')}</strong><br>Correo: ${esc(r.email||'Sin dato')}<br>Documento: ${esc(r.identityNumber||'Sin dato')}<br>Departamento: ${esc(r.city||'Sin dato')}<br>Código: ${esc(r.participationCode||'')}<br>Fecha: ${esc(r.drawDate||'')}<br>Responsable: ${esc(r.responsible||'')}</p><div class="button-row">${r.callPhone?`<a class="btn green small" href="tel:+${esc(r.callPhone)}">Llamar</a><a class="btn small" target="_blank" href="https://wa.me/${esc(r.callPhone)}">WhatsApp</a>`:''}${r.proofUrl?`<button class="btn gray small" data-winner-proof="${esc(r.proofUrl)}">Comprobante</button>`:''}</div></article>`).join(''):'<div class="empty">Aún no existen ganadores registrados para este sorteo.</div>';qsa('[data-winner-proof]').forEach(button=>button.onclick=()=>openProof(button.dataset.winnerProof));
    }
    function winnerArt(id){const r=state.results.find(x=>x.id===id),c=document.createElement("canvas");c.width=1080;c.height=1080;const x=c.getContext("2d"),g=x.createLinearGradient(0,0,1080,1080);g.addColorStop(0,"#031a36");g.addColorStop(1,"#087481");x.fillStyle=g;x.fillRect(0,0,1080,1080);x.textAlign="center";x.fillStyle="#8ed600";x.font="900 62px Montserrat";x.fillText("¡TENEMOS GANADOR!",540,160);x.fillStyle="#fff";x.font="900 190px Montserrat";x.fillText(r.ticket,540,430);x.font="800 54px Montserrat";x.fillText(r.fullName,540,560);x.fillStyle="#baff72";x.font="800 42px Montserrat";x.fillText(r.prizeName,540,650);x.fillStyle="#fff";x.font="500 31px Montserrat";x.fillText("Gracias por apoyar los proyectos de Fundación Utopía.",540,820);const a=document.createElement("a");a.download=`ganador-${r.ticket}.png`;a.href=c.toDataURL("image/png");a.click()}
    function certificate(id){const r=state.results.find(x=>x.id===id),w=window.open("","_blank");w.document.write(`<!doctype html><html><head><title>Certificado</title><style>body{font-family:Arial;text-align:center;padding:70px;border:18px solid #0872b9}h1{color:#0872b9;font-size:46px}h2{font-size:40px}.n{font-size:90px;color:#6baa00;font-weight:bold}</style></head><body><h1>CERTIFICADO DE GANADOR</h1><p>Fundación Utopía certifica que</p><h2>${esc(r.fullName)}</h2><p>es ganador de</p><h2>${esc(r.prizeName)}</h2><div class="n">${esc(r.ticket)}</div><p>Código: ${esc(r.participationCode)}</p><p>${esc(r.drawDate)}</p></body></html>`);w.document.close();w.print()}
    async function publishResult(id){const r=state.results.find(x=>x.id===id),d=await api("adminPublishResult",{resultId:id,published:!r.published});if(!d.ok)throw new Error(d.error);toast(r.published?"Resultado ocultado.":"Resultado publicado.");loadWinners()}

    async function loadReports(){const d=await api("adminReport",{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);state.report=d;qs("#reportContent").innerHTML=Object.entries(d.summary||{}).map(([k,v])=>`<article class="report-card"><small>${esc(k)}</small><strong>${esc(v)}</strong></article>`).join("");const render=(id,items)=>qs(id).innerHTML=(items||[]).map(i=>`<div class="status-row"><span>${esc(i.label)}</span><strong>${esc(i.value??i.count??0)}</strong></div>`).join("")||'<div class="empty">Sin datos.</div>';render('#reportNumberStatuses',d.numberStatuses);render('#reportPaymentStatuses',d.paymentStatuses);render('#reportDepartments',d.departments);render('#reportMethods',d.paymentMethods)}
    function reportCsv(){const rows=[["Indicador","Valor"],...Object.entries(state.report?.summary||{})];download("reporte-sorteo.csv",rows.map(r=>r.map(c=>`"${String(c).replaceAll('"','""')}"`).join(",")).join("\n"),"text/csv;charset=utf-8")}
    function reportExcel(){const rows=Object.entries(state.report?.summary||{}).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");download("reporte-sorteo.xls",`<html><meta charset="utf-8"><table border="1"><tr><th>Indicador</th><th>Valor</th></tr>${rows}</table></html>`,"application/vnd.ms-excel;charset=utf-8")}

    async function loadUsers(){const d=await api("adminUsers");if(!d.ok)throw new Error(d.error);qs("#usersTable").innerHTML=(d.users||[]).map(u=>`<div class="user-row"><div><strong>${esc(u.name)}</strong><br><small>${esc(u.username)} · ${esc(u.status)} · Último acceso: ${esc(u.lastLogin||'Nunca')}</small></div><div class="button-row"><select class="role-select" data-role-user="${esc(u.username)}">${['ADMINISTRADOR','OPERADOR','FINANZAS','COMUNICACION','AUDITOR'].map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select><button class="btn gray small" data-save-role="${esc(u.username)}">Guardar rol</button><button class="btn gray small" data-reset="${esc(u.username)}">Clave</button><button class="btn ${u.status==="ACTIVO"?"red":"green"} small" data-toggle="${esc(u.username)}">${u.status==="ACTIVO"?"Desactivar":"Activar"}</button></div></div>`).join("")||'<div class="empty">Sin usuarios.</div>';qsa("[data-reset]").forEach(b=>b.onclick=()=>resetUser(b.dataset.reset));qsa("[data-toggle]").forEach(b=>b.onclick=()=>toggleUser(b.dataset.toggle));qsa('[data-save-role]').forEach(b=>b.onclick=()=>updateUserRole(b.dataset.saveRole))}
    async function createUser(e){e.preventDefault();const d=await api("adminCreateUser",{user:{username:qs("#newUsername").value.trim(),name:qs("#newUserName").value.trim(),email:qs("#newUserEmail").value.trim(),role:qs("#newUserRole").value,password:qs("#newUserPassword").value}});qs("#userMessage").textContent=d.ok?"Usuario creado.":d.error;if(!d.ok)throw new Error(d.error);e.target.reset();toast("Usuario creado.");loadUsers()}
    async function updateUserRole(username){const select=qs(`[data-role-user="${CSS.escape(username)}"]`);const d=await api('adminUpdateUserRole',{username,role:select.value});if(!d.ok)throw new Error(d.error);toast('Rol actualizado.');loadUsers()}
    async function resetUser(username){const password=prompt(`Nueva contraseña para ${username}`);if(!password)return;const d=await api("adminResetPassword",{username,password});if(!d.ok)throw new Error(d.error);toast("Contraseña actualizada.")}
    async function toggleUser(username){if(!confirm(`¿Cambiar el estado de ${username}?`))return;const d=await api("adminToggleUser",{username});if(!d.ok)throw new Error(d.error);toast(`Usuario ${d.status}.`);loadUsers()}


    async function loadTechnicalStatus(){const d=await api('adminTechnicalStatus');if(!d.ok)throw new Error(d.error);const s=d.status;qs('#technicalStatus').innerHTML=[['Versión',s.version],['Google Sheet',s.spreadsheetName],['ID Sheet',s.spreadsheetId],['Sorteo activo',s.activeRaffleId],['Sorteo encontrado',s.activeRaffleExists?'Sí':'No'],['Sorteos',s.raffles],['Participantes',s.participants],['Números',s.numbers],['Usuarios',s.users],['Resultados',s.results]].map(([k,v])=>`<div class="technical-item"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('')}
    async function repairCurrentRaffle(){const d=await api('adminRepairCurrentRaffle');if(!d.ok)throw new Error(d.error);toast('Sorteo actual reparado.');await loadRaffles();loadTechnicalStatus()}
    async function loadAudit(){const d=await api("adminAudit");if(!d.ok)throw new Error(d.error);renderAudit("#auditFull",d.audit||[])}
    async function changePassword(){const currentPassword=prompt("Contraseña actual");if(!currentPassword)return;const newPassword=prompt("Nueva contraseña (mínimo 8 caracteres)");if(!newPassword)return;const d=await api("adminChangePassword",{currentPassword,newPassword});if(!d.ok)throw new Error(d.error);toast("Contraseña actualizada. Inicia sesión nuevamente.");setTimeout(()=>logout(false),1000)}
    async function backup(){
      const b=qs("#backupButton");b.disabled=true;
      try{
        const d=await api("adminBackup");
        if(!d.ok)throw new Error(d.error);
        qs("#settingsMessage").innerHTML=`Copia ZIP creada: <a href="${esc(d.downloadUrl||d.url)}" target="_blank">${esc(d.name)}</a>`;
        window.open(d.downloadUrl||d.url,"_blank");
        toast("Copia ZIP creada.");
      }finally{b.disabled=false}
    }

    function setup(){
      const bind=(selector,event,handler)=>{const el=qs(selector);if(el)el.addEventListener(event,handler)};
      qs("#loginForm").onsubmit=login;
      qs("#logoutButton").onclick=()=>logout();
      qsa("#adminNav button").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
      qs("#adminRaffleSelect").onchange=e=>{state.raffleId=e.target.value;updatePublicPageLink();refreshView(state.currentView)};
      qs("#raffleForm").onsubmit=saveRaffle;
      qs("#raffleTotal").oninput=renderDigitPreview;
      bind("#newRaffleButton","click",newRaffle);
      bind("#duplicateRaffle","click",duplicateRaffle);
      bind("#deleteRaffle","click",deleteRaffle);
      bind("#setActiveRaffle","click",setActiveRaffle);
      bind("#newPrizeButton","click",openNewPrize);
      if(qs("#newPrizeForm"))qs("#newPrizeForm").onsubmit=createPrize;
      if(qs("#systemConfigForm"))qs("#systemConfigForm").onsubmit=saveSystemConfig;
      bind("#newImpactButton","click",()=>openImpact());
      if(qs("#impactForm"))qs("#impactForm").onsubmit=saveImpact;
      bind("#newFaqButton","click",()=>openFaq());
      if(qs("#faqForm"))qs("#faqForm").onsubmit=saveFaq;
      bind("#refreshOrders","click",loadOrders);
      bind("#searchOrders","click",loadOrders);
      bind("#searchParticipants","click",loadParticipants);
      bind("#exportParticipants","click",exportParticipants);
      if(qs("#participantEditForm"))qs("#participantEditForm").onsubmit=saveParticipant;
      bind("#refreshPayments","click",loadPayments);
      bind("#searchPayments","click",loadPayments);
      bind("#cashPaymentButton","click",()=>qs("#cashModal").showModal());
      if(qs("#cashForm"))qs("#cashForm").onsubmit=cashPayment;
      bind("#adminRefreshNumbers","click",loadBoard);
      bind("#adminSearchNumber","click",searchNumber);
      bind("#numberStatusFilter","change",filterBoard);
      bind("#adminNumberPrev","click",()=>{state.numberPage--;renderBoard()});
      bind("#adminNumberNext","click",()=>{state.numberPage++;renderBoard()});
      bind("#blockNumber","click",()=>numberAction("BLOCK"));
      bind("#releaseNumber","click",()=>numberAction("RELEASE"));
      bind("#assignNumber","click",()=>numberAction("ASSIGN"));
      bind("#bulkBlock","click",()=>bulkNumberAction("BLOCK"));
      bind("#bulkRelease","click",()=>bulkNumberAction("RELEASE"));
      bind("#releaseExpired","click",releaseExpiredReservations);
      bind("#liveRaffleSelect","change",e=>{state.liveRaffleId=e.target.value;state.liveSession=null;stopLiveAnimation();loadLiveDraw()});
      bind("#liveSyncTickets","click",syncLiveTickets);
      bind("#liveSaveBackground","click",saveLiveBackground);
      bind("#liveStartDraw","click",startLiveDraw);
      bind("#liveRevealDigit","click",revealLiveDigit);
      bind("#liveCancelDraw","click",cancelLiveDraw);
      bind("#liveNextPrize","click",nextLivePrize);
      bind("#liveRefreshWinners","click",()=>loadLiveDraw(true));
      bind("#liveFullscreen","click",()=>{const stage=qs("#liveStage");if(!document.fullscreenElement)stage.requestFullscreen?.();else document.exitFullscreen?.()});
      bind("#livePrizeSelect","change",()=>{qs("#liveStartDraw").disabled=!state.liveMigrationReady||!qs("#livePrizeSelect").value;});
      bind("#refreshWinnerHistory","click",loadWinners);
      bind("#reportCsv","click",reportCsv);
      bind("#reportExcel","click",reportExcel);
      bind("#reportPrint","click",()=>window.print());
      if(qs("#userForm"))qs("#userForm").onsubmit=createUser;
      bind("#changeOwnPassword","click",changePassword);
      bind("#repairCurrentRaffle","click",repairCurrentRaffle);
      bind("#settingsReleaseExpired","click",releaseExpiredReservations);
      bind("#backupButton","click",backup);
      bind("#refreshAudit","click",loadAudit);
      qsa("[data-close-modal]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
      qsa("dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d)d.close()}));
    }
    const boot=()=>{try{setup();restore()}catch(error){console.error(error);alert(error.message||"No se pudo iniciar el panel administrativo.")}};
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
  })();
