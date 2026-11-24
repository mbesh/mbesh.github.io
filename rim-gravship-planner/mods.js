import {MOD_ENGINES,MOD_OVERRIDES} from './mod-data.js';

export function normalizeMods(mods={}){
  const chapter2=mods?.chapter2===true;
  return {chapter1:mods?.chapter1===true||chapter2,chapter2};
}
export const chapterEnabled=(state,chapter)=>!chapter||normalizeMods(state?.mods)[`chapter${chapter}`];
export const componentEnabled=(state,definition)=>!!definition&&chapterEnabled(state,definition.chapter);
export function modOverride(id,state){
  const mods=normalizeMods(state?.mods);
  const one=mods.chapter1?MOD_OVERRIDES[1][id]:{},two=mods.chapter2?MOD_OVERRIDES[2][id]:{};
  return {...one,...two,systems:{...one?.systems,...two?.systems}};
}
const VANILLA_ENGINE=Object.freeze({id:'standard',name:'Grav engine',width:3,height:3,fieldRadius:18.9,support:500,sprites:{south:'GravEngine_with_orb.png'}});
export function engineOptions(state){
  return normalizeMods(state?.mods).chapter1
    ? [{...VANILLA_ENGINE,...MOD_OVERRIDES[1].engine},...MOD_ENGINES]
    : [VANILLA_ENGINE];
}
export function engineProfile(state){return engineOptions(state).find(e=>e.id===state?.engineType)||engineOptions(state)[0];}
export function extenderProfile(state){
  return {name:'Field extender',fieldRadius:16.9,supportOffset:250,limit:6,sprites:{south:'GravFieldExtender.png'},...modOverride('extender',state)};
}
