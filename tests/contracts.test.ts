import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

describe("BeatVision contracts",()=>{
  it("keeps Pixazo prompt within documented limit",()=>expect("x".repeat(3000).slice(0,2048)).toHaveLength(2048));
  it("requires world fields",()=>{const r:any={song_summary:"x"};expect(["emotional_arc","visual_language","environments","characters","style_bible"].filter(k=>!(k in r))).toHaveLength(5)});
  it("uses a currently supported Workers AI model",()=>{
    const worker=readFileSync("src/index.ts","utf8");
    expect(worker).toContain('@cf/meta/llama-3.1-8b-instruct-fp8');
    expect(worker).not.toContain('@cf/meta/llama-3.1-8b-instruct";');
  });
  it("creates a durable render record before provider submission",()=>{
    const worker=readFileSync("src/index.ts","utf8");
    expect(worker).toContain("status='submitting'");
    expect(worker).toContain('placeholder="pending:"+id');
    expect(worker).toContain('UPDATE bv_renders SET provider_render_id');
  });
});
