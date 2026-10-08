// RevidAPI documented endpoints only. No generic proxy or automatic paid fallback.
export class RevidError extends Error {
  constructor(status,message){super(message);this.status=status}
}
const idPattern=/^[A-Za-z0-9_-]{1,150}$/;
async function requestJSON(url,env,{method='GET',body,form=false}={}){
  let response;
  try{response=await fetch(url,{method,body,headers:{'x-api-key':env.REVID_API_KEY,...(!form?{'Content-Type':'application/json'}:{})},redirect:'error',signal:AbortSignal.timeout(60000)})}
  catch{throw new RevidError(502,'Không kết nối được RevidAPI. Yêu cầu đã gửi có thể vẫn đang xử lý; không tự gửi lại.')}
  if(!response.ok){const messages={400:'RevidAPI không chấp nhận tham số hoặc ảnh đầu vào.',401:'Khoá RevidAPI không hợp lệ.',402:'Tài khoản RevidAPI không đủ credit.',403:'Khoá RevidAPI chưa được cấp quyền này.',404:'RevidAPI chưa cung cấp endpoint hoặc model này cho tài khoản.',429:'RevidAPI đang giới hạn lượt xử lý. Hãy chờ tác vụ hiện tại.'};throw new RevidError(response.status===429?429:502,messages[response.status]||'RevidAPI chưa trả được kết quả.')}
  const reader=response.body?.getReader();const chunks=[];let length=0;
  if(!reader)throw new RevidError(502,'RevidAPI không trả dữ liệu.');
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024){await reader.cancel();throw new RevidError(502,'Phản hồi RevidAPI quá lớn.')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new RevidError(502,'Phản hồi RevidAPI không hợp lệ.')}
}
function validateId(id){if(typeof id!=='string'||!idPattern.test(id))throw new RevidError(502,'RevidAPI không trả mã tác vụ hợp lệ.');return id}
export async function submitRevid(body,env){
  if(body.action==='generate'){
    const sizes={square_hd:'1:1',landscape_4_3:'4:3',landscape_16_9:'16:9',portrait_16_9:'9:16'};
    if(!Object.hasOwn(sizes,body.size))throw new RevidError(400,'RevidAPI hỗ trợ tỷ lệ 1:1, 4:3, 16:9 hoặc 9:16.');
    const data=await requestJSON('https://revidapi.com/v1/images/generations',env,{method:'POST',body:JSON.stringify({model:'gpt-image-2',prompt:body.prompt.trim(),aspect_ratio:sizes[body.size],output_format:'png'})});
    if(data.data?.length)return{group:'image',id:data.id?validateId(data.id):crypto.randomUUID(),immediate:data.data};
    return{group:'image',id:validateId(data.id)};
  }
  if(body.action==='removeBackground'){
    const match=body.image.match(/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/);
    if(!match)throw new RevidError(400,'Ảnh không hợp lệ.');
    const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));const form=new FormData();
    form.set('file',new Blob([bytes],{type:match[1]}),'input.'+(match[1]==='image/jpeg'?'jpg':match[1].split('/')[1]));form.set('model','u2net');
    const data=await requestJSON('https://revidapi.com/v1/remove-background',env,{method:'POST',body:form,form:true});
    if(data.success===false)throw new RevidError(502,'RevidAPI không nhận được ảnh xoá nền.');
    return{group:'background',id:validateId(data.task_id)};
  }
  throw new RevidError(400,'Chưa có tích hợp RevidAPI cho tác vụ này.');
}
export async function pollRevid(job,env){
  if(job.immediate)return{status:'COMPLETED',images:job.immediate};
  const id=validateId(job.id);
  const url=job.group==='image'?`https://revidapi.com/v1/images/jobs/${id}`:job.group==='background'?`https://revidapi.com/v1/job/status/${id}`:null;
  if(!url)throw new RevidError(400,'Loại tác vụ RevidAPI không hợp lệ.');
  const data=await requestJSON(url,env);
  if(data.status==='failed'||data.status==='error'||data.success===false)throw new RevidError(422,'RevidAPI xử lý thất bại. Kiểm tra tác vụ và credit trong tài khoản.');
  if(data.status==='completed'){
    const images=job.group==='image'?data.data:(data.result?.image_url?[{url:data.result.image_url}]:[]);
    return{status:'COMPLETED',images};
  }
  if(['queued','pending'].includes(data.status))return{status:'IN_QUEUE'};
  if(['processing','running','in_progress'].includes(data.status))return{status:'IN_PROGRESS'};
  throw new RevidError(502,'RevidAPI trả trạng thái không được nhận diện.');
}
