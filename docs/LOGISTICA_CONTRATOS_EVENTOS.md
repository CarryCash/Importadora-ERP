# Contratos de eventos y auditoría logística

## Sobre operativo

Todo evento pertenece a una empresa y apunta a una operación estable mediante UUID. Las tablas de evento son append-only para el flujo normal de la aplicación. Una corrección requiere un nuevo evento compensatorio con el motivo original; no se reescribe el kardex.

Campos mínimos: `id`, `company_id`, `operation_id` o referencia de origen, `event_type`, `occurred_at`, `recorded_at`, `actor_id`, `from_status`, `to_status`, `reason`, `details` y `correlation_id`/clave de idempotencia cuando el origen sea HTTP. `details` contiene datos adicionales versionados y no debe duplicar datos maestros.

## Familias actuales

| Fuente | Uso |
|---|---|
| `stock_movements` | Kardex cuantitativo para compra, venta, ajuste y corrección de saldo. |
| `storage_movements` | Movimiento físico de ubicación, estado y bodega. |
| `inventory_transfer_events` y recibos | Solicitud, aprobación, despacho, recepción y diferencias de transferencia. |
| `dispatch_events` y sus líneas | Confirmación de salida, cantidades y documento de despacho. |
| `logistics_quality_events` | Inspección, cuarentena y liberación. |
| `logistics_incident_events` | Alta, cambios y transición de estado de incidencia. |
| `logistics_dock_events` | Reserva, llegada, inicio de atención y salida de muelle. |
| `logistics_service_events` | Alta y transición de servicios en sitio. |
| `audit_logs` | Auditoría transversal de actor/empresa/acción cuando la operación usa el servicio de auditoría común. |

No se considera que un evento de negocio esté auditado solo porque exista un `updated_at`. Los cambios de estado tienen que dejar su evento propio.

## Clave de idempotencia HTTP

Los endpoints sensibles aceptan `Idempotency-Key` (8–120 caracteres). Se guarda un hash del cuerpo junto con empresa, operación y clave. Repetir clave y cuerpo devuelve la respuesta anterior; reutilizar la clave con otro cuerpo produce conflicto. La fila y el cambio de inventario/finanzas se escriben en la misma transacción, de modo que no exista una clave completada sin su movimiento de negocio.

Aplicaciones actuales: creación/cierre de recepción, confirmación de despacho, solicitud/despacho/recepción de transferencias, creación/edición/conciliación de conteos y conciliación de gasto logístico. Los cambios de estado conservan además sus propias validaciones, por lo que un cliente antiguo sin clave tampoco puede volver a ejecutar un movimiento confirmado.

## Invariantes de inventario

1. Cambiar una existencia siempre bloquea la fila fuente y valida saldo en la misma transacción.
2. La cantidad negativa se rechaza antes del `UPDATE`; el saldo destino debe respetar bodega, ubicación, estado y capacidad habilitada.
3. Cerrar recepción, despacho, transferencia o conteo escribe cantidades, kardex, historia de la operación y estado final como una sola unidad atómica.
4. Mercancía retenida/dañada queda en estado o ubicación no disponible; liberarla necesita permiso separado cuando la inspección lo requiere.
5. Un evento confirmado no se vuelve a procesar. Diferencias posteriores se registran como nuevo movimiento autorizado y enlazado.
6. Cada referencia seleccionada por el cliente vuelve a validarse contra la empresa propietaria en el backend.

## Invariantes financieras

1. Reconciliar un gasto crea el registro de Finanzas y marca el gasto logístico como conciliado dentro de la misma transacción.
2. Una conciliación ya aplicada no crea otro gasto; claves idempotentes y bloqueo de fila cubren los reintentos concurrentes.
3. Importes y prorrateos se calculan en `NUMERIC` de PostgreSQL; el último renglón absorbe el residuo de redondeo para que la suma distribuida sea idéntica al gasto original.
4. Logística no crea facturas tributarias ni cuentas por pagar paralelas; enlaza la factura/documento y delega los saldos contables en Finanzas.

