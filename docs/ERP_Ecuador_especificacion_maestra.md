# ERP Ecuador — Especificación funcional y arquitectura empresarial

## Propósito y alcance

El producto se diseña como un ERP empresarial con Ecuador como localización nativa. La primera entrega comercial se enfoca en importadoras y distribuidoras ecuatorianas, con arquitectura extensible para otros sectores. Este documento establece el mapa funcional y las dependencias; no declara que todos los módulos estén implementados ni sustituye la revisión profesional tributaria, contable o laboral.

## Estado observado del repositorio

El repositorio ya contiene frontend Next.js, API NestJS y PostgreSQL; módulos de ventas, compras/proveedores, productos, inventario, bodegas, transferencias, recepción, despacho, importaciones, logística, finanzas operativas, clientes, seguridad, usuarios y reportes. Hay una base de empresa/sucursal, permisos, auditoría y funcionalidades orientadas a operación ecuatoriana.

Brechas relevantes frente a la visión completa:

- El README aclara que el POS genera una factura interna y que no equivale a un comprobante electrónico autorizado por el SRI.
- No se identificó un módulo de contabilidad general, libro diario/mayor ni estados financieros integrados.
- No se identificó gestión de RR. HH. y nómina ecuatoriana.
- Los costos logísticos pueden registrarse como gastos, pero eso no constituye un subsistema completo de tesorería, cuentas por pagar/cobrar ni conciliación bancaria.
- Hay fundación multiempresa, aunque la documentación indica que todavía falta completar aislamiento de datos por empresa y sucursal.
- Existen valores fiscales en código y migraciones (por ejemplo, valor inicial de IVA); deben migrarse a reglas configurables con código, vigencia, fuente y aprobación de cambio antes de ser tratados como normativa vigente.
- El sistema de importaciones gestiona operaciones internas; no se debe afirmar integración con ECUAPASS sin confirmar interfaces y autorizaciones disponibles.

## Principios de diseño

1. Ecuador es el país operativo predeterminado, con datos, documentos y procesos ecuatorianos desde el núcleo.
2. Las reglas legales y contables son parámetros versionados por jurisdicción, entidad y fecha de vigencia; nunca constantes dispersas en el código.
3. Cada obligación tiene fuente primaria, fecha de consulta, vigencia, responsable de revisión, estado de validación y casos de prueba.
4. El Setup recomienda módulos, pero no determina por sí solo el régimen ni las obligaciones legales del contribuyente; se verifican y confirman.
5. Una operación conserva su trazabilidad y enlaza documento comercial, inventario, tributación, contabilidad, caja/banco y auditoría.
6. Los módulos se liberan por fases; el catálogo total no implica que todo deba desarrollarse antes del primer lanzamiento.
7. ECUAPASS y los portales oficiales siguen siendo sistemas oficiales externos salvo que se confirme una integración autorizada y técnicamente disponible.

## Catálogo funcional objetivo

### Plataforma y administración

Multiempresa y multisucursal con aislamiento probado; establecimientos y puntos de emisión; centros de costo y departamentos; usuarios, roles y permisos por acción y alcance; aprobaciones; auditoría; documentos y evidencias; workflows; notificaciones; períodos, bloqueo y cierre de ejercicio; configuración, calendarios y tareas.

### Comercial: CRM, ventas y servicio

Prospectos y oportunidades; cotizaciones, pedidos y contratos; listas de precios y promociones; descuentos y comisiones; control de crédito; anticipos; despacho; facturación; notas de crédito/débito; devoluciones; garantías; cobranza; historial de cliente y ventas recurrentes. Pedido, despacho, comprobante, cobro y devolución son eventos/documentos diferenciados.

### Compras y abastecimiento

Solicitudes, cotizaciones y comparativos; órdenes y aprobaciones; compras nacionales e internacionales; recepciones parciales; facturas de proveedores; retenciones según aplique; devoluciones; anticipos y cuentas por pagar; evaluación de proveedores; planificación, reposición e historial de precios.

### Inventario y almacenes

Multiinventario y multibodega; ubicaciones; recepciones, transferencias, reserva, picking, packing y despacho; kardex; lotes, series y caducidad; trazabilidad; inventario físico, ajustes y mermas; consignaciones; stock mínimo/máximo, comprometido y disponible; valoración e historial de costo. Existencia física, disponibilidad y valor contable son conceptos distintos.

### Finanzas y tesorería

Caja por sucursal, apertura/cierre y arqueos; bancos y cuentas; cobros, pagos y transferencias; conciliación bancaria; cuentas por cobrar/pagar; anticipos, préstamos y obligaciones; liquidez y flujo de caja; presupuestos, proyecciones y vencimientos.

### Contabilidad

Plan de cuentas configurable; asientos manuales y automáticos; diario, mayor y auxiliares; balance de comprobación y estados financieros; centros de costo; períodos, cierres, reversiones, conciliaciones y ajustes; activos fijos/depreciación; respaldo documental. Los marcos contables se configuran según el tipo y obligaciones de cada entidad, sin imponer un único tratamiento universal.

### Localización de Ecuador

- SRI: identificación tributaria, establecimientos y puntos de emisión; motor tributario por conceptos, códigos, bases, redondeos, exenciones, tratamientos y vigencias; comprobantes electrónicos, firma, transmisión, autorización, rechazo, contingencias, notas, retenciones, guías, liquidaciones y anulaciones conforme a especificaciones aplicables; reportes y anexos cuando correspondan.
- SENAE/comercio exterior: expediente de importación, proveedores, origen/procedencia, clasificación arancelaria, Incoterms, régimen, documentos de soporte y control previo, aforo, liquidaciones, tributos, bodegaje, demoras, transporte, seguro, nacionalización y distribución del costo a productos. El ERP organiza el expediente interno.
- Trabajo/IESS: empleados, contratos, cambios salariales, asistencia, horas, vacaciones, permisos, roles, beneficios, aportes, anticipos/préstamos, liquidaciones y reportes, con parámetros de vigencia y evidencia de revisión.
- Protección de datos: inventario de tratamientos, finalidades/base aplicable, acceso, conservación, solicitudes de titulares, bloqueo/anonimización/eliminación cuando proceda, incidentes, encargados/proveedores, transferencias y evidencias. El ERP aporta herramientas; cada empresa conserva sus responsabilidades como responsable del tratamiento.
- Contabilidad local y obligaciones societarias: configuración por entidad, reportes y calendario, sujeto a validación profesional y a los marcos aplicables.

### Aplicaciones operativas extensibles

Producción, calidad, activos fijos, mantenimiento, proyectos, servicios técnicos, comercio electrónico, punto de venta, transporte, BI, API, plugins, marketplace e integraciones. Se activan por perfil y necesidad del negocio.

## Sistemas transversales requeridos

Workflow y motor de aprobaciones; motor de reglas de negocio; motor tributario; motor contable; notificaciones/eventos; documentos; auditoría; reportes; integraciones; tareas programadas; importación/exportación de datos; localización; respaldo/recuperación; actualización/migraciones.

### Ejemplo de flujo integrado de venta

Pedido → verificación de crédito → reserva de existencias → autorización y despacho → emisión del comprobante aplicable → transmisión y seguimiento de respuesta del SRI cuando corresponda → asiento contable → cuenta por cobrar → cobro/conciliación → actualización de indicadores. Cada etapa conserva identidad, estado, fecha y actor, con reversos explícitos donde proceda.

## Setup empresarial

Recopilar cuatro dimensiones: identidad jurídica; actividad económica; estructura (compañías, sucursales, bodegas y alcance nacional/internacional); perfil operativo y tributario declarado/verificado (contabilidad, inventario, nómina, compras internacionales y facturación). Recomendar aplicaciones y configuraciones; mostrar las obligaciones inferidas como pendientes de confirmación y registrar quién las verificó y cuándo.

## Matriz normativa y de reglas

Cada regla implementada debe registrar al menos: jurisdicción; autoridad; tema; fuente primaria y URL; identificador/versionado del documento; fecha consultada; vigencia desde/hasta; regla anterior; configuración afectada; módulos impactados; responsable de revisión; estado (pendiente, revisado, aprobado, implementado, retirado); pruebas asociadas; fecha de próxima revisión. Ninguna tasa, plazo o fórmula se activa sin validación de su fuente y alcance.

Fuentes de partida verificadas el 20-11-2026:

- SRI, facturación electrónica y ficha técnica offline: https://www.sri.gob.ec/nl/web/intersri/facturacion-electronica (publica versión 2.34 actualizada a julio de 2026).
- SENAE, requisitos y documentos para importar: https://www.aduana.gob.ec/servicio-al-ciudadano/para-importar/.
- IESS, inscripción de afiliación y obligaciones del empleador: https://www.iess.gob.ec/web/afiliado/inscripcion-de-afiliacion.
- SPDP, normativa de protección de datos: https://www.spdp.gob.ec/docs/proteccion-de-datos-personales/general/normativa/.
- Superintendencia de Compañías, Valores y Seguros: incorporar la fuente oficial y las obligaciones de información financiera pertinentes a cada tipo de compañía en la siguiente revisión normativa.
- Ministerio del Trabajo: incorporar fuentes oficiales vigentes para contratos, remuneraciones, beneficios y obligaciones laborales en la siguiente revisión normativa.

Estas fuentes son punto de partida, no una matriz legal completa ni una certificación de cumplimiento.

## Fases recomendadas

### Fase 0 — Base confiable y datos

Completar el aislamiento multiempresa/sucursal documentado como pendiente; definir permisos, auditoría, documentos, períodos y configuración; respaldos cifrados y restauración verificada; inventariar reglas fiscales codificadas y documentar sus brechas. El motor fiscal y la integración SRI se implementan en la fase final. Sin esta base no activar multiempresa en producción.

### Fase 1 — Importadora/distribuidora operable

Cerrar compras, inventario, recepción, ventas, despacho, expediente de importación y costeo; enlazar documentos, pagos/cobros, costos y centros de costo; reportes operativos; pilotos con datos representativos.

### Fase 2 — Contabilidad y tesorería

Plan de cuentas configurable; asientos integrados con eventos de ventas, compras, inventario, importación, cobros y pagos; diario/mayor/estados; CxC/CxP, caja/bancos y conciliación; períodos y cierres controlados.

### Fase 3 — RR. HH. y nómina

Expediente, contrato, novedades, asistencia, cálculos con parámetros vigentes, rol de pagos, obligaciones y exportaciones; validación con especialista laboral y contable antes de producción.

### Fase 4 — Protección de datos y controles transversales

Herramientas LOPDP y gestión de evidencias integradas en todos los módulos; API e integraciones; BI; extensiones por sector; despliegue, monitorización, soporte, actualizaciones y recuperación.

### Fase 5 — Localización tributaria SRI

Validar matriz con asesor tributario; confirmar perfil de contribuyente, establecimientos y puntos de emisión; construir motor de reglas y adaptador de documentos electrónicos conforme a ficha vigente, firma y gestión de estados; probar el ambiente disponible; conservar XML, autorización, respuesta y evidencia; manejar contingencias, retenciones y cambios de especificación. Esta etapa se inicia al final, cuando los procesos, controles contables y datos de la empresa estén definidos.

## Criterio de aceptación transversal

Una función legalmente sensible solo se considera lista cuando: su fuente primaria y vigencia están registradas; la regla tiene responsable de revisión; los casos normales, excepcionales, límites temporales y reversos están definidos; la segregación de acceso y auditoría están demostradas; los documentos de respaldo se conservan conforme al perfil aprobado; y el flujo fue revisado por el especialista que corresponda. La existencia de una pantalla o cálculo aislado no constituye cumplimiento.
