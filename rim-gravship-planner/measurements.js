// Live brush measurements use the bounds and tile count already collected by
// the preview renderer. Labels never inspect or modify the ship itself.
export function drawShapeMeasurements(ctx,measurement,screen,zoom,viewport){
  if(!measurement?.count)return [];
  const {count,minX,minY,maxX,maxY}=measurement;
  const columns=maxX-minX+1,rows=maxY-minY+1,cx=(minX+maxX+1)/2,cy=(minY+maxY+1)/2;
  const center=screen(cx,cy),top=screen(cx,minY+.5),left=screen(minX+.5,cy);
  const corner=screen(minX,minY),opposite=screen(maxX+1,maxY+1),gap=4;
  const font=Math.max(12,Math.min(20,zoom*.6)),labels=[];
  ctx.save();ctx.globalAlpha=1;ctx.font=`${font}px "Segoe UI", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  const make=(role,value,p)=>{
    const text=String(value),w=Math.ceil(ctx.measureText(text).width)+12,h=Math.ceil(font)+6;
    const x=Math.round(Math.max(w/2+gap,Math.min(viewport.width-w/2-gap,p.x)));
    const y=Math.round(Math.max(h/2+gap,Math.min(viewport.height-h/2-gap,p.y)));
    return {role,text,x,y,width:w,height:h};
  };
  const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+gap&&Math.abs(a.y-b.y)<(a.height+b.height)/2+gap;
  const total=make('total',count,center);labels.push(total);
  const addDimension=(role,value,p)=>{
    const initial=make(role,value,p),w=initial.width,h=initial.height;
    const alternatives=role==='width'
      ? [p,{x:p.x,y:Math.min(corner.y,total.y-total.height/2)-h/2-gap},{x:p.x,y:Math.max(opposite.y,total.y+total.height/2)+h/2+gap}]
      : [p,{x:Math.min(corner.x,total.x-total.width/2)-w/2-gap,y:p.y},{x:Math.max(opposite.x,total.x+total.width/2)+w/2+gap,y:p.y}];
    const candidates=alternatives.map(anchor=>make(role,value,anchor));
    labels.push(candidates.find(label=>labels.every(existing=>!overlaps(label,existing)))||initial);
  };
  // A straight line's total is its length; the axis badge would duplicate it.
  if(columns>4&&!(rows===1&&count===columns))addDimension('width',columns,top);
  if(rows>4&&!(columns===1&&count===rows))addDimension('height',rows,left);
  for(const label of labels){
    ctx.fillStyle='rgba(24, 31, 24, 0.8)';ctx.fillRect(label.x-label.width/2,label.y-label.height/2,label.width,label.height);
    ctx.fillStyle='#ffffff';ctx.fillText(label.text,label.x,label.y);
  }
  ctx.restore();return labels;
}
