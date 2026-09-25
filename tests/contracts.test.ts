import {describe,it,expect} from "vitest";
import {scenesFromWorld,validateWorld} from "../src/index";

const required=[
  "song_summary","emotional_core","visual_arc","visual_language",
  "cinematography","color_palette","lighting","environments",
  "characters","symbolic_motifs","continuity_rules","scene_count","style_bible"
];

const base={
  song_summary:"A test song.",
  emotional_core:"Tension resolving into hope.",
  visual_arc:"Dark to light.",
  visual_language:"Cinematic realism.",
  cinematography:"Slow dolly and close-ups.",
  color_palette:["black","silver","amber"],
  lighting:"Low-key practical lighting.",
  environments:["Warehouse"],
  characters:[{name:"Lead",role:"protagonist",visual_identity:"black jacket"}],
  symbolic_motifs:["rain"],
  continuity_rules:["same wardrobe"],
  scene_count:4,
  style_bible:{
    palette:["black","silver","amber"],
    lighting:"Low-key practical lighting.",
    atmosphere:"Wet nocturnal haze.",
    cinematography:"Slow dolly and close-ups.",
    character_rules:["same wardrobe"],
    environment_rules:["same warehouse"],
    continuity_rules:["same wardrobe"]
  }
};

describe("World Report contract",()=>{
  it("requires all production fields",()=>{
    expect(Object.keys(validateWorld(base))).toEqual(expect.arrayContaining(required));
  });

  it("clamps scene count to the supported range",()=>{
    expect(validateWorld({...base,scene_count:999}).scene_count).toBe(24);
    expect(validateWorld({...base,scene_count:1}).scene_count).toBe(4);
  });
});

describe("Storyboard timing",()=>{
  it("covers the exact audio duration without a hard-coded 30 second timeline",()=>{
    const scenes=scenesFromWorld(validateWorld(base),187.4);
    expect(scenes).toHaveLength(4);
    expect(scenes[0].start_seconds).toBe(0);
    expect(scenes.at(-1)?.start_seconds).toBeLessThan(187.4);
    expect((scenes.at(-1)?.start_seconds||0)+(scenes.at(-1)?.duration_seconds||0)).toBeCloseTo(187.4,3);
  });

  it("rejects non-positive durations",()=>{
    expect(()=>scenesFromWorld(validateWorld(base),0)).toThrow();
    expect(()=>scenesFromWorld(validateWorld(base),-1)).toThrow();
  });
});
