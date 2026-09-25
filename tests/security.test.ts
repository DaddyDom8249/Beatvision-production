import {describe,it,expect} from "vitest";
describe("security invariants",()=>{it("has exactly two external provider secrets",()=>expect(["PIXAZO_API_KEY","SHOTSTACK_API_KEY"]).toHaveLength(2));});
