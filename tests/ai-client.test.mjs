import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source=readFileSync(new URL('../assets/ai.js',import.meta.url),'utf8');
function setup(){
 const elements=new Map(),calls=[];let remembered=0,downloaded=false;
 function element(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,classList:{toggle(){},add(){},remove(){}},append(){},replaceChildren(){},scrollIntoView(){},focus(){},showModal(){this.open=true},close(){this.open=false}});return elements.get(id)}
 element('aiAction').value='layers';element('aiSource').value='selected';element('aiLayerCount').value='4';element('aiSize').value='square_hd';element('aiPassword').value='owner-access-test-123456';
 const original={id:'poster',name:'poster',type:'image',src:'data:image/png;base64,AAAA',x:100,y:200,w:800,h:500,opacity:1,visible:true};
 const S={w:1600,h:1000,layers:[original],selected:'poster'};const cache=new Map([[original.src,{width:800,height:500}]]);
 const context=vm.createContext({S,cache,$:element,crypto:webcrypto,TextEncoder,Uint8Array,URL,atob,Image:class{width=800;height=500;async decode(){}},
  selected:()=>S.layers.find(l=>l.id===S.selected),composition:()=>({width:1600,height:1000}),
  newCanvas:(width,height)=>({width,height,getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/png;base64,AAAA'}),
  layerBase:(name,type)=>({id:'new-'+S.layers.length,name,type,x:0,y:0,w:S.w,h:S.h,opacity:1,visible:true}),
  remember:()=>remembered++,render(){},zipStore:files=>{assert.ok(files[0].data instanceof Uint8Array);return files},download:()=>downloaded=true,
  sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  document:{querySelectorAll:()=>[],createElement:()=>({append(){}})},
  fetch:async(path,options={})=>{calls.push({path,options});if(path.endsWith('config'))return Response.json({ready:true});if(path.endsWith('auth'))return Response.json({ok:true});if(path.endsWith('jobs'))return Response.json({token:'job-token',requestId:'request-1'},{status:202});if(path.includes('job?'))return Response.json({status:'COMPLETED',images:[{name:'AI · Layer 1',token:'image-1'},{name:'AI · Layer 2',token:'image-2'}]});if(path.includes('image?'))return new Response(new Blob([new Uint8Array([1,2])],{type:'image/png'}));throw Error(path)},
 });vm.runInContext(source,context);
 return {S,e:element,calls,get remembered(){return remembered},get downloaded(){return downloaded}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('AI preview preserves source until apply, then places every RGBA layer on the original bounds',async()=>{
 const app=setup();await settle();await app.e('aiUnlock').onclick();await app.e('aiRun').onclick();
 assert.equal(app.S.layers.length,1);assert.equal(app.S.layers[0].visible,true);assert.equal(app.e('aiResultDialog').open,true);
 assert.equal(JSON.parse(app.calls.find(c=>c.path.endsWith('jobs')).options.body).numLayers,4);
 app.e('aiDownload').onclick();assert.equal(app.downloaded,true);
 await app.e('aiApply').onclick();assert.equal(app.remembered,1);assert.equal(app.S.layers.length,3);assert.equal(app.S.layers[0].visible,false);
 for(const layer of app.S.layers.slice(1)){assert.deepEqual([layer.x,layer.y,layer.w,layer.h],[100,200,800,500]);assert.ok(layer.src.startsWith('data:image/png'))}
 assert.equal(app.e('aiRun').disabled,false);
});
test('edited document rejects late results instead of hiding or overwriting current layers',async()=>{
 const app=setup();await settle();await app.e('aiUnlock').onclick();await app.e('aiRun').onclick();app.S.layers[0].x=999;await app.e('aiApply').onclick();
 assert.equal(app.S.layers.length,1);assert.equal(app.S.layers[0].visible,true);assert.equal(app.remembered,0);assert.match(app.e('aiResultInfo').textContent,/đã thay đổi/);
});
test('public page requires unlock and clears access on lock',async()=>{
 const app=setup();await settle();assert.equal(app.e('aiRun').disabled,true);await app.e('aiUnlock').onclick();assert.equal(app.e('aiRun').disabled,false);assert.equal(app.e('aiPassword').value,'');app.e('aiLock').onclick();assert.equal(app.e('aiRun').disabled,true);
});
