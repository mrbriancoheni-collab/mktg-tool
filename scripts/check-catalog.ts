import { CATALOG } from "../shared/catalog";
import * as L from "lucide-react";
import * as SI from "simple-icons";
const slugs = new Set(Object.values(SI as any).map((i: any) => i?.slug));
const types = new Set<string>();
const bad: string[] = [];
for (const c of CATALOG) {
  if (types.has(c.type)) bad.push("dup " + c.type);
  types.add(c.type);
  if (!(L as any)[c.icon]) bad.push("lucide " + c.icon + " (" + c.type + ")");
  if (c.brand && !slugs.has(c.brand)) bad.push("brand " + c.brand);
}
const by = (k: string) => CATALOG.filter((c) => c.segment === k || c.segment === "both").length;
console.log(bad.length ? bad.join("\n") : "all icons OK", `| ${CATALOG.length} items, ${CATALOG.filter(c=>c.brand).length} with brand logos | B2B-relevant ${by("b2b")}, B2C-relevant ${by("b2c")}`);
