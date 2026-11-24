// Assumptions belong to the design, independently of current game state.
export const DEFAULT_SCENARIO=Object.freeze({crew:4,distance:10,fuelPercent:100,oxygenPercent:100,chargePercent:100,heatPercent:0,vacuum:true,heatResearch:false,cabinTiles:null});
export function normalizeScenario(raw={}){
  const value=raw&&typeof raw==='object'?raw:{};
  const number=(name,min,max,integer=false)=>{
    const n=value[name];
    if(typeof n!=='number'||!Number.isFinite(n))return DEFAULT_SCENARIO[name];
    const bounded=Math.max(min,Math.min(max,n));return integer?Math.floor(bounded):bounded;
  };
  return {crew:number('crew',0,1000,true),distance:number('distance',1,100000,true),fuelPercent:number('fuelPercent',0,100),oxygenPercent:number('oxygenPercent',0,100),chargePercent:number('chargePercent',0,100),heatPercent:number('heatPercent',0,100),vacuum:value.vacuum!==false,heatResearch:value.heatResearch===true,cabinTiles:value.cabinTiles==null?null:number('cabinTiles',0,50000,true)};
}
