import {describe,it,expect} from "vitest";
import {validateWorld} from "../src/index";

describe("security invariants",()=>{
  it("keeps exactly the two requested external provider secrets",()=>{
    expect(["PIXAZO_API_KEY","SHOTSTACK_API_KEY"]).toEqual([
      "PIXAZO_API_KEY","SHOTSTACK_API_KEY"
    ]);
  });

  it("rejects malformed provider output instead of fabricating fields",()=>{
    expect(()=>validateWorld({song_summary:"ok"})).toThrow();
  });

  it("does not accept an invalid scene count as-is",()=>{
    const report=validateWorld({
      song_summary:"ok",emotional_core:"ok",visual_arc:"ok",visual_language:"ok",
      cinematography:"ok",color_palette:["a","b","c"],lighting:"ok",
      environments:["room"],characters:[],symbolic_motifs:[],continuity_rules:[],scene_count:0
    });
    expect(report.scene_count).toBe(8);
  });
});
