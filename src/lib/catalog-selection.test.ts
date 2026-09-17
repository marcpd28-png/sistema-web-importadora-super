import assert from "node:assert/strict";
import test from "node:test";
import { isCatalogRequest, selectCatalogProducts, type CatalogCandidate } from "./catalog-selection";
const products: CatalogCandidate[] = [
 {code:"A1",name:"AUDIFONO JBL TUNE 520",brand:null,category:"AURICULARES"},
 {code:"A2",name:"AUDIFONO JBL ENDURANCE",brand:null,category:"ACCESORIOS PARA CELULARES"},
 {code:"A3",name:"AUDIFONO SONY",brand:"Sony",category:"AURICULARES"},
 {code:"P1",name:"PARLANTE JBL CHARGE 6",brand:null,category:"PARLANTES"},
 {code:"P2",name:"PARLANTE SONY",brand:"Sony",category:"PARLANTES"},
 {code:"B1",name:"BATERIA JBL BATTERY 400",brand:null,category:"BATERIAS"},
 {code:"F1",name:"FUNDA PARA AUDIFONOS JBL",brand:null,category:"ACCESORIOS PARA CELULARES"},
];
const codes=(query:string)=>selectCatalogProducts(query,products).products.map(p=>p.code).sort();
test("catálogo de marca contiene todos sus tipos y detecta la marca en el nombre",()=>{
 assert.deepEqual(codes("hola me dan el catalogo de los productos jbl?"),["A1","A2","B1","F1","P1"]);
});
test("categoría y marca se intersectan; acepta el error audofnos",()=>{
 for(const word of ["audífonos","audofnos","auriculares","audifionos"]) assert.deepEqual(codes(`hola me pasan el catálogo de los productos ${word} jbl`),["A1","A2"]);
});
test("categoría sin marca agrupa todas las marcas y excluye accesorios",()=>{
 assert.deepEqual(codes("me pasa el catalogo de sus audifonos"),["A1","A2","A3"]);
 assert.deepEqual(codes("catálogo de parlantes"),["P1","P2"]);
});
test("modelo/código y filtros desconocidos no amplían la búsqueda a todo el catálogo",()=>{
 assert.deepEqual(codes("catálogo JBL charge 6"),["P1"]);
 assert.deepEqual(codes("catálogo JBL cámaras"),[]);
 assert.deepEqual(codes("catálogo audífonos marca inexistente"),[]);
 assert.equal(selectCatalogProducts("catálogo por mayor",products).scoped,false);
 assert.deepEqual(codes("catálogo de audífonos JBL por mayor"),["A1","A2"]);
});
test("solo intercepta solicitudes explícitas de catálogo",()=>{
 assert.equal(isCatalogRequest("CATÁLOGOS JBL"),true);
 assert.equal(isCatalogRequest("¿Tienen audífonos JBL?"),false);
});
