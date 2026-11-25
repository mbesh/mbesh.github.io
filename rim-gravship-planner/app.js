import {HULL_REFERENCES,hullTopology,updateHullTopology,drawHull,drawSimpleHull} from './hull.js';
import {drawShapeMeasurements} from './measurements.js';
import {APP_VERSION} from './version.js';
import {normalizeScenario} from './scenario.js';
import {shipSystems} from './systems.js';
import {renderSystems} from './systems-ui.js';
import {COMPONENTS,availableComponents,componentInfo,componentDefinition,componentBounds,componentCells,componentSprite,directionalSprite,componentVisual,barrierJoins,pumpMount,exhaustCells,ROTATIONS,normalizeRotation,componentRotationLabel} from './components.js';
import {normalizeMods,componentEnabled,engineProfile,engineOptions,extenderProfile} from './mods.js';
import {blank,key,point,footprint,engineFootprint,capacity,capacityDetails,validate,shapeCells,apply,sanitize,inField,inEngineField,fieldCells,fieldSources,hitItem,itemPosition,itemCells,moveItem,checkPlacement,previewMove,rotateItem} from './model.js';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d');
const paletteMedia=window.matchMedia?.('(max-width:1100px)');
function collapsePaletteOnNarrowScreen(){if(paletteMedia?.matches)$('palette-panel').open=false;}
paletteMedia?.addEventListener?.('change',collapsePaletteOnNarrowScreen);
collapsePaletteOnNarrowScreen();
const STORAGE='gravship-designs-v1',DRAFT='gravship-draft-v1';
let state=blank(),layer='engine',selection=null,rotation=0,shape='single',erase=false,zoom=22,offset={x:0,y:0},width=0,height=0,hover=null,drag=null,space=false,undo=[],redo=[],savedId=null,dirty=false,toastTimer,draftTimer,validation=null,validationState=null,supportedField=new Set(),engineField=new Set(),fieldSignature=null,engineSignature=null,framePending=false,toolsDirty=true,statusDirty=true,libraryCache=null,inventorySignature=null,checksSignature=null,hullLayout=null,hullLayoutState=null,hullReferencesRequested=false,hullTexturesReady=false;
const assets={},hullTextures={},paths={floor:'substructure-3x3.png',floorSingle:'substructure-1x1.png',hull:'hull-3x3.png',engine:'GravEngine_with_orb.png',extender:'GravFieldExtender.png'};
const requestedAssets=new Set();
let assetSignature=null;
let systemsSignature=null;
const scenarioFields=['crew','distance','fuelPercent','oxygenPercent','chargePercent','heatPercent','cabinTiles','vacuum','heatResearch'];
let panMode=false,gesture=null,touchNavigation=false;
const touchPointers=new Map();
function updateViewportSize(){
  const style=document.documentElement?.style;
  if(!style)return;
  style.setProperty('--header-height',`${$('app-header').getBoundingClientRect().height}px`);
  style.setProperty('--app-height',`${window.visualViewport?.height||window.innerHeight}px`);
}
new ResizeObserver(updateViewportSize).observe($('app-header'));
window.addEventListener('resize',updateViewportSize);
window.visualViewport?.addEventListener('resize',updateViewportSize);
updateViewportSize();
for(const field of scenarioFields)$(`scenario-${field}`).onchange=()=>{
  if(drag)finish(null,true);
  const input=$(`scenario-${field}`),value=field==='vacuum'||field==='heatResearch'?input.checked:field==='cabinTiles'&&input.value.trim()===''?null:input.value.trim()===''?undefined:Number(input.value);
  const scenario=normalizeScenario({...normalizeScenario(state.scenario),[field]:value});
  if(field!=='vacuum'&&field!=='heatResearch')input.value=scenario[field]===null?'':String(scenario[field]);
  commit({...state,scenario});
};
function refreshSystems(){
  const report=shipSystems(state,validation),signature=JSON.stringify(report);
  if(signature===systemsSignature)return;systemsSignature=signature;
  for(const field of scenarioFields){const input=$(`scenario-${field}`),value=report.scenario[field];
    if(field==='vacuum'||field==='heatResearch')input.checked=value;
    else input.value=value===null?'':String(value);
  }
  for(const field of ['crew','oxygenPercent','heatPercent','vacuum','heatResearch'])$(`scenario-${field}`).disabled=!report.modded;
  $('scenario-chargePercent').disabled=!normalizeMods(state.mods).chapter2;
  renderSystems(report,document);
}
$('app-version').textContent=`v${APP_VERSION}`;
$('diagonal-hull').checked=true;
const palette=[['engine','Grav engine','3 × 3 · max. 1','GravEngine_with_orb.png'],['floor','Substructure','1 tile · connected floor','substructure-1x1.png'],['hull','Gravship hull','1 tile · needs floor','hull-1x1.png'],['extender','Field extender','1 tile · max. 6','GravFieldExtender.png']];
palette.push(['scaffold','Subscaffold','Walkway · no capacity cost','mods/chapter1/UI/MenuIcons/Subscaffold_MenuIcon.png']);
const shapes=[['single','·','Single tile'],['line','─','Straight line'],['diagonal','╱','Diagonal line'],['rect','□','Rectangle'],['filled','▣','Filled rectangle'],['circle','○','Circle'],['disc','●','Filled circle']];
function toast(t){$('toast').textContent=t;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function readLibrary(){if(libraryCache!==null)return libraryCache;try{const r=JSON.parse(localStorage.getItem(STORAGE)||'[]');return libraryCache=Array.isArray(r)?r:[];}catch{toast('Saved designs could not be read. Browser storage may be unavailable.');return libraryCache=[];}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v));if(k===STORAGE)libraryCache=v;return true;}catch{toast('Could not save. Browser storage is unavailable or full.');return false;}}
function draft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>store(DRAFT,{state,name:$('name').value,savedId,dirty}),250);}
function changed(){dirty=true;draft();refresh();}
function commit(next){if(JSON.stringify(next)===JSON.stringify(state))return;undo.push(structuredClone(state));if(undo.length>80)undo.shift();redo=[];state=next;changed();}
function paintableLayer(type=layer){const def=componentDefinition(type,state);return !!type&&type!=='engine'&&type!=='extender'&&(!def||!!def.paintable);}
function chooseLayer(v){if(drag)finish(null,true);panMode=false;layer=v;selection=null;erase=false;rotation=0;if(v&&!paintableLayer(v))shape='single';refresh();}
$('select-mode').onclick=()=>{chooseLayer(null);collapsePaletteOnNarrowScreen();};
$('remove-selected').onclick=removeSelected;
function selectionName(){
  const p=itemPosition(state,selection);
  if(!p)return null;
  return selection.kind==='component'?componentDefinition(p.type,state).name:selection.kind==='engine'?engineProfile(state).name:selection.kind==='extender'?extenderProfile(state).name:selection.kind==='hull'?'Hull tile':selection.kind==='scaffold'?'Subscaffold tile':'Substructure tile';
}
function removeSelected(){
  if(layer||panMode||touchNavigation||!itemPosition(state,selection))return;
  if(drag)finish(null,true);
  const name=selectionName(),p=itemPosition(state,selection);
  // Remove the exact selected instance, including when pipe layers overlap.
  const next=selection.kind==='component'?{...state,components:state.components.filter((_,i)=>i!==selection.index)}:
    selection.kind==='extender'?{...state,extenders:state.extenders.filter((_,i)=>i!==selection.index)}:
    apply(state,selection.kind,[key(p.x,p.y)],true).state;
  selection=null;hover=null;commit(next);toast(`${name} removed. Undo to restore.`);
}
$('pan-mode').onclick=()=>{if(drag)finish(null,true);panMode=!panMode;hover=null;collapsePaletteOnNarrowScreen();refresh();};
for(const [id,label,description,file] of palette){const b=document.createElement('button');b.className='palette-item';b.dataset.layer=id;b.title=`${label}. ${description}`;b.innerHTML=`<img src="assets/${file}" alt=""><div><strong>${label}</strong><small>${description}</small></div>`;b.onclick=()=>{chooseLayer(id);collapsePaletteOnNarrowScreen();};$('palette').append(b);}
$('component-palette-count').textContent=availableComponents(state).length;
const componentGroups=new Map(),modPaletteGroups={'pilot-console':'Platform','small-tank':'Fuel network','large-tank':'Fuel network'};
const componentGroupOrder=[...new Set(COMPONENTS.map(c=>c.group))];
componentGroupOrder.splice(componentGroupOrder.indexOf('Platform'),1);
componentGroupOrder.splice(componentGroupOrder.indexOf('Structure')+1,0,'Platform');
for(const group of componentGroupOrder){
  const category=document.createElement('details');category.className='component-group';category.dataset.group=group;category.open=true;
  componentGroups.set(group,category);
  const heading=document.createElement('summary');heading.textContent=group;category.append(heading);$('component-options').append(category);
  for(const c of COMPONENTS.filter(c=>c.group===group)){
    const b=document.createElement('button');b.className='palette-item component-item';b.dataset.layer=c.id;b.dataset.group=group;
    b.title=`${c.name}. ${componentInfo(c)}${c.limit?' Maximum '+c.limit+'.':' No stated ship-wide limit.'}`;
    b.innerHTML=`<img loading="lazy" src="assets/${c.icon||componentSprite({type:c.id,rotation:0}).file}" alt=""><div><strong>${c.name}</strong><small>${c.width} × ${c.height} · ${c.limit?'max. '+c.limit:'no stated limit'}${c.chapter?' · Ch. '+c.chapter:''}${c.requiresDlc?' · '+c.requiresDlc:''}</small></div><span class="component-quantity">0</span>`;
    b.onclick=()=>{chooseLayer(c.id);collapsePaletteOnNarrowScreen();};category.append(b);
  }
}
function filterComponents(){
  const query=$('component-search').value.trim().toLowerCase();let visible=0;
  document.querySelectorAll('.component-item').forEach(b=>{const d=componentDefinition(b.dataset.layer,state);b.hidden=!componentEnabled(state,d)||![d.name,b.dataset.group,d.requiresDlc||''].join(' ').toLowerCase().includes(query);if(!b.hidden)visible++;});
  document.querySelectorAll('.component-group').forEach(group=>{group.hidden=![...document.querySelectorAll('.component-item')].some(b=>b.dataset.group===group.dataset.group&&!b.hidden);if(query)group.open=true;});
  $('no-components').hidden=visible>0;
}
$('component-search').oninput=filterComponents;
let modControlsSignature=null;
function refreshModControls(){
  const mods=normalizeMods(state.mods),engine=engineProfile(state),extender=extenderProfile(state),signature=JSON.stringify([mods,state.engineType]);
  if(signature===modControlsSignature)return;
  modControlsSignature=signature;
  $('mod-chapter1').checked=mods.chapter1;$('mod-chapter2').checked=mods.chapter2;
  $('engine-options').hidden=!mods.chapter1;
  const options=engineOptions(state).map(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=`${d.name} · ${d.width} × ${d.height}`;return o;});
  $('engine-type').replaceChildren(...options);$('engine-type').value=engine.id;
  $('component-palette-count').textContent=availableComponents(state).length;
  document.querySelectorAll('[data-layer]').forEach(b=>{
    if(b.dataset.layer==='scaffold')b.hidden=!mods.chapter1;
    if(b.dataset.layer==='engine'||b.dataset.layer==='extender'){
      const d=b.dataset.layer==='engine'?engine:extender,strong=b.querySelector('strong'),small=b.querySelector('small'),im=b.querySelector('img');
      if(strong)strong.textContent=d.name;
      if(small)small.textContent=b.dataset.layer==='engine'?`${d.width} × ${d.height} · max. 1`:`1 tile · max. ${d.limit} · +${d.supportOffset} tiles`;
      b.title=b.dataset.layer==='engine'?`${d.name}. ${d.width} × ${d.height}; radius ${d.fieldRadius}; supports ${d.support} tiles.`:`${d.name}. Radius ${d.fieldRadius}; maximum ${d.limit}; adds ${d.supportOffset} tiles.`;
      if(im)im.src=`assets/${d.sprites.south}`;
    }
  });
  document.querySelectorAll('.component-item').forEach(b=>{
    const d=componentDefinition(b.dataset.layer,state),strong=b.querySelector('strong'),small=b.querySelector('small'),im=b.querySelector('img');
    const group=mods.chapter1&&modPaletteGroups[d.id]||d.group;
    if(b.dataset.group!==group){b.dataset.group=group;componentGroups.get(group).append(b);}
    if(strong)strong.textContent=d.name;
    if(small)small.textContent=`${d.width} × ${d.height} · ${d.limit?'max. '+d.limit:'no stated limit'}${d.chapter?' · Ch. '+d.chapter:''}${d.requiresDlc?' · '+d.requiresDlc:''}`;
    if(im)im.src=`assets/${d.icon||componentSprite({type:d.id,rotation:0},state).file}`;
    b.title=componentInfo(d);
  });
  filterComponents();
  loadComponentAssets();
  $('engine-radius').textContent=engine.fieldRadius;$('extender-radius').textContent=extender.fieldRadius;
  $('field-reference-note').textContent=mods.chapter1?`Extenders: +${extender.supportOffset} tiles each, max ${extender.limit}, placed in the engine or an amplifier field. Amplifiers: radius 22.9, +200 tiles, max 4, inside the original engine field. Astrofuel thrusters multiply supported capacity.`:'Extenders must sit inside the engine’s original field. Each adds 250 tiles of capacity, up to 2,000.';
  $('field-reference-note').textContent+=' You can plan outside these fields; unsupported placements are marked red.';
}
function changeMods(chapter,checked){
  if(drag)finish(null,true);
  const mods=normalizeMods(state.mods);mods[`chapter${chapter}`]=checked;
  if(chapter===2&&checked)mods.chapter1=true;
  if(chapter===1&&!checked)mods.chapter2=false;
  commit({...state,mods});chooseLayer('engine');
}
$('mod-chapter1').onchange=()=>changeMods(1,$('mod-chapter1').checked);
$('mod-chapter2').onchange=()=>changeMods(2,$('mod-chapter2').checked);
$('engine-type').onchange=()=>{
  if(drag)finish(null,true);
  const next={...state,engineType:$('engine-type').value};
  if(state.engine){const result=checkPlacement(next,'engine',key(state.engine.x,state.engine.y),0,{ignore:{kind:'engine'}});if(result.rejected){toast(result.message);modControlsSignature=null;refresh();return;}}
  commit(next);chooseLayer('engine');
};
function rotateSelected(delta){
  if(drag||panMode||touchNavigation)return;
  if(!layer){
    const result=rotateItem(state,selection,delta);
    if(result.rejected){toast(result.message);return;}
    selection=result.item;hover=null;commit(result.state);return;
  }
  if(!componentDefinition(layer,state)?.rotate)return;
  rotation=normalizeRotation(layer,rotation+delta,state);refresh();
}
$('rotate').onclick=()=>rotateSelected(1);$('rotate-left').onclick=()=>rotateSelected(-1);
$('component-rotate-left').onclick=()=>rotateSelected(-1);$('component-rotate-right').onclick=()=>rotateSelected(1);
for(const [id,icon,label] of shapes){const b=document.createElement('button');b.dataset.shape=id;b.title=label;b.setAttribute('aria-label',label);b.innerHTML=`<span aria-hidden="true">${icon}</span>${label}`;b.onclick=()=>{shape=id;collapsePaletteOnNarrowScreen();refresh();};$('shapes').append(b);const option=document.createElement('option');option.value=id;option.textContent=label;$('shape-picker').append(option);}
$('shape-picker').onchange=()=>{if(drag)finish(null,true);shape=$('shape-picker').value;refresh();};
$('add').onclick=()=>{erase=false;refresh();};$('erase').onclick=()=>{erase=true;refresh();};
for(const id of ['grid','field','issues','exhaust'])$(id).onchange=render;
$('diagonal-hull').onchange=()=>{if($('diagonal-hull').checked)loadHullTextures();render();};
function refresh(){toolsDirty=true;statusDirty=true;render();}
function refreshTools(){document.querySelectorAll('[data-layer]').forEach(b=>{const selected=b.dataset.layer===layer;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected);});document.querySelectorAll('[data-shape]').forEach(b=>{b.classList.toggle('active',b.dataset.shape===shape);b.setAttribute('aria-pressed',b.dataset.shape===shape);b.disabled=!layer||!paintableLayer()&&b.dataset.shape!=='single';});$('add').classList.toggle('active',!erase);$('erase').classList.toggle('active',erase);$('add').setAttribute('aria-pressed',!erase);$('erase').setAttribute('aria-pressed',erase);$('mode-label').textContent=`${erase?'Erase':'Place'} ${(componentDefinition(layer,state)?.name||palette.find(p=>p[0]===layer)?.[1]||'component').toLowerCase()}`;$('shape-label').textContent=shapes.find(s=>s[0]===shape)[2];$('tool-hint').textContent=erase?'Erase affects the selected palette layer. Erasing the engine also removes its extenders.':layer==='engine'?'Click to place the engine. Its center anchors the grav field.':layer==='extender'?'Place inside the engine’s original field. Adds a 17-tile field and 250 tiles of capacity.':shape==='single'?'Click or drag to paint individual tiles. Right-click to erase the selected layer.':shape==='circle'||shape==='disc'?'Drag from the center to the outermost tile. An 18-tile reach matches the engine field; 16 matches an extender.':'Drag between two tiles. Release to draw the shape.';
refreshModControls();
if(layer==='engine'){$('mode-label').textContent=`${erase?'Erase':'Place'} ${engineProfile(state).name.toLowerCase()}`;$('shape-label').textContent=`${engineProfile(state).width} × ${engineProfile(state).height}`;}
if(layer==='extender')$('tool-hint').textContent=`Place in the original engine field${normalizeMods(state.mods).chapter1?' or an amplifier field':''}. Radius ${extenderProfile(state).fieldRadius}; +${extenderProfile(state).supportOffset} tiles; maximum ${extenderProfile(state).limit}.`;
if(layer==='scaffold')$('tool-hint').textContent='Draw a walkway that connects substructure without using capacity. Buildings on subscaffold need substructure and are marked red.';
if((shape==='circle'||shape==='disc')&&!erase)$('tool-hint').textContent=`Drag from center to edge. A ${Math.floor(engineProfile(state).fieldRadius)}-tile reach matches the engine field; ${Math.floor(extenderProfile(state).fieldRadius)} matches an extender.`;
$('select-mode').classList.toggle('active',!layer&&!panMode);$('select-mode').setAttribute('aria-pressed',!layer&&!panMode);
const selecting=!layer&&!panMode,name=selectionName();
$('drawing-toolbar').classList.toggle('selection-mode',selecting);
$('drawing-toolbar').classList.toggle('can-draw',!panMode&&paintableLayer());
$('selection-info').hidden=!selecting;$('selection-name').textContent=name||'Select an item';$('selection-name').title=name||'Choose an item on the grid to move or remove it.';
$('remove-selected').hidden=!selecting;$('remove-selected').disabled=!selecting||!name||touchNavigation;
$('remove-selected').setAttribute('aria-label',name?`Remove ${name}`:'Remove selected item');
$('add').disabled=$('erase').disabled=!layer;
$('pan-mode').classList.toggle('active',panMode);$('pan-mode').setAttribute('aria-pressed',panMode);
$('shape-picker').value=shape;
$('shape-picker').disabled=panMode||!paintableLayer();
if(panMode){$('add').disabled=$('erase').disabled=true;document.querySelectorAll('[data-shape]').forEach(b=>b.disabled=true);}
if(!layer){
  $('mode-label').textContent=name?`${name} selected`:'Select / move';
  $('shape-label').textContent=name?'Drag to move · Remove selected or Delete':'Choose an item to move or remove';
  $('tool-hint').textContent='Select an item on the grid, then drag it to move or choose Remove selected. Delete / Backspace also removes the selection. Moves and removals can be undone.';
}
canvas.style.cursor=drag?.pan||drag?.move||touchNavigation?'grabbing':panMode?'grab':layer?'crosshair':selection?'grab':'default';
const placed=!layer&&selection?.kind==='component'?itemPosition(state,selection):null;
const selected=componentDefinition(layer,state),rotating=placed|| (selected?{type:layer,rotation}:null);
const canRotate=rotating&&componentDefinition(rotating.type,state)?.rotate;
$('rotation-controls').hidden=panMode||!!selected?.paintable||(!selected&&!canRotate);
$('rotate').disabled=$('rotate-left').disabled=!canRotate||!!drag||touchNavigation;
$('rotation-label').textContent=rotating?componentRotationLabel(rotating,state):'Fixed';
if(placed&&canRotate){
  const def=componentDefinition(placed.type,state),b=componentBounds(placed,state);
  $('shape-label').textContent=`${b.width} × ${b.height} · ${componentRotationLabel(placed,state)}`;
  $('tool-hint').textContent='Drag the selection to move it. Tap the arrows beside it or use the toolbar to rotate; Q / E works too. Rotations can be undone.';
  $('component-wiki').href=def.source||`https://rimworldwiki.com/wiki/${def.wiki}`;
  $('component-wiki').textContent=def.source?'Mod definition ↗':'Wiki reference ↗';
}
if(selected){
  const b=componentBounds({type:layer,x:0,y:0,rotation},state);
  if(!selected.paintable)$('shape-label').textContent=`${b.width} × ${b.height} · ${componentRotationLabel({type:layer,rotation},state)}`;
  $('component-wiki').href=selected.source||`https://rimworldwiki.com/wiki/${selected.wiki}`;
  $('component-wiki').textContent=selected.source?'Mod definition ↗':'Wiki reference ↗';
  $('tool-hint').textContent=erase?'Click any tile of this component to remove it. Substructure stays in place.':`Click to place one component; the pointer anchors its top-left tile. ${selected.rotate?'Q / E or the buttons rotate before placing. ':''}${componentInfo(selected)} All footprint tiles need substructure.`;
}
if(selected?.paintable)$('tool-hint').textContent=erase?'Drag to erase the selected pipe type using the drawing tools.':'Click or drag to paint pipes, or draw a line, rectangle, or circle. Astrofuel pipes and hidden astrofuel pipes connect north, east, south, and west. Existing fuel-network tiles are preserved.';
if(layer&&!panMode)$('tool-hint').textContent+=' Outside-field and missing-substructure placements are allowed and marked red.';
if(panMode){$('mode-label').textContent='Pan view';$('shape-label').textContent='Drag to pan · Pinch to zoom';$('tool-hint').textContent='Drag to pan without changing your design. Use two fingers to pan and pinch to zoom in any tool. Choose Pan again to return to editing.';}
}
function refreshDesign(){
const counts=Object.fromEntries(COMPONENTS.map(c=>[c.id,0]));for(const c of state.components||[])counts[c.type]++;
const nextInventorySignature=JSON.stringify([state.mods,COMPONENTS.map(c=>counts[c.id])]);
if(nextInventorySignature!==inventorySignature){
  inventorySignature=nextInventorySignature;$('component-count').textContent=(state.components||[]).length;
  document.querySelectorAll('.component-item').forEach(b=>{b.querySelector('.component-quantity').textContent=counts[b.dataset.layer];});
  $('component-inventory').replaceChildren(...COMPONENTS.filter(c=>counts[c.id]).map(c=>{const d=componentDefinition(c.id,state),row=document.createElement('div');row.className='stat';const label=document.createElement('span'),n=document.createElement('b');label.textContent=d.name;n.textContent=counts[c.id]+(d.limit?' / '+d.limit:'');row.append(label,n);return row;}));
}
$('empty').hidden=!!state.engine;$('used').textContent=state.floor.length;$('capacity').textContent=capacity(state).toLocaleString();$('engine-count').textContent=`${state.engine?1:0} / 1`;$('hull-count').textContent=state.hull.length;$('meter').style.width=`${Math.min(100,state.floor.length/Math.max(1,capacity(state))*100)}%`;
$('extender-count').textContent=`${state.extenders.length} / ${extenderProfile(state).limit}`;
const support=capacityDetails(state);
$('capacity-note').textContent=state.engine?`${Math.max(0,support.total-state.floor.length).toLocaleString()} tiles available${normalizeMods(state.mods).chapter1?` · (${support.base} + ${support.bonus}) × ${Number(support.multiplier.toFixed(2))}${state.scaffold?.length?` · ${state.scaffold.length} free subscaffold`:''}`:''}`:`Place an engine to support ${engineProfile(state).support} tiles.`;
const checks=[];checks.push([!state.engine,state.engine?'Grav engine placed':'Place one grav engine to begin.']);if(validation.disabledTerrain.length)checks.push([true,'Subscaffold requires Chapter 1.']);if(validation.disabledEngine)checks.push([true,'The saved engine variant requires Chapter 1. Vanilla engine rules are active.']);if(validation.overlappingStructures.length)checks.push([true,`${validation.overlappingStructures.length} tiles contain overlapping structures.`]);if(state.engine){checks.push([validation.missing.length,validation.missing.length?`${validation.missing.length} structure tiles need substructure (marked red).`:'All structures have substructure.']);checks.push([validation.disconnected.length,validation.disconnected.length?`${validation.disconnected.length} floor tiles disconnected from engine.`:'All floor tiles connect to the engine.']);checks.push([validation.outsideTiles.length,validation.outsideTiles.length?`${validation.outsideTiles.length} tiles have unsupported field placement (marked red).`:'All placed tiles and components have field support.']);checks.push([validation.over,validation.over?`${validation.over} tiles exceed capacity.`:'Within supported tile capacity.']);if(validation.invalidExtenders.length)checks.push([true,'Extenders must be within the original engine field.']);}if(state.engine&&(state.components||[]).length){
checks.push([validation.blockedExhaust.length,validation.blockedExhaust.length?`${validation.blockedExhaust.length} thruster clearance tiles obstructed.`:'Thruster clearance is clear.']);
if(validation.missingWall.length)checks.push([true,`${validation.missingWall.length} wall-mounted components need a hull tile.`]);
if(validation.blockedPumps.length)checks.push([true,`${validation.blockedPumps.length} oxygen pumps face hull. Rotate them toward a non-hull tile.`]);
if(validation.outsideComponents.length)checks.push([true,`${validation.outsideComponents.length} components outside their supported field.`]);
if(validation.overLimits.length)checks.push([true,'Component limits exceeded in this saved design.']);
if(validation.disabledComponents.length)checks.push([true,`${validation.disabledComponents.length} components require a disabled mod chapter. Enable it to use them.`]);
}const nextChecksSignature=JSON.stringify(checks);if(nextChecksSignature!==checksSignature){checksSignature=nextChecksSignature;const bad=checks.filter(c=>c[0]).length;$('check-badge').textContent=!state.engine?'Getting started':bad?`${bad} to resolve`:'All checks pass';$('checks').replaceChildren(...checks.map(([warn,t])=>{const li=document.createElement('li');li.className=warn?'warn':'';const s=document.createElement('span');s.textContent=warn?'!':'✓';li.append(s,document.createTextNode(t));return li;}));}
}
function refreshStatus(){$('undo').disabled=!undo.length;$('redo').disabled=!redo.length;$('save-state').textContent=dirty?'Unsaved changes':savedId?'Saved in this browser':'Unsaved design';$('saved-count').textContent=readLibrary().length||'';}
function updateDesign(){
  if(validationState===state)return;
  loadComponentAssets();
  validation=validate(state);validationState=state;
  const nextFieldSignature=JSON.stringify([state.mods,state.engineType,state.engine,state.extenders,(state.components||[]).filter(c=>componentDefinition(c.type).fieldRadius)]);
  if(nextFieldSignature!==fieldSignature){supportedField=fieldCells(state);fieldSignature=nextFieldSignature;}
  const nextEngineSignature=JSON.stringify([state.mods,state.engineType,state.engine]);
  if(nextEngineSignature!==engineSignature){engineField=fieldCells({...state,extenders:[],components:[]});engineSignature=nextEngineSignature;}
  refreshDesign();toolsDirty=true;statusDirty=true;
  refreshSystems();
}
// Coalesce every source of invalidation into one repaint; edits still retain
// every input sample and are applied before the scheduled frame.
function render(){
  if(framePending)return;
  framePending=true;
  window.requestAnimationFrame(()=>{
    framePending=false;updateDesign();
    if(toolsDirty){toolsDirty=false;refreshTools();}
    if(statusDirty){statusDirty=false;refreshStatus();}
    drawCanvas();
  });
}
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
function drawComponent(c,alpha=1,previewNetwork=null){
  if(c.type==='oxygen-pump'){
    const mount=pumpMount(c),p=screen(mount.x,mount.y);
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);ctx.rotate(mount.rotation*Math.PI/2);
    ctx.fillStyle='#ed963e';ctx.strokeStyle='#63391e';ctx.lineWidth=Math.max(.75,zoom*.035);
    ctx.fillRect(-zoom/4,-zoom/6,zoom/2,zoom/3);ctx.strokeRect(-zoom/4,-zoom/6,zoom/2,zoom/3);
    ctx.fillStyle='#63391e';for(const x of [-.12,0,.12])ctx.fillRect(x*zoom-zoom*.025,0,zoom*.05,zoom*.11);
    ctx.restore();return;
  }
  const def=componentDefinition(c.type,state),b=componentBounds(c,state),sprite=componentSprite(c,state);
  loadImage(sprite.file);if(def.topSprite)loadImage(def.topSprite);
  if(def.topSprites)loadImage(directionalSprite(def.topSprites,b.rotation).file);
  const im=assets[sprite.file];
  const p=screen(b.x+b.width/2,b.y+b.height/2);ctx.save();ctx.globalAlpha=alpha*(def.spriteAlpha??1);ctx.translate(p.x,p.y);ctx.rotate(sprite.turn*Math.PI/2);if(sprite.flip)ctx.scale(-1,1);
  const size=def.drawSize,drawWidth=size?size[b.rotation%2?1:0]:b.width,drawHeight=size?size[b.rotation%2?0:1]:b.height;
  const w=(sprite.turn%2?drawHeight:drawWidth)*zoom,h=(sprite.turn%2?drawWidth:drawHeight)*zoom;
  if(im){const visual=c.type==='vac-barrier'&&normalizeMods(state.mods).chapter1?null:componentVisual(c);if(visual){ctx.drawImage(im,...visual.source,(visual.x-.5)*zoom,(visual.y-.5)*zoom,visual.width*zoom,visual.height*zoom);}else if(def.atlas){drawNetworkSprite(c,im,w,h,previewNetwork);}else{const scale=Math.min(w/im.width,h/im.height);ctx.drawImage(im,-im.width*scale/2,-im.height*scale/2,im.width*scale,im.height*scale);}}
  else{ctx.fillStyle=def.color;ctx.fillRect(-w/2+2,-h/2+2,w-4,h-4);ctx.fillStyle='#172627';ctx.font=`${Math.max(9,zoom*.4)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(def.symbol,0,0);}
  if(def.topSprite&&assets[def.topSprite]){const size=(def.topDrawSize||Math.max(b.width,b.height))*zoom;ctx.drawImage(assets[def.topSprite],-size/2,-size/2,size,size);}
  if(def.topSprites){const top=directionalSprite(def.topSprites,b.rotation),image=assets[top.file];if(image){ctx.save();ctx.rotate((top.turn-sprite.turn)*Math.PI/2);if(top.flip!==sprite.flip)ctx.scale(-1,1);ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();}}
  ctx.restore();
}
let networkLayoutState=null,networkLayout=new Map();
function networkTiles(network){
  if(networkLayoutState!==state){
    networkLayout=new Map();
    for(const c of state.components||[]){const net=componentDefinition(c.type).network;if(!net)continue;if(!networkLayout.has(net))networkLayout.set(net,new Set());for(const k of componentCells(c))networkLayout.get(net).add(k);}
    networkLayoutState=state;
  }
  return networkLayout.get(network);
}
function drawNetworkSprite(c,im,w,h,previewNetwork=null){
  const def=componentDefinition(c.type),network=def.network;
  // Linked graphics use a 4x4 atlas indexed by N/E/S/W neighbors.
  let mask=0;
  for(const [dx,dy,bit] of [[0,-1,1],[1,0,2],[0,1,4],[-1,0,8]]){
    const tile=key(c.x+dx,c.y+dy);
    if(network&&(networkTiles(network)?.has(tile)||previewNetwork?.has(tile))||def.hullLike&&(state.hull.includes(tile)||(state.components||[]).some(n=>componentDefinition(n.type).hullLike&&componentCells(n).includes(tile))))mask|=bit;
  }
  const tw=im.width/4,th=im.height/4;ctx.drawImage(im,(mask%4)*tw,(3-Math.floor(mask/4))*th,tw,th,-w/2,-h/2,w,h);
}
function drawEngine(position,alpha=1){
  const d=engineProfile(state),im=assets[d.sprites.south]||assets.engine;
  if(!im||!position)return;
  const p=screen(position.x-Math.floor(d.width/2),position.y-Math.floor(d.height/2));
  ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(im,p.x,p.y,zoom*d.width,zoom*d.height);ctx.restore();
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
function drawCanvas(){if(!width)return;if(hover)$('coordinates').textContent=`X ${hover.x} · Y ${hover.y}`;ctx.clearRect(0,0,width,height);const start=tileAt(0,0),end=tileAt(width,height);if($('field').checked&&state.engine){
ctx.save();ctx.fillStyle='#559e9418';ctx.beginPath();
for(const k of supportedField){const [x,y]=point(k),p=screen(x,y);ctx.rect(p.x,p.y,zoom,zoom);}ctx.fill();
ctx.strokeStyle='#89c4b990';ctx.lineWidth=1.5;traceFieldBoundary(supportedField);
ctx.stroke();ctx.restore();}

if($('grid').checked){ctx.lineWidth=1;for(let x=start.x;x<=end.x+1;x++){const p=screen(x,0);ctx.strokeStyle=x%5===0?'#68827e25':'#68827e12';ctx.beginPath();ctx.moveTo(Math.round(p.x)+.5,0);ctx.lineTo(Math.round(p.x)+.5,height);ctx.stroke();}for(let y=start.y;y<=end.y+1;y++){const p=screen(0,y);ctx.strokeStyle=y%5===0?'#68827e25':'#68827e12';ctx.beginPath();ctx.moveTo(0,Math.round(p.y)+.5);ctx.lineTo(width,Math.round(p.y)+.5);ctx.stroke();}}
const floorTiles=new Set(state.floor);for(const k of state.floor)connectedSprite(k,floorTiles,'floor');
for(const k of state.scaffold||[]){const [x,y]=point(k),p=screen(x,y),im=assets['mods/chapter1/Things/Terrain/Substructure/Subscaffolding.png'];if(im)ctx.drawImage(im,p.x,p.y,zoom,zoom);else tileRect(k,'#81999a66');}
for(const c of state.components||[])if(componentDefinition(c.type).network)drawComponent(c);
if($('diagonal-hull').checked&&hullTexturesReady){
  if(hullLayoutState!==state){hullLayout=hullLayout?updateHullTopology(hullLayout,state):hullTopology(state);hullLayoutState=state;}
  drawHull(ctx,hullLayout,hullTextures,screen,zoom);
}else drawSimpleHull(ctx,state,assets.hull,screen,zoom);
if(state.engine)drawEngine(state.engine);for(const e of state.extenders){const p=screen(e.x,e.y),im=assets[extenderProfile(state).sprites.south]||assets.extender;if(im)ctx.drawImage(im,p.x,p.y,zoom,zoom);}
for(const c of state.components||[])if(!componentDefinition(c.type).network)drawComponent(c);
if($('exhaust').checked)for(const k of new Set((state.components||[]).flatMap(c=>exhaustCells(c,state))))tileRect(k,'#d4a16a26');
if($('issues').checked){for(const k of [...validation.blockedExhaust,...validation.overlappingStructures])tileRect(k,'#e977605c');for(const c of [...validation.missingWall,...validation.blockedPumps])for(const k of componentCells(c))tileRect(k,'#e977605c');for(const k of new Set(validation.disconnected))tileRect(k,'#df6f654f');}
if($('issues').checked)for(const k of validation.unsupportedTiles){
  tileRect(k,'#e35b5b66');const [x,y]=point(k),p=screen(x,y);
  ctx.strokeStyle='#ff7d7d';ctx.lineWidth=1.5;ctx.strokeRect(p.x+.75,p.y+.75,zoom-1.5,zoom-1.5);
}
if(layer&&hover&&!panMode&&!touchNavigation&&!drag?.pan){
  const def=componentDefinition(layer),brush=!!def?.paintable,remove=drag?drag.erase:erase;
  const candidate=def?{type:layer,x:hover.x,y:hover.y,rotation}:null;
  const points=drag?shapeCells(shape,drag.start,hover):[key(hover.x,hover.y)];
  const hit=def&&remove?(state.components||[]).find(c=>c.type===layer&&componentCells(c).includes(key(hover.x,hover.y))):null;
  const actual=def&&!brush?(remove?(hit?componentCells(hit):points):componentCells(candidate)):layer==='engine'&&!remove?engineFootprint(state,hover):points;
  const measurement=drag&&!drag.move&&shape!=='single'&&(!def||brush)?{count:actual.length,minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity}:null;
  const placement=remove?{rejected:0}:checkPlacement(state,layer,key(hover.x,hover.y),rotation);
  const valid=!placement.rejected&&!placement.outside&&!placement.missingSupport;
  if(brush&&!remove){const preview=new Set(actual),existing=networkTiles(def.network);for(const k of actual){if(existing?.has(k))continue;const [x,y]=point(k);drawComponent({type:layer,x,y,rotation},.6,preview);}}
  if(def&&!brush&&!remove){if($('exhaust').checked)for(const k of exhaustCells(candidate,state))tileRect(k,'#dfb47e45');drawComponent(candidate,.6);}
  if(layer==='engine'&&!remove)drawEngine(hover,.6);
  for(const k of actual){const supported=!placement.rejected&&(def&&!brush||layer==='extender'?valid:layer==='engine'?!placement.missingSupport:supportedField.has(k)&&(!(layer==='hull'||brush)||floorTiles.has(k)));tileRect(k,remove?'#e7907c55':supported?'#c4dbac50':'#dd766551');const [x,y]=point(k),p=screen(x,y);ctx.strokeStyle=remove||!supported?'#ff7d7d':'#cedfbc';ctx.lineWidth=1;ctx.strokeRect(p.x+.5,p.y+.5,zoom-1,zoom-1);if(measurement){measurement.minX=Math.min(measurement.minX,x);measurement.minY=Math.min(measurement.minY,y);measurement.maxX=Math.max(measurement.maxX,x);measurement.maxY=Math.max(measurement.maxY,y);}}
  if((shape==='circle'||shape==='disc')&&drag){const c=screen(drag.start.x+.5,drag.start.y+.5);ctx.fillStyle='#e2ebd4';ctx.fillRect(c.x-2,c.y-2,4,4);}
  if(measurement)drawShapeMeasurements(ctx,measurement,screen,zoom,{width,height});
}

// Selection and movement overlays do not change the design until a valid drop.
if(!layer){
  const moving=drag?.move;
  const result=moving?previewMove(state,selection,drag.target):null;
  const highlighted=moving?(result.rejected?itemCells(state,selection):result.cells):itemCells(state,selection);
  if(moving){
    const original=itemPosition(state,selection),preview={...original,...drag.target};
    const cells=selection.kind==='component'?componentCells(preview):selection.kind==='engine'?engineFootprint(state,preview):[key(preview.x,preview.y)];
    for(const k of cells)tileRect(k,result.rejected||result.outside||result.missingSupport?'#dd766566':'#b9dab855');
    if(selection.kind==='component')drawComponent(preview,.7);
    else if(selection.kind==='engine'||selection.kind==='extender'){
      const im=assets[selection.kind],size=selection.kind==='engine'?engineProfile(state).width:1,p=screen(preview.x-Math.floor(size/2),preview.y-Math.floor(size/2));
      if(selection.kind==='engine')drawEngine(preview,.7);
      else if(im){ctx.save();ctx.globalAlpha=.7;ctx.drawImage(im,p.x,p.y,zoom*size,zoom*size);ctx.restore();}
    }
  }
  ctx.save();ctx.strokeStyle=moving&&(result.rejected||result.outside||result.missingSupport)?'#ed9985':'#f1cc7b';ctx.lineWidth=2;
  for(const k of highlighted){const [x,y]=point(k),p=screen(x,y);ctx.strokeRect(p.x+1,p.y+1,zoom-2,zoom-2);}ctx.restore();
}
// Draw last so the original placement limit stays visible over floor, hull and extended fields.
const highlightEngine=!!state.engine&&(layer==='engine'||!layer&&selection?.kind==='engine'||layer==='extender'||componentDefinition(layer)?.fieldRadius)&&!erase&&!drag?.erase;
$('engine-boundary-legend').hidden=!highlightEngine;
if(highlightEngine){
  const originalField=engineField;
  ctx.save();traceFieldBoundary(originalField);ctx.lineJoin='round';
  ctx.strokeStyle='#142326';ctx.lineWidth=6;ctx.stroke();
  ctx.strokeStyle='#f1cc7b';ctx.lineWidth=2.5;ctx.stroke();ctx.restore();
}
$('zoom-level').textContent=`${Math.round(zoom/22*100)}%`;positionRotationHandles();}
function positionRotationHandles(){
  const controls=$('component-rotation-handles');
  const component=!layer&&selection?.kind==='component'?itemPosition(state,selection):null;
  controls.hidden=!component||!componentDefinition(component.type,state)?.rotate||panMode||!!drag||touchNavigation;
  if(controls.hidden)return;
  const b=componentBounds(component,state),p=screen(b.x,b.y);
  if(p.x+b.width*zoom<0||p.x>width||p.y+b.height*zoom<0||p.y>height){controls.hidden=true;return;}
  const board=canvas.getBoundingClientRect(),toolbar=$('drawing-toolbar').getBoundingClientRect();
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const maxY=Math.min(height-48,toolbar.top-board.top-48);
  if(maxY<4||width<104){controls.hidden=true;return;}
  let left=clamp(p.x-52,4,width-48),right=clamp(p.x+b.width*zoom+8,4,width-48);
  if(right-left<52){right=clamp(left+52,56,width-48);left=right-52;}
  const desiredY=clamp(p.y+(b.height*zoom-44)/2,4,maxY);
  const obstacles=[$('palette-panel'),$('zoom-controls')].map(e=>{const r=e.getBoundingClientRect();return {x:r.left-board.left,y:r.top-board.top,right:r.left-board.left+r.width,bottom:r.top-board.top+r.height};});
  const clear=y=>obstacles.every(r=>[left,right].every(x=>x+44<=r.x||x>=r.right||y+44<=r.y||y>=r.bottom));
  const candidates=[desiredY,...obstacles.map(r=>clamp(r.bottom+4,4,maxY)),4,maxY];
  const y=candidates.find(clear);
  // The toolbar remains available if there is no room beside the component.
  if(y===undefined){controls.hidden=true;return;}
  for(const [id,x] of [['component-rotate-left',left],['component-rotate-right',right]]){
    $(id).style.left=`${x}px`;$(id).style.top=`${y}px`;
  }
}
function tileAt(x,y){return {x:Math.floor((x-width/2-offset.x)/zoom),y:Math.floor((y-height/2-offset.y)/zoom)};}
function resize(){const r=$('board').getBoundingClientRect();width=r.width;height=r.height;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);render();}new ResizeObserver(resize).observe($('board'));
function applyCells(cells,remove){const r=apply(state,layer,cells,remove,rotation);state=r.state;if(r.rejected)drag&&(drag.message=r.message);}
function pointerWorld(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left-width/2-offset.x)/zoom,y:(e.clientY-r.top-height/2-offset.y)/zoom};}
function touchSnapshot(){
  const [a,b]=[...touchPointers.values()];
  if(!b)return null;
  const r=canvas.getBoundingClientRect();
  return {x:(a.x+b.x)/2-r.left,y:(a.y+b.y)/2-r.top,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom,offset:{...offset}};
}
function navigateTouch(){
  const next=touchSnapshot();if(!gesture||!next)return;
  zoom=Math.max(8,Math.min(58,gesture.zoom*next.distance/gesture.distance));
  const ratio=zoom/gesture.zoom;
  offset={x:next.x-width/2-(gesture.x-width/2-gesture.offset.x)*ratio,y:next.y-height/2-(gesture.y-height/2-gesture.offset.y)*ratio};
  render();
}
canvas.onpointerdown=e=>{
  if(e.button!==0&&e.button!==1&&e.button!==2)return;
  e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);hover=tile(e);
  if(e.pointerType==='touch'){
    touchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touchPointers.size>1){
      // Restore the entire unfinished edit before a second finger navigates.
      if(drag)finish(null,true);
      touchNavigation=true;gesture=touchSnapshot();hover=null;refresh();return;
    }
    if(touchNavigation)return;
  }
  if(drag||touchNavigation)return;
  if(panMode||space||e.button===1){drag={pan:true,pointerId:e.pointerId,x:e.clientX,y:e.clientY,offset:{...offset}};canvas.style.cursor='grabbing';return;}
  if(e.button===2&&(!layer||!hitItem(state,pointerWorld(e)))){chooseLayer(null);return;}
  if(!layer){
    selection=hitItem(state,pointerWorld(e));
    if(selection){const p=itemPosition(state,selection);drag={move:true,pointerId:e.pointerId,start:{...hover},origin:{x:p.x,y:p.y},target:{x:p.x,y:p.y}};}
    refresh();return;
  }
  drag={pointerId:e.pointerId,start:hover,last:hover,erase:erase||e.button===2,before:structuredClone(state),message:''};
  if(shape==='single')applyCells([key(hover.x,hover.y)],drag.erase);refresh();
};
function continueStroke(e){
  const cells=new Set(),samples=[...(e.getCoalescedEvents?.()||[]),e];
  for(const sample of samples){
    const next=tile(sample);hover=next;
    if(next.x===drag.last.x&&next.y===drag.last.y)continue;
    for(const k of shapeCells('diagonal',drag.last,next))cells.add(k);
    drag.last=next;
  }
  if(!cells.size)return false;
  applyCells([...cells],drag.erase);return true;
}
canvas.onpointermove=e=>{
  if(touchPointers.has(e.pointerId))touchPointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touchNavigation){navigateTouch();return;}
  if(drag&&e.pointerId!==drag.pointerId)return;
  if(drag?.pan){offset={x:drag.offset.x+e.clientX-drag.x,y:drag.offset.y+e.clientY-drag.y};hover=tile(e);render();return;}
  if(drag&&!drag.move&&shape==='single'&&(paintableLayer()||drag.erase)){
    if(continueStroke(e))render();return;
  }
  const next=tile(e);if(hover&&next.x===hover.x&&next.y===hover.y)return;
  hover=next;
  if(drag?.move){drag.target={x:drag.origin.x+hover.x-drag.start.x,y:drag.origin.y+hover.y-drag.start.y};canvas.style.cursor='grabbing';}
  render();
};
function finish(e,cancel=false){
  if(!drag)return;
  if(drag.pan){drag=null;canvas.style.cursor=panMode||!layer?'grab':'crosshair';return;}
  if(drag.move){
    const d=drag;drag=null;
    if(cancel){refresh();return;}
    if(e){const end=tile(e);d.target={x:d.origin.x+end.x-d.start.x,y:d.origin.y+end.y-d.start.y};}
    const result=moveItem(state,selection,d.target);
    if(result.rejected){toast(result.message);refresh();return;}
    selection=result.item;commit(result.state);refresh();return;
  }
  const d=drag;
  if(e&&!cancel){hover=tile(e);if(shape==='single'&&(paintableLayer()||d.erase))continueStroke(e);}
  if(cancel)state=d.before;
  else if(shape!=='single')applyCells(shapeCells(shape,d.start,hover||d.start),d.erase);
  drag=null;
  if(JSON.stringify(d.before)!==JSON.stringify(state)){undo.push(d.before);if(undo.length>80)undo.shift();redo=[];changed();}else refresh();
  if(d.message&&!cancel)toast(d.message);render();
}

function endPointer(e,cancel=false){
  touchPointers.delete(e.pointerId);
  if(touchNavigation){
    gesture=touchSnapshot();
    // A remaining finger cannot resume painting until every finger is lifted.
    if(!touchPointers.size){touchNavigation=false;hover=null;refresh();}
    return;
  }
  if(drag?.pointerId===e.pointerId)finish(e,cancel);
}
canvas.onpointerup=e=>endPointer(e);canvas.onpointercancel=e=>endPointer(e,true);canvas.onlostpointercapture=e=>endPointer(e,true);canvas.onpointerleave=()=>{if(!drag){hover=null;render();}};canvas.oncontextmenu=e=>e.preventDefault();
function zoomBy(f,at={x:width/2,y:height/2}){const next=Math.max(8,Math.min(58,zoom*f)),ratio=next/zoom;offset={x:at.x-width/2-(at.x-width/2-offset.x)*ratio,y:at.y-height/2-(at.y-height/2-offset.y)*ratio};zoom=next;render();}
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoomBy(Math.exp(-e.deltaY*.001),{x:e.clientX-r.left,y:e.clientY-r.top});},{passive:false});$('zoom-in').onclick=()=>zoomBy(1.25);$('zoom-out').onclick=()=>zoomBy(.8);
function center(){const tiles=[...state.floor,...state.hull,...engineFootprint(state),...(state.scaffold||[]),...state.extenders.map(e=>key(e.x,e.y)),...(state.components||[]).flatMap(componentCells)];if(!tiles.length){offset={x:0,y:0};zoom=22;}else{const ps=tiles.map(point),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys);zoom=Math.max(8,Math.min(32,(width-120)/(b-a+5),(height-120)/(d-c+5)));offset={x:-(a+b+1)/2*zoom,y:-(c+d+1)/2*zoom};}hover=null;render();}$('center').onclick=center;
function history(back){const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;if(drag)finish(null,true);selection=null;to.push(structuredClone(state));state=from.pop();changed();}$('undo').onclick=()=>history(true);$('redo').onclick=()=>history(false);
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['Delete','Backspace'].includes(e.key)&&!layer&&!panMode&&selection){e.preventDefault();removeSelected();return;}if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['q','e'].includes(e.key.toLowerCase())){e.preventDefault();rotateSelected(e.key.toLowerCase()==='q'?-1:1);}if(e.code==='Space'&&!e.target.matches('button,summary,a')){space=true;e.preventDefault();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();history(!e.shiftKey);}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();requestSave();}if(e.key==='Escape'){chooseLayer(null);hover=null;render();}});window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;finish(null,true);touchPointers.clear();gesture=null;touchNavigation=false;});
$('name').oninput=()=>{dirty=true;draft();statusDirty=true;render();};
let confirmAction=null;function confirm(title,text,action){$('confirm-title').textContent=title;$('confirm-text').textContent=text;confirmAction=action;$('confirm-dialog').showModal();}$('cancel-confirm').onclick=()=>$('confirm-dialog').close();$('accept-confirm').onclick=()=>{$('confirm-dialog').close();confirmAction?.();};
function save(){const library=[...readLibrary()],id=savedId||crypto.randomUUID(),name=$('name').value.trim()||'Untitled gravship';const item={id,name,updated:Date.now(),state:structuredClone(state)},i=library.findIndex(d=>d.id===id);if(i>=0)library[i]=item;else library.push(item);if(store(STORAGE,library)){savedId=id;dirty=false;$('name').value=name;draft();refresh();toast('Design saved in this browser.');return true;}return false;}
function requestSave(){
  if(drag)finish(null,true);
  if(!savedId&&(!$('name').value.trim()||$('name').value.trim()==='Untitled gravship')){
    $('save-name').value='';$('save-dialog').showModal();$('save-name').focus();return;
  }
  save();
}
$('save').onclick=requestSave;
$('cancel-save').onclick=()=>$('save-dialog').close();
$('save-form').onsubmit=e=>{e.preventDefault();const name=$('save-name').value.trim();if(!name){$('save-name').focus();return;}$('name').value=name;dirty=true;draft();if(save())$('save-dialog').close();};
$('new').onclick=()=>{const action=()=>{commit(blank({mods:state.mods,engineType:state.engineType,scenario:state.scenario}));savedId=null;$('name').value='Untitled gravship';dirty=false;chooseLayer('engine');draft();center();};if(state.engine||state.floor.length||state.hull.length||state.scaffold?.length||(state.components||[]).length)confirm('Start a new gravship?','The current canvas will be cleared. Save your design first if you want to keep it.',action);else action();};
function library(){const list=$('design-list');list.replaceChildren();const items=[...readLibrary()].sort((a,b)=>b.updated-a.updated);if(!items.length){const p=document.createElement('p');p.textContent='No saved designs yet. Use Save design to keep your first gravship.';list.append(p);}for(const item of items){const row=document.createElement('div');row.className='saved-row';const info=document.createElement('div'),name=document.createElement('strong'),meta=document.createElement('small');name.textContent=item.name;meta.textContent=`${item.state?.floor?.length||0} tiles · ${new Date(item.updated).toLocaleDateString()}`;info.append(name,meta);const load=document.createElement('button');load.textContent='Load';load.onclick=()=>{const action=()=>{try{const next=sanitize(item.state);undo.push(structuredClone(state));redo=[];state=next;selection=null;savedId=item.id;$('name').value=item.name;dirty=false;$('library').close();draft();refresh();center();toast('Design loaded.');}catch{toast('This saved design could not be loaded.');}};if(dirty)confirm('Load this design?','Your unsaved canvas changes will be replaced.',action);else action();};const del=document.createElement('button');del.textContent='Delete';del.onclick=()=>confirm('Delete saved design?',`“${item.name}” will be removed from this browser.`,()=>{if(store(STORAGE,readLibrary().filter(d=>d.id!==item.id))){if(savedId===item.id){savedId=null;dirty=true;draft();}library();refresh();}});row.append(info,load,del);list.append(row);}}
window.addEventListener('storage',e=>{if(e.key===STORAGE||e.key===null){libraryCache=null;statusDirty=true;render();}});
$('load').onclick=()=>{library();$('library').showModal();};$('close-library').onclick=()=>$('library').close();
try{const d=JSON.parse(localStorage.getItem(DRAFT));if(d){state=sanitize(d.state);$('name').value=typeof d.name==='string'?d.name:'Untitled gravship';savedId=d.savedId||null;dirty=!!d.dirty;if(state.engine)layer='floor';}}catch{toast('Could not restore the previous canvas. Start a new design.');}
for(const [id,file] of Object.entries(paths)){const im=new Image();im.onload=()=>{assets[id]=im;render();};im.src=`assets/${file}`;}
function loadHullTextures(){
  if(hullReferencesRequested)return;
  hullReferencesRequested=true;
  for(const ref of HULL_REFERENCES){
    const im=new Image();im.onload=()=>{
      hullTextures[ref.id]=im;hullTexturesReady=HULL_REFERENCES.every(r=>hullTextures[r.id]);
      if($('diagonal-hull').checked)render();
    };
    im.onerror=()=>toast('Diagonal hull artwork could not be loaded. Reload to retry.');
    im.src=`assets/${ref.texture}`;
  }
}
function loadComponentAssets(){
  const signature=JSON.stringify([state.mods,state.engineType,[...new Set((state.components||[]).map(c=>c.type))].sort(),!!state.scaffold?.length]);
  if(assetSignature===signature)return;assetSignature=signature;
  const files=new Set([...availableComponents(state).filter(d=>!d.chapter&&d.group!=='Furniture'),...(state.components||[]).map(c=>componentDefinition(c.type,state)),engineProfile(state),extenderProfile(state)].flatMap(d=>[...Object.values(d.sprites),...Object.values(d.topSprites||{}),d.topSprite].filter(Boolean)));
  if(normalizeMods(state.mods).chapter1||state.scaffold?.length)files.add('mods/chapter1/Things/Terrain/Substructure/Subscaffolding.png');
  for(const file of files)loadImage(file);
}
function loadImage(file){
  if(requestedAssets.has(file))return;requestedAssets.add(file);
  const im=new Image();im.onload=()=>{assets[file]=im;render();};im.onerror=()=>console.warn(`Component image unavailable: ${file}`);im.src=`assets/${file}`;
}
loadHullTextures();
refresh();resize();if(state.engine)center();
