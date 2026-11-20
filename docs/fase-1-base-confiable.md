# Fase 1: base confiable

## Migración de base de datos

Las migraciones SQL de `data/migrations` se aplican en orden y se registran en `schema_migrations`. Con Docker Desktop iniciado y PostgreSQL disponible:

```powershell
pnpm init:db
```

La migración `20261026_phase1_foundation.sql` conserva la información existente y la asigna al espacio de trabajo inicial. Crea empresas, sucursales, membresías, permisos por acción, preferencias persistentes y auditoría. Los tokens antiguos se asignan temporalmente al espacio inicial; vuelve a iniciar sesión para recibir los permisos actualizados.

La base ya tiene claves de empresa en los datos principales, pero aún no debe crearse ni seleccionarse una segunda empresa: primero hay que completar los filtros de pertenencia a empresa en todos los repositorios. Hasta cerrar esa tarea, la aplicación opera con un solo espacio de trabajo para impedir que una cuenta vea datos de otra empresa.

## Respaldo

Desde PowerShell, en la carpeta del proyecto:

```powershell
.\scripts\backup-db.ps1
```

El respaldo comprimido se guarda en `backups/`, carpeta excluida de Git. Cópialo también a un medio seguro fuera del equipo; el archivo no está cifrado.

## Restauración segura

La restauración crea una base nueva y no sobrescribe `importadora`:

```powershell
.\scripts\restore-db-to-new.ps1 -BackupPath .\backups\importadora-AAAAMMDD-HHMMSS.dump -NewDatabaseName importadora_restore_validacion
```

Revisa la base restaurada antes de cambiar la configuración del backend para apuntar a ella. El script no elimina ni reemplaza bases existentes.

## Alcance pendiente de la fase

- Completar el aislamiento por empresa y sucursal en todas las lecturas, escrituras, reportes y transacciones.
- Añadir pantalla de administración de sucursales y asignaciones por usuario.
- Incorporar retención y cifrado de respaldos, y automatizar su ejecución y verificación de restauración.
