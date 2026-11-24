import {COMPONENTS,componentDefinition,componentBounds,componentCells,exhaustCells,pumpMount,normalizeRotation} from './components.js';
import {normalizeMods,componentEnabled,engineProfile,extenderProfile} from './mods.js';
import {normalizeScenario} from './scenario.js';
export const key=(x,y)=>`${x},${y}`;
export const point=k=>k.split(',').map(Number);
export const blank=(settings={})=>({engine:null,extenders:[],floor:[],hull:[],components:[],...(settings.mods?{mods:normalizeMods(settings.mods)}:{}),...(settings.engineType?{engineType:settings.engineType}:{}),...(settings.scenario?{scenario:normalizeScenario(settings.scenario)}:{})});
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function footprint(p,size=1){const a=[];for(let y=p.y-Math.floor(size/2);y<=p.y+Math.floor(size/2);y++)for(let x=p.x-Math.floor(size/2);x<=p.x+Math.floor(size/2);x++)a.push(key(x,y));return a;}
export const engineFootprint=(s,p=s.engine)=>p?footprint(p,engineProfile(s).width):[];
// Half-width of each row, indexed by absolute Y offset from the engine center.
// Matches the supplied in-game field: 37 rows, with an 11-tile top/bottom row.
const ENGINE_ROW_HALF_WIDTHS=Object.freeze([18,18,18,18,18,18,17,17,17,16,16,15,14,13,12,11,10,8,5]);
// Supplied extender screenshot: 33 rows, with an 11-tile top/bottom row.
const EXTENDER_ROW_HALF_WIDTHS=Object.freeze([16,16,16,16,16,16,15,15,14,14,13,12,11,10,9,7,5]);
function inRowField(center,p,rows){
  if(!center)return false;
  const dx=p.x-center.x,dy=p.y-center.y;
  return Number.isInteger(dx)&&Number.isInteger(dy)&&Math.abs(dy)<rows.length&&Math.abs(dx)<=rows[Math.abs(dy)];
}
function inRadius(center,p,radius){return !!center&&(p.x-center.x)**2+(p.y-center.y)**2<radius**2;}
export function inEngineField(engine,p,s){
  return normalizeMods(s?.mods).chapter1?inRadius(engine,p,engineProfile(s).fieldRadius):inRowField(engine,p,ENGINE_ROW_HALF_WIDTHS);
}
export function inExtenderField(extender,p,s){
  return normalizeMods(s?.mods).chapter1?inRadius(extender,p,extenderProfile(s).fieldRadius):inRowField(extender,p,EXTENDER_ROW_HALF_WIDTHS);
}
export function componentAnchor(c){const b=componentBounds(c);return {x:b.x+Math.floor((b.width-1)/2),y:b.y+Math.floor((b.height-1)/2)};}
export function fieldSources(s){
  if(!s.engine)return [];
  const sources=[{...s.engine,radius:engineProfile(s).fieldRadius,kind:'engine'}];
  const components=s.components||[],modded=normalizeMods(s.mods).chapter1;
  const generators=modded?components.filter(c=>componentEnabled(s,componentDefinition(c.type))&&componentDefinition(c.type).fieldRadius):[];
  // Amplifiers and dilutors must stay in the original engine field.
  for(const c of generators.filter(c=>c.type!=='VGE_GravshipStructuralBeam')){
    const p=componentAnchor(c),d=componentDefinition(c.type);
    if(inEngineField(s.engine,p,s))sources.push({...p,radius:d.fieldRadius,kind:c.type,component:c});
  }
  const amplifiers=sources.filter(p=>p.kind==='VGE_GravFieldAmplifier');
  for(const e of s.extenders)if(inEngineField(s.engine,e,s)||modded&&amplifiers.some(a=>inRadius(a,e,a.radius)))sources.push({...e,radius:extenderProfile(s).fieldRadius,kind:'extender',extender:e});
  const pending=generators.filter(c=>c.type==='VGE_GravshipStructuralBeam');
  for(let changed=true;changed&&pending.length;){
    changed=false;
    for(let i=pending.length-1;i>=0;i--){const c=pending[i],p=componentAnchor(c);
      if(sources.some(a=>inRadius(a,p,a.radius))){sources.push({...p,radius:componentDefinition(c.type).fieldRadius,kind:c.type,component:c});pending.splice(i,1);changed=true;}
    }
  }
  return sources;
}
export function inField(s,p){return fieldSources(s).some(a=>inRadius(a,p,a.radius));}
export function capacityDetails(s){
  if(!s.engine)return {base:0,bonus:0,multiplier:1,total:0};
  const sources=fieldSources(s),base=engineProfile(s).support;
  const bonus=sources.reduce((n,a)=>n+(a.kind==='extender'?extenderProfile(s).supportOffset:a.component?componentDefinition(a.kind).supportOffset||0:0),0);
  const multiplier=1+(s.components||[]).reduce((n,c)=>{const d=componentDefinition(c.type,s);return n+(componentEnabled(s,d)&&inField(s,componentAnchor(c))?(d.supportMultiplier||0):0);},0);
  return {base,bonus,multiplier,total:Math.max(0,Math.floor((base+bonus)*multiplier+1e-6))};
}
export const capacity=s=>capacityDetails(s).total;
// The overlay and placement rules share the same set of supported tile centers.
export function fieldCells(s){
  const cells=new Set();
  if(!s.engine)return cells;
  for(const source of fieldSources(s))for(let dy=-Math.floor(source.radius);dy<=Math.floor(source.radius);dy++){
    const half=Math.floor(Math.sqrt(source.radius**2-dy**2));
    for(let dx=-half;dx<=half;dx++)cells.add(key(source.x+dx,source.y+dy));
  }
  return cells;
}
function componentCenter(c){const b=componentBounds(c);return {x:b.x+(b.width-1)/2,y:b.y+(b.height-1)/2};}
export function validate(s){
  const floor=new Set(s.floor),foundation=new Set([...s.floor,...s.scaffold||[]]),connected=new Set(),queue=[],components=s.components||[];
  const sources=fieldSources(s),modded=normalizeMods(s.mods).chapter1;
  const supported=(x,y)=>sources.some(a=>(a.x-x)**2+(a.y-y)**2<a.radius**2);
  if(s.engine)for(const k of engineFootprint(s))if(foundation.has(k)){connected.add(k);queue.push(k);}
  for(let i=0;i<queue.length;i++){
    const [x,y]=point(queue[i]);
    for(const n of [key(x-1,y),key(x+1,y),key(x,y-1),key(x,y+1)])if(foundation.has(n)&&!connected.has(n)){connected.add(n);queue.push(n);}
  }
  const disconnected=[...foundation].filter(k=>!connected.has(k));
  const outside=[...foundation].filter(k=>{const [x,y]=point(k);return !supported(x,y);});
  const required=[...engineFootprint(s),...s.extenders.flatMap(e=>footprint(e)),...s.hull,...components.flatMap(componentCells)];
  const missing=[...new Set(required.filter(k=>!floor.has(k)))];
  const structures=new Set([...engineFootprint(s),...s.extenders.flatMap(e=>footprint(e)),...s.hull,...components.filter(c=>!componentDefinition(c.type).network).flatMap(componentCells)]);
  const blockedExhaust=[...new Set(components.flatMap(c=>exhaustCells(c,s)).filter(k=>foundation.has(k)||structures.has(k)))];
  const hull=new Set([...s.hull,...components.filter(c=>componentDefinition(c.type).hullLike).flatMap(componentCells)]);
  const missingWall=components.filter(c=>componentDefinition(c.type).wallMounted&&!hull.has(key(c.x,c.y)));
  const blockedPumps=components.filter(c=>(c.type==='oxygen-pump'||c.type==='VGE_IndustrialOxygenPump')&&hull.has(key(pumpMount(c).facingTile.x,pumpMount(c).facingTile.y)));
  const outsideComponents=components.filter(c=>{
    const d=componentDefinition(c.type,s),anchor=modded?componentAnchor(c):componentCenter(c);
    return !componentEnabled(s,d)||componentCells(c).some(k=>{const [x,y]=point(k);return !supported(x,y);})||d.engineField&&!inEngineField(s.engine,anchor,s);
  });
  const overLimits=COMPONENTS.map(d=>componentDefinition(d.id,s)).filter(d=>componentEnabled(s,d)&&d.limit&&components.filter(c=>c.type===d.id).length>d.limit);
  if(s.extenders.length>extenderProfile(s).limit)overLimits.push({id:'extender',name:'Field extender',limit:extenderProfile(s).limit});
  const disabledComponents=components.filter(c=>!componentEnabled(s,componentDefinition(c.type)));
  const occupancy=new Map();
  for(const k of [...engineFootprint(s),...s.extenders.map(e=>key(e.x,e.y)),...s.hull,...components.filter(c=>{const d=componentDefinition(c.type);return !d.network&&!d.wallMounted;}).flatMap(componentCells)])occupancy.set(k,(occupancy.get(k)||0)+1);
  const overlappingStructures=[...occupancy].filter(([,n])=>n>1).map(([k])=>k);
  const invalidExtenders=s.extenders.filter(e=>!sources.some(a=>a.extender===e));
  const outsideTiles=[...new Set([...outside,...s.hull.filter(k=>{const [x,y]=point(k);return !supported(x,y);}),...invalidExtenders.map(e=>key(e.x,e.y)),...outsideComponents.flatMap(componentCells)])];
  const unsupportedTiles=[...new Set([...outsideTiles,...missing])];
  return {disconnected,outside,outsideTiles,unsupportedTiles,missing,blockedExhaust,missingWall,blockedPumps,outsideComponents,overLimits,disabledComponents,overlappingStructures,disabledTerrain:!modded?(s.scaffold||[]):[],disabledEngine:!modded&&!!s.engine&&s.engineType&&s.engineType!=='standard',over:Math.max(0,s.floor.length-capacity(s)),invalidExtenders};
}

function line(a,b){const out=[];let x=a.x,y=a.y;const dx=Math.abs(b.x-x),dy=-Math.abs(b.y-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1;let err=dx+dy;while(true){out.push(key(x,y));if(x===b.x&&y===b.y)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}return out;}
// Drag distance selects the outermost tile offset (18 gives a 37-tile span).
// Use the same row masks as grav fields at their corresponding sizes.
function circleCells(type,center,edge){
  const extent=Math.min(110,Math.round(distance(center,edge)));
  const rows=extent===18?ENGINE_ROW_HALF_WIDTHS:extent===16?EXTENDER_ROW_HALF_WIDTHS:
    Array.from({length:extent+1},(_,y)=>Math.min(extent,Math.floor(Math.sqrt((extent+.9)**2-y*y))));
  const cells=[];
  for(let y=-extent;y<=extent;y++){
    const half=rows[Math.abs(y)];
    for(let x=-half;x<=half;x++){
      const p={x:center.x+x,y:center.y+y};
      if(type==='disc'||[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([nx,ny])=>
        Math.abs(ny)>extent||Math.abs(nx)>rows[Math.abs(ny)]))cells.push(key(p.x,p.y));
    }
  }
  return cells;
}
export function shapeCells(type,a,b){b={...b};if(type==='single')return [key(b.x,b.y)];if(type==='line'){if(Math.abs(b.x-a.x)>=Math.abs(b.y-a.y))b.y=a.y;else b.x=a.x;return line(a,b);}if(type==='diagonal')return line(a,b);const out=[];if(type==='circle'||type==='disc')return circleCells(type,a,b);const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)if(type==='filled'||x===minX||x===maxX||y===minY||y===maxY)out.push(key(x,y));return out;}
const PLACEMENT_OK=Object.freeze({rejected:0,message:''});
// Read-only rules shared by hover previews and actual edits. Ignore the source
// item while checking a move, without cloning or constructing a temporary ship.
export function checkPlacement(s,layer,k,rotation=0,{ignore=null,tiles=null}={}){
  const fail=message=>({rejected:1,message}),[x,y]=point(k),p={x,y};
  if(!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>110||Math.abs(y)>110)return fail('Place within the planning grid (X and Y from -110 to 110).');
  let outside=false,missingSupport=false;
  const engine=ignore?.kind==='engine'?null:s.engine;
  const extenders=ignore?.kind==='extender'?s.extenders.filter((_,i)=>i!==ignore.index):s.extenders;
  const components=ignore?.kind==='component'?(s.components||[]).filter((_,i)=>i!==ignore.index):s.components||[];
  const supportState=ignore?.kind==='component'||ignore?.kind==='extender'?{...s,components,extenders}:s;
  const hasHull=k=>!(ignore?.kind==='hull'&&ignore.key===k)&&s.hull.includes(k)||components.some(c=>componentDefinition(c.type).hullLike&&componentCells(c).includes(k));
  const occupied=(k,allowWall=false)=>!!(engine&&engineFootprint(s,engine).includes(k)||extenders.some(e=>key(e.x,e.y)===k)||!allowWall&&hasHull(k)||components.some(c=>!componentDefinition(c.type).network&&!(allowWall&&componentDefinition(c.type).hullLike)&&componentCells(c).includes(k)));
  const def=componentDefinition(layer,s);
  if(def){
    if(!componentEnabled(s,def))return fail('Enable this component’s mod chapter first.');
    const c={type:layer,x,y,rotation:normalizeRotation(layer,rotation,s)},foot=componentCells(c);
    const existingPipe=def.paintable&&components.some(c=>componentDefinition(c.type).network===def.network&&componentCells(c).some(k=>foot.includes(k)));
    if(components.length>=2000&&!existingPipe)return fail('A design can contain at most 2,000 components.');
    if(foot.some(k=>{const [x,y]=point(k);return Math.abs(x)>110||Math.abs(y)>110;}))return fail('Keep the full component within the planning grid.');
    missingSupport=foot.some(k=>!s.floor.includes(k));
    if(def.wallMounted&&!hasHull(k))return fail('Oxygen pumps must be mounted on a hull tile.');
    if(layer==='oxygen-pump'||layer==='VGE_IndustrialOxygenPump'){
      const front=pumpMount(c).facingTile;
      if(hasHull(key(front.x,front.y)))return fail('Rotate the oxygen pump to face a non-hull tile.');
    }
    if(def.limit&&components.filter(c=>c.type===layer).length>=def.limit)return fail(`A maximum of ${def.limit} ${def.name.toLowerCase()} components is allowed.`);
    const anchor=normalizeMods(s.mods).chapter1?componentAnchor(c):componentCenter(c);
    const supported=def.fieldRadius?inField(supportState,anchor):foot.every(k=>{const [x,y]=point(k);return inField(supportState,{x,y});});
    outside=!supported||!!(def.engineField&&!inEngineField(engine,anchor,s));
    if(def.network){if((!def.paintable||ignore)&&components.some(c=>componentDefinition(c.type).network===def.network&&componentCells(c).some(k=>foot.includes(k))))return fail('This tile already has a pipe in this network.');}
    else if(foot.some(k=>occupied(k,def.wallMounted||def.replacesHull||layer==='autodoor')))return fail('The component footprint overlaps another structure.');
  }else if(layer==='engine'){
    if(engine)return fail('Only one grav engine is allowed. Erase it to reposition.');
    if(engineFootprint(s,p).some(k=>{const [x,y]=point(k);return Math.abs(x)>110||Math.abs(y)>110;}))return fail('Keep the full engine within the planning grid.');
    if(engineFootprint(s,p).some(k=>occupied(k)))return fail(`The engine needs a clear ${engineProfile(s).width} × ${engineProfile(s).height} footprint.`);
    missingSupport=engineFootprint(s,p).some(k=>!s.floor.includes(k));
  }else if(layer==='extender'){
    missingSupport=!s.floor.includes(k);
    outside=!inEngineField(engine,p,s)&&!(normalizeMods(s.mods).chapter1&&fieldSources(s).some(a=>a.kind==='VGE_GravFieldAmplifier'&&inRadius(a,p,a.radius)));
    if(extenders.length>=extenderProfile(s).limit)return fail(`A maximum of ${extenderProfile(s).limit} extenders is allowed.`);
    if(occupied(k))return fail('This tile is occupied by a structure.');
  }else{
    const existing=tiles?tiles.has(k):!(ignore?.kind===layer&&ignore.key===k)&&(s[layer]||[]).includes(k);
    if(existing)return PLACEMENT_OK;
    outside=!inField(s,p);
    if(layer==='scaffold'&&!normalizeMods(s.mods).chapter1)return fail('Enable Chapter 1 to place subscaffold.');
    if(layer==='hull')missingSupport=!s.floor.includes(k);
    const count=tiles?tiles.size:s.floor.length-(ignore?.kind==='floor'?1:0);
    if(layer==='floor'&&count>=capacity(s))return fail('Substructure capacity reached. Add a field extender.');
    if(layer==='hull'&&components.some(c=>c.type==='oxygen-pump'&&key(pumpMount(c).facingTile.x,pumpMount(c).facingTile.y)===k))return fail('This tile must stay clear of hull for the oxygen pump facing it.');
    if(layer==='hull'&&(engine&&engineFootprint(s,engine).includes(k)||extenders.some(e=>key(e.x,e.y)===k)||components.some(c=>c.type!=='autodoor'&&!componentDefinition(c.type).replacesHull&&!componentDefinition(c.type).wallMounted&&!componentDefinition(c.type).network&&componentCells(c).includes(k))))return fail('This tile is occupied by a structure.');
  }
  return outside||missingSupport?{...PLACEMENT_OK,...(outside?{outside:true}:{}),...(missingSupport?{missingSupport:true}:{})}:PLACEMENT_OK;
}
export function apply(s,layer,cells,erase=false,rotation=0){
  const next=structuredClone(s);next.components??=[];
  if(layer==='scaffold')next.scaffold??=[];
  let rejected=0,message='';
  const def=componentDefinition(layer),tiles=!def&&layer!=='engine'&&layer!=='extender'?new Set(next[layer]):null;
  for(const k of cells){
    if(erase){
      if(def)next.components=next.components.filter(c=>c.type!==layer||!componentCells(c).includes(k));
      else if(layer==='engine'&&next.engine&&engineFootprint(next).includes(k)){next.engine=null;next.extenders=[];}
      else if(layer==='extender')next.extenders=next.extenders.filter(e=>key(e.x,e.y)!==k);
      else if(tiles)tiles.delete(k);
      continue;
    }
    if(tiles?.has(k))continue;
    const result=checkPlacement(next,layer,k,rotation,{tiles});
    if(result.rejected){rejected++;message=result.message;continue;}
    if(def?.paintable&&next.components.some(c=>componentDefinition(c.type).network===def.network&&componentCells(c).includes(k)))continue;
    const [x,y]=point(k);
    if(def){
      const c={type:layer,x,y,rotation:normalizeRotation(layer,rotation,next)};
      if(layer==='autodoor'||def.replacesHull){const foot=componentCells(c);next.hull=next.hull.filter(k=>!foot.includes(k));next.components=next.components.filter(c=>!componentDefinition(c.type).hullLike||!componentCells(c).some(k=>foot.includes(k)));}
      next.components.push(c);
    }else if(layer==='engine')next.engine={x,y};
    else if(layer==='extender')next.extenders.push({x,y});
    else{
      if(layer==='hull')next.components=next.components.filter(c=>!(c.type==='autodoor'||componentDefinition(c.type).replacesHull)||!componentCells(c).includes(k));
      if(layer==='floor'&&next.scaffold)next.scaffold=next.scaffold.filter(t=>t!==k);
      if(layer==='scaffold')next.floor=next.floor.filter(t=>t!==k);
      tiles.add(k);
    }
  }
  if(tiles)next[layer]=[...tiles];
  return {state:next,rejected,message};
}

export function sanitize(raw){if(!raw||typeof raw!=='object')throw Error('Invalid design');const validPoint=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&Math.abs(p.x)<=110&&Math.abs(p.y)<=110;const tiles=a=>{if(!Array.isArray(a)||a.length>50000)throw Error('Invalid tiles');return [...new Set(a.filter(k=>typeof k==='string'&&/^-?\d+,-?\d+$/.test(k)&&validPoint(Object.fromEntries(['x','y'].map((v,i)=>[v,point(k)[i]])))))];};const s={engine:raw.engine===null?null:validPoint(raw.engine)?{x:raw.engine.x,y:raw.engine.y}:null,extenders:Array.isArray(raw.extenders)?raw.extenders.filter(validPoint).slice(0,10):[],floor:tiles(raw.floor),hull:tiles(raw.hull),components:[]};
  if(raw.mods)s.mods=normalizeMods(raw.mods);
  if(raw.scenario!==undefined)s.scenario=normalizeScenario(raw.scenario);
  if(raw.engineType)s.engineType=['standard','VGE_GravjumperEngine','VGE_GravhulkEngine'].includes(raw.engineType)?raw.engineType:'standard';
  if(raw.scaffold!==undefined)s.scaffold=tiles(raw.scaffold).filter(k=>!s.floor.includes(k));
  if(raw.components!==undefined&&!Array.isArray(raw.components))throw Error('Invalid components');
  s.components=(raw.components||[]).slice(0,2000).filter(c=>c&&componentDefinition(c.type)&&validPoint(c)).map(c=>({type:c.type,x:c.x,y:c.y,rotation:normalizeRotation(c.type,c.rotation,s)}));
  return s;}

// Selection descriptors refer to one placed item, independently of the build palette.
export function itemPosition(s,item){
  if(!item)return null;
  if(item.kind==='component')return s.components?.[item.index]||null;
  if(item.kind==='engine')return s.engine;
  if(item.kind==='extender')return s.extenders[item.index]||null;
  if(item.kind==='floor'||item.kind==='hull'||item.kind==='scaffold'){
    if(!s[item.kind].includes(item.key))return null;
    const [x,y]=point(item.key);return {x,y};
  }
  return null;
}
export function itemCells(s,item){
  const p=itemPosition(s,item);if(!p)return [];
  return item.kind==='component'?componentCells(p):item.kind==='engine'?engineFootprint(s,p):[key(p.x,p.y)];
}
export function hitItem(s,p){
  const k=key(Math.floor(p.x),Math.floor(p.y));
  // Pump markers straddle an edge, so their visible half on the adjacent cell also selects them.
  for(let i=(s.components||[]).length-1;i>=0;i--){const c=s.components[i];if(c.type==='oxygen-pump'){
    const m=pumpMount(c);if(Math.abs(p.x-m.x)<=m.width/2&&Math.abs(p.y-m.y)<=m.height/2)return {kind:'component',index:i};
  }}
  for(let i=(s.components||[]).length-1;i>=0;i--)if(!componentDefinition(s.components[i].type).network&&componentCells(s.components[i]).includes(k))return {kind:'component',index:i};
  if(s.engine&&engineFootprint(s).includes(k))return {kind:'engine'};
  const i=s.extenders.findIndex(e=>key(e.x,e.y)===k);if(i>=0)return {kind:'extender',index:i};
  if(s.hull.includes(k))return {kind:'hull',key:k};
  for(let i=(s.components||[]).length-1;i>=0;i--)if(componentCells(s.components[i]).includes(k))return {kind:'component',index:i};
  if(s.floor.includes(k))return {kind:'floor',key:k};
  if(s.scaffold?.includes(k))return {kind:'scaffold',key:k};
  return null;
}
export function previewMove(s,item,target){
  const p=itemPosition(s,item),fail=message=>({rejected:1,message,item,cells:[]});
  if(!p)return fail('Select an existing component to move.');
  if(!Number.isInteger(target.x)||!Number.isInteger(target.y)||Math.abs(target.x)>110||Math.abs(target.y)>110)return fail('Move within the planning grid.');
  const position={...p,x:target.x,y:target.y};
  const cells=item.kind==='component'?componentCells(position):item.kind==='engine'?engineFootprint(s,position):[key(target.x,target.y)];
  let outside=false,missingSupport=false;
  if(target.x!==p.x||target.y!==p.y){
    if((item.kind==='floor'||item.kind==='hull'||item.kind==='scaffold')&&s[item.kind].includes(key(target.x,target.y)))return fail('The destination already contains this tile type.');
    const result=checkPlacement(s,item.kind==='component'?p.type:item.kind,key(target.x,target.y),p.rotation||0,{ignore:item});
    if(result.rejected)return fail(result.message);
    outside=!!result.outside;
    missingSupport=!!result.missingSupport;
  }else{
    const result=checkPlacement(s,item.kind==='component'?p.type:item.kind,key(p.x,p.y),p.rotation||0,{ignore:item});
    outside=!!result.outside;missingSupport=!!result.missingSupport;
  }
  return {rejected:0,message:'',item,position,cells,outside,missingSupport};
}
export function moveItem(s,item,target){
  const preview=previewMove(s,item,target),fail=message=>({state:s,rejected:1,message,item});
  if(preview.rejected)return fail(preview.message);
  const p=itemPosition(s,item);
  if(target.x===p.x&&target.y===p.y)return {state:s,rejected:0,message:'',item};
  const next=structuredClone(s);let layer=item.kind,rotation=0;
  if(item.kind==='component'){layer=p.type;rotation=p.rotation;next.components.splice(item.index,1);}
  else if(item.kind==='engine')next.engine=null;
  else if(item.kind==='extender')next.extenders.splice(item.index,1);
  else next[item.kind]=next[item.kind].filter(k=>k!==item.key);
  const result=apply(next,layer,[key(target.x,target.y)],false,rotation);
  if(result.rejected)return fail(result.message);
  if(item.kind==='component'){
    const moved=result.state.components.pop();result.state.components.splice(item.index,0,moved);
  }else if(item.kind==='extender'){
    const moved=result.state.extenders.pop();result.state.extenders.splice(item.index,0,moved);
  }
  return {...result,item:item.kind==='floor'||item.kind==='hull'||item.kind==='scaffold'?{...item,key:key(target.x,target.y)}:item};
}
export function rotateItem(s,item,delta){
  const current=item?.kind==='component'?itemPosition(s,item):null;
  const fail=message=>({state:s,item,rejected:1,message});
  if(!current)return fail('Select an existing component to rotate.');
  if(!componentDefinition(current.type,s)?.rotate)return fail('This component does not rotate.');
  if(!Number.isInteger(delta))return fail('Choose a whole quarter turn.');
  const rotation=normalizeRotation(current.type,normalizeRotation(current.type,current.rotation,s)+delta,s);
  if(rotation===current.rotation)return {state:s,item,rejected:0,message:''};
  const before=componentBounds(current,s),after=componentBounds({...current,rotation},s);
  // Keep the central grid tile as a stable pivot, including even-sized footprints.
  // Four turns (or two for an autodoor) return to the original position.
  const x=current.x+Math.floor(before.width/2)-Math.floor(after.width/2);
  const y=current.y+Math.floor(before.height/2)-Math.floor(after.height/2);
  const candidate={...current,x,y,rotation};
  if(componentCells(candidate).some(k=>{const [x,y]=point(k);return Math.abs(x)>110||Math.abs(y)>110;}))return fail('Rotate within the planning grid.');
  const withoutCurrent={...s,components:s.components.filter((_,i)=>i!==item.index)};
  const result=apply(withoutCurrent,current.type,[key(x,y)],false,rotation);
  if(result.rejected)return fail(result.message);
  const rotated=result.state.components.pop(),index=Math.min(item.index,result.state.components.length);
  result.state.components.splice(index,0,{...current,...rotated});
  return {...result,item:{...item,index}};
}
