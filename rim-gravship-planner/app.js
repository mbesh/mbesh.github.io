import {HULL_REFERENCES,hullTopology,prepareHullTexture,drawHull} from './hull.js';
import {COMPONENTS,componentDefinition,componentBounds,componentCells,componentSprite,componentVisual,barrierJoins,pumpMount,exhaustCells,ROTATIONS,normalizeRotation,componentRotationLabel} from './components.js';
import {blank,key,point,footprint,capacity,validate,shapeCells,apply,sanitize,inField,inEngineField,fieldCells,hitItem,itemPosition,itemCells,moveItem} from './model.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const STORAGE='gravship-designs-v1',DRAFT='gravship-draft-v1';
let state=blank(),layer='engine',selection=null,rotation=0,shape='single',erase=false,zoom=22,offset={x:0,y:0},width=0,height=0,hover=null,drag=null,space=false,undo=[],redo=[],savedId=null,dirty=false,toastTimer,draftTimer,validation=validate(state),supportedField=fieldCells(state),hullLayout=hullTopology(state);
const assets={},hullTextures={},paths={floor:'substructure-3x3.png',floorSingle:'substructure-1x1.png',engine:'GravEngine_with_orb.png',extender:'GravFieldExtender.png'};
const palette=[['engine','Grav engine','3 × 3 · max. 1','GravEngine_with_orb.png'],['floor','Substructure','1 tile · connected floor','substructure-1x1.png'],['hull','Gravship hull','1 tile · needs floor','hull-1x1.png'],['extender','Field extender','1 tile · max. 6','GravFieldExtender.png']];
const shapes=[['single','·','Single tile'],['line','─','Straight line'],['diagonal','╱','Diagonal line'],['rect','□','Rectangle'],['filled','▣','Filled rectangle'],['circle','○','Circle'],['disc','●','Filled circle']];
function toast(t){$('toast').textContent=t;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function readLibrary(){try{const r=JSON.parse(localStorage.getItem(STORAGE)||'[]');return Array.isArray(r)?r:[];}catch{toast('Saved designs could not be read. Browser storage may be unavailable.');return [];}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{toast('Could not save. Browser storage is unavailable or full.');return false;}}
function draft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>store(DRAFT,{state,name:$('name').value,savedId,dirty}),250);}
function changed(){dirty=true;draft();refresh();}
function commit(next){if(JSON.stringify(next)===JSON.stringify(state))return;undo.push(structuredClone(state));if(undo.length>80)undo.shift();redo=[];state=next;changed();}
function chooseLayer(v){if(drag)finish(null,true);layer=v;selection=null;erase=false;rotation=0;if(v==='engine'||v==='extender'||componentDefinition(v))shape='single';refresh();}
$('select-mode').onclick=()=>chooseLayer(null);
for(const [id,label,description,file] of palette){const b=document.createElement('button');b.className='palette-item';b.dataset.layer=id;b.innerHTML=`<img src="assets/${file}" alt=""><div><strong>${label}</strong><small>${description}</small></div>`;b.onclick=()=>chooseLayer(id);$('palette').append(b);}
$('component-palette-count').textContent=COMPONENTS.length;
for(const group of [...new Set(COMPONENTS.map(c=>c.group))]){
  const heading=document.createElement('h3');heading.textContent=group;$('component-options').append(heading);
  for(const c of COMPONENTS.filter(c=>c.group===group)){
    const b=document.createElement('button');b.className='palette-item component-item';b.dataset.layer=c.id;b.dataset.group=group;
    b.title=`${c.name}. ${c.note}${c.limit?' Maximum '+c.limit+'.':' No maximum stated on the wiki.'}`;
    b.innerHTML=`<img src="assets/${componentSprite({type:c.id,rotation:0}).file}" alt=""><div><strong>${c.name}</strong><small>${c.width} × ${c.height} · ${c.limit?'max. '+c.limit:'no stated limit'}</small></div><span class="component-quantity">0</span>`;
    b.onclick=()=>chooseLayer(c.id);$('component-options').append(b);
  }
}
$('component-search').oninput=()=>{
  const query=$('component-search').value.trim().toLowerCase();let visible=0;
  document.querySelectorAll('.component-item').forEach(b=>{b.hidden=!componentDefinition(b.dataset.layer).name.toLowerCase().includes(query);if(!b.hidden)visible++;});
  document.querySelectorAll('#component-options h3').forEach(h=>{h.hidden=![...document.querySelectorAll('.component-item')].some(b=>b.dataset.group===h.textContent&&!b.hidden);});
  $('no-components').hidden=visible>0;
};
function rotateSelected(delta){if(!componentDefinition(layer)?.rotate||drag)return;rotation=normalizeRotation(layer,rotation+delta);refresh();}
$('rotate').onclick=()=>rotateSelected(1);$('rotate-left').onclick=()=>rotateSelected(-1);
for(const [id,icon,label] of shapes){const b=document.createElement('button');b.dataset.shape=id;b.title=label;b.innerHTML=`<span aria-hidden="true">${icon}</span>${label}`;b.onclick=()=>{shape=id;refresh();};$('shapes').append(b);}
$('add').onclick=()=>{erase=false;refresh();};$('erase').onclick=()=>{erase=true;refresh();};
for(const id of ['grid','field','issues','exhaust'])$(id).onchange=render;
function refresh(){validation=validate(state);supportedField=fieldCells(state);hullLayout=hullTopology(state);document.querySelectorAll('[data-layer]').forEach(b=>{const selected=b.dataset.layer===layer;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);});document.querySelectorAll('[data-shape]').forEach(b=>{b.classList.toggle('active',b.dataset.shape===shape);b.setAttribute('aria-pressed',b.dataset.shape===shape);b.disabled=!layer||(layer==='engine'||layer==='extender'||componentDefinition(layer))&&b.dataset.shape!=='single';});$('add').classList.toggle('active',!erase);$('erase').classList.toggle('active',erase);$('add').setAttribute('aria-pressed',!erase);$('erase').setAttribute('aria-pressed',erase);$('mode-label').textContent=`${erase?'Erase':'Place'} ${(componentDefinition(layer)?.name||palette.find(p=>p[0]===layer)?.[1]||'component').toLowerCase()}`;$('shape-label').textContent=shapes.find(s=>s[0]===shape)[2];$('tool-hint').textContent=erase?'Erase affects the selected palette layer. Erasing the engine also removes its extenders.':layer==='engine'?'Click to place the engine. Its center anchors the grav field.':layer==='extender'?'Place inside the engine’s original field. Adds a 17-tile field and 250 tiles of capacity.':shape==='single'?'Click or drag to paint individual tiles. Right-click to erase the selected layer.':shape==='circle'||shape==='disc'?'Drag from the center to the outermost tile. An 18-tile reach matches the engine field; 16 matches an extender.':'Drag between two tiles. Release to draw the shape.';
$('select-mode').classList.toggle('active',!layer);$('select-mode').setAttribute('aria-pressed',!layer);
$('add').disabled=$('erase').disabled=!layer;
if(!layer){
  const p=itemPosition(state,selection);
  const name=selection?.kind==='component'?componentDefinition(p?.type)?.name:selection?.kind==='engine'?'Grav engine':selection?.kind==='extender'?'Field extender':selection?.kind==='hull'?'Hull tile':selection?.kind==='floor'?'Substructure tile':null;
  $('mode-label').textContent=name?`${name} selected`:'Select / move';
  $('shape-label').textContent='Drag to move';
  $('tool-hint').textContent='Click an item to select it, then drag it to a new position. Right-click or press Esc to clear selection. Moves preserve rotation and can be undone.';
}
canvas.style.cursor=layer?'crosshair':selection?'grab':'default';
const selected=componentDefinition(layer);
$('rotation-controls').hidden=!selected;
$('rotate').disabled=$('rotate-left').disabled=!selected?.rotate;
$('rotation-label').textContent=selected?componentRotationLabel({type:layer,rotation}):'Fixed';
if(selected){
  const b=componentBounds({type:layer,x:0,y:0,rotation});
  $('shape-label').textContent=`${b.width} × ${b.height} · ${componentRotationLabel({type:layer,rotation})}`;
  $('component-wiki').href=`https://rimworldwiki.com/wiki/${selected.wiki}`;
  $('tool-hint').textContent=erase?'Click any tile of this component to remove it. Substructure stays in place.':`Click to place one component; the pointer anchors its top-left tile. ${selected.rotate?'Q / E or the buttons rotate before placing. ':''}${selected.note} All footprint tiles need substructure.`;
}
const counts=Object.fromEntries(COMPONENTS.map(c=>[c.id,(state.components||[]).filter(p=>p.type===c.id).length]));
$('component-count').textContent=(state.components||[]).length;
document.querySelectorAll('.component-item').forEach(b=>{b.querySelector('.component-quantity').textContent=counts[b.dataset.layer];});
$('component-inventory').replaceChildren(...COMPONENTS.filter(c=>counts[c.id]).map(c=>{const row=document.createElement('div');row.className='stat';const label=document.createElement('span'),n=document.createElement('b');label.textContent=c.name;n.textContent=counts[c.id]+(c.limit?' / '+c.limit:'');row.append(label,n);return row;}));

$('empty').hidden=!!state.engine;$('used').textContent=state.floor.length;$('capacity').textContent=capacity(state).toLocaleString();$('engine-count').textContent=`${state.engine?1:0} / 1`;$('extender-count').textContent=`${state.extenders.length} / 6`;$('hull-count').textContent=state.hull.length;$('meter').style.width=`${Math.min(100,state.floor.length/Math.max(1,capacity(state))*100)}%`;$('capacity-note').textContent=state.engine?`${Math.max(0,capacity(state)-state.floor.length).toLocaleString()} tiles available`:'Place an engine to support 500 tiles.';
const checks=[];checks.push([!state.engine,state.engine?'Grav engine placed':'Place one grav engine to begin.']);if(state.engine){checks.push([validation.missing.length,validation.missing.length?`${validation.missing.length} structure tiles need substructure.`:'All structures have substructure.']);checks.push([validation.disconnected.length,validation.disconnected.length?`${validation.disconnected.length} floor tiles disconnected from engine.`:'All floor tiles connect to the engine.']);checks.push([validation.outside.length,validation.outside.length?`${validation.outside.length} tiles outside the grav field.`:'All floor tiles within grav field.']);checks.push([validation.over,validation.over?`${validation.over} tiles exceed capacity.`:'Within supported tile capacity.']);if(validation.invalidExtenders.length)checks.push([true,'Extenders must be within the original engine field.']);}if(state.engine&&(state.components||[]).length){
checks.push([validation.blockedExhaust.length,validation.blockedExhaust.length?`${validation.blockedExhaust.length} thruster clearance tiles obstructed.`:'Thruster clearance is clear.']);
if(validation.missingWall.length)checks.push([true,`${validation.missingWall.length} oxygen pumps need a hull tile.`]);
if(validation.blockedPumps.length)checks.push([true,`${validation.blockedPumps.length} oxygen pumps face hull. Rotate them toward a non-hull tile.`]);
if(validation.outsideComponents.length)checks.push([true,`${validation.outsideComponents.length} components outside their supported field.`]);
if(validation.overLimits.length)checks.push([true,'Component limits exceeded in this saved design.']);
}const bad=checks.filter(c=>c[0]).length;$('check-badge').textContent=!state.engine?'Getting started':bad?`${bad} to resolve`:'All checks pass';$('checks').replaceChildren(...checks.map(([warn,t])=>{const li=document.createElement('li');li.className=warn?'warn':'';const s=document.createElement('span');s.textContent=warn?'!':'✓';li.append(s,document.createTextNode(t));return li;}));$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;$('save-state').textContent=dirty?'Unsaved changes':savedId?'Saved in this browser':'Unsaved design';$('saved-count').textContent=readLibrary().length||'';render();}
function screen(x,y){return {x:width/2+offset.x+x*zoom,y:height/2+offset.y+y*zoom};}
function tile(e){const r=canvas.getBoundingClientRect();return {x:Math.max(-110,Math.min(110,Math.floor((e.clientX-r.left-width/2-offset.x)/zoom))),y:Math.max(-110,Math.min(110,Math.floor((e.clientY-r.top-height/2-offset.y)/zoom)))};}
function tileRect(k,color){const [x,y]=point(k),p=screen(x,y);ctx.fillStyle=color;ctx.fillRect(p.x,p.y,zoom,zoom);}
function connectedSprite(k,set,type){
  const [x,y]=point(k),p=screen(x,y),im=assets[type];if(!im)return;
  const w=im.width/3,h=im.height/3;
  for(let qy=0;qy<2;qy++)for(let qx=0;qx<2;qx++){
    const nx=qx?1:-1,ny=qy?1:-1,side=set.has(key(x+nx,y)),vert=set.has(key(x,y+ny));
    const sx=side?1:(qx?2:0),sy=vert?1:(qy?2:0);
    ctx.drawImage(im,(sx+qx/2)*w,(sy+qy/2)*h,w/2,h/2,p.x+qx*zoom/2,p.y+qy*zoom/2,zoom/2+.3,zoom/2+.3);
  }
}
function drawComponent(c,alpha=1){
  if(c.type==='oxygen-pump'){
    const mount=pumpMount(c),p=screen(mount.x,mount.y);
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);ctx.rotate(mount.rotation*Math.PI/2);
    ctx.fillStyle='#ed963e';ctx.strokeStyle='#63391e';ctx.lineWidth=Math.max(.75,zoom*.035);
    ctx.fillRect(-zoom/4,-zoom/6,zoom/2,zoom/3);ctx.strokeRect(-zoom/4,-zoom/6,zoom/2,zoom/3);
    ctx.fillStyle='#63391e';for(const x of [-.12,0,.12])ctx.fillRect(x*zoom-zoom*.025,0,zoom*.05,zoom*.11);
    ctx.restore();return;
  }
  const def=componentDefinition(c.type),b=componentBounds(c),sprite=componentSprite(c),im=assets[sprite.file];
  const p=screen(b.x+b.width/2,b.y+b.height/2);ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);ctx.rotate(sprite.turn*Math.PI/2);if(sprite.flip)ctx.scale(-1,1);
  const w=(sprite.turn%2?b.height:b.width)*zoom,h=(sprite.turn%2?b.width:b.height)*zoom;
  if(im){const visual=componentVisual(c);if(visual){ctx.drawImage(im,...visual.source,(visual.x-.5)*zoom,(visual.y-.5)*zoom,visual.width*zoom,visual.height*zoom);}else{const scale=Math.min(w/im.width,h/im.height);ctx.drawImage(im,-im.width*scale/2,-im.height*scale/2,im.width*scale,im.height*scale);}}
  else{ctx.fillStyle=def.color;ctx.fillRect(-w/2+2,-h/2+2,w-4,h-4);ctx.fillStyle='#172627';ctx.font=`${Math.max(9,zoom*.4)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(def.symbol,0,0);}
  ctx.restore();
}
function traceFieldBoundary(cells){
  ctx.beginPath();
  for(const k of cells){const [x,y]=point(k),p=screen(x,y);
    if(!cells.has(key(x,y-1))){ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+zoom,p.y);}
    if(!cells.has(key(x+1,y))){ctx.moveTo(p.x+zoom,p.y);ctx.lineTo(p.x+zoom,p.y+zoom);}
    if(!cells.has(key(x,y+1))){ctx.moveTo(p.x+zoom,p.y+zoom);ctx.lineTo(p.x,p.y+zoom);}
    if(!cells.has(key(x-1,y))){ctx.moveTo(p.x,p.y+zoom);ctx.lineTo(p.x,p.y);}
  }
}
function render(){if(!width)return;ctx.clearRect(0,0,width,height);const start=tileAt(0,0),end=tileAt(width,height);if($('field').checked&&state.engine){
ctx.save();ctx.fillStyle='#559e9418';ctx.beginPath();
for(const k of supportedField){const [x,y]=point(k),p=screen(x,y);ctx.rect(p.x,p.y,zoom,zoom);}ctx.fill();
ctx.strokeStyle='#89c4b990';ctx.lineWidth=1.5;traceFieldBoundary(supportedField);
ctx.stroke();ctx.restore();}

if($('grid').checked){ctx.lineWidth=1;for(let x=start.x;x<=end.x+1;x++){const p=screen(x,0);ctx.strokeStyle=x%5===0?'#68827e25':'#68827e12';ctx.beginPath();ctx.moveTo(Math.round(p.x)+.5,0);ctx.lineTo(Math.round(p.x)+.5,height);ctx.stroke();}for(let y=start.y;y<=end.y+1;y++){const p=screen(0,y);ctx.strokeStyle=y%5===0?'#68827e25':'#68827e12';ctx.beginPath();ctx.moveTo(0,Math.round(p.y)+.5);ctx.lineTo(width,Math.round(p.y)+.5);ctx.stroke();}}
const floorTiles=new Set(state.floor);for(const k of state.floor)connectedSprite(k,floorTiles,'floor');
drawHull(ctx,hullLayout,hullTextures,screen,zoom);
if(state.engine&&assets.engine){const p=screen(state.engine.x-1,state.engine.y-1);ctx.drawImage(assets.engine,p.x,p.y,zoom*3,zoom*3);}for(const e of state.extenders){const p=screen(e.x,e.y);if(assets.extender)ctx.drawImage(assets.extender,p.x,p.y,zoom,zoom);}
for(const c of state.components||[])drawComponent(c);
if($('exhaust').checked)for(const k of new Set((state.components||[]).flatMap(exhaustCells)))tileRect(k,'#d4a16a26');
if($('issues').checked){for(const k of validation.blockedExhaust)tileRect(k,'#e977605c');for(const c of [...validation.missingWall,...validation.blockedPumps,...validation.outsideComponents])for(const k of componentCells(c))tileRect(k,'#e977605c');for(const k of new Set([...validation.disconnected,...validation.outside]))tileRect(k,'#df6f654f');for(const k of validation.missing){tileRect(k,'#dc956735');const [x,y]=point(k),p=screen(x,y);ctx.strokeStyle='#eca17d';ctx.lineWidth=1.5;ctx.strokeRect(p.x+2,p.y+2,zoom-4,zoom-4);}}
if(layer&&hover&&!drag?.pan){
  const def=componentDefinition(layer),remove=drag?drag.erase:erase;
  const candidate=def?{type:layer,x:hover.x,y:hover.y,rotation}:null;
  const points=drag?shapeCells(shape,drag.start,hover):[key(hover.x,hover.y)];
  const hit=def&&remove?(state.components||[]).find(c=>c.type===layer&&componentCells(c).includes(key(hover.x,hover.y))):null;
  const actual=def?(remove?(hit?componentCells(hit):points):componentCells(candidate)):layer==='engine'&&!remove?footprint(hover,3):points;
  const valid=remove||apply(state,layer,[key(hover.x,hover.y)],false,rotation).rejected===0;
  if(def&&!remove){if($('exhaust').checked)for(const k of exhaustCells(candidate))tileRect(k,'#dfb47e45');drawComponent(candidate,.6);}
  for(const k of actual){tileRect(k,remove?'#e7907c55':valid?'#c4dbac50':'#dd766551');const [x,y]=point(k),p=screen(x,y);ctx.strokeStyle=remove||!valid?'#dfa28d':'#cedfbc';ctx.lineWidth=1;ctx.strokeRect(p.x+.5,p.y+.5,zoom-1,zoom-1);}
  if((shape==='circle'||shape==='disc')&&drag){const c=screen(drag.start.x+.5,drag.start.y+.5);ctx.fillStyle='#e2ebd4';ctx.fillRect(c.x-2,c.y-2,4,4);}
}

// Selection and movement overlays do not change the design until a valid drop.
if(!layer){
  const moving=drag?.move;
  const result=moving?moveItem(state,selection,drag.target):null;
  const highlighted=moving?itemCells(result.rejected?state:result.state,result.item):itemCells(state,selection);
  if(moving){
    const original=itemPosition(state,selection),preview={...original,...drag.target};
    const cells=selection.kind==='component'?componentCells(preview):selection.kind==='engine'?footprint(preview,3):[key(preview.x,preview.y)];
    for(const k of cells)tileRect(k,result.rejected?'#dd766566':'#b9dab855');
    if(selection.kind==='component')drawComponent(preview,.7);
    else if(selection.kind==='engine'||selection.kind==='extender'){
      const im=assets[selection.kind],size=selection.kind==='engine'?3:1,p=screen(preview.x-(size===3?1:0),preview.y-(size===3?1:0));
      if(im){ctx.save();ctx.globalAlpha=.7;ctx.drawImage(im,p.x,p.y,zoom*size,zoom*size);ctx.restore();}
    }
  }
  ctx.save();ctx.strokeStyle=moving&&result.rejected?'#ed9985':'#f1cc7b';ctx.lineWidth=2;
  for(const k of highlighted){const [x,y]=point(k),p=screen(x,y);ctx.strokeRect(p.x+1,p.y+1,zoom-2,zoom-2);}ctx.restore();
}
// Draw last so the original placement limit stays visible over floor, hull and extended fields.
const highlightEngine=!!state.engine&&layer==='extender'&&!erase&&!drag?.erase;
$('engine-boundary-legend').hidden=!highlightEngine;
if(highlightEngine){
  const originalField=fieldCells({engine:state.engine,extenders:[]});
  ctx.save();traceFieldBoundary(originalField);ctx.lineJoin='round';
  ctx.strokeStyle='#142326';ctx.lineWidth=6;ctx.stroke();
  ctx.strokeStyle='#f1cc7b';ctx.lineWidth=2.5;ctx.stroke();ctx.restore();
}
$('zoom-level').textContent=`${Math.round(zoom/22*100)}%`;}
function tileAt(x,y){return {x:Math.floor((x-width/2-offset.x)/zoom),y:Math.floor((y-height/2-offset.y)/zoom)};}
function resize(){const r=$('board').getBoundingClientRect();width=r.width;height=r.height;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);render();}new ResizeObserver(resize).observe($('board'));
function applyCells(cells,remove){const r=apply(state,layer,cells,remove,rotation);state=r.state;if(r.rejected)drag&&(drag.message=r.message);}
function pointerWorld(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left-width/2-offset.x)/zoom,y:(e.clientY-r.top-height/2-offset.y)/zoom};}
canvas.onpointerdown=e=>{
  if(e.button!==0&&e.button!==1&&e.button!==2)return;
  e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);hover=tile(e);
  if(space||e.button===1){drag={pan:true,x:e.clientX,y:e.clientY,offset:{...offset}};canvas.style.cursor='grabbing';return;}
  if(e.button===2&&(!layer||!hitItem(state,pointerWorld(e)))){chooseLayer(null);return;}
  if(!layer){
    selection=hitItem(state,pointerWorld(e));
    if(selection){const p=itemPosition(state,selection);drag={move:true,start:{...hover},origin:{x:p.x,y:p.y},target:{x:p.x,y:p.y}};}
    refresh();return;
  }
  drag={start:hover,last:hover,erase:erase||e.button===2,before:structuredClone(state),message:''};
  if(shape==='single')applyCells([key(hover.x,hover.y)],drag.erase);refresh();
};
canvas.onpointermove=e=>{
  hover=tile(e);$('coordinates').textContent=`X ${hover.x} · Y ${hover.y}`;
  if(drag?.pan)offset={x:drag.offset.x+e.clientX-drag.x,y:drag.offset.y+e.clientY-drag.y};
  else if(drag?.move){drag.target={x:drag.origin.x+hover.x-drag.start.x,y:drag.origin.y+hover.y-drag.start.y};canvas.style.cursor='grabbing';}
  else if(drag&&shape==='single'&&(!componentDefinition(layer)||drag.erase)){const cells=shapeCells('diagonal',drag.last,hover);applyCells(cells,drag.erase);drag.last=hover;refresh();}
  render();
};
function finish(e,cancel=false){
  if(!drag)return;
  if(drag.pan){drag=null;canvas.style.cursor=layer?'crosshair':'grab';return;}
  if(drag.move){
    const d=drag;drag=null;
    if(cancel){refresh();return;}
    if(e){const end=tile(e);d.target={x:d.origin.x+end.x-d.start.x,y:d.origin.y+end.y-d.start.y};}
    const result=moveItem(state,selection,d.target);
    if(result.rejected){toast(result.message);refresh();return;}
    selection=result.item;commit(result.state);refresh();return;
  }
  const d=drag;
  if(cancel)state=d.before;
  else if(shape!=='single')applyCells(shapeCells(shape,d.start,hover||d.start),d.erase);
  drag=null;
  if(JSON.stringify(d.before)!==JSON.stringify(state)){undo.push(d.before);if(undo.length>80)undo.shift();redo=[];changed();}else refresh();
  if(d.message&&!cancel)toast(d.message);render();
}

canvas.onpointerup=finish;canvas.onpointercancel=e=>finish(e,true);canvas.onlostpointercapture=()=>{if(drag)finish(null,true);};canvas.onpointerleave=()=>{if(!drag){hover=null;render();}};canvas.oncontextmenu=e=>e.preventDefault();
function zoomBy(f,at={x:width/2,y:height/2}){const next=Math.max(8,Math.min(58,zoom*f)),ratio=next/zoom;offset={x:at.x-width/2-(at.x-width/2-offset.x)*ratio,y:at.y-height/2-(at.y-height/2-offset.y)*ratio};zoom=next;render();}
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoomBy(Math.exp(-e.deltaY*.001),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});$('zoom-in').onclick=()=>zoomBy(1.25);$('zoom-out').onclick=()=>zoomBy(.8);
function center(){const tiles=[...state.floor,...state.hull,...(state.engine?footprint(state.engine,3):[]),...state.extenders.map(e=>key(e.x,e.y)),...(state.components||[]).flatMap(componentCells)];if(!tiles.length){offset={x:0,y:0};zoom=22;}else{const ps=tiles.map(point),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys);zoom=Math.max(8,Math.min(32,(width-120)/(b-a+5),(height-120)/(d-c+5)));offset={x:-(a+b+1)/2*zoom,y:-(c+d+1)/2*zoom};}hover=null;render();}$('center').onclick=center;
function history(back){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;if(drag)finish(null,true);selection=null;to.push(structuredClone(state));state=from.pop();changed();}$('undo').onclick=()=>history(true);$('redo').onclick=()=>history(false);
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea')||document.querySelector('dialog[open]'))return;if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['q','e'].includes(e.key.toLowerCase())){e.preventDefault();rotateSelected(e.key.toLowerCase()==='q'?-1:1);}if(e.code==='Space'){space=true;e.preventDefault();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(!e.shiftKey);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if(e.key==='Escape'){chooseLayer(null);hover=null;render();}});window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;finish(null,true);});
$('name').oninput=changed;
let confirmAction=null;function confirm(title,text,action){$('confirm-title').textContent=title;$('confirm-text').textContent=text;confirmAction=action;$('confirm-dialog').showModal();}$('cancel-confirm').onclick=()=>$('confirm-dialog').close();$('accept-confirm').onclick=()=>{$('confirm-dialog').close();confirmAction?.();};
function save(){const library=readLibrary(),id=savedId||crypto.randomUUID(),name=$('name').value.trim()||'Untitled gravship';const item={id,name,updated:Date.now(),state:structuredClone(state)},i=library.findIndex(d=>d.id===id);if(i>=0)library[i]=item;else library.push(item);if(store(STORAGE,library)){savedId=id;dirty=false;$('name').value=name;draft();refresh();toast('Design saved in this browser.');}}$('save').onclick=save;
$('new').onclick=()=>{const action=()=>{commit(blank());savedId=null;$('name').value='Untitled gravship';dirty=false;chooseLayer('engine');draft();center();};if(state.engine||state.floor.length||state.hull.length||(state.components||[]).length)confirm('Start a new gravship?','The current canvas will be cleared. Save your design first if you want to keep it.',action);else action();};
function library(){const list=$('design-list');list.replaceChildren();const items=readLibrary().sort((a,b)=>b.updated-a.updated);if(!items.length){const p=document.createElement('p');p.textContent='No saved designs yet. Use Save design to keep your first gravship.';list.append(p);}for(const item of items){const row=document.createElement('div');row.className='saved-row';const info=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('small');name.textContent=item.name;meta.textContent=`${item.state?.floor?.length||0} tiles · ${new Date(item.updated).toLocaleDateString()}`;info.append(name,meta);const load=document.createElement('button');load.textContent='Load';load.onclick=()=>{const action=()=>{try{const next=sanitize(item.state);undo.push(structuredClone(state));redo=[];state=next;selection=null;savedId=item.id;$('name').value=item.name;dirty=false;$('library').close();draft();refresh();center();toast('Design loaded.');}catch{toast('This saved design could not be loaded.');}};if(dirty)confirm('Load this design?','Your unsaved canvas changes will be replaced.',action);else action();};const del=document.createElement('button');del.textContent='Delete';del.onclick=()=>confirm('Delete saved design?',`“${item.name}” will be removed from this browser.`,()=>{if(store(STORAGE,readLibrary().filter(d=>d.id!==item.id))){if(savedId===item.id){savedId=null;dirty=true;draft();}library();refresh();}});row.append(info,load,del);list.append(row);}}
$('load').onclick=()=>{library();$('library').showModal();};$('close-library').onclick=()=>$('library').close();
try{const d=JSON.parse(localStorage.getItem(DRAFT));if(d){state=sanitize(d.state);$('name').value=typeof d.name==='string'?d.name:'Untitled gravship';savedId=d.savedId||null;dirty=!!d.dirty;if(state.engine)layer='floor';}}catch{toast('Could not restore the previous canvas. Start a new design.');}
for(const [id,file] of Object.entries(paths)){const im=new Image();im.onload=()=>{assets[id]=im;render();};im.src=`assets/${file}`;}
for(const ref of HULL_REFERENCES){
  const im=new Image();im.onload=()=>{hullTextures[ref.id]=prepareHullTexture(im,ref,(w,h)=>{if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(w,h);const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;});render();};im.src=`assets/${ref.file}`;
}
for(const def of COMPONENTS)for(const file of new Set(Object.values(def.sprites))){
  const im=new Image();im.onload=()=>{assets[file]=im;render();};im.onerror=()=>console.warn(`Component image unavailable: ${file}`);im.src=`assets/${file}`;
}
refresh();resize();if(state.engine)center();
