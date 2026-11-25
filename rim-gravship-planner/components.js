// Wiki dimensions and stated maxima checked 2026-11-20.
// Footprints and limits: https://rimworldwiki.com/wiki/Gravship and linked component pages.
// New component anchors are the top-left tile of their rotated footprint.
import {MOD_COMPONENTS} from './mod-data.js';
import {FURNITURE} from './furniture.js';
import {PRODUCTION} from './production.js';
import {modOverride,componentEnabled} from './mods.js';
const astrofuelSprites=MOD_COMPONENTS.find(c=>c.id==='VGE_AstrofuelPipe').sprites;
// Planner-only presentation: show hidden pipe runs using the shared linked art.
function plannerComponent(c){
  if(c.systems?.range>0)return {...c,group:'Flight'};
  if(c.id==='VGE_GravshipCapacitor')return {...c,group:'Power'};
  if(c.id==='VGE_AstrofuelPipe')return {...c,paintable:true};
  if(c.id==='VGE_HiddenAstrofuelPipe')return {...c,paintable:true,atlas:true,sprites:astrofuelSprites,spriteAlpha:.55};
  return c;
}
export const COMPONENTS = [
  {id:'autodoor',name:'Autodoor',width:1,height:1,rotate:true,rotationCount:2,group:'Structure',symbol:'AD',color:'#aeb8b4',wiki:'Autodoor',note:'Powered door. Choose north/south or east/west; needs substructure.'},
  {id:'small-tank',name:'Small chemfuel tank',width:2,height:2,rotate:true,group:'Flight',symbol:'250',color:'#bea879',wiki:'Small_chemfuel_tank',note:'Stores 250 chemfuel.'},
  {id:'large-tank',name:'Large chemfuel tank',width:3,height:3,rotate:true,group:'Flight',symbol:'750',color:'#bea879',wiki:'Large_chemfuel_tank',note:'Stores 750 chemfuel.'},
  {id:'small-thruster',name:'Small thruster',width:1,height:2,rotate:true,limit:4,exhaust:5,group:'Flight',symbol:'ST',color:'#d3ac84',wiki:'Small_thruster',note:'Keep its 1 × 5 exhaust area clear of floor and structures.'},
  {id:'large-thruster',name:'Large thruster',width:2,height:2,rotate:true,limit:6,exhaust:7,group:'Flight',symbol:'LT',color:'#d3ac84',wiki:'Large_thruster',note:'Keep its 2 × 7 exhaust area clear of floor and structures.'},
  {id:'pilot-console',name:'Pilot console',width:3,height:2,rotate:true,group:'Flight',symbol:'PC',color:'#97c4b5',wiki:'Pilot_console',note:'Required to pilot the ship.'},
  {id:'signal-jammer',name:'Signal jammer',width:2,height:2,group:'Upgrades',symbol:'SJ',color:'#b1abd2',wiki:'Signal_jammer',note:'Enables approaching heavily defended landing sites.'},
  {id:'power-cell',name:'Gravcore power cell',width:1,height:1,group:'Upgrades',symbol:'GC',color:'#b7c783',wiki:'Gravcore_power_cell',note:'Generates 1,200 W.'},
  {id:'fuel-optimizer',name:'Fuel optimizer',width:2,height:2,limit:2,group:'Upgrades',symbol:'FO',color:'#c6bb87',wiki:'Fuel_optimizer',note:'Each reduces fuel consumption by 30%.'},
  {id:'shield-generator',name:'Gravship shield generator',width:3,height:3,limit:2,engineField:true,group:'Upgrades',symbol:'SG',color:'#9ebee1',wiki:'Gravship_shield_generator',note:'Must be inside the original engine field.'},
  {id:'subpersona-core',name:'Pilot subpersona core',width:1,height:1,limit:2,group:'Upgrades',symbol:'SC',color:'#c0a1ca',wiki:'Pilot_subpersona_core',note:'Each adds 15% launch ritual quality.'},
  {id:'oxygen-pump',name:'Oxygen pump',width:1,height:1,rotate:true,wallMounted:true,group:'Life support',symbol:'O₂',color:'#ed963e',wiki:'Oxygen_pump',note:'Mount on a hull edge facing a non-hull tile. Needs substructure beneath the wall.'},
  {id:'vac-barrier',name:'Vac barrier',width:1,height:1,rotate:true,group:'Life support',symbol:'VB',color:'#93caca',wiki:'Vac_barrier',note:'A powered, passable air barrier.'},
  {id:'heater',name:'Heater',width:1,height:1,group:'Life support',symbol:'H',color:'#d5a08d',wiki:'Heater',note:'Warms enclosed rooms.'},
  // Core SolarGenerator definition: 4 × 4 and rotatable=false.
  {id:'solar-generator',name:'Solar generator',width:4,height:4,group:'Power',symbol:'SOL',color:'#82a6bd',wiki:'Solar_generator',note:'Produces up to 1,700 W in sunlight; roofs reduce output.'},
  {id:'wood-fired-generator',name:'Wood-fired generator',width:2,height:2,rotate:true,group:'Power',symbol:'WOOD',color:'#a7a17d',wiki:'Wood-fired_generator',sprites:{south:'Wood-fired_generator.png'},note:'Produces 1,000 W while fueled. Burns 22 wood per day; stores 75 wood.'},
  {id:'chemfuel-generator',name:'Chemfuel powered generator',width:2,height:2,rotate:true,group:'Power',symbol:'CHEM',color:'#a5b5a2',wiki:'Chemfuel_powered_generator',sprites:{south:'Chemfuel_powered_generator.png'},note:'Produces 1,000 W while fueled. Burns 4.5 chemfuel per day; stores 30 chemfuel. Generator fuel is separate from flight fuel.'},
  {id:'wind-turbine',name:'Wind turbine',width:7,height:2,rotate:true,group:'Power',symbol:'WIND',color:'#a5b9be',wiki:'Wind_turbine',sprites:{south:'Wind_turbine.png'},drawSize:[8,4],note:'Produces variable power: 2,300 W at normal wind speed, up to 3,450 W. Needs clear space in front and behind. Does not work in orbit. Wind clearance and weather are not simulated.'},
  {id:'geothermal-generator',name:'Geothermal generator',width:6,height:6,group:'Power',symbol:'GEO',color:'#a7b3a4',wiki:'Geothermal_generator',sprites:{south:'Geothermal_generator.png'},note:'Produces 3,600 W over a steam geyser. Geysers are required in-game; terrain is not simulated in this planner.'},
  {id:'watermill-generator',name:'Watermill generator',width:5,height:6,rotate:true,group:'Power',symbol:'HYDRO',color:'#ba9e7b',wiki:'Watermill_generator',sprites:{south:'Watermill_generator.png'},note:'Produces 1,100 W with its wheel in moving water and its base on firm ground. Nearby mills can reduce output. River terrain and interference are not simulated.'},
  {id:'vanometric-power-cell',name:'Vanometric power cell',width:1,height:2,rotate:true,group:'Power',symbol:'VANO',color:'#c2c38c',wiki:'Vanometric_power_cell',sprites:{south:'Vanometric_power_cell.png'},note:'Produces 1,000 W without fuel. A rare quest reward that can be installed and moved, rather than constructed.'},
  ...PRODUCTION,
  ...FURNITURE,
  ...MOD_COMPONENTS.map(plannerComponent),
];
// South-facing console art uses the 3-wide by 2-deep orientation of its 2 × 3 footprint.
const directional=prefix=>({south:`${prefix}_south.png`,north:`${prefix}_north.png`,east:`${prefix}_east.png`});
// Vanilla flight values; source formulas and mod overrides are documented in SYSTEMS.md.
const BASE_SYSTEMS={
  'power-cell':{powerWatts:1200},'solar-generator':{powerWatts:1700,powerKind:'solar'},
  'wood-fired-generator':{powerWatts:1000},'chemfuel-generator':{powerWatts:1000},
  'wind-turbine':{powerWatts:2300,powerKind:'wind'},'geothermal-generator':{powerWatts:3600},
  'watermill-generator':{powerWatts:1100},'vanometric-power-cell':{powerWatts:1000},
  'small-tank':{fuelCapacity:250,fuelKind:'chemfuel'},'large-tank':{fuelCapacity:750,fuelKind:'chemfuel'},
  'small-thruster':{range:10,fuelKind:'chemfuel'},'large-thruster':{range:16,fuelKind:'chemfuel'},
  'fuel-optimizer':{fuelSavings:.3},'oxygen-pump':{pumpPerSecond:0,airPerHundredPerSecond:.01},
};
for(const c of COMPONENTS)c.systems=c.systems||BASE_SYSTEMS[c.id]||{};
const SPRITES={
  'autodoor':{south:'Autodoor.png'},
  'small-tank':directional('ChemfuelTank'),
  'large-tank':directional('LargeChemfuelTank'),
  'small-thruster':directional('SmallThruster'),
  'large-thruster':directional('LateralThruster'),
  'pilot-console':directional('PilotConsole'),
  'signal-jammer':{south:'SignalJammer_south.png'}, // Wiki explicitly marks this non-rotatable.
  'power-cell':{south:'GravcorePowerCell.png'},
  'fuel-optimizer':{south:'FuelOptimizer_north.png'},
  'shield-generator':{south:'GravshipShieldGenerator.png'},
  'subpersona-core':{south:'PilotSubpersonaCore.png'},
  'vac-barrier':{south:'VacBarrier.png',north:'VacBarrier.png',east:'VacBarrier_east-clean.png'},
  'heater':{south:'Heater.png'},
  'solar-generator':{south:'Solar_generator.png'},
};
for(const c of COMPONENTS)c.sprites=c.sprites||SPRITES[c.id]||{south:`components/${c.id}.svg`};
export const ROTATIONS=['South','West','North','East'];
export function componentSprite(c,state){
  const def=componentDefinition(c.type,state),rotation=componentBounds(c,state).rotation,sprites=def.sprites;
  return directionalSprite(sprites,rotation);
}
export function directionalSprite(sprites,rotation){
  const direction=ROTATIONS[rotation].toLowerCase();
  if(sprites[direction])return {file:sprites[direction],flip:false,turn:0};
  if(direction==='west'&&sprites.east)return {file:sprites.east,flip:true,turn:0};
  const source=ROTATIONS.findIndex(d=>sprites[d.toLowerCase()]);
  return {file:sprites[ROTATIONS[source].toLowerCase()],flip:false,turn:(rotation-source+4)%4};
}
// Source rectangles exclude transparent padding; draw rectangles are in tile units.
// The north/south arch reaches both hull sides and overhangs the cell above.
export function componentVisual(c){
  if(c.type!=='vac-barrier')return null;
  return componentBounds(c).rotation%2
    ? {source:[501,86,316,1049],x:.35,y:-.12,width:.36,height:1.16}
    : {source:[15,19,97,78],x:-.02,y:-.12,width:1.04,height:1.04*78/97};
}
export function barrierJoins(c,dx,dy){
  const def=componentDefinition(c.type);
  if(def?.hullLike)return Math.abs(dx)+Math.abs(dy)===1;
  if(c.type!=='vac-barrier'&&!def?.barrier)return false;
  const b=componentBounds(c);
  return b.rotation%2?dx===0&&(dy===-1||dy===b.height):dy===0&&(dx===-1||dx===b.width);
}
export const COMPONENT_BY_ID=Object.fromEntries(COMPONENTS.map(c=>[c.id,Object.freeze(c)]));
export const componentDefinition=(id,state)=>{const base=COMPONENT_BY_ID[id];if(!base||!state)return base;const override=modOverride(id,state);return {...base,...override,systems:{...base.systems,...override.systems}};};
export const availableComponents=state=>COMPONENTS.filter(c=>componentEnabled(state,c)).map(c=>componentDefinition(c.id,state));
export const componentInfo=def=>[def.note,...Object.entries(def.specs||{}).map(([label,value])=>`${label}: ${value}.`)].join(' ');
export function normalizeRotation(type,value=0,state){
  const def=componentDefinition(type,state),count=def?.rotate?(def.rotationCount||4):1;
  return Number.isInteger(value)?((value%count)+count)%count:0;
}
export function componentRotationLabel(c,state){
  const def=componentDefinition(c.type,state),r=normalizeRotation(c.type,c.rotation,state);
  return !def.rotate?'Fixed':def.rotationCount===2?['North/south','East/west'][r]:ROTATIONS[r];
}
export function componentBounds(c,state){
  const def=componentDefinition(c.type,state);
  const rotation=normalizeRotation(c.type,c.rotation,state);
  return {x:c.x,y:c.y,width:rotation%2?def.height:def.width,height:rotation%2?def.width:def.height,rotation};
}
// The pump body covers 1/6 of a tile and straddles its facing hull edge.
export function pumpMount(c){
  const rotation=componentBounds(c).rotation;
  const [dx,dy]=[[0,1],[-1,0],[0,-1],[1,0]][rotation];
  return {x:c.x+.5+dx*.5,y:c.y+.5+dy*.5,rotation,
    width:rotation%2?1/3:1/2,height:rotation%2?1/2:1/3,
    facingTile:{x:c.x+dx,y:c.y+dy}};
}
export function componentCells(c){const b=componentBounds(c),cells=[];for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++)cells.push(`${x},${y}`);return cells;}
// Sprite names describe thrust/facing, not exhaust. The nozzle exhausts in the
// opposite direction: south-facing art clears north, west clears east, etc.
export function exhaustCells(c,state){
  const def=componentDefinition(c.type,state),b=componentBounds(c,state),cells=[];
  if(!def.exhaust)return cells;
  // The mod's directional artwork puts the nozzle in the named direction;
  // the existing wiki artwork uses the opposite sprite convention.
  const facing=(b.rotation+(def.exhaustFacing==='rotation'?2:0))%4;
  for(let d=0;d<def.exhaust;d++)for(let w=0;w<def.width;w++){
    const [x,y]=facing===0?[b.x+w,b.y-1-d]:facing===1?[b.x+b.width+d,b.y+w]:facing===2?[b.x+w,b.y+b.height+d]:[b.x-1-d,b.y+w];
    cells.push(`${x},${y}`);
  }
  return cells;
}
