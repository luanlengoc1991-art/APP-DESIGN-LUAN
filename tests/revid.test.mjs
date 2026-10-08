import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
const env={REVID_API_KEY:'revid-test-key',AI_ACCESS_TOKEN:'owner-access-test-123456'};
const req=(path,method='GET',body)=>new Request('https://studio.example/api/ai/'+path,{method,headers:{Authorization:'Bearer '+env.AI_ACCESS_TOKEN,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const generate={action:'generate',prompt:'Poster Luân',size:'landscape_4_3'};
const image='https://edit.revidapi.com/media/anh/result.png';
async function mockFetch(mock,fn){const original=globalThis.fetch;globalThis.fetch=mock;try{await fn()}finally{globalThis.fetch=original}}

test('Revid key enables documented features without claiming layer decomposition',async()=>{
 const data=await(await worker.fetch(req('config'),env)).json();assert.equal(data.ready,true);assert.deepEqual(data.actions,['removeBackground','generate']);assert.equal(data.providers.layers,null);assert.equal(data.providers.generate,'revid');
 await mockFetch(()=>{throw Error('must not bill')},async()=>{assert.equal((await worker.fetch(req('jobs','POST',{action:'layers',image:'data:image/png;base64,AAAA',numLayers:4}),env)).status,503)});
});
test('Revid generation: fixed payload, queued result, signed image download, no key leak',async()=>{
 let posts=0;await mockFetch(async(url,options={})=>{
  if(url==='https://revidapi.com/v1/images/generations'){posts++;assert.equal(options.headers['x-api-key'],env.REVID_API_KEY);const body=JSON.parse(options.body);assert.deepEqual(body,{model:'gpt-image-2',prompt:'Poster Luân',aspect_ratio:'4:3',output_format:'png'});return Response.json({id:'img_test',status:'queued',poll:'https://attacker.example/ignore'})}
  if(url==='https://revidapi.com/v1/images/jobs/img_test')return Response.json({status:'completed',data:[{url:image}]});
  if(url===image){assert.equal(options.headers,undefined);return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}})}
  throw Error(url);
 },async()=>{
  const response=await worker.fetch(req('jobs','POST',generate),env);assert.equal(response.status,202);const job=await response.json();assert.equal(job.cancelSupported,false);assert.ok(!JSON.stringify(job).includes(env.REVID_API_KEY));
  const result=await(await worker.fetch(req('job?token='+encodeURIComponent(job.token)),env)).json();assert.equal(result.status,'COMPLETED');const media=await worker.fetch(req('image?token='+encodeURIComponent(result.images[0].token)),env);assert.equal(media.status,200);
  assert.equal((await worker.fetch(req('job?token='+encodeURIComponent(job.token),'DELETE'),env)).status,409);assert.equal(posts,1);
 });
});
test('immediate Revid image results do not create or poll a second paid job',async()=>{
 let calls=0;await mockFetch(async()=>{calls++;return Response.json({data:[{url:image}]})},async()=>{const job=await(await worker.fetch(req('jobs','POST',generate),env)).json();const data=await(await worker.fetch(req('job?token='+encodeURIComponent(job.token)),env)).json();assert.equal(data.status,'COMPLETED');assert.equal(calls,1)});
});
test('Revid background removal submits actual file bytes and reads documented task result',async()=>{
 await mockFetch(async(url,options={})=>{
  if(url==='https://revidapi.com/v1/remove-background'){assert.equal(options.headers['Content-Type'],undefined);assert.equal(options.headers['x-api-key'],env.REVID_API_KEY);assert.ok(options.body instanceof FormData);assert.equal(options.body.get('model'),'u2net');const file=options.body.get('file');assert.equal(file.type,'image/png');assert.deepEqual(Array.from(new Uint8Array(await file.arrayBuffer())),[0,0,0]);return Response.json({success:true,task_id:'task_test',status:'pending'})}
  if(url==='https://revidapi.com/v1/job/status/task_test')return Response.json({status:'completed',result:{image_url:'https://edit.revidapi.com/output/result.png'}});
  throw Error(url);
 },async()=>{const job=await(await worker.fetch(req('jobs','POST',{action:'removeBackground',image:'data:image/png;base64,AAAA'}),env)).json();const data=await(await worker.fetch(req('job?token='+encodeURIComponent(job.token)),env)).json();assert.equal(data.images.length,1)});
});
test('Revid failure never falls back to another billed provider',async()=>{
 const calls=[];await mockFetch(async(url)=>{calls.push(url);return Response.json({error:env.REVID_API_KEY},{status:402})},async()=>{const response=await worker.fetch(req('jobs','POST',generate),{...env,FAL_KEY:'fal-test-secret'});assert.equal(response.status,502);assert.ok(!(await response.text()).includes(env.REVID_API_KEY));assert.deepEqual(calls,['https://revidapi.com/v1/images/generations'])});
});
test('Revid failed/pending jobs normalize and cannot turn into a generic URL proxy',async()=>{
 for(const status of ['queued','processing','failed']){
  await mockFetch(async(url)=>url.endsWith('generations')?Response.json({id:'img_test'}):Response.json({status}),async()=>{const job=await(await worker.fetch(req('jobs','POST',generate),env)).json();const response=await worker.fetch(req('job?token='+encodeURIComponent(job.token)),env);if(status==='failed')assert.equal(response.status,422);else assert.equal((await response.json()).status,status==='queued'?'IN_QUEUE':'IN_PROGRESS')});
 }
 await mockFetch(async()=>Response.json({data:[{url:'https://edit.revidapi.com.attacker.example/output/a.png'}]}),async()=>{assert.equal((await worker.fetch(req('jobs','POST',generate),env)).status,502)});
 await mockFetch(()=>{throw Error('must not bill')},async()=>{assert.equal((await worker.fetch(req('jobs','POST',{...generate,size:'portrait_4_3'}),env)).status,400)});
});
