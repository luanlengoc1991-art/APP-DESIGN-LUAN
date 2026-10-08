import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { modelInput } from '../worker/index.mjs';
const env={FAL_KEY:'test-provider-secret',AI_ACCESS_TOKEN:'owner-access-test-123456',ASSETS:{fetch:()=>new Response('static')}};
const id='test-request-123';const base=`https://queue.fal.run/fal-ai/qwen-image-layered/requests/${id}`;
const request=(path,method='GET',body,auth=true)=>new Request('https://studio.example/api/ai/'+path,{method,headers:{...(auth?{Authorization:'Bearer '+env.AI_ACCESS_TOKEN}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const input={action:'layers',image:'data:image/png;base64,AAAA',numLayers:4};
const queue={request_id:id,status_url:base+'/status',response_url:base,cancel_url:base+'/cancel'};
async function withFetch(mock,fn){const original=globalThis.fetch;globalThis.fetch=mock;try{await fn()}finally{globalThis.fetch=original}}

test('AI is closed until secrets exist; static assets stay accessible',async()=>{
 assert.equal((await worker.fetch(request('jobs','POST',input),{})).status,503);
 assert.equal((await(await worker.fetch(request('config'),{})).json()).ready,false);
 assert.equal(await(await worker.fetch(new Request('https://studio.example/'),env)).text(),'static');
});
test('provider cannot be billed without owner access or from another origin',async()=>{
 await withFetch(()=>{throw Error('must not call provider')},async()=>{
  assert.equal((await worker.fetch(request('jobs','POST',input,false),env)).status,401);
  const req=request('jobs','POST',input);req.headers.set('Origin','https://attacker.example');
  assert.equal((await worker.fetch(req,env)).status,403);
 });
});
test('input maps to supported models only, and rejects malicious remote sources',()=>{
 assert.throws(()=>modelInput({...input,action:'arbitrary/provider'}));
 assert.throws(()=>modelInput({...input,image:'http://127.0.0.1/'}));
 assert.throws(()=>modelInput({...input,numLayers:50}));
 assert.throws(()=>modelInput({action:'generate',prompt:'',size:'square_hd'}));
 assert.equal(modelInput({...input,enable_safety_checker:false}).enable_safety_checker,true);
 assert.equal(modelInput({action:'upscale',image:input.image}).face,false);
 assert.deepEqual(modelInput({action:'edit',image:input.image,prompt:'giữ logo'}).image_urls,[input.image]);
});
test('signed queue lifecycle returns transparent media without leaking provider credentials',async()=>{
 const calls=[];await withFetch(async(url,options={})=>{
  calls.push({url,options});
  if(url==='https://queue.fal.run/fal-ai/qwen-image-layered')return Response.json(queue);
  if(url===base+'/status')return Response.json({status:'COMPLETED'});
  if(url===base)return Response.json({images:[{url:'https://v3.fal.media/files/test.png'}],has_nsfw_concepts:[false]});
  if(url==='https://v3.fal.media/files/test.png'){assert.equal(options.headers,undefined);return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}})}
  throw Error('unexpected url '+url);
 },async()=>{
  const submitted=await worker.fetch(request('jobs','POST',input),env);assert.equal(submitted.status,202);
  const job=await submitted.json();assert.ok(!JSON.stringify(job).includes(env.FAL_KEY));
  const data=await(await worker.fetch(request('job?token='+encodeURIComponent(job.token)),env)).json();assert.equal(data.status,'COMPLETED');
  const image=await worker.fetch(request('image?token='+encodeURIComponent(data.images[0].token)),env);
  assert.equal(image.status,200);assert.equal(image.headers.get('Cache-Control'),'no-store');assert.equal(image.headers.get('Content-Type'),'image/png');
  assert.equal((await image.arrayBuffer()).byteLength,4);
  const tampered=job.token.slice(0,-1)+(job.token.endsWith('0')?'1':'0');assert.equal((await worker.fetch(request('job?token='+encodeURIComponent(tampered)),env)).status,403);
  assert.equal(calls[0].options.headers.Authorization,'Key '+env.FAL_KEY);
  assert.equal(JSON.parse(calls[0].options.body).num_layers,4);
 });
});
test('polling does not resubmit paid jobs and cancellation uses PUT',async()=>{
 await withFetch(async(url,options={})=>{
  if(url=== 'https://queue.fal.run/fal-ai/qwen-image-layered')return Response.json(queue);
  if(url===base+'/status'){assert.equal(options.method,undefined);return Response.json({status:'IN_QUEUE',queue_position:2})}
  if(url===base+'/cancel'){assert.equal(options.method,'PUT');return new Response(null,{status:204})}
  throw Error('unexpected url');
 },async()=>{
  const {token}=await(await worker.fetch(request('jobs','POST',input),env)).json();
  const data=await(await worker.fetch(request('job?token='+encodeURIComponent(token)),env)).json();assert.equal(data.queuePosition,2);
  assert.equal((await worker.fetch(request('job?token='+encodeURIComponent(token),'DELETE'),env)).status,200);
 });
});
test('upstream URLs, error responses and HTML media are rejected',async()=>{
 await withFetch(async()=>Response.json({...queue,status_url:'https://evil.example/status'}),async()=>{assert.equal((await worker.fetch(request('jobs','POST',input),env)).status,502)});
 await withFetch(async()=>Response.json({error:env.FAL_KEY},{status:401}),async()=>{const response=await worker.fetch(request('jobs','POST',input),env);assert.equal(response.status,502);assert.ok(!(await response.text()).includes(env.FAL_KEY))});
 await withFetch(async(url)=>{if(url=== 'https://queue.fal.run/fal-ai/qwen-image-layered')return Response.json(queue);if(url===base+'/status')return Response.json({status:'COMPLETED'});return Response.json({images:[{url:'http://localhost/private'}]})},async()=>{const {token}=await(await worker.fetch(request('jobs','POST',input),env)).json();assert.equal((await worker.fetch(request('job?token='+encodeURIComponent(token)),env)).status,502)});
});
test('BEN and ESRGAN single-image responses normalize correctly',async()=>{
 for(const [action,model]of [['removeBackground','fal-ai/ben/v2/image'],['upscale','fal-ai/esrgan']]){
  await withFetch(async(url)=>{if(url===`https://queue.fal.run/${model}`)return Response.json(queue);if(url===base+'/status')return Response.json({status:'COMPLETED'});return Response.json({image:{url:'https://v3.fal.media/files/image.png'}})},async()=>{
   const {token}=await(await worker.fetch(request('jobs','POST',{action,image:input.image}),env)).json();const data=await(await worker.fetch(request('job?token='+encodeURIComponent(token)),env)).json();assert.equal(data.images.length,1);
  });
 }
});
test('unknown APIs and malformed JSON cannot fall through to HTML',async()=>{
 assert.equal((await worker.fetch(request('missing'),env)).status,404);
 const req=new Request('https://studio.example/api/ai/jobs',{method:'POST',headers:{Authorization:'Bearer '+env.AI_ACCESS_TOKEN,'Content-Type':'application/json'},body:'{broken'});
 assert.equal((await worker.fetch(req,env)).status,400);
});
