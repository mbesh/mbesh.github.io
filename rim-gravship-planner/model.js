import {COMPONENTS,componentDefinition,componentBounds,componentCells,exhaustCells,pumpMount,normalizeRotation} from './components.js';
export const key=(x,y)=>`${x},${y}`;
export const point=k=>k.split(',').map(Number);
export const blank=()=>({engine:null,extenders:[],floor:[],hull:[],components:[]});
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function footprint(p,size=1){const a=[];for(let y=p.y-Math.floor(size/2);y<=p.y+Math.floor(size/2);y++)for(let x=p.x-Math.floor(size/2);x<=p.x+Math.floor(size/2);x++)a.push(key(x,y));return a;}
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
export function inEngineField(engine,p){
  return inRowField(engine,p,ENGINE_ROW_HALF_WIDTHS);
}
export function inExtenderField(extender,p){
  return inRowField(extender,p,EXTENDER_ROW_HALF_WIDTHS);
}
export function inField(s,p){return !!s.engine&&(inEngineField(s.engine,p)||s.extenders.some(e=>inEngineField(s.engine,e)&&inExtenderField(e,p)));}
export const capacity=s=>s.engine?500+250*s.extenders.filter(e=>inEngineField(s.engine,e)).length:0;
// The overlay and placement rules share the same set of supported tile centers.
export function fieldCells(s){
  const cells=new Set();
  if(!s.engine)return cells;
  for(let dy=-18;dy<=18;dy++){
    const half=ENGINE_ROW_HALF_WIDTHS[Math.abs(dy)];
    for(let dx=-half;dx<=half;dx++)cells.add(key(s.engine.x+dx,s.engine.y+dy));
  }
  for(const e of s.extenders.filter(e=>inEngineField(s.engine,e)))
    for(let dy=-16;dy<=16;dy++){
      const half=EXTENDER_ROW_HALF_WIDTHS[Math.abs(dy)];
      for(let dx=-half;dx<=half;dx++)cells.add(key(e.x+dx,e.y+dy));
    }
  return cells;
}
function componentCenter(c){const b=componentBounds(c);return {x:b.x+(b.width-1)/2,y:b.y+(b.height-1)/2};}
export function validate(s){
  const floor=new Set(s.floor),connected=new Set(),queue=[],components=s.components||[];
  if(s.engine)for(const k of footprint(s.engine,3))if(floor.has(k)){connected.add(k);queue.push(k);}
  for(let i=0;i<queue.length;i++){
    const [x,y]=point(queue[i]);
    for(const n of [key(x-1,y),key(x+1,y),key(x,y-1),key(x,y+1)])if(floor.has(n)&&!connected.has(n)){connected.add(n);queue.push(n);}
  }
  const disconnected=s.floor.filter(k=>!connected.has(k));
  const outside=s.floor.filter(k=>{const [x,y]=point(k);return !inField(s,{x,y});});
  const required=[...(s.engine?footprint(s.engine,3):[]),...s.extenders.flatMap(e=>footprint(e)),...s.hull,...components.flatMap(componentCells)];
  const missing=[...new Set(required.filter(k=>!floor.has(k)))];
  const structures=new Set([...(s.engine?footprint(s.engine,3):[]),...s.extenders.flatMap(e=>footprint(e)),...s.hull,...components.flatMap(componentCells)]);
  const blockedExhaust=[...new Set(components.flatMap(exhaustCells).filter(k=>floor.has(k)||structures.has(k)))];
  const missingWall=components.filter(c=>componentDefinition(c.type).wallMounted&&!s.hull.includes(key(c.x,c.y)));
  const blockedPumps=components.filter(c=>c.type==='oxygen-pump'&&s.hull.includes(key(pumpMount(c).facingTile.x,pumpMount(c).facingTile.y)));
  const outsideComponents=components.filter(c=>componentCells(c).some(k=>{const [x,y]=point(k);return !inField(s,{x,y});})||(componentDefinition(c.type).engineField&&!inEngineField(s.engine,componentCenter(c))));
  const overLimits=COMPONENTS.filter(d=>d.limit&&components.filter(c=>c.type===d.id).length>d.limit);
  return {disconnected,outside,missing,blockedExhaust,missingWall,blockedPumps,outsideComponents,overLimits,over:Math.max(0,s.floor.length-capacity(s)),invalidExtenders:s.extenders.filter(e=>!inEngineField(s.engine,e))};
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
export function apply(s,layer,cells,erase=false,rotation=0){
  const next=structuredClone(s);next.components??=[];
  let rejected=0,message='';const fail=m=>{rejected++;message=m;};
  const def=componentDefinition(layer);
  const occupied=(k,allowWall=false)=>!!(next.engine&&footprint(next.engine,3).includes(k)||next.extenders.some(e=>key(e.x,e.y)===k)||(!allowWall&&next.hull.includes(k))||next.components.some(c=>componentCells(c).includes(k)));
  if(def){
    for(const k of cells){
      if(erase){next.components=next.components.filter(c=>c.type!==layer||!componentCells(c).includes(k));continue;}
      const [x,y]=point(k),c={type:layer,x,y,rotation:normalizeRotation(layer,rotation)},foot=componentCells(c);
      if(def.wallMounted&&!next.hull.includes(k)){fail('Oxygen pumps must be mounted on a hull tile.');continue;}
      if(layer==='oxygen-pump'){
        const front=pumpMount(c).facingTile;
        if(next.hull.includes(key(front.x,front.y))){fail('Rotate the oxygen pump to face a non-hull tile.');continue;}
      }
      if(def.limit&&next.components.filter(c=>c.type===layer).length>=def.limit){fail(`A maximum of ${def.limit} ${def.name.toLowerCase()} components is allowed.`);continue;}
      if(foot.some(k=>{const [x,y]=point(k);return !inField(next,{x,y});})||def.engineField&&!inEngineField(next.engine,componentCenter(c))){fail(def.engineField?'Place this component inside the original engine field.':'The entire component must be inside a supported grav field.');continue;}
      if(foot.some(k=>occupied(k,def.wallMounted||layer==='autodoor'))){fail('The component footprint overlaps another structure.');continue;}
      if(layer==='autodoor')next.hull=next.hull.filter(k=>!foot.includes(k));
      next.components.push(c);
    }
  }else if(layer==='engine'||layer==='extender'){
    for(const k of cells){
      const [x,y]=point(k),p={x,y};
      if(erase){if(layer==='engine'&&next.engine&&footprint(next.engine,3).includes(k)){next.engine=null;next.extenders=[];}if(layer==='extender')next.extenders=next.extenders.filter(e=>key(e.x,e.y)!==k);continue;}
      if(layer==='engine'){
        if(next.engine){fail('Only one grav engine is allowed. Erase it to reposition.');continue;}
        if(footprint(p,3).some(k=>occupied(k))){fail('The engine needs a clear 3 × 3 footprint.');continue;}
        next.engine=p;
      }else{
        if(!inEngineField(next.engine,p)){fail('Place extenders inside the engine’s original tile field.');continue;}
        if(next.extenders.length>=6){fail('A maximum of six extenders is allowed.');continue;}
        if(occupied(k)){fail('This tile is occupied by a structure.');continue;}
        next.extenders.push(p);
      }
    }
  }else{
    const set=new Set(next[layer]);
    for(const k of cells){
      if(erase){set.delete(k);continue;}if(set.has(k))continue;
      const [x,y]=point(k);
      if(!inField(next,{x,y})){fail('Tiles must be inside a supported grav field.');continue;}
      if(layer==='floor'&&set.size>=capacity(next)){fail('Substructure capacity reached. Add a field extender.');continue;}
      if(layer==='hull'&&next.components.some(c=>c.type==='oxygen-pump'&&key(pumpMount(c).facingTile.x,pumpMount(c).facingTile.y)===k)){fail('This tile must stay clear of hull for the oxygen pump facing it.');continue;}
      if(layer==='hull'&&(next.engine&&footprint(next.engine,3).includes(k)||next.extenders.some(e=>key(e.x,e.y)===k)||next.components.some(c=>c.type!=='autodoor'&&!componentDefinition(c.type).wallMounted&&componentCells(c).includes(k)))){fail('This tile is occupied by a structure.');continue;}
      if(layer==='hull')next.components=next.components.filter(c=>c.type!=='autodoor'||!componentCells(c).includes(k));
      set.add(k);
    }
    next[layer]=[...set];
  }
  return {state:next,rejected,message};
}

export function sanitize(raw){if(!raw||typeof raw!=='object')throw Error('Invalid design');const validPoint=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&Math.abs(p.x)<=110&&Math.abs(p.y)<=110;const tiles=a=>{if(!Array.isArray(a)||a.length>50000)throw Error('Invalid tiles');return [...new Set(a.filter(k=>typeof k==='string'&&/^-?\d+,-?\d+$/.test(k)&&validPoint(Object.fromEntries(['x','y'].map((v,i)=>[v,point(k)[i]])))))];};const s={engine:raw.engine===null?null:validPoint(raw.engine)?raw.engine:null,extenders:Array.isArray(raw.extenders)?raw.extenders.filter(validPoint).slice(0,6):[],floor:tiles(raw.floor),hull:tiles(raw.hull),components:[]};
  if(raw.components!==undefined&&!Array.isArray(raw.components))throw Error('Invalid components');
  s.components=(raw.components||[]).slice(0,2000).filter(c=>c&&componentDefinition(c.type)&&validPoint(c)).map(c=>({type:c.type,x:c.x,y:c.y,rotation:normalizeRotation(c.type,c.rotation)}));
  return s;}

// Selection descriptors refer to one placed item, independently of the build palette.
export function itemPosition(s,item){
  if(!item)return null;
  if(item.kind==='component')return s.components?.[item.index]||null;
  if(item.kind==='engine')return s.engine;
  if(item.kind==='extender')return s.extenders[item.index]||null;
  if(item.kind==='floor'||item.kind==='hull'){
    if(!s[item.kind].includes(item.key))return null;
    const [x,y]=point(item.key);return {x,y};
  }
  return null;
}
export function itemCells(s,item){
  const p=itemPosition(s,item);if(!p)return [];
  return item.kind==='component'?componentCells(p):item.kind==='engine'?footprint(p,3):[key(p.x,p.y)];
}
export function hitItem(s,p){
  const k=key(Math.floor(p.x),Math.floor(p.y));
  // Pump markers straddle an edge, so their visible half on the adjacent cell also selects them.
  for(let i=(s.components||[]).length-1;i>=0;i--){const c=s.components[i];if(c.type==='oxygen-pump'){
    const m=pumpMount(c);if(Math.abs(p.x-m.x)<=m.width/2&&Math.abs(p.y-m.y)<=m.height/2)return {kind:'component',index:i};
  }}
  for(let i=(s.components||[]).length-1;i>=0;i--)if(componentCells(s.components[i]).includes(k))return {kind:'component',index:i};
  if(s.engine&&footprint(s.engine,3).includes(k))return {kind:'engine'};
  const i=s.extenders.findIndex(e=>key(e.x,e.y)===k);if(i>=0)return {kind:'extender',index:i};
  if(s.hull.includes(k))return {kind:'hull',key:k};
  if(s.floor.includes(k))return {kind:'floor',key:k};
  return null;
}
export function moveItem(s,item,target){
  const p=itemPosition(s,item);
  const fail=message=>({state:s,rejected:1,message,item});
  if(!p)return fail('Select an existing component to move.');
  if(!Number.isInteger(target.x)||!Number.isInteger(target.y)||Math.abs(target.x)>110||Math.abs(target.y)>110)return fail('Move within the planning grid.');
  if(target.x===p.x&&target.y===p.y)return {state:s,rejected:0,message:'',item};
  if((item.kind==='floor'||item.kind==='hull')&&s[item.kind].includes(key(target.x,target.y)))return fail('The destination already contains this tile type.');
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
  return {...result,item:item.kind==='floor'||item.kind==='hull'?{...item,key:key(target.x,target.y)}:item};
}
