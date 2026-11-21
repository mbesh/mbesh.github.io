import {barrierJoins,componentCells} from './components.js';
const key=(x,y)=>`${x},${y}`;
const point=k=>k.split(',').map(Number);
// Reference grids describe placement, not decorative pixels that overhang a cell.
export const HULL_REFERENCES=[
  ['single','hull-1x1.png',['H']],
  ['horizontal2','hull-2x1.png',['HH']],
  ['horizontal3','hull-3x1.png',['HHH']],
  ['vertical2','hull-1x2.png',['H','H']],
  ['vertical3','hull-1x3.png',['H','H','H']],
  ['square2','hull-2x2.png',['HH','HH']],
  ['rectangle','hull-3x2.png',['HHH','HHH']],
  ['square3','hull-3x3.png',['HHH','HHH','HHH']],
  ['diagonal','hull-diagonal-empty.png',['.H','H.']],
  ['diagonalFloorNW','hull-diagonal-floor-upper-left.png',['SH','H.']],
  ['diagonalFloorSE','hull-diagonal-floow-lower-left.png',['.H','HS']],
  ['diagonalFloorBoth','hull-diagonal-floor-both.png',['SH','HS']],
  ['diagonalMirrored','hull-diagonal-mirrored.png',['H.','.H']],
  ['corner','hull-corner-empty.png',['.H','HH']],
  ['cornerFloor','hull-corner-floor.png',['SH','HH']],
  ['chain','hull-diagonal-chain.png',['..H','.H.','H..']],
  ['transitionStraight','hull-transition-diagonal-straight.png',['HHSS','..HH']],
  ['extendedCornerFloor','hull-corner-extended-floor.png',['HS','HS','HH']],
  ['transitionCorner','hull-transition-diagonal-corner.png',['HHS','.HH']],
  ['tEmpty','hull-junction-t-empty.png',['HHH','.H.','.H.']],
  ['tFloor','hull-junction-t-floor.png',['HHH','SHS','SHS']],
  ['bend','hull-diagonal-bend-empty.png',['H.H','.H.']],
  ['diagonalCross','hull-diagonal-cross-empty.png',['H.H','.H.','H.H']],
  ['hole','hull-hole-empty.png',['HHH','H.H','HHH']],
  ['staircaseFloor','hull-staircase-floor.png',['HHSS','.HHS','..HH']],
  ['cardinalCross','hull-cardinal-cross-empty.png',['.H.','HHH','.H.']],
].map(([id,file,rows])=>Object.freeze({id,file,rows,cols:rows[0].length,height:rows.length}));
const at=(rows,x,y)=>rows[y]?.[x]||'.';
const idx=(x,y)=>(y+2)*5+x+2;
function transform(x,y,turns,flip){if(flip)x=-x;for(let t=0;t<turns;t++)[x,y]=[-y,x];return [x,y];}
function cornerCut(signature,qx,qy){
  if(signature[12]!=='H')return false;
  const sx=qx?1:-1,sy=qy?1:-1,h=(x,y)=>signature[idx(x,y)]==='H';
  return !h(sx,0)&&!h(0,sy)&&((h(sx,-sy)&&h(0,-sy))||(h(-sx,sy)&&h(-sx,0)));
}
const cornerKey=(signature,qx,qy)=>{const sx=qx?1:-1,sy=qy?1:-1;return signature[12]+signature[idx(sx,0)]+signature[idx(0,sy)]+signature[idx(sx,sy)]+Number(cornerCut(signature,qx,qy));};
const buckets=new Map(),byHost=new Map();
for(const ref of HULL_REFERENCES)for(let y=0;y<ref.height;y++)for(let x=0;x<ref.cols;x++){
  for(let turns=0;turns<4;turns++)for(const flip of [false,true]){
    const signature=Array(25).fill('.');
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const [tx,ty]=transform(dx,dy,turns,flip);signature[idx(tx,ty)]=at(ref.rows,x+dx,y+dy);}
    for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
      const [tx,ty]=transform(sx-.5,sy-.5,turns,flip),qx=tx>0?1:0,qy=ty>0?1:0;
      const sample={ref,x,y,sx,sy,qx,qy,turns,flip,signature:signature.join('')};
      const k=cornerKey(signature,qx,qy)+qx+qy;
      if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(sample);
      const host=signature[12]+qx+qy;if(!byHost.has(host))byHost.set(host,[]);byHost.get(host).push(sample);
    }
  }
}
const cache=new Map();
function chooseQuarter(signature,qx,qy){
  const cacheKey=signature+qx+qy;if(cache.has(cacheKey))return cache.get(cacheKey);
  const candidates=buckets.get(cornerKey(signature,qx,qy)+qx+qy)||byHost.get(signature[12]+qx+qy)||[];
  const exact=candidates.filter(sample=>sample.signature===signature);
  const interior=[idx(0,-1),idx(1,0),idx(0,1),idx(-1,0)].every(i=>signature[i]==='H')&&signature[idx(qx?1:-1,qy?1:-1)]==='.';
  if(!exact.length&&interior){
    const flat=(byHost.get('H'+qx+qy)||[]).find(sample=>sample.ref.id==='square3'&&sample.x===1&&sample.y===1&&!sample.turns&&!sample.flip);
    if(flat){cache.set(cacheKey,flat);return flat;}
  }
  let best=null,bestScore=Infinity;
  for(const sample of exact.length?exact:candidates){
    // Preserve native top/bottom lighting when composing a layout not explicitly pictured.
    let score=(sample.turns ? (exact.length ? 0.15 : 48) : 0) + (sample.flip ? 0.1 : 0);
    for(let i=0;i<25;i++)if(signature[i]!==sample.signature[i]){
      const radius=Math.max(Math.abs(i%5-2),Math.abs(Math.floor(i/5)-2));
      const occupancy=signature[i]==='H'||sample.signature[i]==='H';
      score+=(radius<=1?12:2)*(occupancy?3:1);
      if(score>=bestScore)break;
    }
    if(score<bestScore){bestScore=score;best=sample;}
  }
  if(cache.size>12000)cache.clear();cache.set(cacheKey,best);return best;
}
const cellCache=new Map();
function chooseCell(signature){
  if(cellCache.has(signature))return cellCache.get(signature);
  const cardinals=[idx(0,-1),idx(1,0),idx(0,1),idx(-1,0)];
  const all=byHost.get(signature[12]+'00')||[];
  let candidates=all.filter(s=>cardinals.every(i=>s.signature[i]===signature[i]));
  if(!candidates.length)candidates=all;
  let best=null,bestScore=Infinity;
  for(const sample of candidates){
    let score=(sample.turns ? 0.15 : 0) + (sample.flip ? 0.1 : 0);
    for(let i=0;i<25;i++)if(signature[i]!==sample.signature[i])score+=(Math.max(Math.abs(i%5-2),Math.abs(Math.floor(i/5)-2))<=1?12:2)*(signature[i]==='H'||sample.signature[i]==='H'?3:1);
    if(score<bestScore){best=sample;bestScore=score;}
  }
  const quarters=[];
  if(best)for(let qy=0;qy<2;qy++)for(let qx=0;qx<2;qx++)for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
    const [tx,ty]=transform(sx-.5,sy-.5,best.turns,best.flip);
    if((tx>0?1:0)===qx&&(ty>0?1:0)===qy)quarters.push({...best,qx,qy,sx,sy});
  }
  if(cellCache.size>12000)cellCache.clear();cellCache.set(signature,quarters);return quarters;
}
const orthogonalTemplates=new Map();
function orthogonalQuarter(signature,qx,qy){
  const sx=qx?1:-1,sy=qy?1:-1,side=signature[idx(sx,0)]==='H',vertical=signature[idx(0,sy)]==='H',diagonal=signature[idx(sx,sy)]==='H';
  let id,x,y,flip=false;
  if(!side&&!vertical){id='single';x=0;y=0;}
  else if(side&&!vertical){id='horizontal3';x=1;y=0;}
  else if(!side&&vertical){id='vertical3';x=0;y=1;}
  else if(diagonal){id='square3';x=1;y=1;}
  else if(qy===0){id='cornerFloor';x=1;y=1;flip=qx===1;}
  else{id='tFloor';x=1;y=0;}
  const k=[id,x,y,qx,qy,flip].join(':');
  if(!orthogonalTemplates.has(k))orthogonalTemplates.set(k,(byHost.get('H'+qx+qy)||[]).find(q=>q.ref.id===id&&q.x===x&&q.y===y&&!q.turns&&q.flip===flip));
  const template=orthogonalTemplates.get(k);
  return template?{...template,method:'orthogonal'}:null;
}
export function hullTopology(s){
  const hull=new Set(s.hull),floor=new Set(s.floor),cells=new Set(hull),tiles=new Map();
  const occupied=new Set((s.components||[]).flatMap(componentCells));
  for(const e of s.extenders||[])occupied.add(key(e.x,e.y));
  if(s.engine)for(let y=s.engine.y-1;y<=s.engine.y+1;y++)for(let x=s.engine.x-1;x<=s.engine.x+1;x++)occupied.add(key(x,y));
  for(const k of hull){const [x,y]=point(k);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)cells.add(key(x+dx,y+dy));}
  const emptyCorners=new Set();
  for(const k of cells){
    if(hull.has(k)||floor.has(k)||occupied.has(k))continue;
    const [x,y]=point(k);
    if([[1,1],[-1,1],[-1,-1],[1,-1]].some(([sx,sy])=>hull.has(key(x+sx,y))&&hull.has(key(x,y+sy))))emptyCorners.add(k);
  }
  for(const k of cells){
    const [x,y]=point(k),host=hull.has(k)?'H':floor.has(k)?'S':'.';
    if(host!=='H'){
      if(occupied.has(k))continue;
      // Only a pair of adjacent cardinal hull neighbors can decorate an empty/floor cell.
      const adjacent=[[1,1],[-1,1],[-1,-1],[1,-1]].some(([sx,sy])=>hull.has(key(x+sx,y))&&hull.has(key(x,y+sy)));
      if(!adjacent)continue;
    }
    const signature=[];
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const nx=x+dx,ny=y+dy,n=key(nx,ny);
      const virtual=(s.components||[]).some(c=>c.x===nx&&c.y===ny&&barrierJoins(c,x-nx,y-ny));
      signature.push(hull.has(n)||virtual?'H':floor.has(n)?'S':'.');
    }
    const context=signature.join(''),quarters=host==='H'?[]:chooseCell(context);
    if(host==='H'){
      let hasDiagonalJoin=false;
      for(let dy=-2;dy<=2&&!hasDiagonalJoin;dy++)for(let dx=-2;dx<=2;dx++)if(emptyCorners.has(key(x+dx,y+dy))){hasDiagonalJoin=true;break;}
      for(let qy=0;qy<2;qy++)for(let qx=0;qx<2;qx++){
        const selected=chooseQuarter(context,qx,qy);
        // Fully floor-separated hull uses ordinary wall pieces. Distant floor
        // changes must not introduce a rotated bevel, end cap or false seam.
        quarters.push(!hasDiagonalJoin&&selected?.signature!==context?orthogonalQuarter(context,qx,qy)||selected:selected);
      }
    }
    tiles.set(k,{x,y,host,context,quarters});
  }
  return {tiles};
}
// Hull reference pixels are neutral grays; the supplied terrain/floor backgrounds
// are blue-gray. Remove that backdrop at runtime, leaving source PNGs untouched.
export function hullPixelAlpha(r,g,b,a){
  if(!a||Math.max(r,g,b)>150)return 0;
  const spread=Math.max(r,g,b)-Math.min(r,g,b);
  return spread<=2?a:spread<6?Math.round(a*(6-spread)/4):0;
}
function floorBevel(rows,x,y,u,v){
  for(const [sx,sy] of [[1,1],[-1,1],[-1,-1],[1,-1]]){
    if(at(rows,x+sx,y)!=='H'||at(rows,x,y+sy)!=='H'||at(rows,x+sx,y+sy)!=='.')continue;
    const cx=sx===1?1:0,cy=sy===1?1:0;
    if(Math.abs(u-cx)+Math.abs(v-cy)<.42)return true;
  }
  return false;
}
export function prepareHullTexture(image,ref,createSurface=(w,h)=>new OffscreenCanvas(w,h)){
  const surface=createSurface(image.width,image.height),ctx=surface.getContext('2d');ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,image.width,image.height),data=pixels.data;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    const gx=x/image.width*ref.cols,gy=y/image.height*ref.height,cx=Math.floor(gx),cy=Math.floor(gy),i=(y*image.width+x)*4;
    data[i+3]=at(ref.rows,cx,cy)==='S'&&!floorBevel(ref.rows,cx,cy,gx-cx,gy-cy)?0:hullPixelAlpha(data[i],data[i+1],data[i+2],data[i+3]);
  }
  // Screenshot shadows can contain a one-pixel neutral line. Keep empty-cell
  // decoration only where it has a solid foreground core, rather than carrying
  // those isolated shadow remnants onto the planner background.
  const core=new Uint8Array(image.width*image.height);
  for(let y=1;y<image.height-1;y++)for(let x=1;x<image.width-1;x++){
    let count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(data[((y+dy)*image.width+x+dx)*4+3]>128)count++;
    if(count===9)core[y*image.width+x]=1;
  }
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
    if(at(ref.rows,Math.floor(x/image.width*ref.cols),Math.floor(y/image.height*ref.height))==='H')continue;
    const i=(y*image.width+x)*4;if(!data[i+3])continue;
    let supported=false;
    for(let dy=-2;dy<=2&&!supported;dy++)for(let dx=-2;dx<=2;dx++){
      const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<image.width&&ny<image.height&&core[ny*image.width+nx]){supported=true;break;}
    }
    if(!supported)data[i+3]=0;
  }
  ctx.putImageData(pixels,0,0);return surface;
}
export function drawHull(ctx,layout,textures,screen,zoom){
  for(const cell of layout.tiles.values())for(const sample of cell.quarters){
    if(!sample)continue;const image=textures[sample.ref.id];if(!image)continue;
    const tw=image.width/sample.ref.cols,th=image.height/sample.ref.height;
    const p=screen(cell.x+sample.qx/2+.25,cell.y+sample.qy/2+.25);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(sample.turns*Math.PI/2);if(sample.flip)ctx.scale(-1,1);
    ctx.drawImage(image,(sample.x+sample.sx/2)*tw,(sample.y+sample.sy/2)*th,tw/2,th/2,-zoom/4,-zoom/4,zoom/2+.05,zoom/2+.05);ctx.restore();
  }
}
