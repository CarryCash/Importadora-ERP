# Fase 0 — Análisis de requisitos, normativa ecuatoriana y brechas

**Estado:** análisis inicial; no constituye dictamen legal ni declara cumplimiento.  
**Fecha de verificación de fuentes:** 20 de noviembre de 2026.  
**Alcance de esta fase:** entender el producto y los controles que deben existir antes de implementar módulos legales o transaccionales.

## 1. Decisión de producto

Se toma como hipótesis de trabajo la recomendación del documento entregado: construir una plataforma ERP amplia, entrar primero al mercado de importadoras y distribuidoras, y contemplar contabilidad integrada y herramientas para el contador. Esta decisión da prioridad al flujo importación → costeo → inventario → venta → documento tributario → cobro → registro contable, sin excluir otros sectores del diseño.

La plataforma no debe afirmar «cumple toda la ley ecuatoriana» solo por ofrecer formularios o cálculos. El alcance regulatorio se demuestra requisito por requisito para el perfil de la empresa, la operación y la fecha a la que aplica la norma.

## 2. Lo que comprobé en el repositorio

El proyecto contiene aplicación Next.js, API NestJS y PostgreSQL, y módulos funcionales para empresas/usuarios, seguridad, clientes, productos, ventas, proveedores/compras, inventario, recepción, transferencias, despacho, importaciones, logística, costos operativos y reportes.

La documentación local es explícita en dos límites:

- `docs/fase-1-base-confiable.md` indica que todavía falta completar filtros de pertenencia a empresa en todos los repositorios, lecturas, escrituras, reportes y transacciones; mientras tanto prohíbe habilitar una segunda empresa operativa.
- `README.md` dice que el POS produce una factura interna, no una autorización electrónica del SRI.

En código y esquema del producto se usa `iva_rate` por producto con valores por defecto y límites generales. No encontré en el barrido inicial un catálogo de tributos con autoridad, concepto tributario, vigencia temporal, transición normativa y evidencias de aprobación. El modelo actual sirve a una primera operación POS, pero no demuestra que la tarifa aplicable esté resuelta para cada artículo, evento, contribuyente y fecha.

La documentación financiera/logística muestra registro de gastos y conciliación operativa a gastos. Eso no equivale todavía a libro diario/mayor, cuentas por pagar y cobrar completas, conciliación bancaria o estados financieros. No identifiqué módulo de nómina.

Este es un inventario de arquitectura, no una revisión exhaustiva de cada línea, endpoint, formulario o migración. Antes de cambiar código se debe realizar el trazado por entidad y operación.

## 3. Principio para decidir si una norma aplica

Una regla solo puede activarse después de resolver, como mínimo:

1. Quién es el contribuyente/empleador/declarante y cuál es su forma jurídica.
2. Qué actividad, operación, bien o servicio se registra.
3. Régimen y obligaciones confirmados desde evidencia aportada o fuente oficial autorizada.
4. Qué condición especial existe (por ejemplo, agente de retención o contribuyente especial).
5. Fecha del hecho económico y fechas de vigencia normativa.
6. Jurisdicción y alcance del establecimiento/sucursal.
7. Qué documento y evidencia deben producirse o conservarse.

El Setup puede preguntar, importar certificados o señalar datos por confirmar. No debe inferir automáticamente obligaciones únicamente desde una actividad económica, tipo de negocio, RUC introducido o respuestas incompletas.

## 4. Matriz preliminar de requisitos ecuatorianos

| Dominio | Fuente oficial consultada | Qué debe permitir el ERP | Dependencias / condición que se debe confirmar | Evidencia y vigencia |
|---|---|---|---|---|
| Identidad tributaria y perfil del contribuyente | SRI, RUC, catastros y normativa por obligación | Mantener identidad, establecimientos, puntos de emisión y perfil de obligaciones versionado. Separar datos capturados de obligaciones verificadas. | Tipo/estado de contribuyente, establecimiento y obligaciones vigentes por empresa. | Fuente consultada, certificado o evidencia, verificador, fecha de revisión y período de vigencia. |
| Comprobantes electrónicos | SRI, ficha técnica offline versión 2.34 actualizada a julio de 2026 | Modelar XML, firma, transmisión, autorizaciones/rechazos, reintentos, secuenciales y estados conforme a ficha técnica vigente; preservar original y respuesta. | Tipo de documento, punto de emisión, ambiente, firma/credencial y regla del emisor. El PDF de representación no sustituye al documento y autorización electrónica. | XML firmado, respuesta del SRI, autorización, historial de eventos y versión de ficha aplicada. |
| IVA y otros impuestos | SRI, página de IVA y resoluciones vigentes | Catálogo de impuestos y tratamientos por operación/producto con códigos y fecha efectiva; bases, redondeos, excepciones y trazabilidad del cálculo. | La página SRI consultada muestra tarifas 0 % y 13 %, además de tarifa 5 % para transferencias locales de materiales de construcción; existen tratamientos y eventos de tarifa reducida. No deducir solo desde la categoría comercial del producto. | Parámetro, fundamento, fuente, inicio/fin de vigencia, usuario que lo aprobó y snapshot de tasas en cada documento emitido. |
| Retenciones y condición de agente | SRI, porcentajes/normativa de retención y catastros | Reglas separadas para impuesto, concepto, clase de sujeto, base, código de declaración, documento y fecha; retención ligada al evento de pago/crédito según regla aplicable. | El SRI comunicó nuevos porcentajes de retención y nuevos agentes aplicables desde el 1-03-2026. La calidad de agente debe confirmarse por entidad y período; no puede heredarse globalmente a todos los clientes/empresas. | Resolución aplicable, versión del catálogo, prueba de vigencia, condición del agente y comprobante de retención relacionado. |
| Conservación tributaria | SRI, regulación de documentos electrónicos y conservación | Archivo íntegro, indexable y recuperable de comprobantes y documentos sustentatorios; control de retención, acceso, respaldo y suspensión de borrado. | El SRI informa conservación de comprobantes electrónicos por siete años; otros documentos pueden tener reglas o cómputos específicos, así que no imponer un único plazo universal a todo archivo. | Fecha de inicio/cómputo, tipo de documento, regla aplicable, hash/ubicación, accesos, exportación y prueba de restauración. |
| Importación y aduana | SENAE, guía para importar y procedimientos DAI | Expediente por embarque con DAI, subpartida, régimen, documentos de soporte/acompañamiento, hitos, valores, costos y responsables; alertas de vencimiento y diferencias estimado/real. | SENAE indica registro de importador en ECUAPASS, participación del importador o agente acreditado, documentos previos según mercancía y ventana DAI de hasta 15 días calendario antes del arribo y 30 días después. Clasificación, permisos, aforo y tributos dependen del caso. | Documento original/electrónico, fuente/fecha, hitos de arribo, DAI, aprobaciones, liquidación y costo de importación por producto. ERP gestiona control interno; no se presupone que transmite a ECUAPASS. |
| Relación laboral e IESS | IESS, obligaciones del empleador; Ministerio del Trabajo | Expediente del trabajador, contrato, novedades, asistencia, roles y calendario. Alertas para aviso de entrada, cambios/salida y aportes; reportes revisables antes de envío/pago. | IESS señala afiliación desde el primer día, aviso de entrada dentro de primeros 15 días, novedades dentro de 3 días en los supuestos indicados y pago de aportes dentro de 15 días posteriores al mes. Modalidad y excepciones deben confirmarse por relación y régimen laboral. | Contrato/novedad, fecha de hecho, vencimiento calculado, usuario responsable, constancia de envío/recepción y período de nómina. |
| Beneficios laborales y nómina | Ministerio del Trabajo, Código del Trabajo, calendario y acuerdos aplicables | Reglas versionadas para décimos, vacaciones, fondos, horas, utilidades y liquidaciones; distinguir pago mensualizado/acumulado y casos proporcionales. | Sector privado/público, régimen, ubicación, opción escrita del trabajador y hechos laborales modifican el cálculo. No copiar una tabla única para todo el personal. | Parámetro y fuente, fechas, elección documentada, cálculo reproducible, revisión/ajuste y comprobante de pago. |
| Protección de datos personales | SPDP, LOPDP, RGLOPDP y normativa secundaria | Control de acceso, inventario de tratamientos, finalidad/base registrada por la empresa, conservación y revisión, solicitudes de titulares, gestión de incidentes, encargados y transferencias. Evidencia de medidas desde diseño. | Responsabilidades cambian según la empresa sea responsable o encargado; la designación de delegado depende de los supuestos legales. No presentar al software como quien decide la base legitimadora del cliente. | Registro de tratamiento, propósito, rol, acceso, consentimiento/base cuando aplique, incidentes, solicitudes, proveedores y revisión legal. |
| Contabilidad societaria | SCVS, normativa e instructivo NIIF completo y NIIF para PYMES | Permitir plan de cuentas, políticas y reportes configurables y mantener trazabilidad entre operación y asiento; conservar períodos y cierres. | Marco contable y reportes dependen del tipo de compañía y su sujeción al control de SCVS; se debe clasificar y confirmar con profesional contable. | Perfil contable aprobado, versión del catálogo, política, período, asientos fuente, ajustes y cierres firmados. |

### Fuentes primarias consultadas

- SRI, facturación electrónica y ficha técnica: https://www.sri.gob.ec/web/intersri/facturacion-electronica
- SRI, IVA y tarifas publicadas: https://www.sri.gob.ec/impuesto-al-valor-agregado-iva
- SRI, retenciones en la fuente: https://www.sri.gob.ec/retenciones-en-la-fuente
- SRI, cambios de retenciones y agentes desde marzo de 2026: https://www.sri.gob.ec/detalle-noticias?idnoticia=1273&marquesina=1
- SRI, conservación de comprobantes electrónicos: https://www.sri.gob.ec/detalle-noticias?idnoticia=1021&marquesina=1
- SENAE, requisitos de importación: https://www.aduana.gob.ec/servicio-al-ciudadano/para-importar/
- IESS, obligaciones del empleador: https://www.iess.gob.ec/es/web/empleador/obligaciones
- Ministerio del Trabajo, décimos: https://www.trabajo.gob.ec/29-cual-es-el-plazo-y-como-se-debe-realizar-la-solicitud-para-la-acumulacion-del-pago-de-la-decima-tercera-y-decima-cuarta-remuneracion/
- SPDP, marco normativo: https://www.spdp.gob.ec/marco-normativo/
- SCVS, normativa societaria e instructivo NIIF: https://www1.supercias.gob.ec/portalscvs/Institucion/SectorSocietario.php?seccion=normativas

Las páginas informativas facilitan la localización de reglas, pero las reglas implementables deben apuntar al texto normativo primario, Registro Oficial o ficha técnica correspondiente, con reforma y vigencia verificadas. En caso de contradicción, el equipo normativo debe resolverla antes de cambiar una regla activa.

## 5. Hallazgos y riesgos que deben resolverse antes de programar

### P0 — Aislamiento de datos

La fundación de empresa/sucursal y guardia de membresía existe, pero el propio documento local prohíbe activar una segunda empresa hasta cerrar los filtros de todos los repositorios. Aislamiento incompleto podría exponer o modificar información de otra entidad; es un bloqueo de arquitectura y de privacidad, no una mejora posterior.

### P0 — Veracidad del cumplimiento tributario

Una tasa por producto no modela por sí sola tratamiento, fecha efectiva, código SRI, calidad de agente, retención o un cambio de norma. La factura interna tampoco acredita autorización SRI. Antes de conectividad tributaria se requiere definir el ciclo de documento, estados y evidencia oficial.

### P0 — Trazabilidad financiera

La factura de venta, nota de crédito, compra, documento aduanero, costo asignado, cobro, retención y asiento deben enlazarse con estados y reversos explícitos. El diseño actual de gastos operativos no debe convertirse en un subledger improvisado.

### P1 — Seguridad, datos y retención

Audit log registra solicitudes mutantes en forma general, pero la auditoría funcional debe identificar entidad y valores anteriores/nuevos, motivo, operación y relación documental. La conservación legal de comprobantes debe convivir con minimización y límites de conservación de datos personales; hace falta una política de archivo por tipo de registro y excepción de conservación legal.

### P1 — Parámetros y cambios legales

Debe haber una fuente única versionada por norma, con despliegue controlado, simulación de efecto, fecha de activación y sin alterar documentos históricos. El cambio de retenciones de 2026 demuestra que las tablas/catálogos deben tener gestión de vigencia y responsables.

### P1 — Integraciones y promesas de producto

Separar explícitamente gestión interna de emisión/transmisión oficial. No afirmar integración con SRI o ECUAPASS hasta verificar ambientes, credenciales, términos, especificaciones, autorizaciones y pruebas de interoperabilidad vigentes.

## 6. Entregables de análisis de Fase 0

Antes de cualquier implementación de módulos fiscales/contables/laborales, la Fase 0 queda aceptada cuando existan:

1. Registro de fuentes primarias y obligaciones, con alcance, reforma, vigencia, evidencia y responsable de revisión.
2. Cuestionario de configuración por empresa para RUC/estado, establecimientos, régimen, obligaciones, agente de retención, forma jurídica, marco contable, empleados, sucursales, bodegas y actividad/importación; campos legales con fuente y estado «confirmado/pendiente».
3. Matriz requisito → operación → módulo → dato → control → permiso → documento/evidencia → reporte → prueba → responsable.
4. Mapa de procesos de importación, compra, recepción, venta, devolución, retención, cobro, nómina y cierre contable, incluidos errores, anulaciones y reversos.
5. Modelo conceptual para motor tributario/documental, libro contable, períodos, evidencias, reglas versionadas y roles de acceso, sin tablas/código todavía.
6. Inventario de datos personales por módulo, roles responsable/encargado, permisos, finalidad declarada por cliente, ciclo de vida y criterios para escalar al asesor de privacidad.
7. Análisis de brecha por endpoint/repositorio para aislamiento multiempresa/sucursal y definición de pruebas de no exposición.
8. Priorización de primera versión para importadora/distribuidora y criterios de aceptación medibles por flujo.
9. Revisión con contador ecuatoriano, asesor tributario y laboral para obligaciones que se vayan a automatizar; la matriz registra su aprobación y alcance, no la presume.

## 7. Secuencia posterior al análisis

La Fase 0 fija la arquitectura y los controles, sin intentar activar desde el inicio todas las obligaciones regulatorias. La integración y automatización tributaria del SRI se deja para la última etapa del plan. La implementación posterior se ordena así:

1. Aislamiento de empresa/sucursal, permisos, auditoría y respaldo/recuperación.
2. Flujo importador: compras e importación, expediente documental, recepción, valoración y asignación de costos sin duplicar gastos.
3. Libro y subledgers de ventas/compras/inventario/importación/cobros/pagos, períodos y cierres.
4. Nómina ecuatoriana, tras definir perfil de empleador y reglas laborales confirmadas.
5. Protección de datos y evidencias a lo largo de todos los módulos, con despliegue por riesgo y finalidad.
6. Localización tributaria SRI: motor de reglas vigente, documentos electrónicos, firma, transmisión, estados, retenciones, contingencia y evidencia, tras validar el perfil y la disponibilidad técnica/contractual.

Un requisito se marca como implementado únicamente cuando su fuente está vigente y aprobada, el flujo completo funciona, hay evidencia conservada, segregación/auditoría verificadas y casos límite/reversos definidos.

## 8. Trazado del ERP actual contra los flujos necesarios

La siguiente matriz conecta pantallas/APIs y datos existentes con las capacidades que hacen falta. «Existe» significa que hay código o esquema; no significa que el proceso esté terminado o certificado.

| Flujo / dominio | Capacidad existente observada | Brecha concreta observada | Decisión de análisis antes de código |
|---|---|---|---|
| Empresa y localización | `companies` tiene tax_id, país, moneda y zona horaria; `branches` tiene código y dirección; membresías y preferencias por empresa. | No se modelan claramente múltiples identificaciones/establecimientos SRI, estado y vigencias de calificación ni puntos de emisión. Identificador tributario no sustituye RUC validado y evidencia de estado. | Acordar unidad de empresa tributaria, varios RUC por grupo si se requiere, matriz/sucursales vs. establecimiento SRI y mapa establecimiento–punto de emisión. No reutilizar `branch_id` como código de establecimiento SRI sin confirmación. |
| Clientes y proveedores | Identificación local, tipo de identificación, dirección/ciudad/provincia; validación de formato ecuatoriano en clientes; datos SRI básicos en clientes; controles de aprobación y evaluación de proveedores. | Validación sintáctica no confirma estado tributario ni si cliente/proveedor es agente o contribuyente especial en una fecha determinada. La calificación puede cambiar. | Separar datos declarados, datos consultados y datos confirmados; registrar fuente/fecha/caducidad; no bloquear ventas únicamente por una consulta externa no disponible. Definir regla de retención por tipo de contraparte. |
| Cotización, pedido y precio | Cotizaciones/órdenes, listas de precios, descuentos, aprobaciones y snapshots comerciales. | Falta clasificar evento fiscal y consolidar una regla de cálculo reproducible por renglón/fecha; precio y tratamiento fiscal son cosas distintas. | Definir cuándo ocurre el hecho imponible por tipo de operación, cómo se conservan precio, descuento, base y tratamiento para emitir comprobante y asientos. |
| Venta, pago y caja | Venta transaccional, descuento, salida FEFO, varias formas de pago, pagos parciales, estado de cuenta de cliente y sucursal activa. | No se observó apertura/cierre y arqueo de caja, banco, conciliación, cartera parametrizada, asignación de cobros ni ciclo de comprobante electrónico completo. | Modelar documentos distintos (pedido, despacho, venta/factura, cobro, nota de crédito, devolución) y sus estados/reversos. Definir caja/banco, cuenta contable y documento de respaldo de cada pago. |
| Comprobantes | Existe tabla `invoices` y el cierre de venta crea el registro documental. | En la revisión original faltaban alcance de empresa/sucursal y el número interno usaba `COUNT(*)` global. La primera implementación ya agregó empresa/sucursal, número interno separado, contador transaccional interno y protección contra borrado en cascada. Aún faltan establecimiento/punto emisor, generación de XML, firma, cola, transmisión, respuesta y consulta de autorización del SRI. | Tratar el flujo como registro interno hasta configurar y validar establecimiento/punto y completar el adaptador SRI. Especificar secuencial SRI por empresa/establecimiento/punto/tipo/ambiente, firma/respuesta, conservación y eventos válidos de corrección/anulación. |
| IVA/retenciones | Campo `iva_rate` por producto y cálculo de impuesto en renglones de venta; consulta a SRI tiene catálogo de porcentajes de retención. | Cálculo en venta lee tarifa de producto actual; faltan snapshot legal de código, fuente y vigencia. No se encontró motor por impuesto/concepto/base/agente/fecha ni catálogo de tarifas y reglas versionadas en DB. | Definir catálogo de impuesto separado del producto y esquema `regla + ámbito + vigencia + fuente + aprobación`. El producto puede recomendar un tratamiento; la operación debe resolverlo a fecha del hecho, revisar excepciones y guardar snapshot inmutable. |
| Compra nacional y retención | Módulo proveedores, solicitudes/órdenes y recepción; compras tienen estados operativos. | No se observó un ciclo de factura de proveedor con recepción tributaria, crédito tributario, comprobante de retención, saldo, vencimiento y asiento íntegramente ligado. | Mapear documento recibido, validación/autorización, retención, pago, devolución y crédito; distinguir factura comercial del proveedor de la evidencia de recepción SRI/contable. |
| Importación y costos | Expediente de importación, contenedores, eventos, documentos, clasificación de producto; costos, tarifas y asignación decimal a importación. | Esquema inicial concentra valores de importación en campos agregados. La matriz de subpartida/permiso/tributo depende de producto, régimen y fecha; no se confirmó integración directa con ECUAPASS. Los costos logísticos conciliados a gasto no cubren por sí solos capitalización/importación y cuentas por pagar. | Un expediente debe guardar documentos fuente, identidad de DAI, régimen, subpartida revisada, hitos, liquidaciones y asignación por regla; reconciliar costo estimado, real, inventario y contabilidad con prevención de doble contabilización. Mantener integración externa como hipótesis sin promesa. |
| Recepción, inventario y valoración | Bodegas/ubicaciones, recepción, transferencias, conteos, lotes/series/caducidad, reservas, kardex, costos y snapshots de valoración; guía logística define controles técnicos. | Debe probarse cobertura de empresa/sucursal para las nuevas tablas de inventario empresarial y enlace con asientos; movimiento físico, stock disponible y costo contable son ledgers distintos. | Definir fuente de verdad de cantidades, consumos, costo por capas, fechas y reversos; definir puente contable por tipo de movimiento sin asiento duplicado. |
| Finanzas/contabilidad | `finance` registra gastos; resumen calcula ingresos, COGS, gastos y estimaciones de deudores/acreedores; pagos de venta existen. | `finance.service` describe COGS como simplificado, CxP como proxy de importaciones no completadas; no hay plan de cuentas, asientos, diarios, mayores, períodos/cierres, conciliación bancaria o estados financieros identificados. | Crear alcance conceptual de subledgers y mayor: documento fuente → asiento balanceado → período → reverso. Confirmar NIIF completas/NIIF PYMES u otra política por entidad con contador. No usar el resumen actual como estado financiero oficial. |
| Recursos humanos y nómina | Existen campos de usuario como departamento/cargo y roles de acceso. | No se encontraron entidades o APIs de empleados/contratos, asistencia, roles de pago, beneficios, aportes o finiquitos. Un usuario del ERP no debe representar necesariamente un expediente laboral. | Definir modelo separado de trabajador/usuario/relación laboral; jurisdicción, sector, calendario regional, modalidad y elección escrita para beneficios; permisos reforzados para datos sensibles. |
| Protección de datos | Seguridad tiene sesiones, MFA opcional/políticas, invitaciones, permisos y registros generales de cambios HTTP. Clientes guardan identidad/contactos/direcciones. | El interceptor registra método, ruta, actor, status e IP; no captura valores antes/después. La tabla tiene `changes` pero el interceptor observado no lo rellena. No se encontró inventario de tratamientos, solicitudes de titulares, incidentes, retención por categoría ni gestión contractual de encargados. | Hacer inventario de datos por proceso; definir rol empresa como responsable y ERP/proveedores como posibles encargados según contrato/uso real; diseñar controles técnicos, accesos, retención, eliminación/suspensión legal, exportación e incidentes; validar con asesor de privacidad. |
| Auditoría y autorización | Roles, permisos por módulo/acción, aprobaciones y audit log general; se documentan auditorías específicas de productos/proveedores. | Registro HTTP puede fallar sin bloquear la operación y no equivale a evidencia de negocio firmada e inmutable. Falta demostrar segregación de funciones en procesos fiscales y de cierre. | Definir eventos de negocio obligatorios, actor/fecha/antes/después/razón/correlación, retención y monitoreo; exigir actor distinto donde aplique; congelar cierres/documentos autorizados. |
| Reportes y obligaciones | Dashboard, analítica de clientes, ventas/inventario/importaciones y reportes logísticos. | No se identificó generación validada de declaraciones/anexos tributarios, roles/archivos laborales, reportes regulatorios de compañía o papeles de trabajo contables. | Inventariar cada reporte por obligación, destinatario, formato, período, evidencia, fuente y revisión; no presentar reportes gerenciales como formularios oficiales. |
| Respaldos y continuidad | Scripts de backup y restore a base nueva; documentación advierte que respaldo no está cifrado. | Sin cifrado ni ejecución/verificación automatizada de restauración, los documentos y datos sensibles carecen de garantía operativa suficiente para retención prolongada. | Definir RPO/RTO, cifrado en tránsito/reposo, llave y custodios, ubicación independiente, calendario, monitoreo, retención legal y simulacros con resultado registrado. |

## 9. Flujos de negocio objetivo para validar en talleres

### 9.1 Importación a inventario disponible

1. Alta de orden y proveedor; registrar contrato, factura proforma, moneda, Incoterm y condiciones de pago.
2. Clasificar producto y solicitar revisión de subpartida, permisos de control previo y requisitos de la mercancía; dejar evidencia y versión del arancel/consulta.
3. Crear expediente de embarque con documento de transporte, factura comercial, packing list, certificado de origen cuando proceda y evidencia de control previo.
4. Registrar arribo y alerta de plazo DAI; asignar agente/importador acreditado y estado de trámite externo.
5. Registrar DAI, aforo, observaciones/correcciones, liquidación y tributos pagados; conservar documentos originales/electrónicos.
6. Registrar recepción parcial, diferencia, daño/calidad, lote/serie, bodega/ubicación y momento de liberación.
7. Prorratear costos reales por política aprobada y conciliarlos con costo inventariable, gasto y cuentas por pagar; no duplicar transporte/gastos ya conciliados.
8. Conciliar cantidades, montos y documentos; permitir el uso disponible solo cuando las reglas de recepción y calidad se cumplan.

### 9.2 Venta a cierre contable

1. Validar cliente y condición de crédito conforme a política interna.
2. Cotización/pedido fija precio, descuento, moneda y destinatario.
3. Reservar stock por sucursal/lote; autorizar y despachar con evidencia.
4. Resolver perfil tributario, códigos, base y tarifa por fecha de operación; crear snapshot de cálculo.
5. Generar XML conforme ficha vigente; firmar con credencial autorizada, transmitir y guardar respuesta/estado del SRI.
6. Entregar documento al receptor y conservar XML, autorización y representación por el período aplicable.
7. Crear cuentas por cobrar/asiento automático, registrar pago y conciliar con caja/banco.
8. Si hay devolución, emitir el documento tributario procedente y registrar reverso comercial, inventario, impuesto y asiento enlazados.

### 9.3 Compra, retención y pago

1. Orden de compra y aprobación segregada.
2. Recepción física y factura proveedor se concilian sin confundir ambas fechas.
3. Validar documento tributario y condición del receptor/agente en la fecha de pago o crédito aplicable.
4. Resolver retención por impuesto, concepto y resolución vigente; generar comprobante electrónico y calendario de entrega/declaración.
5. Registrar obligación, pago, retención, saldo y asiento; conciliar contra banco.
6. Conservar evidencia y hacer reversos por nota/documento válido, no mediante borrado de documentos contabilizados.

### 9.4 Empleo y nómina

1. Abrir expediente laboral distinto a usuario del sistema, con acceso de mínimo privilegio.
2. Registrar relación, contrato, sueldo, jornada, ubicación, modalidad y fechas; producir tareas para aviso de entrada/novedades.
3. Registrar novedades, horas, vacaciones y opciones escritas de acumulación/pago cuando procedan.
4. Calcular rol con parámetros versionados por período, revisar y aprobar por persona distinta; generar asiento y obligaciones.
5. Registrar pago y evidencia de IESS/Ministerio; cierre impide recalcular período sin ajuste/reverso trazable.

## 10. Reglas de arquitectura que se derivan del análisis

- Una entidad legal y sus establecimientos tributarios no se equiparan automáticamente con sucursales internas, bodegas o puntos POS.
- Todo dato operativo debe pertenecer a una empresa; todo dato local debe tener sucursal si corresponde. Las relaciones entre dos registros también deben validar empresa y ámbito en servidor/base de datos.
- Los documentos originales fiscales, aduaneros, laborales y contables no se borran físicamente tras emisión, autorización, envío o contabilización. Su corrección se modela como evento/documento relacionado y permitido por norma.
- Un documento debe conservar snapshots de identificación, líneas, cantidad/unidad, moneda, descuentos, base, impuestos, total, reglas/fuentes vigentes y tercero, porque catálogos cambian.
- Los parámetros fiscales y laborales son configuración administrada con doble control, fecha de publicación/activación, fuente, versión, registro de cambio y prueba de impacto.
- Todo cálculo tributario y de nómina debe ser reproducible para la fecha del hecho; las correcciones retroactivas generan ajustes explícitos, no modificación silenciosa de operaciones históricas.
- El ERP debe diferenciar «pendiente de confirmación», «confirmado con evidencia», «no aplica con motivo» y «revisión vencida» en cada obligación de la empresa.
- Las integraciones oficiales manejan colas, idempotencia, reintentos controlados, timeout, rechazo, contingencia y reconciliación. Un error de red no equivale a autorización oficial.
- Los permisos por módulo necesitan alcance por empresa, sucursal, documento sensible y operación; exportar datos personales también es acción privilegiada.

## 11. Decisiones de alcance registradas para completar el análisis

Se adoptan provisionalmente las recomendaciones escritas por el usuario en el texto pegado:

- Visión objetivo: plataforma ERP extensible y multiempresa.
- Mercado inicial: importadoras, exportadoras y distribuidoras en Ecuador.
- Contabilidad: operaciones integradas y herramientas de trabajo para contador.

Estas son hipótesis de producto para organizar el análisis, no decisiones legales. Si el usuario cambia alguna, se ajusta el orden de módulos antes del desarrollo.

## 12. Estado de cierre de la Fase 0

### Completado en esta revisión

- Inventario inicial de módulos y brechas del repositorio.
- Fuentes oficiales de partida para SRI, SENAE, IESS, Ministerio del Trabajo, SPDP y SCVS.
- Matriz normativa por dominio y variables que condicionan la aplicación.
- Trazado de módulos/tablas/endpoints clave a brechas funcionales y controles.
- Flujos objetivo de importación, venta, compra/retención y empleo/nómina.
- Prioridad P0 de aislamiento de empresa/sucursal y brechas de comprobantes, reglas fiscales, contabilidad y datos personales.
- Criterios de arquitectura previos a implementar los módulos.

### Para declarar cerrada la Fase 0 de proyecto

1. Revisar la matriz con el dueño del negocio y confirmar el perfil jurídico/tributario real de la primera empresa piloto, sin compartir claves privadas.
2. Hacer taller con contador/asesor tributario sobre régimen, obligación de facturación, IVA, retenciones, costos de importación, marco contable y reportes del piloto.
3. Hacer revisión laboral para confirmar si el producto incluirá cálculo automático de nómina en la primera salida o solo expediente/calendario.
4. Hacer revisión de protección de datos del SaaS y contratos: roles, encargados, residencia/transferencias, plazos y atención de derechos.
5. Identificar qué puntos de emisión, obligaciones y condiciones de conexión SRI/ECUAPASS deben quedar para la etapa final, sin activar esas integraciones en las fases anteriores.
6. Convertir cada obligación piloto en un criterio de aceptación firmado y una lista de evidencia/escenarios; congelar alcance de la primera versión.

Hasta completar esos puntos, la matriz es una base de análisis y guía de diseño. No se activa cálculo fiscal/laboral como regla general ni se etiqueta al producto como legalmente certificado.

## 13. Primera implementación derivada del análisis

Se implementó una primera corrección acotada en el ciclo de venta/factura:

- Los registros internos de factura ahora quedan asociados a la empresa y sucursal de la venta, con una clave foránea que impide combinaciones de empresa/sucursal incompatibles.
- El identificador interno se numera por empresa, sucursal y año mediante un contador transaccional; no se usa `COUNT(*)` global como secuencial.
- `internal_number` queda separado de `invoice_number`, que se reserva para el número del documento electrónico SRI. Las ventas nuevas se guardan como `not_issued` y sin fecha de emisión ni número tributario hasta que exista un flujo de emisión y autorización.
- La respuesta de creación de venta y el aviso del POS muestran la referencia interna y explican que el documento electrónico SRI está pendiente de emisión.
- La migración conserva en `legacy_number` los números generados por el sistema anterior. Los registros antiguos sin código de autorización dejan de presentarse como facturas emitidas; los datos de origen se preservan.
- Se impide borrar una venta que tenga un registro de factura, para evitar que desaparezca evidencia enlazada.

Archivos: `data/migrations/20261122_invoice_scope_internal_numbers.sql`, `backend/src/sales/invoices.repository.ts` y `backend/src/sales/sales.repository.ts`.

Este cambio prepara el registro interno; no integra el SRI ni asigna secuenciales SRI, establecimiento o punto de emisión. La migración está creada y se aplicará mediante el inicializador normal de base de datos en la siguiente actualización de esquema. No se ejecutaron pruebas ni migraciones en esta revisión.

## 14. Primera corrección de aislamiento en Importaciones

El análisis encontró que las rutas antiguas de Importaciones listaban, consultaban y modificaban operaciones por ID sin filtrar la empresa activa. Se actualizó el flujo controlador → servicio → repositorio para que lista, detalle, alertas/contenedores, actualización de estado y recepción utilicen la empresa de la sesión. El detalle y las relaciones con proveedor, producto y contenedor también se limitan al expediente de esa empresa; las actualizaciones que no encuentran un registro propio responden como no encontrado.

Archivos: `backend/src/imports/imports.controller.ts`, `backend/src/imports/imports.service.ts` y `backend/src/imports/imports.repository.ts`.

Esto cierra el acceso por empresa en las rutas de Importaciones identificadas, pero no declara completo el aislamiento del ERP. Faltan trazado equivalente de todos los módulos y una matriz de permisos por sucursal. Las importaciones siguen siendo entidades de empresa; la asignación de destino a una o varias sucursales debe definirse en el flujo operativo. No se ejecutaron pruebas.
