const number=value=>Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:2}):'—';
const quantity=(n,unit)=>`${number(n)} ${unit}`;
const hours=seconds=>quantity(seconds/(2500/60),'h');

export function renderSystems(report,document){
  const $=id=>document.getElementById(id),{flight:f,jump:j,oxygen:o,heat:h,scenario:s}=report;
  const rows=(id,items)=>$(id).replaceChildren(...items.map(([label,value])=>{
    const row=document.createElement('div');row.className='stat';
    const title=document.createElement('span'),amount=document.createElement('b');
    title.textContent=label;amount.textContent=value;row.append(title,amount);return row;
  }));
  $('systems-range').textContent=quantity(f.range,'tiles');
  rows('systems-flight',[
    [f.fuelKind,`${number(f.fuelLoaded)} / ${number(f.fuelCapacity)}`],
    ['Range at full load',quantity(f.fullRange,'tiles')],
    ['Ready thrust ceiling',quantity(f.availableCeiling,'tiles')],
    ['Clear / installed thrusters',`${f.readyThrusters} / ${f.installedThrusters}`],
    ['Fuel saving',`${number(f.fuelSavings*100)}%`],
    [`${f.fuelKind}-only rate`,quantity(f.fuelPerTile,'/ tile')],
    ...(f.electricEnergy?[
      ['Usable electric energy',`${number(f.energyAvailable)} / ${number(f.electricEnergy)} Wd`],
      ['Electric range budget',quantity(f.electricBudget,'tiles')],
    ]:[]),
    ...(report.modded?[
      ['Astrofuel refining',quantity(f.fuelProductionPerDay,'/ day')],
      ['Refining chemfuel input',quantity(f.refiningChemfuelPerDay,'/ day')],
      ['Generator refill demand',quantity(f.generatorFuelPerDay,'/ day')],
    ]:[]),
  ]);
  $('systems-jump').textContent=j.reachable
    ? `${j.distance}-tile jump: ${number(j.fuelSpent)} ${f.fuelKind.toLowerCase()}${j.energySpent>0?` + ${number(j.energySpent)} Wd (${number(j.chargeSpentPercent)}% charge)`:''}.`
    : `${j.distance}-tile jump: outside estimated range.`;
  rows('systems-oxygen',report.modded?[
    ['Oxygen stored',`${number(o.loaded)} / ${number(o.capacity)}`],
    ['Production',quantity(o.productionPerDay,'/ day')],
    ['Crew demand',quantity(o.demandPerDay,'/ day')],
    ['Net balance',`${o.netPerDay>0?'+':''}${number(o.netPerDay)} / day`],
    ['Stored-only reserve',o.demandPerDay===0?'No crew draw':quantity(o.loaded/o.demandPerDay,'days')],
    ['Reserve with production',o.demandPerDay===0?'No crew draw':Number.isFinite(o.reserveDays)?quantity(o.reserveDays,'days'):'No depletion'],
    ['Oxyalgae input',quantity(o.oxyalgaePerDay,'/ day')],
    ['Pump max draw',quantity(o.pumpPerSecond*1000,'/ day')],
    ['Pump duty for crew',Number.isFinite(o.pumpDuty)?`${number(o.pumpDuty*100)}%`:'No pumps'],
    ['Cabin refill oxygen',quantity(o.fillOxygen,'units')],
    ['Ideal cabin refill time',Number.isFinite(o.fillSeconds)?hours(o.fillSeconds):'No pumps'],
  ]:[
    ['Oxygen pumps',number(o.pumps)],
    ['Oxygen supply','No stored resource'],
    ['Ideal cabin refill time',Number.isFinite(o.fillSeconds)?hours(o.fillSeconds):'No pumps'],
  ]);
  $('systems-oxygen-note').textContent=report.modded
    ? `${s.crew} standard humanlikes; ${s.vacuum?'vacuum':'breathable atmosphere'}. Cabin estimate: ${number(o.cabinTiles)} tiles. Reserve assumes rooms are already pressurized; leaks and suit refills use extra oxygen. Production assumes inputs and storage are available.`
    : 'Vanilla pumps supply enclosed rooms without oxygen tanks. Cabin refill assumes an airtight room and powered pumps.';
  rows('systems-heat',report.modded?[
    ['Sink capacity',quantity(h.capacity,'HU')],
    ['Initially stored',quantity(h.stored,'HU')],
    ['Requested jump heat',quantity(h.jumpHeat,'HU')],
    ['Excess into rooms',quantity(h.overflow,'HU')],
    ['Passive sink cooling',quantity(h.dissipationPerHour,'HU / h')],
    ['Sink cooldown after jump',Number.isFinite(h.clearHours)?quantity(h.clearHours,'h'):'No passive cooling'],
    ['Jumps before sink overflow',Number.isFinite(h.safeJumps)?number(h.safeJumps):'—'],
    ['Cold-sink cooldown bonus',`${number(h.cooldownReduction*100)}%`],
    ...(h.activeShieldHeatPerHour?[['Active shield heat',quantity(h.activeShieldHeatPerHour,'HU / h')]]:[]),
    ['Emergency absorbers',number(h.absorbers)],
    ['Room heaters',number(h.roomHeaters)],
  ]:[['Room heaters',number(h.roomHeaters)],['Structural heat','Chapter 1 system']]);
  $('systems-heat-note').textContent=report.modded
    ? `HU matches the mod’s heatsink display. ${s.heatResearch?'Heat Dissipation researched':'Base research values'}. Jump heat is a design estimate even when the requested jump is out of range. Cooling time covers stored sink heat; room temperature, weapon damage heat and emergency absorber activation are separate.`
    : 'Room temperature depends on room size, insulation, outside temperature and heater settings.';
  $('systems-warnings').replaceChildren(...report.warnings.map(message=>{const li=document.createElement('li');li.textContent=message;return li;}));
}
