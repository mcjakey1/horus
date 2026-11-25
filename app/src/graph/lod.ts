import { DOT_PX } from "./constants";

export type Lod = "dot" | "thumb";

/** A node drawn smaller than DOT_PX screen pixels is a dot; otherwise its thumbnail. */
export function lodFor(worldSize: number, scale: number): Lod {
  return worldSize * scale < DOT_PX ? "dot" : "thumb";
}
