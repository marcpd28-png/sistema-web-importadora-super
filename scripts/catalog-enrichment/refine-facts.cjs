/* Editorial normalization shared by preparation and validation. */
const tidy = text => String(text || '').replace(/_x000D_/gi, ' ').replace(/\s+/g, ' ').trim();
const forbidden = /\bpendientes?\b|confirmar|verificar|comprobaci[oó]n|no se confirma|no se especifica|no especificad|seg[uú]n (?:la |el )?imagen|anunciad|cat[aá]logo|no medid|valor comercial|ficha (?:es )?parcial/i;
function cleanSpec(spec) {
 let name = tidy(spec.name), value = tidy(spec.value);
 if (/pendiente|advertencia|variaci[oó]n regional|presentaci[oó]n|contenido del combo|garant[ií]a|precio|stock/i.test(name)) return null;
 if (/El t[ií]tulo anuncia|difiere de|contradicci|versiones distintas/i.test(value)) return null;
 name = name.replace(/\s+(?:anunciad[ao]s?|indicad[ao]s?)(?:\s+en el cat[aá]logo)?/gi, '').replace(/\s+por confirmar/gi, '').trim();
 if (/^Referencia indicada/i.test(name) || /^Referencia$/.test(name)) name = 'Modelo';
 if (/^Marca indicada/i.test(name)) name = 'Marca';
 value = value.replace(/\s*\(seg[uú]n denominaci[oó]n del cat[aá]logo\)/gi, '')
  .replace(/\s*(?:seg[uú]n|indicados? en) (?:la |el )?(?:imagen|cat[aá]logo|fabricante|documentaci[oó]n JBL)\b[^;.]*/gi, '')
  .replace(/;?\s*(?:valor nominal anunciado, no medido|valor nominal no medido|no medidos? independientemente|no representa mediciones independientes)\.?/gi, '')
  .replace(/;\s*(?:el cat[aá]logo|condiciones de volumen|condiciones de funcionamiento|tecnolog[ií]a y requisitos|versi[oó]n y perfiles|confirmar|rendimiento y condiciones|no se confirma|no implica|el t[ií]tulo|tipos y uso|tipo de interruptores|tensi[oó]n y consumo|capacidad y autonom[ií]a|potencia del panel|no confirma)[^.]*\.?/gi, '')
  .replace(/\s*[.;]\s*(?:Confirmar|Verificar|La fuente|No se confirma|No implica|No se da por incluido|No trasladar|No equivale a alcance garantizado|valor comercial)[\s\S]*$/i, '')
  .replace(/\s*;\s*corresponde al tama[nñ]o indicado[\s\S]*$/i, '')
  .replace(/\s*;\s*valor PMPO, no equivale a RMS/i, ' PMPO')
  .replace(/\s*;\s*capacidad nominal, espacio utilizable menor/i, '')
  .replace(/\s*;\s*espacio utilizable menor/i, '')
  .replace(/\s*;\s*12 GB anunciados en total.*$/i, '')
  .replace(/\s*;\s*valor nominal.*$/i, '')
  .replace(/\bS[ií],?\s*(?:indicad[ao] en (?:el )?cat[aá]logo)?\.?$/i, 'Sí')
  .replace(/\s*[;.,]\s*$/, '').trim();
 if (/^S[ií]$/.test(value)) {
  const booleanValues={'Conexión inalámbrica':'Inalámbrica','Conexión por cable':'Por cable','Diseño retráctil':'Retráctil'};
  if (booleanValues[name]) value=booleanValues[name]; else return null;
 }
 if (/RAM f[ií]sica|ampliaci[oó]n virtual/i.test(spec.value) && /confirmar/i.test(spec.value)) return null;
 if (!name || !value || forbidden.test(name+' '+value) || value.length>255 || /^(?:No |N\/A|Desconocid)/i.test(value)) return null;
 return {name,value};
}
module.exports={cleanSpec,forbidden,tidy};
