interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  PIXAZO_API_KEY: string;
  SHOTSTACK_API_KEY: string;
}

type User = { id: string; username: string };

type WorldReport = {
  song_summary: string;
  emotional_core: string;
  visual_arc: string;
  visual_language: string;
  cinematography: string;
  color_palette: string[];
  lighting: string;
  environments: string[];
  characters: Array<{name:string;role:string;visual_identity:string}>;
  symbolic_motifs: string[];
  continuity_rules: string[];
  scene_count: number;
};

const SESSION_COOKIE = "bv_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TEXT = 30000;
const MAX_AUDIO = 25 * 1024 * 1024;
const AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";

class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

const id = () => crypto.randomUUID();
const now = () => Date.now();
const json = (body: unknown, status = 200, extra: Record<string,string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra} });
const fail = (message: string, status = 400) => json({success:false,error:message}, status);

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0,max) : "";
}
function validUsername(value: string) { return /^[a-z0-9_]{3,32}$/.test(value); }
function validPassword(value: string) { return value.length >= 10 && value.length <= 200; }
function cookie(name:string,value:string,maxAge:number) {
  return name + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; Secure; SameSite=Lax";
}
function clearCookie(name:string) { return name + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"; }

function bytesToHex(buffer:ArrayBuffer|Uint8Array) {
  return Array.from(new Uint8Array(buffer)).map(v=>v.toString(16).padStart(2,"0")).join("");
}
function hexToBytes(hex:string) {
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++) out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out;
}
async function derivePassword(password:string,salt:Uint8Array) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:120000,hash:"SHA-256"},key,256));
}
async function makePassword(password:string,saltHex?:string) {
  const salt=saltHex?hexToBytes(saltHex):crypto.getRandomValues(new Uint8Array(16));
  const hash=await derivePassword(password,salt);
  return {hash:bytesToHex(hash),salt:bytesToHex(salt)};
}
async function equal(a:string,b:string) {
  const x=new TextEncoder().encode(a), y=new TextEncoder().encode(b);
  if(x.length!==y.length)return false;
  let result=0; for(let i=0;i<x.length;i++) result|=x[i]^y[i];
  return result===0;
}

function getSessionId(request:Request) {
  const header=request.headers.get("Cookie")||"";
  const match=header.match(/(?:^|;\s*)bv_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
async function currentUser(request:Request,env:Env):Promise<User|null> {
  const sid=getSessionId(request); if(!sid)return null;
  const row=await env.DB.prepare(
    "SELECT u.id,u.username,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?"
  ).bind(sid).first<{id:string;username:string;expires_at:number}>();
  if(!row)return null;
  if(row.expires_at<now()){await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();return null;}
  return {id:row.id,username:row.username};
}
async function requireUser(request:Request,env:Env) {
  const user=await currentUser(request,env);
  if(!user)throw new HttpError("Authentication required",401);
  return user;
}
async function body(request:Request) {
  const value=await request.json().catch(()=>null);
  if(!value||typeof value!=="object")throw new HttpError("Invalid JSON body",400);
  return value as Record<string,unknown>;
}
async function projectForUser(env:Env,user:User,projectId:string) {
  const row=await env.DB.prepare("SELECT * FROM projects WHERE id=? AND user_id=?").bind(projectId,user.id).first<any>();
  if(!row)throw new HttpError("Project not found",404);
  return row;
}
function originAllowed(request:Request) {
  const origin=request.headers.get("Origin");
  return !origin || origin===new URL(request.url).origin;
}

function validateWorld(value:any):WorldReport {
  const required=["song_summary","emotional_core","visual_arc","visual_language","cinematography","lighting"];
  for(const key of required) {
    if(typeof value?.[key]!=="string" || !value[key].trim()) throw new HttpError("Visual World Report missing required field: "+key,502);
  }
  if(!Array.isArray(value.color_palette)||value.color_palette.length<3)throw new HttpError("Visual World Report has an invalid color_palette",502);
  if(!Array.isArray(value.environments)||value.environments.length<1)throw new HttpError("Visual World Report has no environments",502);
  if(!Array.isArray(value.characters))throw new HttpError("Visual World Report has invalid characters",502);
  if(!Array.isArray(value.symbolic_motifs)||!Array.isArray(value.continuity_rules))throw new HttpError("Visual World Report has incomplete continuity data",502);
  const sceneCount=Math.min(24,Math.max(4,Number(value.scene_count)||8));
  return {
    song_summary:value.song_summary.trim(),
    emotional_core:value.emotional_core.trim(),
    visual_arc:value.visual_arc.trim(),
    visual_language:value.visual_language.trim(),
    cinematography:value.cinematography.trim(),
    color_palette:value.color_palette.slice(0,8).map(String),
    lighting:value.lighting.trim(),
    environments:value.environments.slice(0,12).map(String),
    characters:value.characters.slice(0,12).map((c:any)=>({name:String(c?.name||"Lead"),role:String(c?.role||""),visual_identity:String(c?.visual_identity||"")})),
    symbolic_motifs:value.symbolic_motifs.slice(0,12).map(String),
    continuity_rules:value.continuity_rules.slice(0,16).map(String),
    scene_count:sceneCount
  };
}

async function worldReport(env:Env,project:any):Promise<WorldReport> {
  const prompt =
    "You are BeatVision's Visual World Director. Create a production-ready visual bible from a song brief. " +
    "Return ONLY a JSON object. Never return markdown. Never reproduce copyrighted lyrics beyond what the user supplied. " +
    "Required keys: song_summary, emotional_core, visual_arc, visual_language, cinematography, color_palette, lighting, environments, characters, symbolic_motifs, continuity_rules, scene_count. " +
    "characters must be an array of objects with name, role, visual_identity. scene_count must be 4-24. " +
    "Song title: "+project.title+"\nArtist: "+project.artist+"\nLyrics/context: "+project.lyrics+
    "\nCreative direction: "+project.creative_direction+"\nNotes: "+project.notes;
  const result:any=await env.AI.run(AI_MODEL,{
    messages:[
      {role:"system",content:"You produce strict machine-readable JSON for a visual production pipeline."},
      {role:"user",content:prompt}
    ],
    response_format:{type:"json_object"}
  },{rejectIfBusy:true});
  const raw=result?.response ?? result?.result ?? result?.text ?? result;
  let parsed:any;
  try { parsed=typeof raw==="string"?JSON.parse(raw):raw; } catch { throw new HttpError("Workers AI returned invalid JSON",502); }
  return validateWorld(parsed);
}

function scenesFromWorld(report:WorldReport) {
  const count=report.scene_count;
  const duration=30/count;
  return Array.from({length:count},(_,i)=>{
    const environment=report.environments[i%report.environments.length];
    const character=report.characters.length?report.characters[i%report.characters.length]:{name:"Lead",visual_identity:"consistent lead character"};
    return {
      id:id(),
      scene_index:i,
      start_seconds:Number((i*duration).toFixed(3)),
      duration_seconds:Number(duration.toFixed(3)),
      prompt:
        "Cinematic music-video frame, scene "+(i+1)+". Environment: "+environment+
        ". Character: "+character.name+", "+character.visual_identity+
        ". Visual language: "+report.visual_language+
        ". Cinematography: "+report.cinematography+
        ". Lighting: "+report.lighting+
        ". Color palette: "+report.color_palette.join(", ")+
        ". Symbolic motifs: "+report.symbolic_motifs.slice(0,4).join(", ")+
        ". Preserve character identity, wardrobe, environment logic and continuity."
    };
  });
}

async function pixazoGenerate(env:Env,prompt:string) {
  const response=await fetch("https://gateway.pixazo.ai/flux-1-schnell/v1/getData",{
    method:"POST",
    headers:{"Content-Type":"application/json","Cache-Control":"no-cache","Ocp-Apim-Subscription-Key":env.PIXAZO_API_KEY},
    body:JSON.stringify({prompt,num_steps:4,width:1024,height:576})
  });
  const data:any=await response.json().catch(()=>null);
  if(!response.ok)throw new HttpError("Pixazo image generation failed",502);
  if(data?.output)return String(data.output);
  if(data?.media_url)return String(data.media_url);
  throw new HttpError("Pixazo returned no completed image",502);
}

async function shotstack(env:Env,path:string,init:RequestInit={}) {
  const response=await fetch("https://api.shotstack.io/v1"+path,{
    ...init,
    headers:{"Accept":"application/json","Content-Type":"application/json","x-api-key":env.SHOTSTACK_API_KEY,...(init.headers||{})}
  });
  const data:any=await response.json().catch(()=>null);
  if(!response.ok)throw new HttpError("Shotstack request failed",502);
  return data;
}

async function handle(request:Request,env:Env):Promise<Response> {
  if(!originAllowed(request))return fail("Invalid origin",403);
  const url=new URL(request.url), path=url.pathname, method=request.method;

  if(path==="/api/health")return json({ok:true,service:"beatvision",version:"1.0.0",language:"cloudflare-workers-ai",image:"pixazo",video:"shotstack"});
  if(path==="/api/me")return json({user:await currentUser(request,env)});

  if(path==="/api/auth/register"&&method==="POST") {
    const b=await body(request), username=text(b.username,32).toLowerCase(), password=String(b.password||"");
    if(!validUsername(username)||!validPassword(password))return fail("Username must be 3-32 lowercase letters/numbers/underscore and password must be 10-200 characters");
    const exists=await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
    if(exists)return fail("Username already exists",409);
    const p=await makePassword(password), uid=id(), sid=id(), t=now();
    await env.DB.prepare("INSERT INTO users VALUES(?,?,?,?,?)").bind(uid,username,p.hash,p.salt,t).run();
    await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)").bind(sid,uid,t+SESSION_MS,t).run();
    return json({success:true,user:{id:uid,username}},201,{"set-cookie":cookie(SESSION_COOKIE,sid,SESSION_MS/1000)});
  }

  if(path==="/api/auth/login"&&method==="POST") {
    const b=await body(request), username=text(b.username,32).toLowerCase(), password=String(b.password||"");
    const key=(request.headers.get("CF-Connecting-IP")||"unknown")+":"+username;
    const attempt=await env.DB.prepare("SELECT * FROM login_attempts WHERE key=?").bind(key).first<any>();
    if(attempt && attempt.window_start+900000>now() && attempt.count>=8)return fail("Too many login attempts. Try again later.",429);
    const row=await env.DB.prepare("SELECT * FROM users WHERE username=?").bind(username).first<any>();
    const valid=!!row && await makePassword(password,row.password_salt).then(v=>equal(v.hash,row.password_hash));
    if(!valid) {
      if(attempt && attempt.window_start+900000>now()) await env.DB.prepare("UPDATE login_attempts SET count=count+1 WHERE key=?").bind(key).run();
      else await env.DB.prepare("INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)").bind(key,1,now()).run();
      return fail("Invalid credentials",401);
    }
    await env.DB.prepare("DELETE FROM login_attempts WHERE key=?").bind(key).run();
    const sid=id(),t=now();
    await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)").bind(sid,row.id,t+SESSION_MS,t).run();
    return json({success:true,user:{id:row.id,username:row.username}},200,{"set-cookie":cookie(SESSION_COOKIE,sid,SESSION_MS/1000)});
  }

  if(path==="/api/auth/logout"&&method==="POST") {
    const sid=getSessionId(request); if(sid)await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
    return json({success:true},200,{"set-cookie":clearCookie(SESSION_COOKIE)});
  }

  const user=await requireUser(request,env);

  if(path==="/api/projects"&&method==="POST") {
    const b=await body(request), title=text(b.title,200);
    if(!title)return fail("Song title is required");
    const pid=id(),t=now();
    await env.DB.prepare(
      "INSERT INTO projects(id,user_id,title,artist,lyrics,creative_direction,notes,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
    ).bind(pid,user.id,title,text(b.artist,200),text(b.lyrics),text(b.creative_direction),text(b.notes),"draft",t,t).run();
    return json({success:true,project:{id:pid,title,status:"draft"}},201);
  }

  const match=path.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
  if(!match)return fail("Not found",404);
  const projectId=match[1], sub=match[2]||"";
  const project=await projectForUser(env,user,projectId);

  if(sub==="world"&&method==="POST") {
    const report=await worldReport(env,project);
    const scenes=scenesFromWorld(report), t=now();
    await env.DB.prepare("INSERT OR REPLACE INTO world_reports VALUES(?,?,?,?,?)").bind(id(),projectId,1,JSON.stringify(report),t).run();
    await env.DB.prepare("DELETE FROM scenes WHERE project_id=?").bind(projectId).run();
    for(const s of scenes) {
      await env.DB.prepare("INSERT INTO scenes VALUES(?,?,?,?,?,?,?,?)").bind(s.id,projectId,s.scene_index,s.start_seconds,s.duration_seconds,s.prompt,null,t).run();
    }
    await env.DB.prepare("UPDATE projects SET status='world_revealed',updated_at=? WHERE id=?").bind(t,projectId).run();
    return json({success:true,report,scenes});
  }

  if(sub==="approve"&&method==="POST") {
    const report=await env.DB.prepare("SELECT id FROM world_reports WHERE project_id=?").bind(projectId).first();
    if(!report)throw new HttpError("Generate the World Report first",400);
    await env.DB.prepare("UPDATE projects SET status='world_approved',updated_at=? WHERE id=?").bind(now(),projectId).run();
    const rows=await env.DB.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY scene_index").bind(projectId).all();
    return json({success:true,scenes:rows.results});
  }

  const imageMatch=sub.match(/^scenes\/(\d+)\/image$/);
  if(imageMatch&&method==="POST") {
    const index=Number(imageMatch[1]);
    const scene=await env.DB.prepare("SELECT * FROM scenes WHERE project_id=? AND scene_index=?").bind(projectId,index).first<any>();
    if(!scene)throw new HttpError("Scene not found",404);
    const imageUrl=await pixazoGenerate(env,scene.prompt);
    await env.DB.prepare("UPDATE scenes SET image_url=? WHERE id=?").bind(imageUrl,scene.id).run();
    return json({success:true,scene_index:index,image_url:imageUrl});
  }

  if(sub==="audio/upload-url"&&method==="POST") {
    const b=await body(request), name=text(b.filename,160), type=text(b.content_type,120);
    const size=Number(b.size||0);
    if(!name||!type.startsWith("audio/")||!Number.isFinite(size)||size<=0||size>MAX_AUDIO)throw new HttpError("Audio must be a supported audio file under 25 MB",400);
    const upload=await shotstack(env,"/ingest/upload",{method:"POST",body:JSON.stringify({filename:name})});
    const sourceId=upload?.data?.id||upload?.data?.attributes?.id;
    const signedUrl=upload?.data?.attributes?.url;
    if(!sourceId||!signedUrl)throw new HttpError("Shotstack did not return an upload URL",502);
    return json({success:true,source_id:String(sourceId),upload_url:String(signedUrl),filename:name,content_type:type,size});
  }

  const audioComplete=sub==="audio/complete"&&method==="POST";
  if(audioComplete) {
    const b=await body(request), sourceId=text(b.source_id,120), name=text(b.filename,160), type=text(b.content_type,120), size=Number(b.size||0);
    if(!sourceId||!name||!type.startsWith("audio/")||!Number.isFinite(size)||size<=0||size>MAX_AUDIO)throw new HttpError("Invalid audio completion data",400);
    const result:any=await shotstack(env,"/ingest/sources/"+encodeURIComponent(sourceId),{method:"GET"});
    const attrs=result?.data?.attributes;
    if(!attrs)throw new HttpError("Shotstack returned no source details",502);
    if(attrs.status==="failed")throw new HttpError("Shotstack failed to ingest the audio",502);
    if(attrs.status!=="ready")return json({success:true,status:attrs.status,ready:false});
    const sourceUrl=String(attrs.source||"");
    if(!sourceUrl)throw new HttpError("Shotstack source is ready but has no usable URL",502);
    await env.DB.prepare("UPDATE projects SET audio_source_id=?,audio_source_url=?,audio_name=?,audio_type=?,audio_size=?,updated_at=? WHERE id=?").bind(sourceId,sourceUrl,name,type,size,now(),projectId).run();
    return json({success:true,ready:true,status:"ready",source_id:sourceId,source_url:sourceUrl});
  }
  }

  if(sub==="render"&&method==="POST") {
    const rows=(await env.DB.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY scene_index").bind(projectId).all()).results as any[];
    const clips=rows.filter(s=>s.image_url).map(s=>({asset:{type:"image",src:s.image_url},start:s.start_seconds,length:s.duration_seconds,fit:"cover"}));
    if(!clips.length)throw new HttpError("Generate at least one scene image before rendering",400);
    const timeline:any={tracks:[{clips}]};
    if(project.audio_source_url)timeline.soundtrack={src:project.audio_source_url,effect:"fadeIn",volume:1};
    const result:any=await shotstack(env,"/render",{method:"POST",body:JSON.stringify({timeline,output:{format:"mp4",size:{width:1280,height:720},fps:25,quality:"medium",poster:{capture:1},thumbnail:{capture:1,scale:0.3}}})});
    const providerId=result?.response?.id;
    if(!providerId)throw new HttpError("Shotstack returned no render ID",502);
    const rid=id(),t=now();
    await env.DB.prepare("INSERT INTO renders VALUES(?,?,?,?,?,?,?,?,?)").bind(rid,projectId,providerId,result?.response?.status||"queued",result?.response?.url||null,result?.response?.poster||null,null,t,t).run();
    return json({success:true,render_id:rid,provider_render_id:providerId,status:result?.response?.status||"queued"});
  }

  const renderMatch=sub.match(/^render\/([^/]+)$/);
  if(renderMatch&&method==="GET") {
    const row=await env.DB.prepare("SELECT * FROM renders WHERE id=? AND project_id=?").bind(renderMatch[1],projectId).first<any>();
    if(!row)throw new HttpError("Render not found",404);
    if(row.provider_render_id && row.status!=="done" && row.status!=="failed") {
      const result:any=await shotstack(env,"/render/"+encodeURIComponent(row.provider_render_id),{method:"GET"});
      const r=result?.response||{};
      await env.DB.prepare("UPDATE renders SET status=?,output_url=?,poster_url=?,error_message=?,updated_at=? WHERE id=?")
        .bind(r.status||row.status,r.url||row.output_url,r.poster||row.poster_url,r.error||null,now(),row.id).run();
      return json({success:true,render_id:row.id,status:r.status||row.status,output_url:r.url||row.output_url,poster_url:r.poster||row.poster_url,error_message:r.error||null});
    }
    return json({success:true,render_id:row.id,status:row.status,output_url:row.output_url,poster_url:row.poster_url,error_message:row.error_message});
  }

  return fail("Not found",404);
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext) {
    try {
      const response=await handle(request,env);
      if(response.status===404 && request.method==="GET" && !new URL(request.url).pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
      return response;
    } catch(error) {
      if(error instanceof HttpError)return fail(error.message,error.status);
      console.error(error);
      return fail("Internal server error",500);
    }
  }
};
