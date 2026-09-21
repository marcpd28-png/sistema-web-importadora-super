import type { RockyPlan } from "./contracts";
import catalog from "./skills/catalog.json";

export type Skill = { name: string; description: string; triggers: string[]; objective: string; requiredInformation: string[]; tools: string[]; rules: string[]; restrictions: string[]; completion: string[] };
// Trusted, version-controlled skills. Customers, documents and model output cannot edit this registry.
export const skills: Skill[] = catalog;
export function selectSkill(intent: RockyPlan["intent"]) {
  const skill = skills.find(s => s.triggers.includes(intent));
  if (!skill) throw new Error("SKILL_NOT_CONFIGURED");
  return skill;
}
