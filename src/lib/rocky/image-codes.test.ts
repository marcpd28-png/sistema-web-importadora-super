import test from "node:test";
import assert from "node:assert/strict";
import { catalogImageAliases, confirmedImageCodes, imageCodeKey, resolveImageCode } from "./image-codes";

test("catalog formatting preserves digits, numeric SKUs, short codes and punctuation", () => {
  for (const code of ["BT125 - SQ", "07434", "B7", "(CE103-GREEN)", "O618-NEGRO.", "Kaperh 220", "RGLO-CAR", "USBDB64"]) {
    assert.deepEqual(resolveImageCode(imageCodeKey(code), [code]), { kind: "EXACT", codes: [code] });
  }
  assert.deepEqual(resolveImageCode("N13O1", ["N1301"]), { kind: "NONE", codes: [] });
  assert.deepEqual(resolveImageCode("", ["BT284"]), { kind: "NONE", codes: [] });
});
test("printed base codes require a variant choice including when only one variant is visible", () => {
  assert.deepEqual(resolveImageCode("AU147", ["AU147-BLANCO"]), { kind: "VARIANTS", codes: ["AU147-BLANCO"] });
  assert.deepEqual(resolveImageCode("CE103", ["(CE103-BLUE)", "(CE103-GREEN)"]), { kind: "VARIANTS", codes: ["(CE103-BLUE)", "(CE103-GREEN)"] });
});
test("explicit product aliases resolve ERP codes and preserve collisions", () => {
  const records = [{ code: "G15E", name: "(N1382) VIRTUAL REALITY COD. G15E" }, { code: "07337", name: "(BT33) ARETE COD BT23" }, { code: "BT23", name: "SUPER JAZZ 1" }];
  assert.deepEqual(resolveImageCode("N1382", records), { kind: "EXACT", codes: ["G15E"] });
  assert.deepEqual(resolveImageCode("BT23", records), { kind: "VARIANTS", codes: ["07337", "BT23"] });
  assert.deepEqual(catalogImageAliases({ code: "05737", name: "Control remoto universal de TV (NA1)" }), ["05737"]);
});
test("confirmation needs two distinct OCR views with sufficient confidence", () => {
  const read = { code: "BT284", confidence: 90, view: "full", labeled: true };
  assert.deepEqual(confirmedImageCodes([read, read]), []);
  assert.deepEqual(confirmedImageCodes([read, { ...read, view: "crop", confidence: 69 }]), []);
  assert.deepEqual(confirmedImageCodes([read, { ...read, view: "crop", confidence: 75 }]), [{ code: "BT284", confidence: .75 }]);
});
