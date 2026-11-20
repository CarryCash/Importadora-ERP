# Módulo Clientes: operación y contrato

## Qué quedó habilitado

- Clientes identificados por empresa, con código interno `CLI-000001`, tipo natural/jurídico, identificación, nombre comercial y representante legal.
- Búsqueda, filtros por estado/tipo/ubicación/cartera y paginación desde PostgreSQL.
- Perfil comercial con contactos, direcciones múltiples, ventas recientes, cartera estimada, actividad e historial de crédito.
- Contactos y direcciones pueden agregarse, editarse y desactivarse sin borrar el historial. Las direcciones de facturación y entrega tienen valores predeterminados independientes.
- Un cliente se desactiva en vez de borrarse. No se permite seleccionarlo en nuevas ventas.
- Los cupos empiezan en cero. Los cambios se solicitan, guardan motivo y necesitan aprobación de otra persona autorizada; el cambio aplicado queda en el historial.
- Exportación CSV e importación CSV parcial con resultado por fila. Las filas duplicadas o inválidas se informan sin cancelar las filas correctas.

## API principal

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/api/customers?search=&status=&type=&province=&city=&balance=&page=&pageSize=` | `customers.read` |
| GET | `/api/customers/:id` | `customers.read` |
| POST/PATCH | `/api/customers`, `/api/customers/:id` | `customers.write` |
| DELETE | `/api/customers/:id` | `customers.write` (baja lógica) |
| POST/PATCH/DELETE | `/api/customers/:id/contacts` y `/api/customers/:id/addresses` | `customers.write` |
| POST | `/api/customers/:id/credit-requests` | `customers.credit.manage` |
| PATCH | `/api/customers/:id/credit-requests/:requestId/review` | `customers.credit.approve` |
| GET | `/api/customers/export.csv` | `customers.export` |
| POST | `/api/customers/import.csv` | `customers.write` |

Las listas devuelven `{ items, total, page, pageSize }`. El CSV de importación usa los encabezados del CSV exportado y admite hasta 5.000 filas y 1,5 MB. No reactiva clientes inactivos, no concede crédito y no consulta automáticamente el registro oficial del SRI.

## Límites de los saldos mostrados

La cartera se deriva de ventas y pagos registrados en este proyecto. El sistema todavía no tiene un libro de cuentas por cobrar con vencimientos contractuales, aplicaciones de notas de crédito y antigüedad contable por factura; por ello el indicador de vencido se aproxima usando la fecha de venta y debe leerse como estimación. No representa una consulta al SRI ni una verificación oficial de RUC.

## Despliegue

La migración `20261045_customer_relationship_management.sql` agrega campos y tablas relacionadas. Con Docker, reconstruye los servicios y abre `http://localhost:3000/customers`; el backend aplica las migraciones al arrancar. La compilación de backend y el build de producción del frontend se completaron para este corte.
