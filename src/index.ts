interface Env {
  DB: D1Database;
  AI: Ai;
  ASSETS: Fetcher;
  AUTH_RL: RateLimit;
  WORLD_RL: RateLimit;
  IMAGE_RL: RateLimit;
  RENDER_RL: RateLimit;
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
  style_bible: {
    palette: string[];
    lighting: string;
    atmosphere: string;
    cinematography: string;
    character_rules: string[];
    environment_rules: string[];
    continuity_rules: string[];
  };
};

const SESSION_COOKIE = "bv_session";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TEXT = 30000;
const MAX_AUDIO = 25 * 1024 * 1024;
const AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const BUILD = "2026-09-25-production-remediation-2";
const SHOTSTACK_INGEST_BASE = "https://api.shotstack.io/ingest/v1";
const SHOTSTACK_EDIT_BASE = "https://api.shotstack.io/edit/v1";

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
function cookie(name:string,value:string,maxAge:number,secure=true) {
  return name + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + maxAge + "; HttpOnly; SameSite=Lax" + (secure?"; Secure":"");
}
function clearCookie(name:string,secure=true) { return name + "=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" + (secure?"; Secure":""); }

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
  const saltBuffer=salt.buffer.slice(salt.byteOffset,salt.byteOffset+salt.byteLength) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:saltBuffer,iterations:600000,hash:"SHA-256"},key,256));
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
async function ensureAuthSchema(env:Env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
  ]);
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
  const contentLength=Number(request.headers.get("content-length")||0);
  if(contentLength>2_000_000)throw new HttpError("Request body is too large",413);
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

export function validateWorld(value:any):WorldReport {
  const required=["song_summary","emotional_core","visual_arc","visual_language","cinematography","lighting"];
  for(const key of required) {
    if(typeof value?.[key]!=="string" || !value[key].trim()) throw new HttpError("Visual World Report missing required field: "+key,502);
  }
  if(!Array.isArray(value.color_palette)||value.color_palette.length<3)throw new HttpError("Visual World Report has an invalid color_palette",502);
  if(!Array.isArray(value.environments)||value.environments.length<1)throw new HttpError("Visual World Report has no environments",502);
  if(!Array.isArray(value.characters))throw new HttpError("Visual World Report has invalid characters",502);
  if(!Array.isArray(value.symbolic_motifs)||!Array.isArray(value.continuity_rules))throw new HttpError("Visual World Report has incomplete continuity data",502);
  const bible=value.style_bible||{};
  const style_bible={
    palette:Array.isArray(bible.palette)?bible.palette.slice(0,8).map(String):value.color_palette.slice(0,8).map(String),
    lighting:typeof bible.lighting==="string"&&bible.lighting.trim()?bible.lighting.trim():value.lighting.trim(),
    atmosphere:typeof bible.atmosphere==="string"?bible.atmosphere.trim():"",
    cinematography:typeof bible.cinematography==="string"&&bible.cinematography.trim()?bible.cinematography.trim():value.cinematography.trim(),
    character_rules:Array.isArray(bible.character_rules)?bible.character_rules.slice(0,16).map(String):[],
    environment_rules:Array.isArray(bible.environment_rules)?bible.environment_rules.slice(0,16).map(String):[],
    continuity_rules:Array.isArray(bible.continuity_rules)?bible.continuity_rules.slice(0,16).map(String):value.continuity_rules.slice(0,16).map(String)
  };
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
    scene_count:sceneCount,
    style_bible
  };
}

async function worldReport(env:Env,project:any):Promise<WorldReport> {
  const prompt =
    "You are BeatVision's Visual World Director. Create a production-ready visual bible from a song brief. " +
    "Return ONLY a JSON object. Never return markdown. Never reproduce copyrighted lyrics beyond what the user supplied. " +
    "Required keys: song_summary, emotional_core, visual_arc, visual_language, cinematography, color_palette, lighting, environments, characters, symbolic_motifs, continuity_rules, scene_count, style_bible. " +
    "style_bible must contain palette, lighting, atmosphere, cinematography, character_rules, environment_rules, continuity_rules. " +
    "characters must be an array of objects with name, role, visual_identity. scene_count must be 4-24. " +
    "Song title: "+project.title+"\nArtist: "+project.artist+"\nLyrics/context: "+project.lyrics+
    "\nCreative direction: "+project.creative_direction+"\nNotes: "+project.notes;
  const aiRun=(env.AI as unknown as {run:(model:string,input:unknown,options?:unknown)=>Promise<unknown>}).run.bind(env.AI);
  const result:any=await aiRun(AI_MODEL,{
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

export function scenesFromWorld(report:WorldReport,durationSeconds:number) {
  if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new HttpError("A valid audio duration is required",400);
  const count=report.scene_count;
  const duration=durationSeconds/count;
  return Array.from({length:count},(_,i)=>{
    const environment=report.environments[i%report.environments.length];
    const character=report.characters.length?report.characters[i%report.characters.length]:{name:"Lead",visual_identity:"consistent lead character"};
    return {
      id:id(),
      scene_index:i,
      start_seconds:Number((i*duration).toFixed(3)),
      duration_seconds:Number((i===count-1?durationSeconds-i*duration:duration).toFixed(3)),
      motion_effect:["zoomIn","zoomOut","slideLeft","slideRight"][i%4],
      prompt:
        "Cinematic music-video frame, scene "+(i+1)+". Environment: "+environment+
        ". Character: "+character.name+", "+character.visual_identity+
        ". Visual language: "+report.visual_language+
        ". Cinematography: "+report.cinematography+
        ". Lighting: "+report.lighting+
        ". Color palette: "+report.color_palette.join(", ")+
        ". Style Bible palette: "+report.style_bible.palette.join(", ")+
        ". Style Bible atmosphere: "+report.style_bible.atmosphere+
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

async function shotstack(env:Env,path:string,init:RequestInit={},kind:"ingest"|"edit"="edit") {
  const base=kind==="ingest"?SHOTSTACK_INGEST_BASE:SHOTSTACK_EDIT_BASE;
  const response=await fetch(base+path,{
    ...init,
    headers:{"Accept":"application/json","Content-Type":"application/json","x-api-key":env.SHOTSTACK_API_KEY,...(init.headers||{})}
  });
  const data:any=await response.json().catch(()=>null);
  if(!response.ok) {
    console.error({provider:"shotstack",kind,path,status:response.status,body:typeof data==="object"?JSON.stringify(data).slice(0,2000):String(data||"")});
    throw new HttpError("Shotstack request failed",502);
  }
  return data;
}

async function handle(request:Request,env:Env):Promise<Response> {
  if(!originAllowed(request))return fail("Invalid origin",403);
  const url=new URL(request.url), path=url.pathname, method=request.method;

  if(path==="/api/health") {
    const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','login_attempts','projects','world_reports','scenes','renders') ORDER BY name").all<{name:string}>();
    const names=(tables.results||[]).map(row=>row.name);
    const required=["users","sessions","login_attempts","projects","world_reports","scenes","renders"];
    const missing=required.filter(name=>!names.includes(name));
    return json({ok:missing.length===0,service:"beatvision",build:BUILD,language:"cloudflare-workers-ai",image:"pixazo",video:"shotstack",database:{required_tables:required,present_tables:names,missing_tables:missing}});
  }
  if(path==="/api/me")return json({user:await currentUser(request,env)});

  if(path==="/api/auth/register"&&method==="POST") {
    await ensureAuthSchema(env);
    if(!(await env.AUTH_RL.limit({key:request.headers.get("CF-Connecting-IP")||"unknown"})).success) return fail("Too many authentication requests",429);
    const b=await body(request), username=text(b.username,32).toLowerCase(), password=String(b.password||"");
    if(!validUsername(username)||!validPassword(password))return fail("Username must be 3-32 lowercase letters/numbers/underscore and password must be 10-200 characters");
    const exists=await env.DB.prepare("SELECT id FROM users WHERE username=?").bind(username).first();
    if(exists)return fail("Username already exists",409);
    const p=await makePassword(password), uid=id(), sid=id(), t=now();
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users(id,username,password_hash,password_salt,created_at) VALUES(?,?,?,?,?)").bind(uid,username,p.hash,p.salt,t),
        env.DB.prepare("INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(sid,uid,t+SESSION_MS,t)
      ]);
    } catch(error) {
      console.error({operation:"auth.register",error});
      const message=String(error);
      if(message.includes("UNIQUE constraint failed: users.username")) return fail("Username already exists",409);
      if(message.includes("no such table") || message.includes("no such column")) return fail("Account database schema is not ready",503);
      throw error;
    }
    return json({success:true,user:{id:uid,username}},201,{"set-cookie":cookie(SESSION_COOKIE,sid,SESSION_MS/1000,new URL(request.url).protocol==="https:")});
  }

  if(path==="/api/auth/login"&&method==="POST") {
    if(!(await env.AUTH_RL.limit({key:request.headers.get("CF-Connecting-IP")||"unknown"})).success) return fail("Too many authentication requests",429);
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
    return json({success:true,user:{id:row.id,username:row.username}},200,{"set-cookie":cookie(SESSION_COOKIE,sid,SESSION_MS/1000,new URL(request.url).protocol==="https:")});
  }

  if(path==="/api/auth/logout"&&method==="POST") {
    const sid=getSessionId(request); if(sid)await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
    return json({success:true},200,{"set-cookie":clearCookie(SESSION_COOKIE,new URL(request.url).protocol==="https:")});
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
    if(!(await env.WORLD_RL.limit({key:user.id})).success) return fail("World generation rate limit exceeded",429);
    if(!project.audio_duration||Number(project.audio_duration)<=0)throw new HttpError("Upload and complete the song audio before revealing the world",400);
    const report=await worldReport(env,project);
    const scenes=scenesFromWorld(report,Number(project.audio_duration)), t=now(), reportId=id();
    const statements=[
      env.DB.prepare("DELETE FROM scenes WHERE project_id=?").bind(projectId),
      env.DB.prepare("DELETE FROM world_reports WHERE project_id=?").bind(projectId),
      env.DB.prepare("INSERT INTO world_reports VALUES(?,?,?,?,?)").bind(reportId,projectId,1,JSON.stringify(report),t)
    ];
    for(const s of scenes) {
      statements.push(env.DB.prepare("INSERT INTO scenes(id,project_id,scene_index,start_seconds,duration_seconds,motion_effect,prompt,image_url,image_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(s.id,projectId,s.scene_index,s.start_seconds,s.duration_seconds,s.motion_effect,s.prompt,null,"pending",t,t));
    }
    statements.push(env.DB.prepare("UPDATE projects SET status='world_revealed',updated_at=? WHERE id=?").bind(t,projectId));
    await env.DB.batch(statements);
    return json({success:true,report,scenes});
  }

  if(sub==="approve"&&method==="POST") {
    const report=await env.DB.prepare("SELECT id FROM world_reports WHERE project_id=?").bind(projectId).first();
    if(!report)throw new HttpError("Generate the World Report first",400);
    await env.DB.prepare("UPDATE projects SET status='world_approved',updated_at=? WHERE id=?").bind(now(),projectId).run();
    const rows=await env.DB.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY scene_index").bind(projectId).all();
    const missing=(rows.results||[]).filter((scene:any)=>!scene.image_url);
    return json({success:true,images_complete:missing.length===0,missing_images:missing.length,scenes:rows.results});
  }

  const imageMatch=sub.match(/^scenes\/(\d+)\/image$/);
  if(imageMatch&&method==="POST") {
    const index=Number(imageMatch[1]);
    const scene=await env.DB.prepare("SELECT * FROM scenes WHERE project_id=? AND scene_index=?").bind(projectId,index).first<any>();
    if(!scene)throw new HttpError("Scene not found",404);
    if(!(await env.IMAGE_RL.limit({key:user.id})).success) return fail("Image generation rate limit exceeded",429);
    const imageUrl=await pixazoGenerate(env,scene.prompt);
    await env.DB.prepare("UPDATE scenes SET image_url=?,image_status='completed',updated_at=? WHERE id=?").bind(imageUrl,now(),scene.id).run();
    return json({success:true,scene_index:index,image_url:imageUrl});
  }

  if(sub==="audio/upload-url"&&method==="POST") {
    const b=await body(request), name=text(b.filename,160), type=text(b.content_type,120);
    const size=Number(b.size||0);
    if(!name||!type.startsWith("audio/")||!Number.isFinite(size)||size<=0||size>MAX_AUDIO)throw new HttpError("Audio must be a supported audio file under 25 MB",400);
    const upload=await shotstack(env,"/upload",{method:"POST"}, "ingest");
    const sourceId=upload?.data?.id||upload?.data?.attributes?.id;
    const signedUrl=upload?.data?.attributes?.url;
    if(!sourceId||!signedUrl)throw new HttpError("Shotstack did not return an upload URL",502);
    return json({success:true,source_id:String(sourceId),upload_url:String(signedUrl),filename:name,content_type:type,size});
  }

  const audioComplete=sub==="audio/complete"&&method==="POST";
  if(audioComplete) {
    const b=await body(request), sourceId=text(b.source_id,120), name=text(b.filename,160), type=text(b.content_type,120), size=Number(b.size||0);
    if(!sourceId||!name||!type.startsWith("audio/")||!Number.isFinite(size)||size<=0||size>MAX_AUDIO)throw new HttpError("Invalid audio completion data",400);
    const result:any=await shotstack(env,"/sources/"+encodeURIComponent(sourceId),{method:"GET"}, "ingest");
    const attrs=result?.data?.attributes;
    if(!attrs)throw new HttpError("Shotstack returned no source details",502);
    if(attrs.status==="failed")throw new HttpError("Shotstack failed to ingest the audio",502);
    if(attrs.status!=="ready")return json({success:true,status:attrs.status,ready:false});
    const sourceUrl=String(attrs.source||"");
    const duration=Number(attrs.duration||0);
    if(!sourceUrl||!Number.isFinite(duration)||duration<=0)throw new HttpError("Shotstack source is ready but has no usable URL or duration",502);
    await env.DB.prepare("UPDATE projects SET audio_source_id=?,audio_source_url=?,audio_name=?,audio_type=?,audio_size=?,audio_duration=?,updated_at=? WHERE id=?").bind(sourceId,sourceUrl,name,type,size,duration,now(),projectId).run();
    return json({success:true,ready:true,status:"ready",source_id:sourceId,source_url:sourceUrl,duration_seconds:duration});
  }

  if(sub==="render"&&method==="POST") {
    if(!(await env.RENDER_RL.limit({key:user.id})).success) return fail("Render rate limit exceeded",429);
    if(!project.audio_source_url||!Number(project.audio_duration))throw new HttpError("Complete the song audio upload before rendering",400);
    const rows=(await env.DB.prepare("SELECT * FROM scenes WHERE project_id=? ORDER BY scene_index").bind(projectId).all()).results as any[];
    if(!rows.length)throw new HttpError("Generate the World Report before rendering",400);
    const missing=rows.filter(s=>!s.image_url);
    if(missing.length)throw new HttpError("All scene images are required before rendering. Missing scenes: "+missing.map(s=>s.scene_index+1).join(", "),409);
    const clips=rows.map(s=>({asset:{type:"image",src:s.image_url},start:Number(s.start_seconds),length:Number(s.duration_seconds),fit:"crop",effect:s.motion_effect||"zoomIn",transition:{in:"fade",out:"fade"}}));
    const audio={asset:{type:"audio",src:project.audio_source_url},start:0,length:Number(project.audio_duration),volume:1};
    const timeline:any={tracks:[{clips},{clips:[audio]}],cache:true};
    const result:any=await shotstack(env,"/render",{method:"POST",body:JSON.stringify({timeline,output:{format:"mp4",resolution:"hd",aspectRatio:"16:9",fps:25,quality:"medium",poster:{capture:1},thumbnail:{capture:1,scale:0.3}}})});
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
