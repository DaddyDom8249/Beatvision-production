import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

describe("security",()=>{
  it("keeps provider credentials server-side",()=>{
    const worker=readFileSync("src/index.ts","utf8");
    const client=readFileSync("public/index.html","utf8");
    expect(client).not.toContain("PIXAZO_API_KEY");
    expect(client).not.toContain("SHOTSTACK_API_KEY");
    expect(client).not.toContain("GATEWAY_TOKEN");
    expect(worker).toContain("PIXAZO_API_KEY");
    expect(worker).toContain("SHOTSTACK_API_KEY");
  });
  it("does not expose raw server errors to API clients",()=>{
    const worker=readFileSync("src/index.ts","utf8");
    expect(worker).toContain('error:"Internal server error"');
    expect(worker).not.toContain('error:err instanceof Error?err.message');
  });
});
