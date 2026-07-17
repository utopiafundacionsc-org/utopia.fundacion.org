
  (()=>{
    "use strict";
    const API_URL=String((window.UTOPIA_CONFIG||{}).apiUrl||"").trim();
    const DEFAULT_RAFFLE="RIFA-UTOPIA-2026";
    const PAGE_SIZE=100;
    const qs=s=>document.querySelector(s), qsa=s=>[...document.querySelectorAll(s)];
    const state={token:localStorage.getItem("utopiaAdminToken")||"",user:null,raffles:[],raffleId:DEFAULT_RAFFLE,deletedReports:[],currentView:"dashboard",orders:[],participants:[],payments:[],board:[],filteredBoard:[],numberPage:0,numberPageRaffleId:"",selectedNumber:null,results:[],report:null,raffleData:null,publicBackgroundDraft:null,ticketBoardConfig:null,ticketBoardBackgroundDraft:null,liveRaffleId:DEFAULT_RAFFLE,liveSetup:null,liveSession:null,liveDigits:[],liveBurned:[],liveSpinTimer:null,liveMigrationReady:false,liveBackgroundDraft:null,liveObjectUrl:null,liveCurrentWinner:null,liveWinners:[],liveBurnedAll:[],liveBackgroundLoadedRaffleId:"",liveRunConfirmedRaffleId:"",prizeImageDataCache:{},loadedAt:{},refreshSequence:0};
    const views={dashboard:["Resumen","Panel general"],raffles:["Sorteos","Configuración del sorteo"],content:["Contenido público","Textos, reseñas e imágenes"],orders:["Pedidos","Solicitudes por orden de llegada"],participants:["Participantes","Base de datos"],payments:["Pagos","Revisión de comprobantes"],numbers:["Números","Control de números"],liveDraw:["Sorteos en vivo","Selección dinámica de ganadores"],winners:["Ganadores","Sorteo y publicación"],reports:["Reportes","Estadísticas y exportación"],users:["Usuarios","Usuarios y permisos"],settings:["Configuración","Seguridad y auditoría"]};
    const roleViews={ADMINISTRADOR:Object.keys(views),OPERADOR:["dashboard","orders","participants","payments","numbers","liveDraw","winners","settings"],FINANZAS:["dashboard","orders","payments","reports","settings"],COMUNICACION:["dashboard","content","liveDraw","winners","settings"],AUDITOR:["dashboard","orders","participants","payments","numbers","winners","reports","settings"]};
    const statusClass={DISPONIBLE:"available",RESERVADO:"reserved",EN_REVISION:"review",VENDIDO:"sold",BLOQUEADO:"blocked"};
    const BUILD_VERSION="12.5.5-20260717";
    console.info(`[Sorteos Utopía] admin.js ${BUILD_VERSION}`);
    const VIEW_CACHE_MS=30000;
    const inflightRequests=new Map();
    let activeRequests=0;
    function setNetworkBusy(busy){
      activeRequests=Math.max(0,activeRequests+(busy?1:-1));
      document.documentElement.classList.toggle('admin-network-busy',activeRequests>0);
    }


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
    function invalidateViews(...names){names.forEach(name=>{delete state.loadedAt[name]});}
    function renderMediaPreview(container,url,type,label="Fondo actual del sorteo"){
      if(!container)return;
      const mediaUrl=String(url||"").trim();
      const mediaType=String(type||"IMAGEN").toUpperCase()==="VIDEO"?"VIDEO":"IMAGEN";
      if(!mediaUrl){container.innerHTML=`<span>${esc(label)}</span>`;return;}
      container.innerHTML=mediaType==="VIDEO"
        ? `<video src="${esc(mediaUrl)}" muted loop playsinline controls preload="metadata"></video><small>${esc(label)} · Video</small>`
        : `<img src="${esc(mediaUrl)}" alt="${esc(label)}"><small>${esc(label)} · Imagen</small>`;
    }

    const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

    const money=(v,c="Bs")=>`${new Intl.NumberFormat("es-BO",{maximumFractionDigits:2}).format(Number(v||0))} ${c}`;
    const driveFileId=value=>{const text=String(value||"");for(const re of [/\/d\/([a-zA-Z0-9_-]+)/,/[?&]id=([a-zA-Z0-9_-]+)/,/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/]){const m=text.match(re);if(m)return m[1]}return""};
    const imagePlaceholder=(label="PREMIO")=>`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" rx="48" fill="#f4f8fb"/><circle cx="400" cy="330" r="130" fill="#d8e7f1"/><path d="M250 570h300" stroke="#9fb7c8" stroke-width="28" stroke-linecap="round"/><text x="400" y="710" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="#0a477e">${String(label||'PREMIO').slice(0,24)}</text></svg>`)}`;
    const imageUrlCandidates=(value,fallback="")=>{const text=String(value||"").trim(),items=[];const add=url=>{url=String(url||"").trim();if(url&&!items.includes(url))items.push(url)};if(text){const id=driveFileId(text);if(id){add(`https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w2000`);add(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=view&authuser=0`);add(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`);add(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`)}else add(text)}add(fallback);return items};
    const safeImageUrl=(value,fallback="")=>imageUrlCandidates(value,fallback)[0]||fallback||imagePlaceholder();
    function setResilientImage(img,value,fallback="",prizeId="",label="PREMIO"){
      if(!img)return;
      const candidates=imageUrlCandidates(value,fallback,label);let index=0,serverTried=false;
      const next=()=>{
        if(index<candidates.length){img.src=candidates[index++];return;}
        if(prizeId&&!serverTried){serverTried=true;const key=String(prizeId);const cached=state.prizeImageDataCache[key];if(cached){img.src=cached;return;}api("adminPrizeImageData",{prizeId:key}).then(data=>{if(data?.ok&&data.dataUrl){state.prizeImageDataCache[key]=data.dataUrl;img.src=data.dataUrl}else img.src=imagePlaceholder(label)}).catch(()=>{img.src=imagePlaceholder(label)});return;}
        img.src=imagePlaceholder(label);
      };
      img.onerror=next;next();
    }
    function installAdminImageFallback(root=document){root.querySelectorAll("img[data-fallback],img[data-image-source]").forEach(img=>setResilientImage(img,img.dataset.imageSource||img.getAttribute("src")||"",img.dataset.fallback||"",img.dataset.prizeId||"",img.alt||"PREMIO"))}
    const prizeFallback=(p,index=0)=>({1:"assets/premio-televisor.jpg",2:"assets/premio-parlante.jpg",3:"assets/premio-cafetera.jpg"})[Number(p?.order||index+1)]||"assets/rifa-solidaria-2026.png";
    const numberPageStorageKey=raffleId=>`utopiaAdminNumberPage:${String(raffleId||'default')}`;
    const liveWinnerAtStorageKey=raffleId=>`utopiaLiveWinnerAt:${String(raffleId||'default')}`;
    function savedLiveWinnerAt(raffleId=state.liveRaffleId){const value=Number(sessionStorage.getItem(liveWinnerAtStorageKey(raffleId)));return Number.isFinite(value)&&value>=1?Math.floor(value):1;}
    function rememberLiveWinnerAt(){const input=getElement('#liveWinnerAt',false);if(!input)return;const value=Math.max(1,Math.floor(Number(input.value)||1));input.value=String(value);try{sessionStorage.setItem(liveWinnerAtStorageKey(state.liveRaffleId),String(value));}catch(error){}}
    function savedNumberPage(raffleId=state.raffleId){const value=Number(sessionStorage.getItem(numberPageStorageKey(raffleId)));return Number.isFinite(value)&&value>=0?Math.floor(value):0;}
    function rememberNumberPage(){try{sessionStorage.setItem(numberPageStorageKey(state.raffleId),String(Math.max(0,state.numberPage||0)));}catch(error){}}
    const organizationBrand=organization=>{const name=String(organization||'Fundación Utopía').trim()||'Fundación Utopía';const normalized=name.toLowerCase();const isCircle=normalized.includes('circulo')||normalized.includes('círculo');return {name,logo:isCircle?'assets/logo-circulo-amigos-utopia.png':'assets/logo-utopia.png.jpeg',alt:isCircle?'Círculo de Amigos Utopía':'Fundación Utopía'};};
    function setLiveStageBrand(organization){const brand=organizationBrand(organization);const logo=getElement('#liveStageOrgLogo',false);const nameEl=getElement('#liveStageOrgName',false);if(logo){logo.src=brand.logo;logo.alt=brand.alt;logo.title=brand.name;}if(nameEl)nameEl.textContent=brand.name;}
    const resolveStageVideoUrl=value=>{const text=String(value||'').trim();if(!text)return text;const id=driveFileId(text);return id?`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=view&authuser=0`:text;};
    const LIVE_MEDIA_DB='utopia-live-media-v1';
    const LIVE_MEDIA_STORE='backgrounds';
    function openLiveMediaDb(){
      return new Promise((resolve,reject)=>{
        if(!('indexedDB' in window))return reject(new Error('Este navegador no permite guardar videos localmente.'));
        const request=indexedDB.open(LIVE_MEDIA_DB,1);
        request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(LIVE_MEDIA_STORE))db.createObjectStore(LIVE_MEDIA_STORE,{keyPath:'key'});};
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error||new Error('No se pudo abrir el almacenamiento local de videos.'));
      });
    }
    async function saveLocalLiveMedia(raffleId,file,serverUrl=''){
      if(!file)return;
      try{if(navigator.storage?.persist)await navigator.storage.persist();}catch{}
      const db=await openLiveMediaDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(LIVE_MEDIA_STORE,'readwrite');
        tx.objectStore(LIVE_MEDIA_STORE).put({key:`live:${raffleId}`,raffleId,blob:file,mime:file.type||'video/mp4',name:file.name||'fondo-video',serverUrl:String(serverUrl||''),updatedAt:Date.now()});
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('No se pudo guardar el video en este equipo.'));tx.onabort=()=>reject(tx.error||new Error('No se pudo guardar el video en este equipo.'));
      });
      db.close();
    }
    async function updateLocalLiveMediaServerUrl(raffleId,serverUrl){
      try{
        const db=await openLiveMediaDb();
        const current=await new Promise((resolve,reject)=>{const tx=db.transaction(LIVE_MEDIA_STORE,'readonly');const req=tx.objectStore(LIVE_MEDIA_STORE).get(`live:${raffleId}`);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
        if(current){current.serverUrl=String(serverUrl||'');current.updatedAt=Date.now();await new Promise((resolve,reject)=>{const tx=db.transaction(LIVE_MEDIA_STORE,'readwrite');tx.objectStore(LIVE_MEDIA_STORE).put(current);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
        db.close();
      }catch(error){console.warn('[Sorteos Utopía] No se pudo actualizar la referencia local del video:',error);}
    }
    async function loadLocalLiveMedia(raffleId){
      try{
        const db=await openLiveMediaDb();
        const item=await new Promise((resolve,reject)=>{const tx=db.transaction(LIVE_MEDIA_STORE,'readonly');const req=tx.objectStore(LIVE_MEDIA_STORE).get(`live:${raffleId}`);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
        db.close();return item;
      }catch(error){console.warn('[Sorteos Utopía] No se pudo leer el video local:',error);return null;}
    }
    async function deleteLocalLiveMedia(raffleId){
      try{const db=await openLiveMediaDb();await new Promise((resolve,reject)=>{const tx=db.transaction(LIVE_MEDIA_STORE,'readwrite');tx.objectStore(LIVE_MEDIA_STORE).delete(`live:${raffleId}`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();}catch(error){console.warn('[Sorteos Utopía] No se pudo eliminar el video local:',error);}
    }
    function useLiveObjectUrl(blob){
      if(state.liveObjectUrl){try{URL.revokeObjectURL(state.liveObjectUrl);}catch{}}
      state.liveObjectUrl=URL.createObjectURL(blob);
      return state.liveObjectUrl;
    }

    const toast=(message,type="success")=>{const t=qs("#toast");t.textContent=message;t.className=`toast ${type} show`;clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),3500)};
    const badge=status=>{const map={APROBADO:"green",VENDIDO:"green",DISPONIBLE:"green",EN_REVISION:"blue",COMPROBANTE_RECIBIDO:"blue",PENDIENTE:"yellow",RESERVADO:"yellow",RECHAZADO:"red",VENCIDO:"gray",BLOQUEADO:"gray"};return `<span class="badge ${map[status]||"gray"}">${esc(status)}</span>`};
    function download(filename,content,type="text/plain;charset=utf-8"){const blob=new Blob(["\ufeff"+content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
    async function api(action,payload={}){
      if(!API_URL)throw new Error("Falta configurar apiUrl en config.js.");
      const requestKey=action+'|'+JSON.stringify(payload||{})+'|'+String(state.token||'');
      if(inflightRequests.has(requestKey))return inflightRequests.get(requestKey);
      const request=(async()=>{
        const body=new URLSearchParams();body.set("action",action);body.set("clientVersion",BUILD_VERSION);
        if(state.token)body.set("token",state.token);
        Object.entries(payload).forEach(([k,v])=>body.set(k,typeof v==="object"?JSON.stringify(v):String(v??"")));
        const controller=typeof AbortController!=="undefined"?new AbortController():null;
        const timeout=controller?setTimeout(()=>controller.abort(),30000):null;
        setNetworkBusy(true);
        let response;
        try{response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:body.toString(),redirect:"follow",signal:controller?.signal})}
        catch(error){if(error?.name==='AbortError')throw new Error("La consulta tardó demasiado. Revisa la implementación de Apps Script.");throw new Error("No fue posible conectar con Google Apps Script. Revisa la implementación y el acceso para cualquier persona.")}
        finally{if(timeout)clearTimeout(timeout);setNetworkBusy(false)}
        if(!response.ok)throw new Error(`Error ${response.status}`);
        let data;
        if(typeof response.json==="function"&&typeof response.text!=="function")data=await response.json();
        else{const text=await response.text();try{data=JSON.parse(text)}catch{throw new Error("La API no devolvió JSON. Publica Code.gs v12.2 como una implementación nueva.")}}
        if(data.authExpired){logout(false);throw new Error("La sesión venció. Ingresa nuevamente.")}
        return data;
      })();
      inflightRequests.set(requestKey,request);
      try{return await request}finally{inflightRequests.delete(requestKey)}
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

    async function login(e){e.preventDefault();const btn=qs("#loginButton");btn.disabled=true;qs("#loginMessage").textContent="";try{const data=await api("adminLogin",{username:qs("#loginUser").value.trim(),password:qs("#loginPassword").value});if(!data.ok)throw new Error(data.error||"Usuario o contraseña incorrectos.");state.token=data.token;state.user=data.user;localStorage.setItem("utopiaAdminToken",state.token);showAdmin();await loadRaffles();switchView(state.raffles.length?"dashboard":"reports")}catch(err){qs("#loginMessage").textContent=err.message}finally{btn.disabled=false}}
    async function restore(){if(!state.token)return showLogin();try{const data=await api("adminSession");if(!data.ok)throw new Error();state.user=data.user;showAdmin();await loadRaffles();switchView(state.raffles.length?"dashboard":"reports")}catch(e){logout(false)}}
    async function logout(call=true){if(call&&state.token){try{await api("adminLogout")}catch{}}state.token="";state.user=null;localStorage.removeItem("utopiaAdminToken");showLogin()}
    function clearOperationalRaffleState(){
      state.orders=[];state.participants=[];state.payments=[];state.board=[];state.filteredBoard=[];state.results=[];state.report=null;state.raffleData=null;state.liveSetup=null;state.liveSession=null;state.liveWinners=[];state.selectedNumber=null;
      invalidateViews("dashboard","raffles","content","orders","participants","payments","numbers","liveDraw","winners","reports");
    }
    async function loadRaffles(){
      const data=await api("adminRaffles");
      if(!data?.ok)throw new Error(data?.error||"No se pudieron cargar los sorteos.");
      const allowedStatuses=new Set(["ACTIVO","PAUSADO","FINALIZADO"]),seen=new Set();
      state.raffles=(data.raffles||data.sorteos||[]).map(r=>({...r,id:String(r.id||"").trim(),name:String(r.name||"").trim(),status:String(r.status||"").trim().toUpperCase()})).filter(r=>r.id&&r.name&&allowedStatuses.has(r.status)&&!seen.has(r.id)&&seen.add(r.id));
      const activeId=String(data.activeRaffleId||data.raffleId||state.raffles.find(r=>r.status==="ACTIVO")?.id||"");
      const previousId=state.raffleId;
      if(!state.raffles.some(r=>r.id===state.raffleId))state.raffleId=state.raffles.some(r=>r.id===activeId)?activeId:(state.raffles[0]?.id||"");
      if(previousId!==state.raffleId)clearOperationalRaffleState();
      const selector=qs("#adminRaffleSelect");
      if(!state.raffles.length){
        state.raffleId="";clearOperationalRaffleState();selector.innerHTML='<option value="">Sin sorteos creados</option>';selector.value="";
        const liveSelector=qs("#liveRaffleSelect");if(liveSelector){liveSelector.innerHTML='<option value="">Sin sorteos creados</option>';liveSelector.value="";}
        updatePublicPageLink();return;
      }
      selector.innerHTML=state.raffles.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.status)}</option>`).join("");
      selector.value=state.raffleId;updatePublicPageLink();
      const liveSelector=qs("#liveRaffleSelect");if(liveSelector){liveSelector.innerHTML=selector.innerHTML;if(state.raffles.some(r=>r.id===state.liveRaffleId))liveSelector.value=state.liveRaffleId;else liveSelector.value=state.raffleId;}
    }

    function publicTicketBoardUrl(){
      const url=new URL("estado-tickets.html",window.location.href);
      url.search="";
      if(state.raffleId)url.searchParams.set("raffleId",state.raffleId);
      return url.toString();
    }
    function updatePublicTicketBoardLink(){
      const value=publicTicketBoardUrl();
      const input=qs("#publicTicketBoardLink");
      const open=qs("#openPublicTicketBoard");
      if(input)input.value=value;
      if(open)open.href=value;
    }
    async function copyPublicTicketBoardLink(){
      const value=publicTicketBoardUrl();
      try{
        if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(value);
        else{
          const input=qs("#publicTicketBoardLink");
          if(!input)throw new Error("No se encontró el enlace.");
          input.focus();input.select();
          if(!document.execCommand("copy"))throw new Error("No se pudo copiar automáticamente.");
        }
        toast("Enlace del tablero copiado.");
      }catch(error){
        toast("No se pudo copiar. Selecciona el enlace y cópialo manualmente.","error");
      }
    }
    function renderTicketBoardAdminConfig(config={}){
      const enabled=String(config.enabled||'SI').toUpperCase()==='NO'?'NO':'SI';
      const backgroundType=String(config.backgroundType||'IMAGEN').toUpperCase()==='VIDEO'?'VIDEO':'IMAGEN';
      const backgroundUrl=String(config.backgroundUrl||'').trim();
      state.ticketBoardConfig={enabled,backgroundType,backgroundUrl};
      setFieldValue('#ticketBoardEnabled',enabled);
      setFieldValue('#ticketBoardBackgroundUrl',backgroundUrl);
      setFieldValue('#ticketBoardBackgroundType',backgroundType);
      const statusLine=qs('.ticket-board-status-line');
      if(statusLine){statusLine.classList.toggle('open',enabled==='SI');statusLine.classList.toggle('closed',enabled==='NO');}
      const statusText=qs('#ticketBoardStatusText');
      if(statusText)statusText.textContent=enabled==='SI'?'Enlace abierto: los tickets están visibles.':'Enlace cerrado: los tickets están ocultos.';
      renderMediaPreview(qs('#ticketBoardBackgroundPreview'),backgroundUrl,backgroundType,backgroundUrl?'Fondo actual del tablero':'Sin fondo personalizado');
      const message=qs('#ticketBoardConfigMessage');
      if(message)message.textContent='La configuración pertenece únicamente al sorteo seleccionado.';
    }
    async function loadTicketBoardConfig(){
      if(!state.raffleId)return;
      const d=await api('adminTicketBoardConfig',{raffleId:state.raffleId});
      if(!d.ok)throw new Error(d.error);
      state.ticketBoardBackgroundDraft=null;
      renderTicketBoardAdminConfig(d.config||{});
    }
    async function prepareTicketBoardBackground(){
      if(!state.raffleId)throw new Error('Selecciona un sorteo.');
      const file=qs('#ticketBoardBackgroundFile').files[0];
      if(!file)throw new Error('Selecciona una imagen o video.');
      const button=qs('#prepareTicketBoardBackground');
      button.disabled=true;
      qs('#ticketBoardConfigMessage').textContent='Subiendo y preparando el fondo…';
      try{
        const uploaded=await uploadMedia(file);
        state.ticketBoardBackgroundDraft={url:uploaded.url,type:uploaded.type};
        renderMediaPreview(qs('#ticketBoardBackgroundPreview'),uploaded.url,uploaded.type,'Vista previa lista para guardar');
        qs('#ticketBoardConfigMessage').textContent='Fondo preparado. Presiona “Guardar configuración” para aplicarlo al enlace.';
        toast('Fondo del tablero preparado.');
      }finally{button.disabled=false;}
    }
    async function saveTicketBoardConfig(){
      if(!state.raffleId)throw new Error('Selecciona un sorteo.');
      const button=qs('#saveTicketBoardConfig');
      button.disabled=true;
      try{
        const draft=state.ticketBoardBackgroundDraft;
        const backgroundUrl=draft?.url??qs('#ticketBoardBackgroundUrl').value.trim();
        const backgroundType=draft?.type??qs('#ticketBoardBackgroundType').value;
        const d=await api('adminSaveTicketBoardConfig',{
          raffleId:state.raffleId,
          enabled:qs('#ticketBoardEnabled').value,
          backgroundUrl,
          backgroundType
        });
        if(!d.ok)throw new Error(d.error);
        state.ticketBoardBackgroundDraft=null;
        qs('#ticketBoardBackgroundFile').value='';
        renderTicketBoardAdminConfig(d.config||{});
        qs('#ticketBoardConfigMessage').textContent='Configuración guardada. El enlace se actualizará automáticamente.';
        toast('Configuración del tablero guardada.');
      }finally{button.disabled=false;}
    }
    async function removeTicketBoardBackground(){
      if(!state.raffleId)throw new Error('Selecciona un sorteo.');
      if(!confirm('¿Quitar el fondo personalizado de este tablero?'))return;
      state.ticketBoardBackgroundDraft=null;
      const d=await api('adminSaveTicketBoardConfig',{
        raffleId:state.raffleId,
        enabled:qs('#ticketBoardEnabled').value,
        backgroundUrl:'',
        backgroundType:'IMAGEN'
      });
      if(!d.ok)throw new Error(d.error);
      qs('#ticketBoardBackgroundFile').value='';
      renderTicketBoardAdminConfig(d.config||{});
      qs('#ticketBoardConfigMessage').textContent='Fondo eliminado. El tablero utilizará el diseño predeterminado.';
      toast('Fondo del tablero eliminado.');
    }
    function updatePublicPageLink(){
      const link=qs("#publicPageLink");
      if(link)link.href=state.raffleId?`index.html?raffleId=${encodeURIComponent(state.raffleId)}`:"index.html";
      updatePublicTicketBoardLink();
    }
    function switchView(view){
      state.currentView=view;
      qsa("#adminNav button").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
      qsa(".admin-view").forEach(section=>section.classList.toggle("active",section.id===`view-${view}`));
      qs("#currentViewLabel").textContent=views[view][0];qs("#currentViewTitle").textContent=views[view][1];
      const headerActions=qs(".header-actions");if(headerActions)headerActions.hidden=["users","settings","liveDraw"].includes(view);
      refreshView(view);
    }
    async function refreshView(view,force=false){
      const now=Date.now();
      if(!force&&state.loadedAt[view]&&now-state.loadedAt[view]<VIEW_CACHE_MS)return;
      const sequence=++state.refreshSequence;
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
        if(view==="settings")await Promise.all([loadAudit(),loadTechnicalStatus()]);
        if(sequence<=state.refreshSequence)state.loadedAt[view]=Date.now();
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
      const r=d.raffle||d.sorteo;if(!r)throw new Error("La API no devolvió los datos del sorteo. Publica Code.gs v12.2.");
      state.raffleData={...d,raffle:r,prizes:d.prizes||r.prizes||[]};
      setFieldValue("#raffleId",r.id);setFieldValue("#raffleName",r.name);setFieldValue("#raffleDate",r.drawDateLocal||String(r.drawDate||"").slice(0,16));
      setFieldValue("#rafflePrice",r.ticketPrice);setFieldValue("#raffleCurrency",r.currency);setFieldValue("#raffleTotal",r.totalTickets);setFieldValue("#raffleReservationMinutes",r.reservationMinutes||15);
      setFieldValue("#raffleStatus",["ACTIVO","PAUSADO","FINALIZADO"].includes(r.status)?r.status:"PAUSADO");setFieldValue("#raffleDescription",r.description||"");
      setFieldValue("#raffleImageUrl",r.imageUrl||"");setFieldValue("#rafflePublished",String(r.published!==false));setFieldValue("#contactWhatsApp",r.contactWhatsApp||"");setFieldValue("#facebookUrl",r.facebookUrl||"");setFieldValue("#linkedinUrl",r.linkedinUrl||"");setFieldValue("#tiktokUrl",r.tiktokUrl||"");
      setFieldValue("#raffleBackgroundUrl",r.publicBackgroundUrl||"");setFieldValue("#raffleBackgroundType",r.publicBackgroundType||"VIDEO");
      state.publicBackgroundDraft=null;qs("#raffleApplyBackground").disabled=true;qs("#raffleBackgroundFile").value="";
      renderMediaPreview(qs("#raffleBackgroundPreview"),r.publicBackgroundUrl,r.publicBackgroundType,"Fondo actual de la página pública");
      qs("#raffleBackgroundMessage").textContent="Selecciona una imagen o video. Cuando termine de subir, se habilitará “Aplicar fondo”.";
      renderDigitPreview();renderPrizes(state.raffleData.prizes);qs("#raffleMessage").textContent="";
    }

    function renderDigitPreview(){const total=Math.max(1,Number(qs("#raffleTotal").value||1)),digits=String(total).length;qs("#digitPreview").innerHTML=Array.from({length:digits},()=>'<span>0</span>').join("")}
    function renderPrizes(prizes){
      qs("#adminPrizeList").innerHTML=prizes.length?prizes.map((p,index)=>{const fallback=prizeFallback(p,index),image=safeImageUrl(p.imageUrl,fallback);return `<article class="prize-card" data-prize="${esc(p.id)}"><header><div><small>Premio ${p.order}</small><h3>${esc(p.name)}</h3></div>${badge(p.status)}</header><img class="card-image" src="${esc(image)}" data-image-source="${esc(p.imageUrl||'')}" data-prize-id="${esc(p.id)}" data-fallback="${esc(fallback)}" alt="${esc(p.name)}"><form class="inline-form prize-form"><input name="name" value="${esc(p.name)}" placeholder="Nombre"><textarea name="description" placeholder="Descripción">${esc(p.description||"")}</textarea><input name="imageUrl" value="${esc(p.imageUrl||"")}" placeholder="URL de imagen"><div class="image-upload"><input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp"><button class="btn gray small" type="button" data-upload-prize>Subir imagen</button></div><div class="button-row"><button class="btn green small" type="submit">Guardar premio</button><button class="btn red small" type="button" data-delete-prize="${esc(p.id)}">Eliminar</button></div></form></article>`}).join(""):'<div class="empty">No existen premios.</div>';
      installAdminImageFallback(qs("#adminPrizeList"));
      qsa(".prize-form").forEach(f=>f.addEventListener("submit",savePrize));qsa("[data-upload-prize]").forEach(b=>b.addEventListener("click",uploadPrizeImage));qsa("[data-delete-prize]").forEach(b=>b.onclick=()=>deletePrize(b.dataset.deletePrize))
    }
    async function uploadPrizeImage(e){const card=e.target.closest(".prize-card"),file=card.querySelector('[name="imageFile"]').files[0];if(!file)return toast("Selecciona una imagen.","error");e.target.disabled=true;try{const url=await uploadImage(file);card.querySelector('[name="imageUrl"]').value=url;toast("Imagen subida. Guarda el premio.")}catch(err){toast(err.message,"error")}finally{e.target.disabled=false}}
    async function savePrize(e){e.preventDefault();const card=e.target.closest(".prize-card"),id=card.dataset.prize,p=state.raffleData.prizes.find(x=>x.id===id),form=e.target,button=form.querySelector('[type="submit"]');button.disabled=true;try{const data=await api("adminSavePrize",{prize:{...p,name:form.name.value.trim(),description:form.description.value.trim(),imageUrl:form.imageUrl.value.trim()}});if(!data.ok)throw new Error(data.error);state.raffleData.prizes=data.prizes||state.raffleData.prizes;renderPrizes(state.raffleData.prizes);invalidateViews("liveDraw","winners","reports");toast("Premio actualizado.");}finally{button.disabled=false}}
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
        tiktokUrl:qs("#tiktokUrl").value.trim(),
        publicBackgroundUrl:qs("#raffleBackgroundUrl").value.trim(),
        publicBackgroundType:qs("#raffleBackgroundType").value||"VIDEO"
      };
      const d=await api("adminSaveRaffle",{raffle:payload});
      qs("#raffleMessage").textContent=d.ok?"Configuración guardada.":d.error;
      if(!d.ok)throw new Error(d.error);
      state.raffleId=d.raffle.id;
      state.raffleData=state.raffleData&&state.raffleData.raffle?.id===state.raffleId?{...state.raffleData,raffle:{...state.raffleData.raffle,...payload,id:state.raffleId}}:{raffle:{...payload,id:state.raffleId},prizes:[]};
      invalidateViews("dashboard","raffles","content","orders","participants","payments","numbers","liveDraw","winners","reports");
      await loadRaffles();
      state.loadedAt.raffles=Date.now();
      toast("Sorteo actualizado.");
    }
    function newRaffle(){qs("#raffleForm").reset();qs("#raffleId").value="";qs("#raffleCurrency").value="Bs";qs("#raffleStatus").value="ACTIVO";qs("#raffleTotal").value=370;qs("#raffleReservationMinutes").value=15;qs("#rafflePublished").value="true";qs("#raffleBackgroundType").value="VIDEO";state.publicBackgroundDraft=null;qs("#raffleApplyBackground").disabled=true;renderMediaPreview(qs("#raffleBackgroundPreview"),"","VIDEO","Sin fondo configurado");renderDigitPreview()}
    async function duplicateRaffle(){if(!confirm("¿Duplicar este sorteo?"))return;const d=await api("adminDuplicateRaffle",{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);state.raffleId=d.raffleId;await loadRaffles();await loadRaffle();toast("Sorteo duplicado.")}
    async function deleteRaffle(){if(!state.raffleId)return;const raffle=state.raffles.find(r=>r.id===state.raffleId);const name=raffle?.name||state.raffleId;if(!confirm(`Se generará primero un informe histórico descargable. Después, “${name}” desaparecerá definitivamente de la página pública y de todo el panel. ¿Continuar?`))return;const button=qs("#deleteRaffle");button.disabled=true;try{const d=await api("adminDeleteRaffle",{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);state.raffleId=d.activeRaffleId||"";state.report=null;invalidateViews("dashboard","raffles","content","orders","participants","payments","numbers","liveDraw","winners","reports");await loadRaffles();toast("Sorteo eliminado. El informe quedó disponible en Reportes.");switchView("reports");}finally{button.disabled=false}}


    async function setActiveRaffle(){if(!confirm('¿Marcar este como el sorteo principal?'))return;const d=await api('adminSetActiveRaffle',{raffleId:state.raffleId});if(!d.ok)throw new Error(d.error);await loadRaffles();toast('Sorteo activo actualizado.')}
    function openNewPrize(){qs('#newPrizeForm').reset();qs('#newPrizeOrder').value=(state.raffleData?.prizes||[]).length+1;qs('#prizeModal').showModal()}
    async function createPrize(e){e.preventDefault();const submit=e.submitter||e.target.querySelector('[type="submit"]');submit.disabled=true;try{let imageUrl=qs('#newPrizeImageUrl').value.trim();const file=qs('#newPrizeImageFile').files[0];if(file)imageUrl=await uploadImage(file);const prize={raffleId:state.raffleId,order:Number(qs('#newPrizeOrder').value||1),status:qs('#newPrizeStatus').value,name:qs('#newPrizeName').value.trim(),description:qs('#newPrizeDescription').value.trim(),imageUrl};const d=await api('adminSavePrize',{prize});if(!d.ok)throw new Error(d.error);state.raffleData=state.raffleData||{raffle:{id:state.raffleId},prizes:[]};state.raffleData.prizes=d.prizes||[];renderPrizes(state.raffleData.prizes);qs('#prizeModal').close();invalidateViews("liveDraw","winners","reports");toast('Premio creado.');}finally{submit.disabled=false}}
    async function deletePrize(id){if(!confirm('¿Eliminar definitivamente este premio? Esta acción no se puede deshacer.'))return;const d=await api('adminDeletePrize',{prizeId:id});if(!d.ok)throw new Error(d.error);state.raffleData.prizes=d.prizes||state.raffleData.prizes.filter(p=>p.id!==id);renderPrizes(state.raffleData.prizes);invalidateViews("liveDraw","winners","reports");toast('Premio eliminado.');}
    async function prepareRaffleBackground(){const file=qs('#raffleBackgroundFile').files[0];if(!file)throw new Error('Selecciona una imagen o video.');const button=qs('#rafflePrepareBackground');button.disabled=true;qs('#raffleApplyBackground').disabled=true;qs('#raffleBackgroundMessage').textContent='Subiendo y preparando el archivo…';try{const uploaded=await uploadMedia(file);state.publicBackgroundDraft={url:uploaded.url,type:uploaded.type};renderMediaPreview(qs('#raffleBackgroundPreview'),uploaded.url,uploaded.type,'Vista previa lista para aplicar');qs('#raffleApplyBackground').disabled=false;qs('#raffleBackgroundMessage').textContent='Archivo listo. Presiona “Aplicar fondo” para publicarlo en este sorteo.';toast('Fondo preparado.');}finally{button.disabled=false}}
    async function applyRaffleBackground(){if(!state.raffleId)throw new Error('Guarda primero el sorteo.');if(!state.publicBackgroundDraft)throw new Error('Primero sube y prepara el fondo.');const button=qs('#raffleApplyBackground');button.disabled=true;try{const d=await api('adminSavePublicBackground',{raffleId:state.raffleId,publicBackgroundUrl:state.publicBackgroundDraft.url,publicBackgroundType:state.publicBackgroundDraft.type});if(!d.ok)throw new Error(d.error);setFieldValue('#raffleBackgroundUrl',d.publicBackgroundUrl||state.publicBackgroundDraft.url);setFieldValue('#raffleBackgroundType',d.publicBackgroundType||state.publicBackgroundDraft.type);if(state.raffleData?.raffle){state.raffleData.raffle.publicBackgroundUrl=d.publicBackgroundUrl||state.publicBackgroundDraft.url;state.raffleData.raffle.publicBackgroundType=d.publicBackgroundType||state.publicBackgroundDraft.type;}renderMediaPreview(qs('#raffleBackgroundPreview'),d.publicBackgroundUrl||state.publicBackgroundDraft.url,d.publicBackgroundType||state.publicBackgroundDraft.type,'Fondo aplicado en la página pública');state.publicBackgroundDraft=null;qs('#raffleBackgroundFile').value='';qs('#raffleBackgroundMessage').textContent='Fondo aplicado correctamente. La página pública lo mostrará en su próxima actualización.';invalidateViews('raffles','reports');state.loadedAt.raffles=Date.now();toast('Fondo público aplicado.');}catch(error){button.disabled=false;throw error}}
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
      const d=await api("adminOrders",{raffleId:state.raffleId,search:qs("#orderSearch").value.trim()});if(!d.ok)throw new Error(d.error);state.orders=d.orders||[];
      qs("#orderCards").innerHTML=state.orders.length?state.orders.map(order=>`<article class="order-card"><header><div><small>Fecha y hora: ${esc(order.createdAt)}</small><h3>${esc(order.fullName)}</h3><small>Código: ${esc(order.code)}</small></div>${badge(order.status)}</header><div class="order-meta"><div><strong>WhatsApp</strong><br>${esc(order.phone)}</div><div><strong>Correo</strong><br>${esc(order.email)}</div><div><strong>Documento</strong><br>${esc(order.identityNumber||'Sin dato')}</div><div><strong>Departamento</strong><br>${esc(order.city)}</div><div><strong>Método</strong><br>${esc(order.paymentMethod)}</div><div><strong>Total</strong><br>${money(order.totalAmount,order.currency)}</div><div><strong>Reserva vence</strong><br>${esc(order.reservedUntil||'—')}</div><div><strong>Última actualización</strong><br>${esc(order.updatedAt||'—')}</div></div><div><strong>Números adquiridos</strong><div class="order-tickets">${(order.ticketStatuses||[]).map(t=>`<span class="order-ticket ${statusClass[t.status]||'blocked'}">${esc(t.number)} · ${esc(t.status)}</span>`).join('')}</div></div><p class="help">${esc(order.notes||'Sin observaciones')}</p><div class="order-actions">${order.proofUrl?`<button class="btn dark small" data-order-proof="${esc(order.proofUrl)}" data-proof-mime="${esc(order.proofMime||'')}">Ver comprobante / documento</button>`:'<span class="help">Sin comprobante adjunto</span>'}<button class="btn gray small" data-order-status="DISPONIBLE" data-order-code="${esc(order.code)}">Disponible</button><button class="btn small" data-order-status="EN_REVISION" data-order-code="${esc(order.code)}">En revisión</button><button class="btn green small" data-order-status="VENDIDO" data-order-code="${esc(order.code)}">Vendido</button><button class="btn red small" data-order-status="BLOQUEADO" data-order-code="${esc(order.code)}">Bloqueado</button></div></article>`).join(""):'<div class="empty" style="grid-column:1/-1">No hay comprobantes pendientes de revisión para este sorteo.</div>';
      qsa("[data-order-status]").forEach(button=>button.onclick=()=>changeOrderStatus(button.dataset.orderCode,button.dataset.orderStatus));qsa('[data-order-proof]').forEach(button=>button.onclick=()=>openProof(button.dataset.orderProof,button.dataset.proofMime));
    }

    async function changeOrderStatus(code,status){
      const notes=prompt("Observación del cambio de estado","")??"";
      if(!confirm(`¿Cambiar todos los tickets del pedido ${code} a ${status}?`))return;
      const d=await api("adminOrderStatus",{participationCode:code,status,numberStatus:status,notes});
      if(!d.ok)throw new Error(d.error);
      toast("Pedido actualizado. Se retiró de la cola de revisión.");
      invalidateViews("dashboard","participants","payments","numbers","liveDraw","winners","reports");
      await loadOrders();
    }

    async function loadParticipants(){const d=await api("adminParticipants",{raffleId:state.raffleId,search:qs("#participantSearch").value.trim(),status:qs("#participantStatusFilter").value});if(!d.ok)throw new Error(d.error);state.participants=d.participants||[];qs("#participantsTable").innerHTML=state.participants.length?state.participants.map(i=>`<tr><td><strong>${esc(i.code)}</strong></td><td>${esc(i.fullName)}<br><small>${esc(i.city)}</small></td><td>${i.tickets.map(esc).join(", ")}</td><td>${esc(i.phone)}<br>${esc(i.email)}</td><td>${badge(i.status)}</td><td>${esc(i.createdAt)}</td><td><div class="table-actions"><button class="btn small" data-edit-participant="${esc(i.code)}">Editar</button><button class="btn gray small" data-proof="${esc(i.proofUrl||"")}">Comprobante</button>${i.status==='VENCIDO'?`<button class="btn green small" data-include-expired="${esc(i.code)}">Incluir en sorteo</button>`:''}</div></td></tr>`).join(""):'<tr><td colspan="7">Sin resultados.</td></tr>';qsa("[data-edit-participant]").forEach(b=>b.onclick=()=>openParticipant(b.dataset.editParticipant));qsa("[data-proof]").forEach(b=>b.onclick=()=>b.dataset.proof?window.open(b.dataset.proof,"_blank"):toast("No existe comprobante.","error"));qsa("[data-include-expired]").forEach(b=>b.onclick=()=>includeExpiredInDraw(b.dataset.includeExpired,b))}
    async function includeExpiredInDraw(code,button){if(!confirm('¿Incluir en el sorteo únicamente los tickets vencidos que todavía estén libres? Los tickets reutilizados por otra participación no serán modificados.'))return;button.disabled=true;try{const d=await api('adminIncludeExpiredInDraw',{participationCode:code});if(!d.ok)throw new Error(d.error);invalidateViews('dashboard','numbers','liveDraw','reports');toast(`${d.included?.length||0} ticket(s) incluidos en el sorteo.`);await loadParticipants();}finally{button.disabled=false}}
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

    async function loadBoard(options={}){
      const preservePage=options?.preservePage!==false;
      const requestedPage=Number.isFinite(Number(options?.targetPage))?Math.max(0,Math.floor(Number(options.targetPage))):null;
      const restoreNumber=String(options?.restoreNumber||'').trim();
      const currentRaffleId=state.raffleId;
      const sameRaffle=state.numberPageRaffleId===currentRaffleId;
      const previousPage=requestedPage!==null?requestedPage:(sameRaffle&&Number.isFinite(state.numberPage)?state.numberPage:savedNumberPage(currentRaffleId));
      const [d]=await Promise.all([api("adminBoard",{raffleId:currentRaffleId}),loadTicketBoardConfig()]);
      if(!d.ok)throw new Error(d.error);
      if(currentRaffleId!==state.raffleId)return;
      state.board=d.tickets||[];
      state.numberPageRaffleId=currentRaffleId;
      state.numberPage=preservePage?previousPage:0;
      filterBoard(false);
      if(restoreNumber){
        const restoredIndex=state.filteredBoard.findIndex(item=>String(item.number)===restoreNumber);
        if(restoredIndex>=0){
          const restoredPage=Math.floor(restoredIndex/PAGE_SIZE);
          if(requestedPage===null)state.numberPage=restoredPage;
          renderBoard();
        }
      }
    }
    function filterBoard(resetPage=true){const status=qs("#numberStatusFilter").value;state.filteredBoard=status?state.board.filter(i=>i.status===status):state.board;if(resetPage)state.numberPage=0;renderBoard()}
    function renderBoard(){const pages=Math.max(1,Math.ceil(state.filteredBoard.length/PAGE_SIZE));state.numberPage=Math.max(0,Math.min(state.numberPage,pages-1));rememberNumberPage();const items=state.filteredBoard.slice(state.numberPage*PAGE_SIZE,state.numberPage*PAGE_SIZE+PAGE_SIZE);qs("#adminNumberGrid").innerHTML=items.map(i=>`<button class="number-button ${statusClass[i.status]||"blocked"}" data-number="${esc(i.number)}" title="${esc(i.status)} · ${esc(i.owner||"")}">${esc(i.number)}</button>`).join("")||'<div class="empty">No hay números en este filtro.</div>';qs("#adminNumberPageLabel").textContent=`Página ${state.numberPage+1} de ${pages}`;qs("#adminNumberPrev").disabled=state.numberPage<=0;qs("#adminNumberNext").disabled=state.numberPage>=pages-1;qsa("[data-number]").forEach(b=>b.onclick=()=>openNumber(b.dataset.number))}
    function searchNumber(){const raw=qs("#adminNumberSearch").value.replace(/\D/g,"");const item=state.board.find(i=>Number(i.number)===Number(raw));if(!item)return toast("Número no encontrado.","error");qs("#numberStatusFilter").value="";state.filteredBoard=state.board;const index=state.board.indexOf(item);state.numberPage=Math.floor(index/PAGE_SIZE);renderBoard();openNumber(item.number)}
    function openNumber(number){
      state.selectedNumber=number;const item=state.board.find(x=>x.number===number);const p=item.participant;
      qs("#numberModalTitle").textContent=`Número ${number}`;
      qs("#numberModalInfo").innerHTML=`<p>Estado: ${badge(item.status)}</p><div class="number-detail-grid"><div><strong>Cliente</strong><br>${esc(p?.fullName||item.owner||'Sin participante')}</div><div><strong>WhatsApp</strong><br>${esc(p?.phone||'—')}</div><div><strong>Correo</strong><br>${esc(p?.email||'—')}</div><div><strong>Documento</strong><br>${esc(p?.identityNumber||'—')}</div><div><strong>Departamento</strong><br>${esc(p?.city||'—')}</div><div><strong>Código</strong><br>${esc(p?.code||item.code||'—')}</div><div><strong>Método</strong><br>${esc(p?.paymentMethod||'—')}</div><div><strong>Fecha</strong><br>${esc(p?.createdAt||item.updatedAt||'—')}</div></div>${p?.proofUrl?`<button class="btn dark small" id="numberProofButton">Ver comprobante</button>`:''}<p class="help">${esc(item.notes||'')}</p>`;
      const available=item.status==='DISPONIBLE',blocked=item.status==='BLOQUEADO';qs('#assignNumber').hidden=!available;qs('#blockNumber').hidden=!available;qs('#releaseNumber').hidden=!blocked;
      qs("#numberModal").showModal();if(p?.proofUrl)qs('#numberProofButton').onclick=()=>openProof(p.proofUrl);
    }
    async function numberAction(action){
      const pageBeforeAction=Math.max(0,Number(state.numberPage)||0);
      const raffleBeforeAction=state.raffleId;
      const numberBeforeAction=String(state.selectedNumber||'');
      rememberNumberPage();
      let participant={};
      if(action==="ASSIGN"){
        participant={fullName:prompt("Nombre completo")||"",phone:prompt("WhatsApp")||"",email:prompt("Correo")||"",city:prompt("Departamento")||"",identityNumber:prompt("Cédula")||""};
        if(!participant.fullName||!participant.phone)return;
      }
      const notes=prompt("Observaciones","")??"";
      const d=await api("adminNumberAction",{raffleId:raffleBeforeAction,number:numberBeforeAction,numberAction:action,participant,notes});
      if(!d.ok)throw new Error(d.error);
      qs("#numberModal").close();
      toast("Número actualizado.");
      if(raffleBeforeAction===state.raffleId){
        state.numberPage=pageBeforeAction;
        state.numberPageRaffleId=raffleBeforeAction;
        rememberNumberPage();
        await loadBoard({preservePage:true,targetPage:pageBeforeAction,restoreNumber:numberBeforeAction});
      }
    }


    async function bulkNumberAction(action){
      const pageBeforeAction=Math.max(0,Number(state.numberPage)||0);
      const raffleBeforeAction=state.raffleId;
      rememberNumberPage();
      const numbers=qs('#bulkNumbers').value.trim();
      if(!numbers)return toast('Escribe los números.','error');
      if(!confirm('¿Aplicar la acción masiva?'))return;
      const d=await api('adminBulkNumberAction',{raffleId:raffleBeforeAction,numbers,numberAction:action,notes:qs('#bulkNotes').value.trim()});
      if(!d.ok)throw new Error(d.error);
      qs('#bulkNumbers').value='';qs('#bulkNotes').value='';
      toast(`${d.changed.length} números actualizados${d.skipped.length?` y ${d.skipped.length} omitidos`:''}.`);
      if(raffleBeforeAction===state.raffleId){
        state.numberPage=pageBeforeAction;
        state.numberPageRaffleId=raffleBeforeAction;
        rememberNumberPage();
        await loadBoard({preservePage:true,targetPage:pageBeforeAction});
      }
    }
    async function releaseExpiredReservations(){
      const pageBeforeAction=Math.max(0,Number(state.numberPage)||0);
      const raffleBeforeAction=state.raffleId;
      rememberNumberPage();
      const d=await api('adminReleaseReservations',{raffleId:raffleBeforeAction});
      if(!d.ok)throw new Error(d.error);
      toast(`Se liberaron ${d.released} reservas vencidas.`);
      if(raffleBeforeAction===state.raffleId){
        state.numberPage=pageBeforeAction;
        state.numberPageRaffleId=raffleBeforeAction;
        rememberNumberPage();
        await loadBoard({preservePage:true,targetPage:pageBeforeAction});
      }
    }

    function liveOrdinal(index){const names=['PRIMER','SEGUNDO','TERCER','CUARTO','QUINTO','SEXTO','SÉPTIMO','OCTAVO'];return names[index]||`${index+1}°`}
    function stopLiveAnimation(){if(state.liveSpinTimer){clearInterval(state.liveSpinTimer);state.liveSpinTimer=null}}
    function liveTicketRange(){
      const pool=(state.liveSession?.eligibleTickets||state.liveSetup?.eligibleTicketNumbers||[]).map(String).filter(Boolean);
      const fallbackTotal=Math.max(1,Math.floor(Number(state.liveSetup?.raffle?.maxTicketNumber||state.liveSetup?.raffle?.totalTickets||state.liveSession?.totalTickets||1)));
      const digitCount=Math.max(3,Math.floor(Number(state.liveSession?.digitCount||state.liveSetup?.raffle?.digitCount||String(fallbackTotal).length)));
      return {total:fallbackTotal,digitCount,pool};
    }
    function randomLiveTicketDigits(){
      const {total,digitCount,pool}=liveTicketRange();
      const ticket=pool.length?pool[Math.floor(Math.random()*pool.length)]:(1+Math.floor(Math.random()*total));
      return String(ticket).padStart(digitCount,'0').split('').map(value=>({value,frozen:false}));
    }
    function firstLiveTicketDigits(){
      const {digitCount}=liveTicketRange();
      return String(1).padStart(digitCount,'0').split('').map(value=>({value,frozen:false}));
    }
    function renderLiveReels(){
      const count=state.liveSetup?.raffle?.digitCount||3;
      const digits=state.liveDigits.length?state.liveDigits:Array.from({length:count},()=>({value:'0',frozen:false}));
      const container=qs('#liveReels');
      if(container.children.length!==digits.length){
        container.innerHTML=digits.map(()=>'<div class="live-reel spinning">0</div>').join('');
      }
      digits.forEach((digit,index)=>{
        const reel=container.children[index];
        const value=String(digit.value??'0');
        if(reel.textContent!==value)reel.textContent=value;
        reel.className=`live-reel ${digit.frozen?'frozen':'spinning'}`;
      });
    }
    function startLiveAnimation(){
      stopLiveAnimation();
      state.liveSpinTimer=setInterval(()=>{
        state.liveDigits=randomLiveTicketDigits();
        renderLiveReels();
      },75);
    }
    function renderLiveStats(stats){
      const values=[['Tickets aprobados',stats.approvedTickets||0],['Marcados vendidos',stats.soldTickets||0],['Elegibles',stats.eligibleTickets||0],['Participantes',stats.participantRows||0],['Aprobados sin migrar',stats.approvedNotSold||0],['Vendidos adicionales incluidos',stats.soldWithoutApproved||0]];
      qs('#liveStats').innerHTML=values.map(([label,value])=>`<article class="live-stat"><strong>${esc(value)}</strong><small>${esc(label)}</small></article>`).join('');
    }
    function renderLiveWinners(winners){
      const list=(Array.isArray(winners)?winners:[]).map(w=>({
        ...w,
        ticket:String(w?.ticket||w?.winnerTicket||'---'),
        fullName:String(w?.fullName||'Titular no registrado'),
        maskedPhone:String(w?.maskedPhone||'No registrado')
      }));
      state.liveWinners=list;
      const card=w=>`<article class="live-winner-card"><img alt="${esc(w.prizeName)}" data-image-source="${esc(w.prizeImageUrl||'')}" data-prize-id="${esc(w.prizeId||'')}" data-fallback="${esc(prizeFallback({order:w.prizeOrder}))}" src="${esc(safeImageUrl(w.prizeImageUrl,prizeFallback({order:w.prizeOrder})))}"/><div class="meta"><small>Premio ${esc(w.prizeOrder)}</small><strong>${esc(w.prizeName)}</strong><span class="ticket">Ticket ganador: ${esc(w.ticket)}</span><p>${esc(w.fullName)}</p><p>WhatsApp: ${esc(w.maskedPhone)}</p></div></article>`;
      qs('#liveWinnersList').innerHTML=list.length?list.map(card).join(''):'<div class="empty" style="grid-column:1/-1">Aún no se registraron ganadores.</div>';
      const stageList=qs('#liveStageWinnersList');
      const stageSidebar=qs('#liveWinnerSidebar',false);
      if(stageSidebar){
        stageSidebar.classList.toggle('has-winners',list.length>0);
        stageSidebar.style.setProperty('--winner-count',String(Math.min(list.length,5)));
      }
      if(stageList){
        stageList.innerHTML=list.length?list.map(w=>`<article class="live-stage-winner-mini"><img alt="${esc(w.prizeName)}" class="live-stage-winner-prize-thumb" data-image-source="${esc(w.prizeImageUrl||'')}" data-prize-id="${esc(w.prizeId||'')}" data-fallback="${esc(prizeFallback({order:w.prizeOrder}))}" src="${esc(safeImageUrl(w.prizeImageUrl,prizeFallback({order:w.prizeOrder})))}"/><small>Premio ${esc(w.prizeOrder)}</small><strong>${esc(w.prizeName)}</strong><span>Ticket ganador: ${esc(w.ticket)}</span><div class="live-stage-winner-person"><em>GANADOR</em><b>${esc(w.fullName)}</b></div><p class="live-stage-winner-phone">WhatsApp: ${esc(w.maskedPhone)}</p></article>`).join(''):'<div class="live-stage-winners-empty">Los ganadores aparecerán aquí.</div>';
        installAdminImageFallback(stageList);
      }
      installAdminImageFallback(qs('#liveWinnersList'));
      const next=qs('#liveSidebarNextPrize',false);
      if(next)next.hidden=true;
    }
    function updateLivePrizePreview(prizeId=''){
      const prizes=state.liveAvailablePrizes||[];
      const prize=prizes.find(p=>String(p.id)===String(prizeId))||null;
      const img=qs('#livePrizePreviewImage',false),name=qs('#livePrizePreviewName',false);
      if(img)setResilientImage(img,prize?.imageUrl||'',prize?prizeFallback(prize):'assets/rifa-solidaria-2026.png',prize?.id||'',prize?.name||'Fotografía del premio');
      if(name)name.textContent=prize?`${prize.order}. ${prize.name}`:'Fotografía del premio';
    }
    function renderLivePrizeOptions(prizes,keep=''){
      const available=(prizes||[]).filter(p=>!p.drawn&&p.status!=='DESACTIVADO');const select=qs('#livePrizeSelect');
      state.liveAvailablePrizes=available;
      select.innerHTML='<option value="">Seleccionar premio</option>'+available.map(p=>`<option value="${esc(p.id)}">${esc(p.order)}. ${esc(p.name)}</option>`).join('');
      if(keep&&available.some(p=>String(p.id)===String(keep)))select.value=String(keep);
      select.disabled=!state.liveMigrationReady||Boolean(state.liveSession);
      qs('#liveWinnerAt').disabled=!state.liveMigrationReady||Boolean(state.liveSession);
      qs('#liveStartDraw').disabled=!state.liveMigrationReady||!select.value||Boolean(state.liveSession);
      updateLivePrizePreview(select.value||'');
    }
    function ensureLiveVideoPlayback(){
      const video=qs('#liveStageVideo',false);if(!video||video.hidden)return;
      video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;
      const play=()=>video.play().catch(()=>{});
      video.oncanplay=play;video.onloadeddata=play;play();
    }
    function applyLiveBackground(url,type='IMAGEN'){
      const stage=qs('#liveStage'),video=qs('#liveStageVideo');if(!stage||!video)return;
      const mediaType=String(type).toUpperCase()==='VIDEO'?'VIDEO':'IMAGEN';
      stage.dataset.bgType=mediaType.toLowerCase();
      if(mediaType==='VIDEO'&&url){
        const videoUrl=resolveStageVideoUrl(url);
        video.pause();
        video.hidden=false;
        video.style.display='block';
        video.muted=true;
        video.defaultMuted=true;
        video.loop=true;
        video.autoplay=true;
        video.playsInline=true;
        video.setAttribute('muted','');
        video.setAttribute('autoplay','');
        video.setAttribute('playsinline','');
        video.setAttribute('webkit-playsinline','');
        video.preload='auto';
        if(video.src!==videoUrl)video.src=videoUrl;
        video.load();
        video.onerror=()=>{console.warn('[Sorteos Utopía] No se pudo cargar el video del sorteo en vivo:',videoUrl);stage.dataset.bgType='image';stage.style.backgroundImage='linear-gradient(180deg,rgba(1,16,39,.35),rgba(1,28,57,.58)),url("assets/sorteos-en-vivo-utopia.png")';};
        stage.style.backgroundImage='linear-gradient(180deg,rgba(1,16,39,.14),rgba(1,28,57,.34))';
        ensureLiveVideoPlayback();
      } else {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.hidden=true;
        video.style.display='none';
        const imageUrl=safeImageUrl(url||'assets/sorteos-en-vivo-utopia.png','assets/sorteos-en-vivo-utopia.png');
        stage.style.backgroundImage=`linear-gradient(180deg,rgba(1,16,39,.35),rgba(1,28,57,.66)),url("${imageUrl}")`;
      }
    }
        async function applyStoredLiveBackground(raffle){
      const type=String(raffle?.liveBackgroundType||'IMAGEN').toUpperCase()==='VIDEO'?'VIDEO':'IMAGEN';
      const url=String(raffle?.liveBackgroundUrl||'').trim();
      if(type==='VIDEO'){
        const local=await loadLocalLiveMedia(raffle?.id||state.liveRaffleId);
        const localServer=String(local?.serverUrl||'');const sameRemote=localServer===url||(driveFileId(localServer)&&driveFileId(localServer)===driveFileId(url));const localMatches=local&&local.blob&&(!url||url.startsWith('LOCAL_MEDIA:')||sameRemote);
        if(localMatches){applyLiveBackground(useLiveObjectUrl(local.blob),'VIDEO');return true;}
      }
      applyLiveBackground(url,type);
      return false;
    }
    async function prepareLiveBackground(){
      const file=qs('#liveBackgroundFile').files[0];if(!file)throw new Error('Selecciona una imagen o video.');
      const button=qs('#livePrepareBackground');button.disabled=true;qs('#liveApplyBackground').disabled=true;qs('#liveBackgroundReady').hidden=true;
      const isVideo=String(file.type||'').startsWith('video/');
      let previewUrl='';
      try{
        if(isVideo){
          previewUrl=useLiveObjectUrl(file);
          applyLiveBackground(previewUrl,'VIDEO');
          await saveLocalLiveMedia(state.liveRaffleId,file,'');
          qs('#liveBackgroundReadyText').textContent='Video cargado en este equipo. Creando respaldo…';
          qs('#liveBackgroundReady').hidden=false;
        }
        let uploaded=null;
        try{uploaded=await uploadMedia(file);}catch(uploadError){
          if(!isVideo)throw uploadError;
          console.warn('[Sorteos Utopía] El respaldo remoto del video falló; se usará el archivo local:',uploadError);
        }
        const savedUrl=uploaded?.url||`LOCAL_MEDIA:${state.liveRaffleId}`;
        state.liveBackgroundDraft={url:savedUrl,type:isVideo?'VIDEO':(uploaded?.type||'IMAGEN'),name:file.name,previewUrl:isVideo?previewUrl:(uploaded?.url||''),localOnly:isVideo&&!uploaded};
        if(isVideo){await updateLocalLiveMediaServerUrl(state.liveRaffleId,savedUrl);applyLiveBackground(previewUrl,'VIDEO');}
        else applyLiveBackground(uploaded.url,uploaded.type);
        qs('#liveBackgroundReadyText').textContent=isVideo
          ?(uploaded?'Video listo: se reproducirá desde este equipo y quedó respaldado.':'Video listo para usar en este equipo. El respaldo remoto no se completó.')
          :`${file.name} está listo para aplicar`;
        qs('#liveBackgroundReady').hidden=false;qs('#liveApplyBackground').disabled=false;
        toast(isVideo?'Video preparado y reproduciéndose.':'Fondo preparado. Revisa la vista y presiona Aplicar fondo.');
      }finally{button.disabled=false;}
    }
    async function applyLiveBackgroundDraft(){
      if(!state.liveBackgroundDraft)throw new Error('Primero prepara una imagen o video.');
      const button=qs('#liveApplyBackground');button.disabled=true;
      try{
        const draft=state.liveBackgroundDraft;
        const d=await api('adminSaveLiveBackground',{raffleId:state.liveRaffleId,liveBackgroundUrl:draft.url,liveBackgroundType:draft.type});
        if(!d.ok)throw new Error(d.error);
        if(draft.type==='VIDEO'){
          await updateLocalLiveMediaServerUrl(state.liveRaffleId,draft.url);
          if(draft.previewUrl)applyLiveBackground(draft.previewUrl,'VIDEO');else await applyStoredLiveBackground({id:state.liveRaffleId,liveBackgroundUrl:draft.url,liveBackgroundType:'VIDEO'});
        }else{
          await deleteLocalLiveMedia(state.liveRaffleId);
          applyLiveBackground(draft.url,draft.type);
        }
        state.liveBackgroundLoadedRaffleId=state.liveRaffleId;
        state.liveBackgroundDraft=null;qs('#liveBackgroundFile').value='';
        qs('#liveBackgroundReadyText').textContent=draft.type==='VIDEO'?'Video aplicado y listo para utilizar.':'Fondo aplicado correctamente';
        qs('#liveBackgroundReady').hidden=false;invalidateViews('liveDraw','reports');state.loadedAt.liveDraw=Date.now();
        toast(draft.type==='VIDEO'?'Video de fondo aplicado.':'Fondo del sorteo aplicado.');
      }catch(error){button.disabled=false;throw error;}
    }
    async function loadLiveDraw(preserveWinner=false){
      const current=state.liveRaffleId||state.raffleId||state.raffles[0]?.id||'';
      const selector=qs('#liveRaffleSelect');
      selector.innerHTML=state.raffles.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.status)}</option>`).join('');
      if(state.raffles.some(r=>r.id===current))selector.value=current;
      state.liveRaffleId=selector.value||current;
      if(!state.liveRaffleId)throw new Error('No existe un sorteo para realizar la dinámica.');
      if(!state.liveBackgroundDraft)qs('#liveBackgroundReady').hidden=true;
      const previousPrize=qs('#livePrizeSelect').value;
      const d=await api('adminLiveDrawSetup',{raffleId:state.liveRaffleId});
      if(!d.ok)throw new Error(d.error);
      if(!preserveWinner)state.liveCurrentWinner=null;
      state.liveSetup=d;
      state.liveMigrationReady=Boolean(d.migrationReady);
      qs('#liveRaffleTitle').textContent=d.raffle?.name||'Sorteo Utopía';
      setLiveStageBrand(d.raffle?.organization||'Fundación Utopía');
      if(state.liveBackgroundLoadedRaffleId!==state.liveRaffleId){
        await applyStoredLiveBackground(d.raffle||{});
        state.liveBackgroundLoadedRaffleId=state.liveRaffleId;
      }else{
        ensureLiveVideoPlayback();
      }
      const winnerAtInput=qs('#liveWinnerAt');
      if(!winnerAtInput.dataset.restoredFor||winnerAtInput.dataset.restoredFor!==state.liveRaffleId){
        winnerAtInput.value=String(savedLiveWinnerAt(state.liveRaffleId));
        winnerAtInput.dataset.restoredFor=state.liveRaffleId;
      }
      renderLiveStats(d.stats||{});
      renderLivePrizeOptions(d.prizes||[],previousPrize);
      renderLiveWinners(d.winners||[]);
      qs('#livePrepareBackground').disabled=false;
      qs('#liveApplyBackground').disabled=!state.liveBackgroundDraft;
      qs('#liveFullscreen').disabled=false;
      qs('#liveDownloadMigrated').disabled=!state.liveMigrationReady;
      qs('#liveMigrationMessage').textContent=state.liveMigrationReady?'Tickets válidos listos. La configuración se conserva entre premios: selecciona el premio e inicia la dinámica.':'Migra los tickets válidos antes de continuar.';
      if(!state.liveSession){
        state.liveDigits=firstLiveTicketDigits();
        state.liveBurned=state.liveBurnedAll||[];
        renderLiveReels();
        renderLiveBurned();
        const reveal=qs('#liveRevealDigit');
        reveal.hidden=false;reveal.disabled=true;reveal.textContent='DETENER';
        qs('#liveCancelDraw').disabled=true;
        qs('#liveProgress').textContent='';
        qs('#liveControlCode').textContent='';
        qs('#liveWinnerCard').hidden=true;
        const next=qs('#liveSidebarNextPrize',false);if(next)next.hidden=true;
      }
    }
    function renderLiveBurned(){const el=qs('#liveBurnedList');const burned=Array.from(new Set(state.liveBurnedAll||state.liveBurned||[]));state.liveBurnedAll=burned;state.liveBurned=burned;el.innerHTML=burned.length?burned.map(ticket=>`<span>${esc(ticket)}</span>`).join(''):'<span>Ninguno</span>'; }
    async function syncLiveTickets(){
      const button=qs('#liveSyncTickets');button.disabled=true;const downloadButton=qs('#liveDownloadMigrated',false);if(downloadButton)downloadButton.disabled=true;
      try{const d=await api('adminLiveDrawSync',{raffleId:state.liveRaffleId});if(!d.ok)throw new Error(d.error);state.liveSetup=d;state.liveMigrationReady=Boolean(d.migrationReady??((d.stats?.eligibleTickets||0)>0&&(d.stats?.approvedNotSold||0)===0));renderLiveStats(d.stats||{});renderLivePrizeOptions(d.prizes||[],'');renderLiveWinners(d.winners||[]);const m=d.migration||{};qs('#liveMigrationMessage').textContent=`Migración completada: ${m.synchronized||0} actualizados, ${m.alreadySold||0} ya estaban vendidos. ${state.liveMigrationReady?'Ya puedes descargar la lista migrada y configurar el sorteo.':'No existen tickets elegibles todavía.'}`;qs('#livePrepareBackground').disabled=false;qs('#liveApplyBackground').disabled=!state.liveBackgroundDraft;qs('#liveFullscreen').disabled=false;if(downloadButton)downloadButton.disabled=!state.liveMigrationReady;toast('Tickets válidos sincronizados.');}finally{button.disabled=false;}
    }
    async function downloadMigratedTickets(){
      if(!state.liveMigrationReady)throw new Error('Primero migra los tickets válidos.');
      const button=qs('#liveDownloadMigrated');button.disabled=true;
      try{
        const d=await api('adminLiveDrawMigrationExport',{raffleId:state.liveRaffleId});
        if(!d.ok)throw new Error(d.error||'No se pudo preparar la lista migrada.');
        const rows=Array.isArray(d.rows)?d.rows:[];
        if(!rows.length)throw new Error('No existen tickets migrados para descargar.');
        const headers=['N°','Ticket','Nombre completo','WhatsApp','Correo','Departamento / ciudad','Documento','Método de pago','Estado de pago','Código de participación','Estado del ticket','Origen','Condición'];
        const body=rows.map(row=>`<tr><td>${esc(row.order)}</td><td style="mso-number-format:'\@'">${esc(row.ticket)}</td><td>${esc(row.fullName)}</td><td style="mso-number-format:'\@'">${esc(row.phone)}</td><td>${esc(row.email)}</td><td>${esc(row.city)}</td><td style="mso-number-format:'\@'">${esc(row.identityNumber)}</td><td>${esc(row.paymentMethod)}</td><td>${esc(row.paymentStatus)}</td><td>${esc(row.participationCode)}</td><td>${esc(row.numberStatus)}</td><td>${esc(row.origin)}</td><td>${esc(row.condition)}</td></tr>`).join('');
        const info=`<table border="1"><tr><th>Sorteo</th><td colspan="12">${esc(d.raffle?.name||'')}</td></tr><tr><th>Estado</th><td colspan="12">${esc(d.raffle?.status||'')}</td></tr><tr><th>Fecha del sorteo</th><td colspan="12">${esc(d.raffle?.drawDate||'')}</td></tr><tr><th>Lista generada</th><td colspan="12">${esc(d.generatedAt||'')}</td></tr><tr><th>Total migrado</th><td colspan="12">${esc(d.total||rows.length)}</td></tr></table><br>`;
        const table=`<table border="1"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
        const filename=String(d.raffle?.name||'sorteo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||'sorteo';
        download(`lista-migrada-${filename}.xls`,`<html><head><meta charset="utf-8"></head><body><h2>Lista de tickets migrados para el sorteo</h2>${info}${table}</body></html>`,'application/vnd.ms-excel;charset=utf-8');
        toast(`Lista migrada descargada: ${rows.length} tickets.`);
      }finally{button.disabled=!state.liveMigrationReady;}
    }
    function lockLiveControls(locked){qs('#liveRaffleSelect').disabled=locked;qs('#livePrizeSelect').disabled=locked||!state.liveMigrationReady;qs('#liveWinnerAt').disabled=locked||!state.liveMigrationReady;qs('#liveSyncTickets').disabled=locked;qs('#liveDownloadMigrated').disabled=locked||!state.liveMigrationReady;qs('#liveStartDraw').disabled=locked||!state.liveMigrationReady||!qs('#livePrizeSelect').value;qs('#liveCancelDraw').disabled=!locked;qs('#livePrepareBackground').disabled=locked;qs('#liveApplyBackground').disabled=locked||!state.liveBackgroundDraft;qs('#liveFullscreen').disabled=false;}
    async function startLiveDraw(){
      if(!state.liveMigrationReady)throw new Error('Primero migra los tickets válidos.');
      const prizeId=qs('#livePrizeSelect').value;
      if(!prizeId)throw new Error('Selecciona un premio.');
      rememberLiveWinnerAt();
      const winnerAt=Math.max(1,Number(qs('#liveWinnerAt').value||1));
      if(state.liveRunConfirmedRaffleId!==state.liveRaffleId){
        if(!confirm(`¿Iniciar el sorteo? La configuración quedará activa para todos los premios y el ganador será el número ${winnerAt} que salga.`))return;
        state.liveRunConfirmedRaffleId=state.liveRaffleId;
      }
      const d=await api('adminLiveDrawStart',{raffleId:state.liveRaffleId,prizeId,winnerAt});
      if(!d.ok)throw new Error(d.error);
      state.liveSession={token:d.drawToken,digitCount:d.digitCount,totalTickets:d.totalTickets||state.liveSetup?.raffle?.maxTicketNumber||state.liveSetup?.raffle?.totalTickets||1,eligibleTickets:d.eligibleTickets||state.liveSetup?.eligibleTicketNumbers||[],prize:d.prize,controlCode:d.controlCode,winnerAt:d.winnerAt,current:0};
      state.liveCurrentWinner=null;
      state.liveDigits=randomLiveTicketDigits();
      state.liveBurned=state.liveBurnedAll||[];
      renderLiveBurned();
      renderLiveWinners(state.liveWinners);
      qs('#liveWinnerCard').hidden=true;
      const winnerTicket=qs('#liveWinnerTicket',false);if(winnerTicket)winnerTicket.textContent='---';
      const reveal=qs('#liveRevealDigit');
      reveal.hidden=false;reveal.disabled=false;reveal.textContent='DETENER';
      const next=qs('#liveSidebarNextPrize',false);if(next)next.hidden=true;
      lockLiveControls(true);
      qs('#liveProgress').textContent='';
      qs('#liveControlCode').textContent='';
      ensureLiveVideoPlayback();
      startLiveAnimation();
      toast('Dinámica iniciada.');
    }
    async function revealLiveDigit(){
      if(!state.liveSession)return;
      const button=qs('#liveRevealDigit');
      const sessionToken=state.liveSession.token;
      button.disabled=true;
      stopLiveAnimation();
      try{
        const d=await api('adminLiveDrawReveal',{drawToken:sessionToken});
        if(!d.ok)throw new Error(d.error);
        if(!state.liveSession||state.liveSession.token!==sessionToken)return;
        state.liveDigits=String(d.ticket).padStart(state.liveSession.digitCount,'0').split('').map(value=>({value,frozen:true}));
        renderLiveReels();
        state.liveSession.current=d.drawNumber;
        if(d.completed){
          const w=d.winner||{};
          const finishedPrizeId=String(w.prizeId||state.liveSession.prize?.id||'');
          state.liveCurrentWinner=w;
          state.liveSession=null;
          button.textContent='GANADOR DEFINIDO';
          button.disabled=true;
          button.hidden=true;
          qs('#liveCancelDraw').disabled=true;
          const winnerTicket=qs('#liveWinnerTicket',false);if(winnerTicket)winnerTicket.textContent=String(w.ticket||d.ticket||'---');
          qs('#liveWinnerName').textContent=w.fullName||'Titular no registrado';
          qs('#liveWinnerPhone').textContent=w.maskedPhone||'No registrado';
          qs('#liveWinnerCard').hidden=false;
          const immediateWinner={...w,ticket:String(w.ticket||d.ticket||'---'),prizeImageUrl:w.prizeImageUrl||prizeFallback({order:w.prizeOrder})};
          const merged=[...state.liveWinners.filter(item=>String(item.prizeId)!==finishedPrizeId),immediateWinner].sort((a,b)=>Number(a.prizeOrder||0)-Number(b.prizeOrder||0));
          renderLiveWinners(merged);
          qs('#liveProgress').textContent='Ganador registrado. Selecciona el siguiente premio y pulsa “Iniciar dinámica”.';
          toast('¡Ganador registrado! La configuración y el fondo se mantienen.');
          const refresh=await api('adminLiveDrawSetup',{raffleId:state.liveRaffleId});
          if(refresh.ok){
            state.liveSetup=refresh;
            state.liveMigrationReady=Boolean(refresh.migrationReady);
            renderLiveStats(refresh.stats||{});
            renderLiveWinners(refresh.winners||merged);
            renderLivePrizeOptions(refresh.prizes||[],'');
          }else{
            renderLivePrizeOptions((state.liveAvailablePrizes||[]).filter(p=>String(p.id)!==finishedPrizeId),'');
          }
          lockLiveControls(false);
          qs('#livePrizeSelect').value='';
          qs('#liveStartDraw').disabled=true;
          updateLivePrizePreview('');
          ensureLiveVideoPlayback();
        }else{
          state.liveBurnedAll=Array.from(new Set([...(state.liveBurnedAll||[]),d.ticket]));
          state.liveBurned=state.liveBurnedAll;
          renderLiveBurned();
          for(let remaining=10;remaining>0;remaining--){
            if(!state.liveSession||state.liveSession.token!==sessionToken)return;
            button.textContent=`SIGUIENTE NÚMERO EN ${remaining} s`;
            qs('#liveProgress').textContent='';
            await new Promise(resolve=>setTimeout(resolve,1000));
          }
          if(!state.liveSession||state.liveSession.token!==sessionToken)return;
          state.liveDigits=randomLiveTicketDigits();
          renderLiveReels();
          ensureLiveVideoPlayback();
          startLiveAnimation();
          button.disabled=false;
          button.textContent='DETENER';
          qs('#liveProgress').textContent='';
        }
      }catch(e){
        if(state.liveSession&&state.liveSession.token===sessionToken){
          ensureLiveVideoPlayback();
          startLiveAnimation();
          button.disabled=false;
          button.textContent='DETENER';
        }
        throw e;
      }
    }
    async function cancelLiveDraw(){
      if(!state.liveSession)return;if(!confirm('¿Cancelar esta sesión? Aún no se guardará un ganador.'))return;
      await api('adminLiveDrawCancel',{drawToken:state.liveSession.token});stopLiveAnimation();state.liveSession=null;state.liveCurrentWinner=null;lockLiveControls(false);await loadLiveDraw();toast('Sesión cancelada.','error');
    }
    async function nextLivePrize(){
      stopLiveAnimation();
      state.liveSession=null;
      state.liveCurrentWinner=null;
      state.liveBurned=state.liveBurnedAll||[];
      lockLiveControls(false);
      qs('#liveWinnerCard').hidden=true;
      const reveal=qs('#liveRevealDigit');
      reveal.hidden=false;reveal.disabled=true;reveal.textContent='DETENER';
      const next=qs('#liveSidebarNextPrize',false);if(next)next.hidden=true;
      renderLiveWinners(state.liveWinners);
      ensureLiveVideoPlayback();
      toast('Selecciona el siguiente premio. El fondo y la configuración se conservaron.');
    }

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

    function clearCurrentReport(message="Selecciona un sorteo activo para ver su reporte operativo."){
      state.report=null;
      qs('#reportRaffleConfig').innerHTML=`<div class="empty report-empty-wide">${esc(message)}</div>`;
      qs('#reportContent').innerHTML='';
      ['#reportNumberStatuses','#reportPaymentStatuses','#reportDepartments','#reportMethods'].forEach(id=>{qs(id).innerHTML='<div class="empty">Sin datos.</div>'});
      ['#reportCsv','#reportExcel','#reportPrint'].forEach(id=>{const button=qs(id);if(button)button.disabled=true});
    }
    function renderDeletedReports(items){
      state.deletedReports=items||[];
      const root=qs('#deletedReportsList');
      if(!root)return;
      root.innerHTML=state.deletedReports.length?state.deletedReports.map(item=>{
        const summary=item.summary||{};
        const stats=[
          `${Number(summary.totalTickets||0)} números`,
          `${Number(summary.sold||0)} vendidos`,
          `${Number(summary.participants||0)} pedidos`,
          `${Number(summary.winners||0)} ganadores`,
          summary.revenue||''
        ].filter(Boolean).join(' · ');
        return `<article class="deleted-report-card"><div><small>INFORME HISTÓRICO CERRADO</small><h3>${esc(item.raffleName||'Sorteo eliminado')}</h3><p>Eliminado: ${esc(item.deletedAt||'')} · Por: ${esc(item.deletedBy||'')}</p><span>${esc(stats)}</span></div><a class="btn green" href="${esc(item.downloadUrl||'#')}" target="_blank" rel="noopener">Descargar informe ZIP</a></article>`;
      }).join(''):'<div class="empty">Todavía no se eliminaron sorteos.</div>';
    }
    async function loadReports(){
      const requests=[api("adminDeletedReports")];
      if(state.raffleId)requests.unshift(api("adminReport",{raffleId:state.raffleId}));
      const responses=await Promise.all(requests);
      const deletedResponse=responses[responses.length-1];
      if(!deletedResponse?.ok)throw new Error(deletedResponse?.error||'No se pudieron cargar los informes históricos.');
      renderDeletedReports(deletedResponse.reports||[]);
      if(!state.raffleId){clearCurrentReport('No existe un sorteo operativo seleccionado. Los sorteos eliminados solo permanecen en el historial inferior.');return;}
      const d=responses[0];
      if(!d?.ok)throw new Error(d?.error||'No se pudo cargar el reporte del sorteo.');
      state.report=d;
      ['#reportCsv','#reportExcel','#reportPrint'].forEach(id=>{const button=qs(id);if(button)button.disabled=false});
      const c=d.raffleConfig||{};
      qs('#reportRaffleConfig').innerHTML=`<div><small>Sorteo seleccionado</small><strong>${esc(c.name||state.raffleId)}</strong><span>${esc(c.id||'')} · ${esc(c.status||'')}</span></div><div><small>Configuración</small><strong>${esc(c.totalTickets||0)} números · ${esc(c.ticketPrice||'')}</strong><span>Reserva: ${esc(c.reservationMinutes||0)} min · Actualización: ${esc(c.publicRefreshSeconds||0)} s</span></div><div><small>Fecha y publicación</small><strong>${esc(c.drawDate||'Sin fecha')}</strong><span>${c.published===true||c.published==='SI'?'Visible públicamente':'Oculto'} · Fondo público: ${esc(c.publicBackgroundType||'')}</span></div><div><small>Métodos de pago</small><strong>${esc(c.paymentMethods||'No configurados')}</strong><span>Fondo sorteo en vivo: ${esc(c.liveBackgroundType||'')}</span></div>`;
      qs("#reportContent").innerHTML=Object.entries(d.summary||{}).map(([k,v])=>`<article class="report-card"><small>${esc(k)}</small><strong>${esc(v)}</strong></article>`).join("");
      const render=(id,items)=>qs(id).innerHTML=(items||[]).map(i=>`<div class="status-row"><span>${esc(i.label)}</span><strong>${esc(i.value??i.count??0)}</strong></div>`).join("")||'<div class="empty">Sin datos.</div>';
      render('#reportNumberStatuses',d.numberStatuses);render('#reportPaymentStatuses',d.paymentStatuses);render('#reportDepartments',d.departments);render('#reportMethods',d.paymentMethods)
    }
    function reportRows(){const config=state.report?.raffleConfig||{};return [["CONFIGURACIÓN DEL SORTEO",""],...Object.entries(config),["",""],["INDICADORES",""],...Object.entries(state.report?.summary||{})]}
    function reportCsv(){if(!state.report)return toast('No hay un sorteo operativo seleccionado.','error');const rows=[["Indicador","Valor"],...reportRows()];download(`reporte-${state.raffleId||'sorteo'}.csv`,rows.map(r=>r.map(c=>`"${String(c??'').replaceAll('"','""')}"`).join(",")).join("\n"),"text/csv;charset=utf-8")}
    function reportExcel(){if(!state.report)return toast('No hay un sorteo operativo seleccionado.','error');const rows=reportRows().map(([k,v])=>`<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("");download(`reporte-${state.raffleId||'sorteo'}.xls`,`<html><meta charset="utf-8"><table border="1"><tr><th>Indicador</th><th>Valor</th></tr>${rows}</table></html>`,"application/vnd.ms-excel;charset=utf-8")}

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
      qs("#adminRaffleSelect").onchange=e=>{state.raffleId=e.target.value;state.numberPage=savedNumberPage(state.raffleId);state.numberPageRaffleId=state.raffleId;state.publicBackgroundDraft=null;state.ticketBoardBackgroundDraft=null;updatePublicPageLink();refreshView(state.currentView,true)};
      qs("#raffleForm").onsubmit=saveRaffle;
      bind("#rafflePrepareBackground","click",()=>prepareRaffleBackground().catch(error=>{qs("#raffleBackgroundMessage").textContent=error.message;toast(error.message,"error")}));
      bind("#raffleApplyBackground","click",()=>applyRaffleBackground().catch(error=>{qs("#raffleBackgroundMessage").textContent=error.message;toast(error.message,"error")}));
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
      bind("#adminRefreshNumbers","click",()=>loadBoard({preservePage:true}));
      bind("#copyPublicTicketBoardLink","click",copyPublicTicketBoardLink);
      bind("#prepareTicketBoardBackground","click",()=>prepareTicketBoardBackground().catch(error=>{qs('#ticketBoardConfigMessage').textContent=error.message;toast(error.message,'error')}));
      bind("#saveTicketBoardConfig","click",()=>saveTicketBoardConfig().catch(error=>{qs('#ticketBoardConfigMessage').textContent=error.message;toast(error.message,'error')}));
      bind("#removeTicketBoardBackground","click",()=>removeTicketBoardBackground().catch(error=>{qs('#ticketBoardConfigMessage').textContent=error.message;toast(error.message,'error')}));
      bind("#ticketBoardEnabled","change",()=>{const open=qs('#ticketBoardEnabled').value==='SI';const line=qs('.ticket-board-status-line');if(line){line.classList.toggle('open',open);line.classList.toggle('closed',!open)}const text=qs('#ticketBoardStatusText');if(text)text.textContent=open?'Enlace abierto: los tickets estarán visibles al guardar.':'Enlace cerrado: los tickets quedarán ocultos al guardar.';});
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
      const toggleLiveFullscreen=async()=>{
        const stage=qs('#liveStage',false),button=qs('#liveFullscreen',false);
        if(!stage)throw new Error('No se encontró la pantalla del sorteo.');
        try{
          const active=document.fullscreenElement||document.webkitFullscreenElement;
          if(active){
            if(document.exitFullscreen)await document.exitFullscreen();
            else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
            stage.classList.remove('live-stage-expanded');
            document.body.classList.remove('live-fullscreen-fallback');
          }else if(stage.requestFullscreen){
            await stage.requestFullscreen();
          }else if(stage.webkitRequestFullscreen){
            stage.webkitRequestFullscreen();
          }else{
            stage.classList.toggle('live-stage-expanded');
            document.body.classList.toggle('live-fullscreen-fallback',stage.classList.contains('live-stage-expanded'));
          }
          if(button)button.textContent=(document.fullscreenElement||document.webkitFullscreenElement||stage.classList.contains('live-stage-expanded'))?'Salir de pantalla completa':'5. Ampliar pantalla';
          setTimeout(ensureLiveVideoPlayback,250);
        }catch(error){
          stage.classList.toggle('live-stage-expanded');
          document.body.classList.toggle('live-fullscreen-fallback',stage.classList.contains('live-stage-expanded'));
          if(button)button.textContent=stage.classList.contains('live-stage-expanded')?'Salir de pantalla completa':'5. Ampliar pantalla';
          setTimeout(ensureLiveVideoPlayback,250);
        }
      };
      const syncFullscreenButton=()=>{
        const stage=qs('#liveStage',false),button=qs('#liveFullscreen',false);if(!stage||!button)return;
        const active=Boolean(document.fullscreenElement||document.webkitFullscreenElement||stage.classList.contains('live-stage-expanded'));
        button.textContent=active?'Salir de pantalla completa':'5. Ampliar pantalla';
        setTimeout(ensureLiveVideoPlayback,120);
      };
      document.addEventListener('fullscreenchange',syncFullscreenButton);
      document.addEventListener('webkitfullscreenchange',syncFullscreenButton);
      bind("#liveRaffleSelect","change",e=>{state.liveRaffleId=e.target.value;state.liveSession=null;state.liveCurrentWinner=null;state.liveBackgroundDraft=null;state.liveBackgroundLoadedRaffleId='';state.liveRunConfirmedRaffleId='';state.liveBurnedAll=[];state.liveBurned=[];qs('#liveBackgroundReady').hidden=true;qs('#liveApplyBackground').disabled=true;qs('#liveDownloadMigrated').disabled=true;stopLiveAnimation();loadLiveDraw()});
      bind("#liveSyncTickets","click",syncLiveTickets);
      bind("#liveDownloadMigrated","click",downloadMigratedTickets);
      bind("#livePrepareBackground","click",()=>prepareLiveBackground().catch(error=>toast(error.message,"error")));
      bind("#liveApplyBackground","click",()=>applyLiveBackgroundDraft().catch(error=>toast(error.message,"error")));
      bind("#liveStartDraw","click",startLiveDraw);
      bind("#liveRevealDigit","click",revealLiveDigit);
      bind("#liveCancelDraw","click",cancelLiveDraw);
      bind("#liveNextPrize","click",nextLivePrize);
      bind("#liveSidebarNextPrize","click",nextLivePrize);
      bind("#liveRefreshWinners","click",()=>loadLiveDraw(true));
      bind("#liveFullscreen","click",()=>toggleLiveFullscreen().catch(error=>toast(error.message,"error")));
      bind("#livePrizeSelect","change",()=>{const value=qs("#livePrizeSelect").value;qs("#liveStartDraw").disabled=!state.liveMigrationReady||!value||Boolean(state.liveSession);updateLivePrizePreview(value);if(value&&state.liveCurrentWinner){qs('#liveWinnerCard').hidden=true;qs('#liveProgress').textContent='Premio seleccionado. Pulsa “Iniciar dinámica”.';}ensureLiveVideoPlayback();});
      bind("#liveWinnerAt","change",rememberLiveWinnerAt);
      bind("#liveWinnerAt","blur",rememberLiveWinnerAt);
      bind("#liveStage","click",()=>setTimeout(ensureLiveVideoPlayback,50));
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){const stage=qs('#liveStage',false);if(stage?.classList.contains('live-stage-expanded')){stage.classList.remove('live-stage-expanded');document.body.classList.remove('live-fullscreen-fallback');syncFullscreenButton();}}});
      window.addEventListener('beforeunload',()=>{if(state.liveObjectUrl){try{URL.revokeObjectURL(state.liveObjectUrl);}catch{}}});
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
