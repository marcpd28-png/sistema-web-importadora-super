# Incongruentes ocultos

La pestaña `Incongruentes ocultos` de Requiere atención separa las filas CODE_DIFFERENT cuyo producto está actualmente oculto (`Product.isVisible=false`). La lista principal excluye esas filas. Se consulta el estado actual de la base; no se utiliza la visibilidad histórica del barrido ni se cambia la publicación de ningún producto. La integración no conserva un indicador separado de ocultamiento exclusivamente en el ERP: esta clasificación refleja el catálogo sincronizado actual.

Cada grupo conserva búsqueda, contador y paginación. Los demás filtros y exportaciones completas mantienen todas las filas. Las tarjetas muestran la visibilidad actual.

Despliegue: `/home/IMPORTADORA-releases/rocky-20260921-hidden-audit`, PM2 `importadora-rocky-hidden-audit`, localhost 4006. Solo `/admin/atencion` se dirige a este proceso; simulador y otras API siguen en 4005. Recursos estáticos agregados sin sobrescribir al directorio compartido de `rocky-20260921-r2`. Backup Nginx: `/var/log/rocky/nginx-before-hidden-audit.conf`.

Validación: TypeScript y ESLint sin errores, build webpack correcto y comprobación HTTP pública de ambas listas, todas sus páginas, búsqueda, recursos y conservación de exportaciones. En la comprobación: 33 filas principales + 29 ocultas = 62 incongruentes. Los contadores cambian con la visibilidad del catálogo. No se modificaron datos de productos ni la auditoría original.
