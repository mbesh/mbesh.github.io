import {componentDefinition,componentBounds,exhaustCells} from './components.js';
import {normalizeMods,componentEnabled,engineProfile} from './mods.js';
import {normalizeScenario} from './scenario.js';
import {validate,capacity} from './model.js';
import {MOD_SYSTEM_RULES} from './mod-data.js';

const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function adjacent(a,b){
  const x=componentBounds(a),y=componentBounds(b);
  return ((x.x+x.width===y.x||y.x+y.width===x.x)&&x.y<y.y+y.height&&y.y<x.y+x.height)||((x.y+x.height===y.y||y.y+y.height===x.y)&&x.x<y.x+y.width&&y.x<x.x+x.width);
}

function electricityEstimate(state,equipment,scenario,validation){
  const disconnected=new Set(validation.disconnected),engineCapacity=capacity(state);
  const connectedTiles=state.floor.filter(k=>!disconnected.has(k)).length;
  const engineBase=state.engine?(engineProfile(state).systems?.powerWatts||0):0;
  const engineWatts=engineCapacity>0?engineBase*Math.max(0,1-connectedTiles/engineCapacity):0;
  const cores=equipment.filter(e=>e.sys.powerKind==='gravcore'),coreAt=new Map();
  for(const e of cores){const b=componentBounds(e.c,state);for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++)coreAt.set(`${x},${y}`,e);}
  let steadyWatts=0,solarWatts=0,windWatts=0,heatWatts=0,adjacencyWatts=0,emergencyGenerators=0;
  for(const e of equipment){
    const {sys}=e;let watts=sys.powerWatts||0;
    if(sys.powerKind==='emergency'){emergencyGenerators++;continue;}
    if(sys.powerKind==='solar')solarWatts+=watts;
    else if(sys.powerKind==='wind')windWatts+=watts;
    else{
      if(sys.powerKind==='gravcore'){
        const b=componentBounds(e.c,state),neighbors=new Set();
        for(let y=b.y-1;y<=b.y+b.height;y++)for(let x=b.x-1;x<=b.x+b.width;x++){
          if(x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height)continue;
          const neighbor=coreAt.get(`${x},${y}`);if(neighbor&&neighbor!==e)neighbors.add(neighbor);
        }
        const bonus=watts*Math.min(1.2,.15*neighbors.size);adjacencyWatts+=bonus;watts+=bonus;
      }
      steadyWatts+=watts;
    }
    if(scenario.heatPercent>0){
      let heat=sys.heatPowerWatts||0;
      if(scenario.heatResearch)for(const u of sys.powerUpgrades||[])if(u.research==='VGE_HeatDissipation')heat*=u.factor;
      heatWatts+=heat;
    }
  }
  return {totalWatts:engineWatts+steadyWatts+solarWatts+windWatts+heatWatts,engineWatts,engineBase,connectedTiles,engineCapacity,steadyWatts,solarWatts,windWatts,heatWatts,adjacencyWatts,emergencyGenerators};
}

// Planned equipment totals assume power, supplies, connections, and construction.
// Clearance is known from the layout, so blocked thrusters never contribute range.
export function shipSystems(state,validation=validate(state)){
  const scenario=normalizeScenario(state.scenario),modded=normalizeMods(state.mods).chapter1;
  const counts=new Map(),equipment=[];
  for(const c of state.components||[]){
    const def=componentDefinition(c.type,state),count=counts.get(c.type)||0;
    if(!componentEnabled(state,def)||def.limit&&count>=def.limit)continue;
    counts.set(c.type,count+1);equipment.push({c,def,sys:def.systems||{}});
  }
  const sum=field=>equipment.reduce((total,{sys})=>total+(sys[field]||0),0);
  const blockedCells=new Set(validation.blockedExhaust),thrusters=equipment.filter(e=>e.sys.range>0);
  const blocked=thrusters.filter(e=>exhaustCells(e.c,state).some(k=>blockedCells.has(k)));
  const ready=thrusters.filter(e=>!blocked.includes(e));
  const fuelCapacity=sum('fuelCapacity'),fuelLoaded=fuelCapacity*scenario.fuelPercent/100;
  const fuelSavings=clamp(sum('fuelSavings'),0,.95),factor=1-fuelSavings;
  const gasCeiling=ready.filter(e=>!e.sys.electric).reduce((n,e)=>n+e.sys.range,0);
  const electric=ready.filter(e=>e.sys.electric);
  const charged=electric.filter(e=>scenario.chargePercent/100+1e-9>=(e.sys.requiredCharge??1));
  const electricCeiling=electric.reduce((n,e)=>n+e.sys.range,0);
  const electricBudget=charged.reduce((n,e)=>n+e.sys.range*scenario.chargePercent/100,0);
  const ratio=modded?MOD_SYSTEM_RULES.astrofuelPerRange:10;
  const gasBudget=modded?Math.min(fuelLoaded/ratio,gasCeiling):fuelLoaded/ratio;
  const budget=gasBudget+electricBudget;
  const thrustCeiling=gasCeiling+electricCeiling;
  const availableCeiling=gasCeiling+charged.reduce((n,e)=>n+e.sys.range,0);
  // Providers use an equivalent chemfuel budget; vanilla launch minimum remains 50.
  const equivalentFuel=budget*10;
  const maxRange=state.engine&&equivalentFuel>=50?Math.max(0,Math.floor(Math.min(availableCeiling,budget/factor)+1e-8)):0;
  const fullGasBudget=modded?Math.min(fuelCapacity/ratio,gasCeiling):fuelCapacity/ratio;
  const fullBudget=fullGasBudget+electricCeiling;
  const fullRange=state.engine&&fullBudget*10>=50?Math.max(0,Math.floor(Math.min(thrustCeiling,fullBudget/factor)+1e-8)):0;
  const equivalentCost=Math.max(50,scenario.distance*10*factor),reachable=scenario.distance<=maxRange;
  const useRatio=equivalentFuel>0?equivalentCost/equivalentFuel:0;
  const energyAvailable=charged.reduce((n,e)=>n+(e.sys.energyCapacity||0)*scenario.chargePercent/100,0);
  const fuelSpent=reachable?(modded?gasBudget*ratio*useRatio:equivalentCost):null;
  const energySpent=reachable?energyAvailable*useRatio:null;

  const oxygenCapacity=sum('oxygenCapacity'),oxygenLoaded=oxygenCapacity*scenario.oxygenPercent/100;
  const oxygenProduction=equipment.reduce((n,e)=>n+(!scenario.vacuum||!e.sys.atmosphereOnly?(e.sys.oxygenPerDay||0):0),0);
  const oxygenDemand=modded&&scenario.vacuum?scenario.crew*20:0;
  const oxygenNet=oxygenProduction-oxygenDemand;
  const pumpFlow=sum('pumpPerSecond'),airFlow=sum('airPerHundredPerSecond')*100;
  const cabinTiles=scenario.cabinTiles??state.floor.length;
  const oxygenDays=oxygenDemand===0||oxygenNet>=0?Infinity:oxygenLoaded/-oxygenNet;
  const oxygenDuty=modded&&oxygenDemand>0?(pumpFlow>0?oxygenDemand/(pumpFlow*1000):Infinity):0;

  let fuelProduction=0,refiningChemfuel=0;
  const purifiers=equipment.filter(e=>e.c.type==='VGE_Astropurifier');
  for(const e of equipment){
    const purified=e.sys.fuelPerDay&&purifiers.some(p=>adjacent(p.c,e.c));
    fuelProduction+=(e.sys.fuelPerDay||0)*(purified ? .5 : 1);
    refiningChemfuel+=(e.sys.refiningChemfuelPerDay||0)*(purified ? .25 : 1);
  }

  let heatCapacity=0,dissipation=0,cooldownReduction=0;
  for(const {sys} of equipment){
    let cap=sys.heatCapacity||0,rate=sys.heatDissipationPerHour||0,cooldown=sys.cooldownReduction||0;
    if(scenario.heatResearch)for(const u of sys.heatUpgrades||[])if(u.research==='VGE_HeatDissipation'){
      cap*=u.maxHeatFactor??1;rate*=u.heatConsumptionPerHourFactor??1;cooldown*=u.cooldownReductionPercentFactor??1;
    }
    heatCapacity+=cap;dissipation+=rate;cooldownReduction+=cooldown;
  }
  // Use heatsink display units: internal heat / (HeatMultiplier * CapacityMultiplier).
  const jumpHeat=modded&&state.engine?equivalentCost/(MOD_SYSTEM_RULES.fuelToHeatFactor*MOD_SYSTEM_RULES.heatCapacityMultiplier):0;
  const storedHeat=heatCapacity*scenario.heatPercent/100;
  const heatAfter=storedHeat+jumpHeat,overflow=Math.max(0,heatAfter-heatCapacity);
  const warnings=[];
  if(!state.engine)warnings.push('Place an engine to calculate flight range.');
  else if(!ready.length)warnings.push('Add a thruster with clear exhaust to provide flight range.');
  if(blocked.length)warnings.push(`${blocked.length} blocked thruster${blocked.length===1?' is':'s are'} excluded from range.`);
  if(electric.length>charged.length)warnings.push('Electric thrusters need full charge before they can provide range.');
  if(!reachable&&state.engine)warnings.push(`The requested ${scenario.distance}-tile jump exceeds the estimated range.`);
  if(modded&&scenario.vacuum&&scenario.crew>0&&airFlow===0)warnings.push('Add an oxygen pump to supply breathable rooms.');
  if(modded&&airFlow>0&&oxygenDuty>1)warnings.push('Pump output is below the planned crew demand.');
  if(modded&&oxygenDemand>oxygenProduction&&oxygenLoaded===0)warnings.push('No stored oxygen reserve covers the production shortfall.');
  if(modded&&overflow>0)warnings.push('The requested jump exceeds available heatsink capacity; excess heat enters the ship.');
  return {
    scenario,modded,
    electricity:electricityEstimate(state,equipment,scenario,validation),
    flight:{fuelKind:modded?'Astrofuel':'Chemfuel',fuelCapacity,fuelLoaded,fuelSavings,fuelPerTile:ratio*factor,gasCeiling,electricCeiling,thrustCeiling,availableCeiling,range:maxRange,fullRange,blockedThrusters:blocked.length,readyThrusters:ready.length,installedThrusters:thrusters.length,electricEnergy:electric.reduce((n,e)=>n+(e.sys.energyCapacity||0),0),energyAvailable,electricBudget,fuelProductionPerDay:fuelProduction,refiningChemfuelPerDay:refiningChemfuel,generatorFuelPerDay:sum('generatorFuelPerDay')},
    jump:{distance:scenario.distance,reachable,equivalentCost,fuelSpent,energySpent,chargeSpentPercent:reachable&&energyAvailable>0?scenario.chargePercent*useRatio:0},
    oxygen:{capacity:oxygenCapacity,loaded:oxygenLoaded,productionPerDay:oxygenProduction,demandPerDay:oxygenDemand,netPerDay:oxygenNet,reserveDays:oxygenDays,oxyalgaePerDay:sum('oxyalgaePerDay'),pumpPerSecond:pumpFlow,pumpDuty:oxygenDuty,pumps:equipment.filter(e=>e.sys.airPerHundredPerSecond>0).length,cabinTiles,fillOxygen:modded?cabinTiles:0,fillSeconds:cabinTiles===0?0:airFlow>0?cabinTiles/airFlow:Infinity},
    heat:{capacity:heatCapacity,stored:storedHeat,jumpHeat,absorbed:Math.min(jumpHeat,Math.max(0,heatCapacity-storedHeat)),overflow,dissipationPerHour:dissipation,cooldownReduction:Math.min(.5,cooldownReduction),clearHours:Math.min(heatCapacity,heatAfter)===0?0:dissipation>0?Math.min(heatCapacity,heatAfter)/dissipation:Infinity,safeJumps:jumpHeat>0?Math.floor((Math.max(0,heatCapacity-storedHeat)+1e-8)/jumpHeat):Infinity,activeShieldHeatPerHour:sum('activeShieldHeatPerHour'),absorbers:counts.get('VGE_GravheatAbsorber')||0,roomHeaters:counts.get('heater')||0},
    warnings,
  };
}
