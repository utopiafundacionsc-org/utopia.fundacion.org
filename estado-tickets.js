(()=>{
  "use strict";

  const CONFIG=window.UTOPIA_CONFIG||{};
  const API_URL=String(CONFIG.apiUrl||"").trim();
  const params=new URLSearchParams(location.search);
  let raffleId=String(params.get("raffleId")||"").trim();
  let refreshTimer=null;
  let videoLoadTimer=null;
  let previousStatuses=new Map();
  let lastSignature="";
  let currentBackgroundSignature="";
  let videoCandidates=[];
  let videoCandidateIndex=0;

  const qs=(selector)=>document.querySelector(selector);
  const escapeHtml=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const driveFileId=(value)=>{
    const text=String(value||"");
    for(const re of [/\/d\/([a-zA-Z0-9_-]+)/,/[?&]id=([a-zA-Z0-9_-]+)/,/googleusercontent\.com\/download\?id=([a-zA-Z0-9_-]+)/]){
      const match=text.match(re);
      if(match)return match[1];
    }
    return "";
  };
  const statusMap={
    DISPONIBLE:{key:"available",label:"Disponible"},
    RESERVADO:{key:"reserved",label:"Reservado"},
    EN_REVISION:{key:"review",label:"En revisión"},
    VENDIDO:{key:"sold",label:"Vendido"},
    BLOQUEADO:{key:"blocked",label:"Bloqueado"}
  };

  function normalizeStatus(value){
    const raw=String(value||"DISPONIBLE").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase().replace(/[\s-]+/g,"_");
    const aliases={AVAILABLE:"DISPONIBLE",LIBRE:"DISPONIBLE",RESERVED:"RESERVADO",PENDING:"RESERVADO",REVISION:"EN_REVISION",REVIEW:"EN_REVISION",COMPROBANTE_RECIBIDO:"EN_REVISION",SOLD:"VENDIDO",APROBADO:"VENDIDO",APPROVED:"VENDIDO",BLOCKED:"BLOQUEADO"};
    const normalized=aliases[raw]||raw;
    return statusMap[normalized]?normalized:"BLOQUEADO";
  }
  function formatTime(date=new Date()){
    return new Intl.DateTimeFormat("es-BO",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(date);
  }
  function apiUrl(){
    if(!API_URL)throw new Error("No está configurada la dirección de la API.");
    const url=new URL(API_URL);
    url.searchParams.set("action","ticketstatus");
    if(raffleId)url.searchParams.set("raffleId",raffleId);
    url.searchParams.set("_",Date.now());
    return url.toString();
  }
  async function requestStatus(){
    const controller=typeof AbortController!=="undefined"?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),20000):null;
    try{
      const response=await fetch(apiUrl(),{cache:"no-store",redirect:"follow",signal:controller?.signal});
      if(!response.ok)throw new Error(`Error ${response.status}`);
      const text=await response.text();
      let data;
      try{data=JSON.parse(text)}catch{throw new Error("La API no devolvió información válida.")}
      if(!data.ok)throw new Error(data.error||"No se pudo cargar el tablero.");
      return data;
    }catch(error){
      if(error?.name==="AbortError")throw new Error("La actualización tardó demasiado.");
      throw error;
    }finally{if(timer)clearTimeout(timer)}
  }

  function updateCount(id,value){const element=qs(id);if(element)element.textContent=String(value||0)}
  function clearVideoLoadTimer(){if(videoLoadTimer){clearTimeout(videoLoadTimer);videoLoadTimer=null}}
  function resetBackgroundMedia(){
    clearVideoLoadTimer();
    const video=qs("#ticketBoardBackgroundVideo");
    const frame=qs("#ticketBoardBackgroundFrame");
    const image=qs("#ticketBoardBackgroundImage");
    video.pause();
    video.onloadeddata=null;video.oncanplay=null;video.onerror=null;
    video.removeAttribute("src");video.load();video.hidden=true;
    frame.removeAttribute("src");frame.hidden=true;
    image.style.backgroundImage="";
  }
  function showDrivePreviewFallback(fileId){
    const video=qs("#ticketBoardBackgroundVideo");
    const frame=qs("#ticketBoardBackgroundFrame");
    clearVideoLoadTimer();
    video.pause();
    video.hidden=true;
    video.removeAttribute("src");
    video.load();
    if(!fileId){
      frame.hidden=true;
      frame.removeAttribute("src");
      document.body.classList.remove("has-board-media");
      return;
    }
    frame.onload=()=>document.body.classList.add("has-board-media");
    frame.src=`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview?autoplay=1&mute=1`;
    frame.hidden=false;
    document.body.classList.add("has-board-media");
  }
  function tryNextVideoCandidate(fileId){
    const video=qs("#ticketBoardBackgroundVideo");
    const frame=qs("#ticketBoardBackgroundFrame");
    clearVideoLoadTimer();
    if(videoCandidateIndex>=videoCandidates.length){
      showDrivePreviewFallback(fileId);
      return;
    }
    const candidate=videoCandidates[videoCandidateIndex++];
    frame.hidden=true;
    frame.removeAttribute("src");
    video.hidden=false;
    video.muted=true;
    video.defaultMuted=true;
    video.loop=true;
    video.playsInline=true;
    video.autoplay=true;
    video.disablePictureInPicture=true;
    video.setAttribute("muted","");
    video.setAttribute("loop","");
    video.setAttribute("playsinline","");
    video.setAttribute("autoplay","");
    video.setAttribute("webkit-playsinline","");
    video.preload="auto";
    video.src=candidate;
    let resolved=false;
    const loaded=()=>{
      if(resolved)return;
      resolved=true;
      clearVideoLoadTimer();
      document.body.classList.add("has-board-media");
      video.play().catch(()=>{});
    };
    video.onloadeddata=loaded;
    video.oncanplay=loaded;
    video.onplaying=loaded;
    video.onerror=()=>{
      if(resolved)return;
      resolved=true;
      tryNextVideoCandidate(fileId);
    };
    video.load();
    video.play().then(loaded).catch(()=>{});
    videoLoadTimer=setTimeout(()=>{
      if(!resolved&&video.readyState<2){
        resolved=true;
        tryNextVideoCandidate(fileId);
      }
    },4500);
  }
  function setBackground(board={}){
    const type=String(board.backgroundType||"IMAGEN").toUpperCase()==="VIDEO"?"VIDEO":"IMAGEN";
    const url=String(board.backgroundUrl||"").trim();
    const signature=`${type}|${url}`;
    if(signature===currentBackgroundSignature)return;
    currentBackgroundSignature=signature;
    resetBackgroundMedia();
    document.body.classList.toggle("has-board-media",Boolean(url));
    if(!url)return;

    if(type==="VIDEO"){
      const fileId=driveFileId(url);
      videoCandidates=fileId?[
        `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`,
        `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
        `https://drive.google.com/uc?id=${encodeURIComponent(fileId)}&export=download`,
        url
      ].filter((item,index,list)=>item&&list.indexOf(item)===index):[url];
      videoCandidateIndex=0;
      tryNextVideoCandidate(fileId);
      return;
    }
    const image=qs("#ticketBoardBackgroundImage");
    image.style.backgroundImage=`url("${url.replaceAll('"','%22')}")`;
    document.body.classList.add("has-board-media");
  }

  function setBoardVisibility(enabled){
    const open=enabled!==false;
    document.body.classList.toggle("board-closed",!open);
    qs("#ticketBoardClosed").hidden=open;
    qs("#ticketBoardContent").hidden=!open;
  }

  function render(data){
    raffleId=String(data.raffle?.id||raffleId||"");
    if(raffleId){const url=new URL(location.href);url.searchParams.set("raffleId",raffleId);history.replaceState({},"",url)}
    const raffle=data.raffle||{};
    const board=data.board||{};
    const enabled=board.enabled!==false;
    setBackground(board);
    setBoardVisibility(enabled);
    qs("#raffleName").textContent=raffle.name||"Estado de tickets";
    qs("#raffleMeta").textContent=enabled?`${raffle.status||""} · ${Number(raffle.totalTickets||0)} tickets`:`${raffle.status||""} · tablero cerrado`;
    document.title=`${raffle.name||"Estado de tickets"} | Tickets`;
    qs("#lastUpdate").textContent=`Actualizado a las ${formatTime()}`;
    document.body.classList.remove("connection-error");
    if(!enabled){
      lastSignature="";
      previousStatuses=new Map();
      qs("#ticketStatusGrid").innerHTML="";
      return Math.max(5,Number(data.refreshSeconds||CONFIG.refreshSeconds||10));
    }

    const tickets=(data.tickets||[]).map((item)=>({
      number:String(item.number||""),
      status:normalizeStatus(item.status)
    }));
    const counts={DISPONIBLE:0,RESERVADO:0,EN_REVISION:0,VENDIDO:0,BLOQUEADO:0};
    tickets.forEach((ticket)=>{counts[ticket.status]=(counts[ticket.status]||0)+1});
    updateCount("#countAvailable",counts.DISPONIBLE);updateCount("#countReserved",counts.RESERVADO);updateCount("#countReview",counts.EN_REVISION);updateCount("#countSold",counts.VENDIDO);updateCount("#countBlocked",counts.BLOQUEADO);
    const signature=tickets.map((ticket)=>`${ticket.number}:${ticket.status}`).join("|");
    if(signature!==lastSignature){
      const grid=qs("#ticketStatusGrid");
      grid.innerHTML=tickets.map((ticket)=>{
        const meta=statusMap[ticket.status];
        const changed=previousStatuses.has(ticket.number)&&previousStatuses.get(ticket.number)!==ticket.status;
        return `<div class="ticket-state ${meta.key}${changed?" status-changed":""}" title="${escapeHtml(ticket.number)} · ${escapeHtml(meta.label)}"><strong>${escapeHtml(ticket.number)}</strong><small>${escapeHtml(meta.label)}</small></div>`;
      }).join("");
      previousStatuses=new Map(tickets.map((ticket)=>[ticket.number,ticket.status]));
      lastSignature=signature;
    }
    qs("#ticketBoardMessage").hidden=tickets.length>0;
    qs("#ticketBoardMessage").textContent=tickets.length?"":"No existen tickets configurados para este sorteo.";
    return Math.max(5,Number(data.refreshSeconds||CONFIG.refreshSeconds||10));
  }

  function schedule(seconds){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(load,Math.max(5,seconds)*1000);
  }
  async function load(){
    try{const data=await requestStatus();schedule(render(data));}
    catch(error){
      document.body.classList.add("connection-error");
      qs("#lastUpdate").textContent=error.message;
      const message=qs("#ticketBoardMessage");
      if(!lastSignature){message.hidden=false;message.textContent=error.message;}
      schedule(10);
    }
  }
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
  document.addEventListener("click",()=>{
    const video=qs("#ticketBoardBackgroundVideo");
    if(video&&!video.hidden)video.play().catch(()=>{});
  },{once:true});
  load();
})();
