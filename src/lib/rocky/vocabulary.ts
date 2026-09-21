import { normalize } from "./planning";

// Initial commercial vocabulary explicitly supplied in the ROCKY requirements.
// This is reviewed configuration, not an automatically learned production synonym.
export function expandInitialVocabulary(query: string) {
  return normalize(query).replace(/\b(?:aparato (?:para )?prender el carro|arranca carro|booster|arrancador bateria)\b/g, "arrancador");
}
