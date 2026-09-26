import {describe,it,expect} from "vitest";
import {readFileSync,existsSync} from "node:fs";

describe("production contract",()=>{
  it("has a versioned D1 migration",()=>{
    expect(existsSync("migrations/0000_initial_schema.sql")).toBe(true);
    const sql=readFileSync("migrations/0000_initial_schema.sql","utf8");
    for(const table of ["bv_users","bv_sessions","bv_projects","bv_world_reports","bv_renders"])
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS "+table);
  });

  it("does not assume Shotstack ingest is immediately ready",()=>{
    const client=readFileSync("public/index.html","utf8");
    expect(client).toContain("Audio is not ready");
    expect(client).toContain("Processing audio...");
  });

  it("keeps the production provider boundary intact",()=>{
    const worker=readFileSync("src/index.ts","utf8");
    expect(worker).toContain("PIXAZO_API_KEY");
    expect(worker).toContain("SHOTSTACK_API_KEY");
    expect(worker).not.toContain("OPENAI_API_KEY");
    expect(worker).not.toContain("GEMINI_API_KEY");
    expect(worker).not.toContain("GATEWAY_TOKEN");
  });
});
