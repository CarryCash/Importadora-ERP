# Importadora ERP

ERP para ventas, inventario, compras e importaciones, con interfaz en Next.js y API en NestJS/PostgreSQL.

## Desarrollo local con pnpm

1. Copia `.env.example` a `.env` para Docker y `backend/.env.example` a `backend/.env`. Configura contraseñas seguras y un `JWT_SECRET` aleatorio de al menos 32 caracteres.
2. Instala todo desde la raíz con `pnpm install`.
3. Inicia PostgreSQL con `docker compose up -d db` desde la raíz.
4. Ejecuta `pnpm init:db` para crear las tablas y preparar las columnas fiscales del POS.
5. En `backend/.env`, define temporalmente las variables `BOOTSTRAP_ADMIN_*` y ejecuta `pnpm create:admin` para crear el primer administrador. Después quítalas del archivo.
6. Inicia la API con `pnpm dev:backend` y Next.js con `pnpm dev:frontend` en dos terminales desde la raíz.

Next.js sirve `/api/*` como proxy al backend. El frontend corre en el puerto 3000 y la API en el 3001 por defecto. `pnpm build` compila ambos proyectos.

## Operar con Docker Desktop

1. Inicia Docker Desktop y espera a que indique que el motor está funcionando.
2. En la raíz del proyecto, copia `.env.example` como `.env`. Define contraseñas seguras y un `JWT_SECRET` aleatorio de al menos 32 caracteres (por ejemplo, genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
3. Construye e inicia el ERP: `docker compose up -d --build`.
4. Revisa los servicios: `docker compose ps`. La primera ejecución espera PostgreSQL, compila con pnpm, aplica el esquema y migraciones y luego inicia API y web.
5. Abre `http://localhost:3000`. pgAdmin queda en `http://localhost:5050`; la API responde en `http://localhost:3001`.

Para ver errores de arranque usa `docker compose logs -f backend frontend`. Para detener los servicios sin borrar los datos usa `docker compose down`; la base permanece en el volumen `importadora-db-data`. No uses `docker compose down -v` salvo que quieras eliminar permanentemente esa base.

## POS Ecuador

El punto de venta permite consumidor final, varias formas de pago, vuelto en efectivo, descuentos y cálculo de IVA por producto. El administrador puede cambiar la tarifa con `PATCH /api/products/:id/tax-rate` y un cuerpo como `{"iva_rate": 0}`. La tarifa inicial es 13% y puede configurarse entre 0% y 15% según el producto y su tratamiento tributario.

El registro de la venta y del número interno de factura no equivale a autorización de un comprobante electrónico del SRI. Para producción se requiere conectar la emisión, firma digital y transmisión de comprobantes del contribuyente.

Antes de usar el POS con una base existente, aplica `data/migrations/20261025_pos_ecuador.sql`.
