import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogIndex, isCatalogRequest, isScreenExtenderQuery, selectCatalogProducts, type CatalogCandidate } from "./catalog-selection";
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

const chargingProducts: CatalogCandidate[] = [
 {code:"CR1",name:"SQ CARGADOR M. SUPER TIPO C 35W",brand:null,category:"ACCESORIOS PARA CELULARES"},
 {code:"CR2",name:"CARGADOR HONOR SUPER CARGA 66W",brand:"HONOR",category:"ACCESORIOS PARA CELULARES"},
 {code:"CR3",name:"TRANSFORMER CARGADOR PORTATIL",brand:null,category:"ACCESORIOS"},
 {code:"CR4",name:"COMBO CARGADOR SUPER CON CABLE",brand:null,category:"ACCESORIOS"},
 {code:"FP1",name:"FUENTE DE PODER SUPER 12V",brand:"SUPER",category:"ENERGIA"},
 {code:"CB1",name:"CABLE DE PODER SUPER",brand:"SUPER",category:"ACCESORIOS"},
 {code:"CB2",name:"CABLE PARA CARGADOR SUPER",brand:"SUPER",category:"ACCESORIOS"},
 {code:"GA1",name:"GATA HIDRAULICA CON CARGADOR DE BATERIA",brand:null,category:"ACCESORIOS PARA AUTO"},
];

test("separa los tipos del catálogo mayorista sin exigir ambos en un producto",()=>{
 const index=createCatalogIndex(chargingProducts,["SUPER","HONOR"]);
 for(const query of [
  "pero tambien busco el catalogo mayorista de sus productos como cargadores y fuentes de poder",
  "Además, quisiera el catálogo por mayor, por ejemplo cargadores y fuentes de poder",
  "catálogo de cargadores, fuentes de poder",
  "hola\nbusco catálogo mayorista\nde cargadores\ny fuentes de poder",
 ]) {
  const result=index.select(query);
  assert.deepEqual(result.products.map(p=>p.code).sort(),["CR1","CR2","CR3","CR4","FP1"],query);
  assert.equal(result.label,"cargadores y fuentes de poder");
  assert.deepEqual(result.unmatchedScopes,[]);
 }
});

test("si un tipo no coincide conserva el catálogo encontrado e informa cuál falta",()=>{
 const rows=chargingProducts.filter(p=>p.code!=="FP1");
 const index=createCatalogIndex(rows,["SUPER","HONOR"]);
 const result=index.select("pero también busco el catálogo mayorista como cargadores y fuentes de poder");
 assert.deepEqual(result.products.map(p=>p.code).sort(),["CR1","CR2","CR3","CR4"]);
 assert.equal(result.label,"cargadores");
 assert.deepEqual(result.unmatchedScopes,["fuentes de poder"]);
 assert.deepEqual(index.select("catálogo fuentes de poder").products,[]);
});

test("marca compartida restringe ambos tipos; marcas por cláusula conservan su alcance",()=>{
 const index=createCatalogIndex(chargingProducts,["SUPER","HONOR"]);
 for(const query of ["catálogo cargadores y fuentes de poder SUPER", "catálogo cargadores y fuentes de poder marca Super Importaciones", "catálogo SUPER cargadores y fuentes de poder"]) {
  assert.deepEqual(index.select(query).products.map(p=>p.code).sort(),["CR1","CR4","FP1"],query);
 }
 assert.deepEqual(index.select("catálogo cargadores HONOR y fuentes de poder SUPER").products.map(p=>p.code).sort(),["CR2","FP1"]);
 assert.deepEqual(index.select("catálogo cargadores y fuentes de poder marca inexistente").products,[]);
 assert.deepEqual(index.select("catálogo cargadores 999W y fuentes de poder 999V").products,[]);
});

test("Super Importaciones reconoce la marca propia y no confunde SUPER CARGA de otra marca",()=>{
 const rows=[...chargingProducts,{code:"HON1",name:"CARGADOR HONOR SUPER CARGA 100W",brand:null,category:"ACCESORIOS"}];
 const index=createCatalogIndex(rows,["SUPER","HONOR"]);
 for(const query of ["catálogo cargadores Super Importaciones", "catálogo cargadores Importaciones Super", "catálogo cargadores marca SUPER"]) {
  assert.deepEqual(index.select(query).products.map(p=>p.code).sort(),["CR1","CR4"],query);
 }
 assert.equal(index.productType(rows[0]),"cargador");
});

test("conjunciones internas de categorías y filtros de producto no se convierten en listas",()=>{
 const rows: CatalogCandidate[]=[
  {code:"A",name:"CARGADOR ABC 20W BLANCO Y NEGRO",brand:"ABC",category:"CARGADORES Y FUENTES DE PODER"},
  {code:"B",name:"FUENTE DE PODER ABC 12V",brand:"ABC",category:"CARGADORES Y FUENTES DE PODER"},
  {code:"C",name:"CARGADOR ABC 65W",brand:"ABC",category:"OTROS"},
 ];
 const index=createCatalogIndex(rows);
 assert.deepEqual(index.select("catálogo categoría CARGADORES Y FUENTES DE PODER").products.map(p=>p.code).sort(),["A","B"]);
 assert.deepEqual(index.select("catálogo cargadores 20W blanco y negro").products.map(p=>p.code),["A"]);
 assert.deepEqual(index.select("catálogo cargadores marca inexistente").products,[]);
});

const projectors: CatalogCandidate[] = [
 {code:"PR1",name:"PROYECTOR HAVIT PJ215",brand:"HAVIT",category:"ENTRETENIMIENTO Y MULTIMEDIA"},
 {code:"PR2",name:"PROYECTOR MAGCUBIC HY300",brand:"MAGCUBIC",category:"PROYECTORES"},
 {code:"CB1",name:"CABLE HDMI PARA PROYECTOR HAVIT",brand:"HAVIT",category:"ACCESORIOS"},
 {code:"AU1",name:"AUDIFONO HAVIT",brand:"HAVIT",category:"AURICULARES"},
];

test("busco y estoy buscando expresan la solicitud, no filtros del catálogo",()=>{
 for(const query of [
  "hola busco catalogo de proyectores",
  "Hola, estoy buscando el catálogo de proyectores, por favor",
  "Buenas noches, ando buscando catálogo de proyectores",
  "Estamos buscando el catálogo de proyectores",
  "Buscamos catálogo de proyectores",
  "Quisiera buscar el catálogo de proyectores",
 ]) {
  const result=selectCatalogProducts(query,projectors);
  assert.deepEqual(result.products.map(p=>p.code).sort(),["PR1","PR2"],query);
  assert.equal(result.label,"proyectores");
  assert.deepEqual(result.terms,[]);
 }
 assert.equal(selectCatalogProducts("hola estoy buscando el catálogo completo",projectors).scoped,false);
});

test("las frases de solicitud conservan marca, modelo, código y filtros desconocidos",()=>{
 const index=createCatalogIndex(projectors);
 for(const query of ["busco catálogo de proyectores HAVIT", "estoy buscando catálogo de proyectores PJ215", "busco catálogo código PR1"]) {
  assert.deepEqual(index.select(query).products.map(p=>p.code),["PR1"],query);
 }
 for(const query of ["busco catálogo de proyectores marca inexistente", "busco catálogo de proyectores HY999", "busco catálogo de proyectores Sony"]) {
  assert.deepEqual(index.select(query).products,[],query);
 }
});
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
test("excluye micrófonos para Partybox y corrige categorías heredadas contradictorias",()=>{
 const rows: CatalogCandidate[]=[
  {code:"M1",name:"PACK DE DOS MICROFONOS JBL PARTYBOX",brand:null,category:"ENTRETENIMIENTO Y MULTIMEDIA"},
  {code:"H1",name:"AUDIFONO JBL TUNE",brand:null,category:"PARLANTES"},
  {code:"S1",name:"PARLANTE CON MICROFONO",brand:null,category:"AURICULARES"},
 ];
 assert.deepEqual(selectCatalogProducts("catálogo parlantes",rows).products.map(p=>p.code),["S1"]);
 assert.deepEqual(selectCatalogProducts("catálogo audífonos",rows).products.map(p=>p.code),["H1"]);
});

test("incorpora categorías y marcas nuevas del inventario sin editar listas de código",()=>{
 const rows: CatalogCandidate[] = [
  {code:"C1",name:"CARGADOR NOVATEK 65W",brand:"Novatek",category:"ENERGIA PORTATIL Y ACCESORIOS"},
  {code:"C2",name:"CARGADOR NOVATEK 30W",brand:null,category:null,categoryRef:{name:"ENERGIA PORTATIL Y ACCESORIOS"}},
  {code:"C3",name:"CABLE ZENPOWER USB",brand:"ZenPower",category:"CABLEADO PROFESIONAL"},
 ];
 const index=createCatalogIndex(rows,["Novatek","ZenPower"]);
 assert.equal(index.select("catálogo marca Novatek").products.length,2);
 assert.equal(index.select("catálogo categoría ENERGIA PORTATIL Y ACCESORIOS").products.length,2);
 assert.deepEqual(index.select("catálogo cargadores Novatek").products.map(p=>p.code).sort(),["C1","C2"]);
 assert.deepEqual(index.select("catálogo CABLEADO PROFESIONAL ZenPower").products.map(p=>p.code),["C3"]);
});

test("cables, micrófonos y controles son tipos propios, no menciones en otro producto",()=>{
 const rows: CatalogCandidate[] = [
  {code:"CB1",name:"CABLE UGREEN USB",brand:null,category:"ACCESORIOS PARA CELULARES"},
  {code:"AU1",name:"AUDIFONO JBL CON CABLE Y MICROFONO",brand:null,category:"AURICULARES"},
  {code:"MI1",name:"PACK DE DOS MICROFONOS JBL",brand:null,category:"PERIFERICOS"},
  {code:"CT1",name:"CONTROL REMOTO SUPER",brand:null,category:"NOVEDADES"},
  {code:"XX1",name:"ESPECTROMETRO ORBITAL",brand:null,category:"INSTRUMENTOS NUEVOS"},
  {code:"CC1",name:"CASACA IMPERMEABLE",brand:null,category:"NOVEDADES"},
  {code:"CM1",name:"CAMARA WIFI",brand:null,category:"CAMARA DE SEGURIDAD"},
 ];
 const index=createCatalogIndex(rows,["UGREEN","JBL","SUPER"]);
 for(const [query,code] of [["cables UGREEN","CB1"],["micrófonos JBL","MI1"],["controles","CT1"],["tipo espectrómetros","XX1"],["casacas","CC1"]]) {
  assert.deepEqual(index.select(`catálogo ${query}`).products.map(p=>p.code),[code]);
 }
});

test("cada SKU, incluso numérico, sin marca y sin categoría, es localizable",()=>{
 const rows: CatalogCandidate[]=[...products,{code:"6",name:"MODELO SEIS",brand:null,category:null},
  {code:"BT454",name:"MODELO UNO",brand:null,category:null},
  {code:"BT454.",name:"MODELO DOS",brand:null,category:null}];
 const index=createCatalogIndex(rows);
 for(const p of rows) assert.deepEqual(index.select(`catálogo código ${p.code}`).products.map(x=>x.code),[p.code]);
 assert.deepEqual(index.select("catálogo JBL CHARGE 6").products.map(p=>p.code),["P1"]);
});

test("los tipos incluyen productos guardados bajo categorías generales",()=>{
 const rows: CatalogCandidate[]=[
  {code:"PR",name:"PROYECTOR HAVIT PJ215",brand:null,category:"ENTRETENIMIENTO Y MULTIMEDIA"},
  {code:"CA",name:"CAMARA PARA AUTO",brand:null,category:"ACCESORIOS PARA AUTO"},
  {code:"RE",name:"RELOJ DE PARED",brand:null,category:"NOVEDADES"},
  {code:"SW",name:"SMART WATCH",brand:null,category:"SMART WATCH Y SUS ACCESORIOS"},
  {code:"D1",name:"DRON CON CAMARA",brand:null,category:"DRONES"},
  {code:"D2",name:"DRON CON GPS",brand:null,category:"ENTRETENIMIENTO Y MULTIMEDIA"},
 ];
 const index=createCatalogIndex(rows,["HAVIT"]);
 for(const [q,code] of [["proyectores","PR"],["cámaras","CA"]]) assert.deepEqual(index.select(`catálogo ${q}`).products.map(p=>p.code),[code]);
 assert.deepEqual(index.select("catálogo relojes").products.map(p=>p.code).sort(),["RE","SW"]);
 assert.deepEqual(index.select("catálogo smartwatch").products.map(p=>p.code),["SW"]);
 assert.deepEqual(index.select("catálogo tipo drones").products.map(p=>p.code).sort(),["D1","D2"]);
 assert.deepEqual(index.select("catálogo categoría drones").products.map(p=>p.code),["D1"]);
});

test("agrupa por la marca del producto aunque el nombre también diga original",()=>{
 const product={code:"S1",name:"CARGADOR SAMSUNG ORIGINAL",brand:null,category:"ACCESORIOS"};
 const index=createCatalogIndex([product],["SAMSUNG","ORIGINAL"]);
 assert.equal(index.productBrand(product),"SAMSUNG");
 assert.equal(index.select("catálogo Samsung").products.length,1);
 const jbl={...product,name:"AUDIFONO JBL TUNE 110 SUPER BASS"};
 assert.equal(createCatalogIndex([jbl],["SUPER","JBL"]).productBrand(jbl),"JBL");
});

test("pantallas extensoras incluye los cuatro modelos y excluye otras pantallas y extensores",()=>{
 const rows: CatalogCandidate[] = [
  {code:"PC401",name:'SQ EXTENSOR DE PANTALLA PARA LAPTOP PARA 2 PANTALLAS DE 14',brand:null,category:"LAPTOP"},
  {code:"PC402",name:'SQ EXTENSOR DE PANTALLA PARA LAPTOP PARA UNA PANTALLA DE 14',brand:null,category:"LAPTOP"},
  {code:"O832",name:'BLACKVIEW EXTENSOR SCREEN GREY BLACK SCM6 14 pantalla',brand:null,category:"DISPOSITIVOS PORTATILES"},
  {code:"O970",name:'BLACKVIEW EXTENSOR SCREEN GREY BLACK SCM8 15.3',brand:null,category:"DISPOSITIVOS PORTATILES"},
  {code:"NO1",name:'PANTALLA ECRAN PARA PROYECTOR',brand:null,category:"ENTRETENIMIENTO"},
  {code:"NO2",name:'EXTENSOR HDMI INALAMBRICO',brand:null,category:"NOVEDADES"},
  {code:"NO3",name:'CAMARA CON PANTALLA',brand:null,category:"AUTO"},
 ];
 for(const query of ['Información sobre las pantallas extensoras','extensores de pantalla','catálogo de pantallas extensoras','extensores de pantalla en PDF','fotos de extensores de pantalla']) {
  assert.equal(isScreenExtenderQuery(query),true);
  assert.deepEqual(selectCatalogProducts(query,rows).products.map(p=>p.code).sort(),['O832','O970','PC401','PC402']);
 }
 assert.deepEqual(selectCatalogProducts('catálogo de extensores de pantalla BLACKVIEW SCM8',rows).products.map(p=>p.code),['O970']);
 assert.equal(isScreenExtenderQuery('pantallas de proyector'),false);
 assert.equal(isScreenExtenderQuery('extensor HDMI'),false);
});
