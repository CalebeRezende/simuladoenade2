import {esc} from "./supabaseClient.js";
const pdfjsLib = globalThis.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const el=id=>document.getElementById(id);
let pdfDoc=null, page=null, viewport=null, renderScale=1.8;
let start=null, rect=null, cropBlob=null, cropDataUrl=null, crops=[], suggestions=[];
const canvas=el("pdfCanvas"), ctx=canvas.getContext("2d"), wrap=el("canvasWrap"), sel=el("selection");

async function loadPdf(){
  const file=el("pdfFile").files[0];
  if(!file){alert("Escolha um PDF.");return;}
  const buf=await file.arrayBuffer();
  pdfDoc=await pdfjsLib.getDocument({data:buf}).promise;
  el("pageNum").max=pdfDoc.numPages;
  await renderPage();
}

async function renderPage(){
  if(!pdfDoc){await loadPdf();return;}
  const n=Number(el("pageNum").value||1);
  renderScale=Number(el("scale").value||1.8);
  page=await pdfDoc.getPage(n);
  viewport=page.getViewport({scale:renderScale});
  canvas.width=viewport.width;
  canvas.height=viewport.height;
  sel.classList.add("hide");
  rect=null;
  cropBlob=null;
  cropDataUrl=null;
  el("preview").innerHTML='<p class="muted">O preview aparecerá aqui.</p>';
  await page.render({canvasContext:ctx,viewport}).promise;
  suggestions=[];
  renderSuggestions();
}

function pos(ev){
  const r=canvas.getBoundingClientRect();
  return {x:(ev.clientX-r.left)*(canvas.width/r.width), y:(ev.clientY-r.top)*(canvas.height/r.height)};
}
function cssRect(a,b){
  const r=canvas.getBoundingClientRect(), wr=wrap.getBoundingClientRect();
  const scaleX=r.width/canvas.width, scaleY=r.height/canvas.height;
  const x=Math.min(a.x,b.x)*scaleX + (r.left-wr.left) + wrap.scrollLeft;
  const y=Math.min(a.y,b.y)*scaleY + (r.top-wr.top) + wrap.scrollTop;
  const w=Math.abs(a.x-b.x)*scaleX, h=Math.abs(a.y-b.y)*scaleY;
  return {x,y,w,h};
}
function drawSelectionFromRect(rct){
  const c=cssRect({x:rct.x,y:rct.y},{x:rct.x+rct.w,y:rct.y+rct.h});
  sel.classList.remove("hide");
  sel.style.left=c.x+"px"; sel.style.top=c.y+"px"; sel.style.width=c.w+"px"; sel.style.height=c.h+"px";
}
function drawSelection(a,b){
  const c=cssRect(a,b);
  sel.classList.remove("hide");
  sel.style.left=c.x+"px"; sel.style.top=c.y+"px"; sel.style.width=c.w+"px"; sel.style.height=c.h+"px";
}

canvas.addEventListener("mousedown",e=>{start=pos(e);rect=null;});
canvas.addEventListener("mousemove",e=>{if(!start)return;const p=pos(e);drawSelection(start,p);});
canvas.addEventListener("mouseup",async e=>{
  if(!start)return;
  const end=pos(e);
  rect={x:Math.round(Math.min(start.x,end.x)),y:Math.round(Math.min(start.y,end.y)),w:Math.round(Math.abs(start.x-end.x)),h:Math.round(Math.abs(start.y-end.y))};
  start=null;
  if(rect.w<20||rect.h<20){rect=null;sel.classList.add("hide");return;}
  await makePreview();
});

async function makePreview(){
  const out=document.createElement("canvas");
  out.width=rect.w; out.height=rect.h;
  const octx=out.getContext("2d");
  octx.drawImage(canvas,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
  cropDataUrl=out.toDataURL("image/png");
  cropBlob=await new Promise(resolve=>out.toBlob(resolve,"image/png"));
  el("preview").innerHTML=`<img src="${cropDataUrl}" alt="Preview do recorte"><p class="muted">Tamanho: ${rect.w} x ${rect.h}px</p>`;
  autoFilename();
}

/* ------------------ Sugestão automática de cortes ------------------
   A heurística lê os pixels da página renderizada e tenta encontrar blocos
   de conteúdo separados por áreas brancas. Para páginas do ENADE/PND, isso
   costuma sugerir blocos próximos às questões. Não é OCR: é uma sugestão
   visual para o professor ajustar, quando necessário.
-------------------------------------------------------------------- */

function isInk(data, idx){
  const r=data[idx], g=data[idx+1], b=data[idx+2], a=data[idx+3];
  if(a < 30) return false;
  // Detecta texto, bordas, gráficos e áreas coloridas; ignora fundo branco/quase branco.
  return (r < 238 || g < 238 || b < 238) && !(r > 245 && g > 245 && b > 245);
}

function boundingBoxForRegion(img, x0, y0, w, h, step=3){
  const data=img.data, W=img.width;
  let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,count=0;
  for(let y=y0;y<y0+h;y+=step){
    for(let x=x0;x<x0+w;x+=step){
      const idx=(y*W+x)*4;
      if(isInk(data,idx)){
        minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); count++;
      }
    }
  }
  if(count<20) return null;
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,count};
}

function rowDensity(img, x0, y0, w, h, step=3){
  const data=img.data, W=img.width, arr=[];
  for(let y=y0;y<y0+h;y+=step){
    let c=0;
    for(let x=x0;x<x0+w;x+=step){
      if(isInk(data,(y*W+x)*4)) c++;
    }
    arr.push({y,c});
  }
  return arr;
}

function findVerticalGroups(density, threshold, minGapPx=22, step=3){
  const groups=[]; let start=null, lastInk=null, gap=0;
  for(const row of density){
    if(row.c>=threshold){
      if(start===null) start=row.y;
      lastInk=row.y;
      gap=0;
    } else if(start!==null) {
      gap += step;
      if(gap>=minGapPx){
        groups.push({y:start, y2:lastInk});
        start=null; lastInk=null; gap=0;
      }
    }
  }
  if(start!==null) groups.push({y:start,y2:lastInk});
  return groups;
}

function mergeSmallGroups(groups, minHeight=90, maxGap=38){
  const out=[];
  for(const g of groups){
    const h=g.y2-g.y;
    if(out.length && (h<minHeight || g.y-out[out.length-1].y2<maxGap)){
      out[out.length-1].y2=Math.max(out[out.length-1].y2,g.y2);
    } else {
      out.push({...g});
    }
  }
  return out;
}

function proposeForColumn(img, x0, y0, w, h){
  const dens=rowDensity(img,x0,y0,w,h,3);
  // Threshold adaptativo: quantidade mínima de pixels "não brancos" por linha.
  const threshold=Math.max(8, Math.floor((w/3)*0.018));
  let groups=findVerticalGroups(dens,threshold,26,3);
  groups=mergeSmallGroups(groups,110,45);

  const props=[];
  for(const g of groups){
    const yy=Math.max(0,g.y-12);
    const hh=Math.min(canvas.height-yy,g.y2-g.y+36);
    const bb=boundingBoxForRegion(img,x0,yy,w,hh,2);
    if(!bb) continue;
    const pad=18;
    const r={
      x:Math.max(0, bb.x-pad),
      y:Math.max(0, bb.y-pad),
      w:Math.min(canvas.width-bb.x+pad, bb.w+pad*2),
      h:Math.min(canvas.height-bb.y+pad, bb.h+pad*2),
      score:bb.count
    };
    if(r.w>120 && r.h>80) props.push(r);
  }
  return props;
}

function dedupeRects(rects){
  const area=r=>r.w*r.h;
  const inter=(a,b)=>{
    const x1=Math.max(a.x,b.x), y1=Math.max(a.y,b.y), x2=Math.min(a.x+a.w,b.x+b.w), y2=Math.min(a.y+a.h,b.y+b.h);
    return Math.max(0,x2-x1)*Math.max(0,y2-y1);
  };
  const sorted=[...rects].sort((a,b)=>b.score-a.score);
  const out=[];
  for(const r of sorted){
    if(!out.some(o=>inter(o,r)/Math.min(area(o),area(r))>0.70)) out.push(r);
  }
  return out.sort((a,b)=>a.y-b.y || a.x-b.x);
}

function detectColumns(img){
  const W=img.width, H=img.height;
  // Ignora capa/cabeçalhos extremos e bordas.
  const marginX=Math.floor(W*0.06), top=Math.floor(H*0.05), height=Math.floor(H*0.90);
  const mid=Math.floor(W/2);
  // Se houver muito espaço branco no miolo, tenta duas colunas.
  let inkMid=0, samples=0;
  for(let y=top;y<top+height;y+=5){
    for(let x=mid-25;x<mid+25;x+=5){
      samples++;
      if(isInk(img.data,(y*W+x)*4)) inkMid++;
    }
  }
  const twoCols = inkMid/samples < 0.045;
  if(twoCols){
    return [
      {x:marginX,y:top,w:mid-marginX-12,h:height},
      {x:mid+12,y:top,w:W-mid-marginX-12,h:height}
    ];
  }
  return [{x:marginX,y:top,w:W-marginX*2,h:height}];
}

function suggestCuts(){
  if(!canvas.width){alert("Renderize uma página primeiro.");return;}
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const cols=detectColumns(img);
  let rects=[];
  for(const c of cols) rects=rects.concat(proposeForColumn(img,c.x,c.y,c.w,c.h));
  rects=dedupeRects(rects).filter(r=>r.h<canvas.height*0.82);

  // Fallback: um grande corte com todo o conteúdo da página.
  if(!rects.length){
    const bb=boundingBoxForRegion(img,0,0,canvas.width,canvas.height,3);
    if(bb) rects=[{x:Math.max(0,bb.x-18),y:Math.max(0,bb.y-18),w:Math.min(canvas.width,bb.w+36),h:Math.min(canvas.height,bb.h+36),score:bb.count}];
  }

  suggestions=rects.map((r,i)=>({...r,idx:i+1}));
  renderSuggestions();
  if(suggestions.length){
    selectSuggestion(0);
  } else {
    alert("Não consegui sugerir cortes nessa página. Faça o recorte manual.");
  }
}

function renderSuggestions(){
  const box=el("suggestionsList");
  if(!box) return;
  if(!suggestions.length){
    box.innerHTML='<div class="alerta warn">Nenhuma sugestão gerada ainda. Renderize uma página e clique em “Sugerir cortes da página”.</div>';
    return;
  }
  box.innerHTML=suggestions.map((s,i)=>`<div class="cropItem"><div class="qhead"><b>Sugestão ${i+1}</b><button class="secondary" data-sel="${i}">Usar este corte</button></div><p class="muted">x:${s.x}, y:${s.y}, largura:${s.w}, altura:${s.h}</p></div>`).join("");
  box.querySelectorAll("[data-sel]").forEach(b=>b.onclick=()=>selectSuggestion(Number(b.dataset.sel)));
}

async function selectSuggestion(i){
  const s=suggestions[i];
  if(!s) return;
  rect={x:Math.round(s.x),y:Math.round(s.y),w:Math.round(s.w),h:Math.round(s.h)};
  drawSelectionFromRect(rect);
  await makePreview();
  // Tenta avançar o número original automaticamente quando já há número preenchido.
  if(!el("number_original").value && crops.length){
    const last=crops[crops.length-1].meta.number_original;
    const n=parseInt(last,10);
    if(!Number.isNaN(n)) el("number_original").value=String(n+1);
  }
  autoFilename();
}

/* ------------------ Dados e ZIP ------------------ */

function pad(n){return String(n||"").padStart(3,"0");}
function slug(s){return (s||"questao").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,35);}
function autoFilename(){
  const n=el("number_original").value.trim();
  const origem=slug(el("prova_origem").value || "prova");
  if(n && !el("filename").value.trim()) el("filename").value=`${origem}_q${pad(n)}.png`;
}

["number_original","prova_origem"].forEach(id=>el(id).addEventListener("input",autoFilename));

function currentMeta(){
  const filename=(el("filename").value.trim() || `questao_${Date.now()}.png`).replace(/[^\w.\-]+/g,"_");
  return {
    number_original: el("number_original").value.trim() || null,
    prova_origem: el("prova_origem").value.trim() || null,
    disciplina: el("disciplina").value.trim() || null,
    enunciado: el("enunciado").value.trim() || "",
    image_url: "questoes/" + filename,
    correct_answer: el("correct_answer").value,
    is_anulada: el("is_anulada").checked,
    tags: [],
    filename,
    rect: rect ? {...rect, page:Number(el("pageNum").value), scale:renderScale} : null
  };
}

function clearMetaKeepOrigin(){
  const origem=el("prova_origem").value, disc=el("disciplina").value;
  ["number_original","enunciado","filename"].forEach(id=>el(id).value="");
  el("prova_origem").value=origem; el("disciplina").value=disc; el("correct_answer").value="A"; el("is_anulada").checked=false;
  el("preview").innerHTML='<p class="muted">O preview aparecerá aqui.</p>';
  cropBlob=null; cropDataUrl=null; rect=null; sel.classList.add("hide");
}

function renderCropList(){
  el("cropList").innerHTML=crops.length?crops.map((c,i)=>`<div class="cropItem"><div class="qhead"><b>${i+1}. ${esc(c.meta.image_url)}</b><button class="danger" data-rm="${i}">Remover</button></div><img src="${c.dataUrl}"><p class="muted">Origem: ${esc(c.meta.prova_origem||"")} | Original: ${esc(c.meta.number_original||"")} | Gabarito: ${c.meta.is_anulada?"ANULADA":esc(c.meta.correct_answer)} | Tema: ${esc(c.meta.disciplina||"")}</p></div>`).join(""):'<div class="alerta warn">Nenhum recorte adicionado ainda.</div>';
  document.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{crops.splice(Number(b.dataset.rm),1);renderCropList();});
}

function addCrop(){
  if(!cropBlob||!rect){alert("Desenhe ou selecione um recorte primeiro.");return;}
  const meta=currentMeta();
  crops.push({meta,blob:cropBlob,dataUrl:cropDataUrl});
  renderCropList();
  clearMetaKeepOrigin();
}

async function downloadZip(){
  if(!crops.length){alert("Adicione ao menos um recorte.");return;}
  const zip=new JSZip();
  const folder=zip.folder("questoes");
  const json=crops.map(c=>{
    const {filename,rect,...clean}=c.meta;
    return clean;
  });
  const manifest=crops.map(c=>c.meta);
  crops.forEach(c=>folder.file(c.meta.filename,c.blob));
  zip.file("questions_import.json",JSON.stringify(json,null,2));
  zip.file("manifest_com_coordenadas.json",JSON.stringify(manifest,null,2));
  zip.file("leia-me.txt","Suba as imagens da pasta questoes/ para a pasta questoes/ do GitHub. Depois, no admin.html, importe o arquivo questions_import.json.\\nO arquivo manifest_com_coordenadas.json guarda as coordenadas dos recortes.\\n");
  const blob=await zip.generateAsync({type:"blob"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="questoes_recortadas.zip"; a.click();
  URL.revokeObjectURL(a.href);
}

el("pdfFile").addEventListener("change",loadPdf);
el("renderBtn").addEventListener("click",renderPage);
el("suggestBtn").addEventListener("click",suggestCuts);
el("addCrop").addEventListener("click",addCrop);
el("downloadZip").addEventListener("click",downloadZip);
renderCropList();
renderSuggestions();
