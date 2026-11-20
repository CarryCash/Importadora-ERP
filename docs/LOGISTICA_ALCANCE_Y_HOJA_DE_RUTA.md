# Logística: alcance, brechas y hoja de ruta

## Objetivo

Construir Logística como el coordinador del movimiento físico de mercancías y servicios. Inventario conserva existencias, reservas y valoración; Compras, Ventas e Importaciones originan demanda; Finanzas registra obligaciones y asientos; Logística ejecuta, evidencia y mide las operaciones. Se reutilizan los catálogos maestros existentes y no se crean copias de productos, clientes o proveedores.

El alcance se organiza para importadoras, distribuidoras, comercios, empresas con transporte propio o tercerizado y empresas que prestan servicios sin bodega. Las capacidades especializadas se activan según el negocio.

## Matriz A–R

| Área | Estado en el proyecto | Brecha principal antes de considerarla completa |
|---|---|---|
| A. Configuración | Existe configuración logística por empresa y datos de bodega/ubicación. | Terminar versionado, validación de conversiones y reglas de capacidad/compatibilidad. |
| B. Recepción | Hay órdenes/recepciones, diferencias, evidencia y cierre con inventario. | Citas, lectura de códigos desde dispositivo y pruebas de concurrencia/duplicados. |
| C. Almacenamiento | Hay ubicaciones, movimientos, capacidad básica, cuarentena y cross-dock. | Optimización de ubicación, ocupación real por peso/volumen/pallet y reposición automática. |
| D. Preparación y despacho | Hay reservas, picking, packing y confirmación de despacho. | Oleadas y políticas FIFO/FEFO completas con evidencia de salida y fallos parciales. |
| E. Transferencias | Existe solicitud, aprobación, despacho, tránsito, recepción y diferencias. | Pruebas de consistencia, reintentos idempotentes y tratamiento completo de pérdida/daño. |
| F. Transporte (TMS) | Hay transportistas, flota, viajes, paradas, gastos, eventos y POD. | Rutas optimizadas, documentos/licencias con alertas y conciliación contractual completa. |
| G. Devoluciones | Existe flujo cliente/proveedor, inspección y disposición. | Integración más profunda con garantías, notas de crédito y reclamos. |
| H. Inventario y trazabilidad | Hay conteos, movimientos, lotes/series y consulta de trazabilidad. | Índices/consulta escalable y reportes de diferencias con causa raíz. |
| I. Importaciones | Expedientes, eventos, documentos, paquetes y costos logísticos enlazados. | Conciliación de gastos/importación sin doble contabilización y expediente documental completo. |
| J. Exportaciones | Hay expedientes y seguimiento logístico de exportación. | Completar reserva, documentos, restricciones y flujo detallado de despacho internacional. |
| K. Citas y muelles | **Base añadida:** muelles por bodega, citas con referencia a documentos, ventanas sin sobrecupo, llegada/atención/salida y eventos auditados. | Festivos/horarios operativos, capacidad por carga/pallet, políticas avanzadas de prioridad y métricas de permanencia. |
| L. Calidad | Ya hay planes, inspecciones, cuarentena/liberación, temperaturas, alertas e incidentes. | Adjuntos/evidencia, muestreo sectorial configurable y controles de cumplimiento validados por sector. |
| M. Costos | Hay estimado/real, centros, tarifas, aprobación, conciliación idempotente a gastos de Finanzas y prorrateo de importación calculado con `NUMERIC`. | Completar cuentas por pagar/liquidaciones con facturas, pagos y reglas contables, sin duplicar Finanzas. |
| N. Incidencias | **Base añadida:** clasificación, prioridad, origen, responsables/reglas, fechas, estados y eventos auditados. | Adjuntar evidencia, escalamiento, reclamos a terceros y analítica de causa raíz. |
| O. Reportes | **Base añadida:** tablero por empresa con recepciones, despacho, viajes, excepciones, incidencias y costos. | Catálogo de fórmulas, filtros temporales configurables, exportación y OTIF/tiempos/ocupación verificables. |
| P. Automatización | **Base añadida:** reglas versionadas para asignar y fijar vencimiento al crear incidencias. | Scheduler, bandeja de notificaciones, condiciones más amplias, historial de ejecución y reintentos. |
| Q. Activos | **Base añadida:** activos/equipos, estado, bodega y fechas de mantenimiento. | Órdenes de mantenimiento, costo/vida útil, alertas y vínculo con disponibilidad de flota. |
| R. Servicios sin bodega | **Base añadida:** agenda de servicio, contacto/dirección y transiciones auditadas. | Asignación de técnico, ruta, consumos, firma/fotos, facturación y medición de SLA. |

“Base añadida” indica que existe una primera capacidad utilizable, no que el área cubra todos los requisitos empresariales. Las áreas A–J también requieren revisión de los escenarios de aceptación antes de declararlas terminadas.

## Estado del corte de preparación operativa — 26 de octubre de 2026

- Se añadió una agenda K de muelles con ventanas, control de capacidad concurrente, estados de atención y eventos.
- Las acciones logísticas de recepción, despacho, transferencias, conteos y conciliación admiten clave de idempotencia; los descuentos logísticos y de ventas se ejecutan con una condición de saldo suficiente dentro de la transacción.
- La creación y consulta de ventas, cobros, anulaciones e indicadores se limita a la empresa de la sesión; las ventas usan la sucursal activa y el inventario de esa sucursal.
- La conciliación de costos logísticos registra el gasto en la sucursal activa y usa bloqueo/idempotencia. El prorrateo de importación se ejecuta en `NUMERIC` dentro de PostgreSQL.
- Docker Compose ahora define PostgreSQL, pgAdmin, API y frontend. La API aplica esquema/migraciones al arrancar y conserva PostgreSQL en un volumen.
- El build NestJS, la verificación TypeScript del frontend y el build de producción Next.js finalizaron correctamente. No se ejecutaron escenarios de aceptación ni prueba de restauración.

Este corte prepara los flujos básicos para operación controlada; no es una certificación de producción. Antes de procesar inventario real, el responsable del negocio debe ejecutar los escenarios mínimos de aceptación y una restauración de respaldo. El cliente Docker disponible en el entorno de desarrollo es un alias vacío de Windows, así que el build/arranque real de imágenes debe confirmarse en un equipo con Docker Desktop funcional. La salida tributaria ECUAPASS/SRI tampoco está integrada por este trabajo.

## Organización del producto

La navegación de Logística se divide en espacios de trabajo, no en una pantalla saturada:

1. **Centro de control:** indicadores, alertas y pendientes.
2. **Bodegas:** configuración, recepción, almacenamiento, preparación, transferencias, conteos y trazabilidad.
3. **Transporte y entregas:** TMS, flota, rutas, viajes y POD.
4. **Comercio exterior:** expedientes de importación/exportación y costos asociados.
5. **Calidad e incidencias:** inspecciones, cuarentena, reclamos y acciones correctivas.
6. **Costos y servicios:** tarifas, costos, conciliación, activos y servicios en sitio.
7. **Administración:** permisos, reglas, parámetros y auditoría.

Cada lista debe incorporar búsqueda, filtros, paginación del servidor, ordenamiento y estados vacíos apropiados. Los formularios deben reutilizar componentes y conservar una operación como borrador hasta su confirmación.

## Reglas técnicas obligatorias

- Toda entidad operacional pertenece a una empresa; las entidades que afectan inventario también deben identificar sucursal y bodega cuando aplique.
- Validar propiedad de empresa en cada endpoint, incluida toda referencia recibida desde el cliente.
- Cantidades y dinero se almacenan en `NUMERIC/DECIMAL`; usar enteros solo cuando la unidad de negocio lo justifique. Evitar cálculos contables en `float`.
- Cada flujo tiene estados explícitos, transiciones permitidas y razones para rechazo, cancelación o corrección.
- Las operaciones que modifican stock usan transacciones, bloqueos de fila y claves de idempotencia para que el reintento no duplique movimientos.
- Un evento confirmado no se edita silenciosamente. Una corrección genera reverso/compensación y auditoría con actor, fecha, origen y motivo.
- El backend aplica permisos. Ocultar controles en la interfaz solo mejora la experiencia y no sustituye autorización.
- Las reglas por país, documento y sector son configurables/versionadas. Ecuador usa USD y `America/Guayaquil` por defecto, sin fijar las obligaciones del SRI/SENAE como constantes inmutables.
- Una orden interna de despacho y una guía de remisión tributaria son documentos distintos. No afirmar integración SRI/SENAE sin implementación y autorización efectivas.
- No se crea una factura, cuenta por pagar o asiento duplicado dentro de Logística. Finanzas conserva esos datos maestros.

## Hoja de ruta recomendada

### Fase 0 — Integridad y seguridad de la base

Auditar referencias multiempresa/sucursal, permisos, redondeos, concurrencia y transacciones de A–M. Incorporar idempotencia en recepción, despacho, transferencia, conteos y conciliación. Definir los contratos de eventos y auditoría.

**Salida:** escenarios de recepción parcial, cuarentena, transferencia y despacho no producen stock negativo, doble movimiento ni acceso entre empresas.

### Fase 1 — Muelles y bodega esencial

Desarrollar K y cerrar brechas de B–E: citas, ventanas, ocupación, códigos de barras, reposición, conteos y FEFO/FIFO verificable.

**Salida:** recepción → inspección → ubicación → reserva → picking/packing → despacho funciona con trazabilidad desde una única operación.

### Fase 2 — Excepciones, activos y devoluciones

Completar N y Q; vincular incidencias con TMS, recepciones, calidad, inventario y servicios; añadir evidencias, escalamiento y mantenimiento planificado.

**Salida:** daños, atrasos, vencimientos y fallas tienen responsable, plazo, evidencia, resolución y causa raíz.

### Fase 3 — Distribución y costo real

Completar F, M y la conciliación con Finanzas: costeo por pedido/viaje/embarque, facturas de servicios y gastos, aprobación y liquidación sin duplicidad.

**Salida:** costo real y variación se pueden explicar desde el documento de origen y coinciden con Finanzas.

### Fase 4 — Comercio exterior Ecuador

Completar I/J con documentos, hitos, alertas, costos estimados/reales y enlaces a Importaciones. Preparar campos para DAI y documentos requeridos; validar requisitos vigentes con fuentes oficiales antes de automatizar una obligación.

**Salida:** expediente reconstruible, sin afirmar transmisión a ECUAPASS/SRI si no se integró.

### Fase 5 — Operación sin bodega y optimización

Completar R y P; técnicos, rutas, prueba de servicio, SLA, automatizaciones con reintentos y reportes O. La optimización/IA se incorpora después de asegurar datos limpios y métricas estables.

**Salida:** una empresa de servicios puede planificar y cerrar trabajos en sitio; el tablero tiene fuentes, fórmulas y periodos documentados.

## Indicadores y definición de cálculo

- **OTIF:** entregas elegibles entregadas completas y dentro de la ventana acordada / total de entregas elegibles. Definir exclusiones y fuente de fecha prometida antes de mostrarlo.
- **Ciclo de pedido:** tiempo entre liberación de preparación y entrega/POD; mostrar mediana y percentil 90, separado por tipo de entrega.
- **Exactitud de inventario:** líneas contadas sin diferencia / líneas contadas; registrar tolerancia y fecha de corte.
- **Costo por entrega:** costos conciliados atribuibles / entregas completadas. No mezclar presupuestos con costos reales.
- **Ocupación:** capacidad usada / capacidad habilitada en unidades compatibles (volumen, peso o posiciones), nunca sumar magnitudes incompatibles.
- **Tiempo de recepción/preparación:** timestamps definidos del flujo, segmentados por bodega y horario operativo.

El tablero creado es una primera lectura operativa, no sustituye estos indicadores auditables; estos deben añadirse al completar sus fuentes y definiciones.

## Escenarios mínimos de aceptación

Antes de producción se debe comprobar: recepción parcial con faltantes/daños; cuarentena que impida disponibilidad; transferencia parcial; despacho por encima de disponible rechazado; reintento que no duplique movimientos; entrega fallida y reprogramación; devolución no vendible que no se reintegre al stock disponible; trazabilidad de lote punta a punta; costo importado distribuido una sola vez; permiso denegado en API; y conciliación que coincida con Finanzas.

