# Especificación funcional definitiva: módulo Productos

**Estado:** especificación para guiar las siguientes fases de implementación  
**Ámbito:** catálogo comercial multiempresa para una importadora ecuatoriana  
**Criterio de diseño:** Productos es el maestro comercial. Inventario conserva cantidades y movimientos; Compras conserva compras y costos de proveedor; Importaciones conserva costos de nacionalización; Ventas y Finanzas conservan operaciones emitidas y contabilizadas.

## 1. Objetivo y límites

El módulo debe permitir crear, consultar, mantener y clasificar el catálogo de la empresa, además de distribuir información comercial aprobada a Ventas, Compras, Importaciones, Inventario y Logística.

Productos es propietario de identidad, clasificación, características, dimensiones, medios, referencias de proveedor, listas comerciales y clasificación arancelaria. No escribe existencias, kardex, recepciones, costos contabilizados ni datos históricos de documentos emitidos. Los datos derivados de otros módulos se consultan con su origen y fecha.

Una actualización del maestro no reescribe una factura o transacción histórica. Los documentos operativos conservan una instantánea del nombre, SKU, precio, impuesto, unidad y demás atributos aplicados cuando se registraron.

## 2. Estado del módulo en el proyecto

La base existente ya ofrece una pantalla de catálogo, vistas de tarjetas y tabla, filtro y selección, formulario de creación por secciones, carga de archivos, catálogo separado de categorías y marcas, listas de precios con aprobación administrativa y una lectura agregada de existencias.

La implementación actual debe considerarse **base funcional, no cierre de alcance**:

| Área | Estado actual | Trabajo pendiente para cumplir esta especificación |
| --- | --- | --- |
| Catálogo | Tarjetas/tabla, búsqueda, filtros, orden y selección | Filtros avanzados, estado archivado, persistencia de preferencias y búsqueda indexada |
| Importación/exportación | Importación CSV y exportación CSV/Excel compatible | XLSX real, vista previa, validación por fila, reintentos y reporte descargable |
| Producto | Creación inicial y datos adicionales en JSONB | Edición/detalle, relaciones normalizadas, validaciones completas y transacciones de guardado |
| Identificación | Código principal y validación GTIN en backend | Tabla de identificadores alternativos y unicidad transaccional por empresa |
| Variantes | Variantes como productos hijos con SKU, código, imagen y atributos propios; cada hijo tiene identidad independiente | Matriz para generar combinaciones y mayor cobertura de códigos/documentos por variante |
| Categorías y maestros | Gestión independiente de categoría, marca, fabricante, modelo y familia | Vincular productos mediante claves foráneas y evitar texto libre como valor principal |
| Fotografías y documentos | Carga local privada, asociación al producto/variante, versión inmutable, checksum, descarga autorizada y archivo trazable | Trasladar almacenamiento local a almacenamiento persistente de producción y migrar los archivos URL heredados |
| Precios | Listas, reglas por volumen, vigencias, alcance comercial, separación solicitante/aprobador, bitácora e instantáneas en ventas/cotizaciones | Tipo de cambio aprobado para moneda distinta de USD y consulta autorizada de costos reales |
| Costos | Algunos valores informativos en el formulario | Consultas de costo reales con origen, fecha y permisos; nunca capturarlos como costo contabilizado |
| Proveedor por producto | No implementado | Referencias, MOQ, empaque, moneda, proveedor preferido e historial de compra |
| Auditoría | Cambios del producto registrados por campo con antes/después, actor, motivo y correlación; operaciones de medios también dejan eventos | Extender auditoría correlacionada a catálogos maestros e integraciones restantes |
| Archivo | Desactivación disponible | Estado archivado reversible y reglas de conservación operativa |

La migración y APIs que ya existen se conservan como punto de partida. Las ampliaciones deben ser migraciones aditivas y compatibles con el flujo de inicialización de base de datos del proyecto.

## 3. Navegación y pantallas

### 3.1 Menú Productos

El menú del módulo tendrá estas entradas:

1. Resumen y catálogo.
2. Nuevo producto.
3. Categorías y atributos.
4. Marcas, fabricantes, modelos y familias.
5. Variantes e identificadores.
6. Unidades y empaques.
7. Listas de precios.
8. Proveedores por producto.
9. Clasificación de importación.
10. Importar y exportar.

El historial será accesible desde el detalle del producto. Las entradas se muestran según permiso; la navegación no sustituye controles de autorización del API.

Rutas previstas: `/products`, `/products/new`, `/products/[id]`, `/products/catalogs`, `/products/variants`, `/products/units`, `/products/pricing`, `/products/suppliers`, `/products/import-classification`, `/products/import-export`.

### 3.2 Resumen y catálogo (`/products`)

Indicadores: total, activos, inactivos, pendientes, sin identificador, sin categoría, incompletos y creados recientemente. Cada indicador aplica un filtro real al listado.

Herramientas: búsqueda por nombre comercial, SKU, código, marca, modelo y referencia; filtros por estado, tipo, categoría, marca, proveedor, familia y completitud; ordenamiento estable; selección múltiple; acciones por permiso; importación y exportación; cambio de vista tarjetas/tabla.

**Tarjeta:** fotografía, nombre comercial, SKU, marca, precio vigente y estado.  
**Tabla configurable:** imagen, SKU, nombre, categoría, marca, tipo, precio vigente, estado, stock de solo lectura y fecha de actualización. El stock proviene de Inventario con alcance de sucursal/bodega visible al usuario e incluye enlace al detalle correspondiente.

Acciones de selección: activar, desactivar, archivar, restaurar, asignar categoría/familia, exportar seleccionados y duplicar como borrador. Acciones irreversibles no se ofrecen como acción masiva sin confirmación y conteo.

### 3.3 Detalle y formulario (`/products/new`, `/products/[id]`)

Crear y editar son páginas completas, no modales. Crear conduce al mismo formulario vacío; editar lo abre con los datos actuales. El formulario usa navegación por pestañas, indicador de campos obligatorios/incompletos, autoguardado de borrador local opcional y guardado explícito.

#### Pestaña A. Información general

- SKU manual o generado; debe ser único por empresa y puede conservar alias anteriores.
- Nombre comercial obligatorio y nombre interno opcional.
- Descripción breve y descripción larga.
- Tipo: producto físico, servicio, combo/kit o muestra.
- Categoría y subcategoría jerárquicas; marca, fabricante, modelo, familia y referencia.
- Estado: borrador, activo, inactivo o archivado.
- Creador, fecha de creación y última modificación, de solo lectura.

Los campos de relación se eligen de catálogos, nunca se escriben como texto libre salvo que exista permiso para crear el catálogo de referencia.

#### Pestaña B. Identificación

- Un código principal y cero o más identificadores alternativos tipados (EAN-8, UPC-A, EAN-13, GTIN-14, interno, referencia del fabricante, proveedor y código anterior).
- No todos son obligatorios. Cada valor se normaliza y su formato se valida de acuerdo con el tipo.
- GTIN valida longitud y dígito de control; valores duplicados se rechazan dentro de la empresa, incluyendo concurrencia.
- El identificador anterior se conserva como alias histórico y no se reutiliza para otro producto.

#### Pestaña C. Características y atributos

Los atributos se definen por categoría con nombre, tipo de dato, unidad, obligatoriedad, valores permitidos y orden. Tipos: texto, número, decimal, booleano, fecha, lista y multiselección. Una subcategoría hereda atributos de sus superiores; la definición efectiva permite sobrescritura explícita y validada.

El producto guarda valores tipados vinculados a la definición. Cambiar de categoría no elimina valores: el sistema avisa qué atributos dejarán de aplicar y solicita confirmación antes de conservarlos como atributos no clasificados o descartarlos.

#### Pestaña D. Variantes

Producto padre y variante comercializable son entidades distintas. Cada variante tiene SKU propio, estado, códigos, atributos, fotografía y dimensiones; puede mantener existencias independientes al tener identidad de producto propia para Inventario. La matriz permite generar combinaciones de atributos (por ejemplo, color/talla) y seleccionar cuáles se comercializan.

No se representarán variantes como texto JSON o líneas descriptivas cuando participen en ventas, compras o inventario.

#### Pestaña E. Unidades y empaques

Unidad base, compra, venta y almacenamiento; factor de conversión positivo y dirección explícita; empaque, unidades/caja, paquete y pallet; precisión decimal. Las conversiones se calculan desde una unidad base y no alteran saldos históricos. Cambiar factores con movimientos existentes requiere motivo, vigencia y aprobación de Inventario.

#### Pestaña F. Dimensiones y logística

Peso neto/bruto, largo/ancho/alto, volumen calculado o declarado, unidades de medida, tipo de embalaje, dimensiones por empaque, cantidad por caja, apilabilidad, manipulación y almacenamiento. Valores no negativos; volumen calculado conserva dimensiones/unidad fuente. Logística e Importaciones consultan la versión vigente.

#### Pestaña G. Fotografías y documentos

Fotografía principal, galería y archivos asociados al producto o variante: ficha técnica, manual, certificado, garantía, hoja de seguridad y documento del fabricante. Cada archivo conserva nombre original, MIME validado por contenido, tamaño, clave de almacenamiento, usuario/fecha de carga, versión, categoría y estado.

Reemplazar crea una nueva versión; no borra el archivo relacionado con operaciones anteriores. Se permiten previsualizar formatos admitidos y descargar según permisos. La interfaz muestra carga, fallo, reintento y progreso.

#### Pestaña H. Información comercial

Los precios se mantienen en listas separadas. El formulario presenta precio vigente calculado y permite navegar a la lista correspondiente; no sobrescribe el historial. Impuesto por producto/regla fiscal, moneda y vigencia tienen origen claro. Margen objetivo y precio mínimo son parámetros de política y se validan en Ventas en el servidor.

#### Pestaña I. Costos

Panel de consulta, no de contabilización: costo referencial manual claramente identificado; último costo de compra (Compras), promedio (Inventario), nacionalización (Importaciones) y gastos atribuibles con vínculo a la operación de origen, moneda, fecha y método. Los datos derivados son de solo lectura; un valor ausente no se reemplaza por cero presentado como costo real.

#### Pestaña J. Clasificación de importación

País de origen y fabricación, fabricante extranjero, partida/subpartida, unidad comercial, peso documental, restricciones, permisos y observaciones. Cada clasificación guarda fuente, vigencia, estado de revisión, responsable, fecha y evidencia. No se autocompleta ni aprueba una partida arancelaria como correcta sin revisión autorizada.

### 3.4 Catálogos maestros

La sección independiente gestiona categorías, marcas, fabricantes, modelos y familias. Categorías/familias soportan jerarquía sin ciclos; cada categoría admite descripción, imagen, atributos, estado y orden. Marca admite logotipo, fabricante, país, web, descripción y estado. Modelos se vinculan a marca. Todos los registros pertenecen a una empresa y poseen estado activo/inactivo.

### 3.5 Listas de precios

Se mantienen listas minoristas, mayoristas, distribuidor y especiales. Una lista tiene alcance global, por cliente, segmento y/o sucursal; moneda; regla de redondeo; vigencia; estado; descuento máximo autorizado y responsable.

Las reglas contienen producto/variante, cantidad mínima, precio, descuento por volumen y vigencia. Se selecciona la regla aplicable por mayor cantidad mínima y fecha válida. Los límites de descuentos se combinan y validan en el servidor; una interfaz no puede elevarlos.

Toda modificación queda pendiente hasta revisión autorizada. La aprobación almacena revisor, fecha y decisión; una lista rechazada o pendiente no se ofrece en Ventas. Se conserva historial antes/después. Monedas distintas de la moneda de venta requieren tipo de cambio con fecha y fuente antes de calcular totales; no se aplica una conversión implícita.

### 3.6 Proveedores por producto

Relación N:M producto-proveedor con código y nombre del proveedor, precio cotizado, moneda, MOQ, plazo estimado, origen, unidad y empaque de compra, proveedor preferido, fechas de vigencia y última compra enlazada a Compras. Las cotizaciones no se presentan como costo real contabilizado.

### 3.7 Historial y auditoría

La pestaña Historial muestra creación y cambios con fecha/hora, actor, campo, valor anterior/nuevo, motivo y origen (usuario, importación o integración). Eventos inmutables; correcciones generan un evento nuevo. No se registra información sensible innecesaria. La actividad de medios y clasificaciones también queda trazada.

## 4. Modelo de datos propuesto

Todas las entidades de negocio llevan `company_id`, `created_at`, `updated_at` cuando aplique y restricciones de empresa en las relaciones.

| Entidad | Propósito y claves principales |
| --- | --- |
| `products` | Maestro del producto; SKU, nombre, tipo, estado, relación a categoría/marca/modelo/familia, producto padre si corresponde |
| `product_identifiers` | Varios identificadores por producto/variante; tipo, valor normalizado, principal, vigencia; índice único por empresa y tipo/valor |
| `product_categories` | Árbol de categorías con descripción, imagen, orden y estado |
| `product_attribute_definitions` | Definiciones tipadas vinculadas a categoría y reglas de validación |
| `product_attribute_values` | Valor tipado por producto/variante y definición |
| `product_variants` o productos hijos | Identidad comercializable y SKU/códigos propios; relación padre, atributos y estado |
| `product_units` / `product_unit_conversions` | Unidades del producto, factores y vigencia |
| `product_media` / `product_media_versions` | Archivo, categoría, asociación, metadatos y versiones inmutables |
| `product_price_lists` | Alcance, moneda, vigencia, política de descuento y aprobación |
| `product_price_rules` / `product_price_history` | Precio por producto, volumen, fechas y rastro de aprobación/cambio |
| `product_suppliers` | Proveedor-producto, referencias y condiciones comerciales |
| `product_import_classifications` | Clasificación arancelaria versionada y revisada |
| `product_audit_events` | Eventos inmutables de cambios y actor |

Los campos flexibles JSONB se reservan para metadatos auxiliares; no sustituyen relaciones/valores normalizados que ventas, compras, inventario o validaciones necesiten consultar.

## 5. API objetivo

Rutas existentes a preservar: `GET/POST /api/products`, `GET /api/products/:id`, `PATCH /api/products/:id/status`, cargas de archivos, `/api/product-catalog/:type` y `/api/product-pricing/*`.

Ampliaciones propuestas (respuestas paginadas y con filtro de empresa):

| Método | Endpoint | Uso |
| --- | --- | --- |
| `PATCH` | `/api/products/:id` | Actualizar campos maestros con validación y auditoría |
| `GET` | `/api/products/:id/history` | Historial paginado |
| `POST` | `/api/products/:id/archive` | Archivar con motivo y chequeo de referencias operativas |
| `POST` | `/api/products/:id/restore` | Restaurar según política |
| `GET/POST/PATCH` | `/api/products/:id/identifiers` | Gestionar códigos alternativos |
| `GET/POST/PATCH` | `/api/products/:id/variants` | Gestionar variantes reales |
| `GET/POST/PATCH` | `/api/product-catalog/categories/:id/attributes` | Definir atributos de categoría |
| `GET/POST/PATCH` | `/api/products/:id/units` | Unidad y conversiones |
| `GET/POST/PATCH` | `/api/products/:id/suppliers` | Proveedor por producto |
| `GET/POST/PATCH` | `/api/products/:id/import-classifications` | Clasificación y revisión |
| `POST` | `/api/products/imports` | Crear trabajo de importación y validación en vista previa |
| `GET` | `/api/products/imports/:id` | Estado, resumen y errores por fila |
| `GET` | `/api/products/exports` | Exportación CSV/XLSX con filtros permitidos |
| `GET` | `/api/products/:id/cost-snapshot` | Consulta de costos con origen y permisos |

Los endpoints de búsqueda/listado aceptan `search`, filtros, `sort`, `page` y `pageSize` con topes de servidor. Los endpoints de Inventario siguen siendo la única fuente de cantidades.

## 6. Validaciones y reglas

1. SKU normalizado y único por empresa; una colisión muestra alternativa, no reemplaza otro producto.
2. Identificadores validados por tipo, checksum cuando corresponda y unicidad atómica por empresa.
3. Relaciones (categoría, marca, fabricante, familia, proveedor, cliente y sucursal) deben pertenecer a la misma empresa.
4. Árboles sin ciclos; cambio de padre validado también en el servidor.
5. Tipos, moneda, vigencias, descuentos, conversiones y cantidades se validan del lado servidor con precisión decimal.
6. No se permite vender, importar ni comprar un producto archivado; un producto inactivo sigue disponible para consultar operaciones antiguas.
7. Desactivar no elimina relaciones ni stock. Archivar exige explicación y conserva histórico.
8. Eliminar físicamente solo se permite a un administrador cuando no existen referencias; la conducta normal es archivar.
9. Cambios a precio/lista requieren aprobación antes de usarse. Ningún descuento efectivo puede exceder la política aplicable sin permiso explícito de excepción.
10. Un producto servicio no requiere stock físico; un combo/kit necesita definición de componentes antes de descontar inventario.
11. Importaciones masivas validan todas las filas primero, permiten previsualizar altas/actualizaciones/errores y no aplican parcialmente sin elección explícita.
12. Las fechas se almacenan con zona/fecha inequívoca y se presentan en la zona configurada de la empresa.

## 7. Permisos

| Permiso lógico | Lectura/acción |
| --- | --- |
| `products.read` | Consultar catálogo, ficha, catálogos maestros, precios permitidos e historial según alcance |
| `products.write` | Crear/editar borradores, categorías, referencias, relaciones, cargar archivos y solicitar cambios comerciales |
| `products.archive` | Archivar/restaurar producto y registrar motivo |
| `products.price.approve` | Aprobar/rechazar cambios de listas y límites de descuento |
| `products.import` | Previsualizar/aplicar cargas masivas |
| `products.export` | Exportar campos permitidos |
| `inventory.read` | Ver stock resumido y abrir Inventario |
| `purchases.read` / `imports.read` | Ver datos de costo/proveedor del origen respectivo |

Durante transición, los permisos no creados pueden mapearse a permisos actuales explícitamente. La aprobación de precio no debe depender de un control visual ni solo de que el usuario sea administrador; el API comprueba permiso/rol y evita que el solicitante apruebe su propia solicitud cuando se habilite aprobación de dos personas.

## 8. Seguridad, privacidad y operación

- Todas las consultas y mutaciones se limitan a `company_id`; las listas por sucursal también respetan `branch_ids` del usuario.
- Validar contenido real del archivo, tamaño, extensión permitida y autorización. Usar nombres opacos, descarga autorizada, almacenamiento persistente y límites configurables; no confiar en MIME declarado por el navegador.
- Metadatos del documento no contienen secretos. Registro de acceso conforme a política de retención.
- Paginar; evitar llamar Inventario por producto. Stock se obtiene mediante un endpoint agregado con el alcance del usuario.
- Índices para SKU, códigos, nombre normalizado, categoría/marca y vigencias comerciales.
- Operaciones de importación, aprobación, conversión de unidades y archivo son transaccionales e idempotentes donde aplique.
- Errores de validación identifican campo/fila y no filtran datos de otras empresas.

## 9. Roadmap de implementación

### Fase 1. Maestro confiable

Edición y ficha de producto, relaciones reales a categoría/marca, estado/archivo, identificadores alternativos, atributos por categoría, auditoría inicial y vínculo del stock de lectura. Import/export con vista previa y validación robusta.

**Salida:** crear, buscar, editar, activar, desactivar, archivar y restaurar sin perder trazabilidad; todas las relaciones quedan dentro de la empresa.

### Fase 2. Variantes, unidades y logística

Variantes como identidades comercializables, códigos por variante, unidades y conversiones, dimensiones y atributos tipados; integración controlada con Inventario y Logística.

**Implementado:** variantes como productos hijos con SKU, códigos, atributos e imagen propios; unidades y conversiones dirigidas con precisión, vigencia y aprobación requerida cuando existen lotes; perfiles logísticos versionados con dimensiones, embalaje, volumen y condiciones de manipulación/almacenamiento. Ventas y las órdenes de compra seleccionan una unidad comercial y convierten a unidad base dentro de la transacción; conservan cantidad, unidad y factor originales. Ventas descuenta existencias en unidad base y recepción usa el perfil logístico vigente para comprobar capacidad por peso, volumen y pallets. Migraciones: `20261107_product_variants_units_logistics.sql`, `20261108_sales_product_units.sql` y `20261109_purchase_order_product_units.sql`.

**Pendiente para cerrar la fase:** integrar unidades en la planificación de Importaciones y ampliar el consumo de perfiles a las demás operaciones de Logística. Inventario conserva cantidades enteras en unidad base; Ventas y Compras admiten cantidades comerciales decimales solo si su conversión resulta en una cantidad entera de unidad base. Las conversiones no reescriben saldos ni movimientos históricos.

**Salida:** cada variante con existencias independientes puede moverse y venderse con SKU/unidad correctos; las conversiones no modifican movimientos históricos.

### Fase 3. Comercial y costos

**Implementado:** editar una lista o regla vuelve a solicitar aprobación; quien solicita no puede aprobar su propio cambio; el rechazo requiere motivo; la bitácora conserva creación, edición, solicitud, aprobación, rechazo y activación. Ventas y cotizaciones validan en servidor el estado, vigencia, sucursal/cliente, descuentos y elegibilidad del producto. Las cotizaciones nuevas quedan limitadas a la empresa del usuario, toman precios aprobados/vigentes y guardan precio e IVA por línea. Ventas y cotizaciones guardan instantáneas de lista y moneda. Migraciones: `20261110_pricing_approval_audit.sql` y `20261111_pricing_document_snapshots.sql`.

**Pendiente:** tipos de cambio aprobados para listas no USD, política de excepción con permiso específico y paneles de costos reales con origen/fecha desde Compras, Inventario e Importaciones.

**Salida:** cotización y venta seleccionan el precio autorizado vigente, guardan su instantánea y rechazan descuentos no autorizados; monedas distintas de USD permanecerán fuera de Ventas hasta que exista una conversión aprobada.

### Fase 4. Proveedores e importación

**Implementado:** relación producto-proveedor versionada con código de proveedor, moneda/costo cotizado, MOQ, plazo, país, unidad, empaque y proveedor preferido; cada condición conserva historial. La clasificación arancelaria es un registro independiente con partida/subpartida validada por formato, fuente, enlace/evidencia cargada desde el PC, restricciones, permisos, peso y vigencia. Las propuestas quedan pendientes y requieren revisión por Importaciones, con separación entre solicitante y revisor; el rechazo pide motivo. Al crear una orden de compra se guardan instantáneas de referencia y cotización del proveedor asociado; al crear una importación, la línea conserva proveedor-producto y clasificación aprobada vigentes en la fecha del embarque. Migraciones: `20261112_product_suppliers_import_classifications.sql` y `20261113_purchase_supplier_product_snapshots.sql`.

**Pendiente:** selección manual de una clasificación aprobada para cada línea cuando hay varias alternativas aplicables, consumo de origen/proveedor en más pantallas de Compras, y validación de permisos/certificados regulatorios específicos por partida antes de nacionalización.

**Salida:** el artículo propuesto a compra conserva identidad/proveedor y la clasificación aduanera aprobada es rastreable a fuente y fecha.

### Fase 5. Multimedia y auditoría completa

**Implementado:** documentos privados versionados asociados al producto (incluidas las variantes, que tienen identidad de producto propia), con carga desde el PC, categorías de medio, orden, fotografía principal, descripción, descarga autenticada, suma de verificación SHA-256 y archivo lógico. Las fotografías principales generan además una copia para mostrarse en el catálogo. Reemplazar crea una versión nueva y conserva las anteriores; motivo requerido para reemplazo, cambios de metadatos y archivo. La auditoría del producto conserva antes/después por campo, actor, fecha, motivo y correlación; creación, reemplazo y archivo de medios también se registran. Migraciones: `20261114_product_media_versions_audit.sql` y `20261115_product_primary_media_urls.sql`.

**Pendiente:** mover los archivos del disco local a almacenamiento persistente de producción, definir retención/limpieza segura y migrar los medios heredados que todavía se guardan como URL o JSON.

**Salida:** reemplazar una ficha o certificado no altera documentos vinculados a una operación anterior y se puede saber quién hizo el cambio.

### Fase 6. Herramientas avanzadas

Plantillas, kits/componentes, sustitutos, relacionados, etiquetas, generación de códigos, automatizaciones y flujos de importación a escala.

**Implementado:** relaciones de componentes de kit con cantidad, sustitutos y productos relacionados; catálogo de etiquetas por empresa; generación de SKU único con evento de auditoría; plantillas CSV/XLSX y carga en lotes de hasta 1.000 productos con resultado y errores por fila. Los componentes son datos maestros y no escriben existencias; el movimiento y disponibilidad continúan siendo responsabilidad de Inventario. Migración: `20261116_product_advanced_tools.sql`.

**Pendiente:** generación de etiquetas imprimibles con simbologías GS1/QR configurables; combinaciones masivas de variantes; flujos de automatización configurables y procesamiento de importaciones en segundo plano con vista previa, reintento idempotente y reporte descargable. Los kits aún requieren una integración explícita con Ventas/Inventario para reservar o descontar sus componentes al despachar.

**Salida:** funciones avanzadas mantienen las mismas reglas de permisos, inventario y trazabilidad.

## 10. Criterios de aceptación globales

- No existe modificación del stock desde Productos.
- Usuario de otra empresa no puede enumerar ni asociar catálogos, archivos, precios o productos.
- Producto archivado conserva sus relaciones históricas y deja de aparecer como elegible en nuevas operaciones.
- Variantes con stock propio son seleccionables por su identidad y no comparten saldo accidentalmente con el padre.
- Un cambio de tarifa no altera ventas/cotizaciones históricas y conserva valor anterior/nuevo, autor y vigencia.
- Una lista no aprobada, vencida, de otra sucursal o incompatible con el cliente no aparece ni puede forzarse en API.
- Costos consultados muestran fuente/fecha y nunca se contabilizan desde Productos.
- Importación de archivo inválido informa errores por fila y deja los registros sin cambios hasta confirmar aplicación.
- Navegación y acciones se ocultan por permiso, y cada endpoint repite la autorización en servidor.

## 11. Decisiones pendientes antes de iniciar las fases posteriores

Estas decisiones no bloquean el maestro básico; deben acordarse antes de desarrollar la función relacionada:

1. Política de SKU: secuencia por empresa, prefijo por familia o manual con sugerencia.
2. Si las variantes viven en tabla propia o como productos hijos visibles en el catálogo (se recomienda producto hijo vinculado al padre para reutilizar Inventario existente).
3. Unidad base y reglas de conversión para productos fraccionables; redondeo permitido por operación.
4. Moneda base de empresa, proveedor de tipo de cambio y permisos de excepción.
5. Aprobación de precios: un aprobador administrativo o doble control con separación solicitante/aprobador.
6. Retención y acceso a documentos técnicos/comerciales y ubicación de archivos en producción.
7. Motivos requeridos para archivar/desactivar y reglas si todavía hay stock, órdenes abiertas o contratos vigentes.
8. Campos de costo que pueden ver Ventas, Compras y cada rol.

**Siguiente paso recomendado:** completar el flujo de tipo de cambio aprobado y consulta de costos reales antes de habilitar listas en otras monedas o presentar costos como información vigente.
