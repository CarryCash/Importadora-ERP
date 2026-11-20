param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [Parameter(Mandatory = $true)]
  [string]$NewDatabaseName
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $BackupPath -PathType Leaf)) {
  throw "No se encontró el archivo de respaldo: $BackupPath"
}
if ($NewDatabaseName -notmatch '^importadora_restore_[A-Za-z0-9_]+$') {
  throw 'La base destino debe llamarse importadora_restore_<nombre>. El script restaura en una base nueva y no reemplaza la original.'
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$containerDump = "/tmp/restore-$([guid]::NewGuid().ToString('N')).dump"

Push-Location $projectRoot
try {
  & docker cp $resolvedBackup "importadora-postgres:$containerDump"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo copiar el respaldo al contenedor PostgreSQL.' }

  & docker compose exec -T db createdb -U postgres -O postgres $NewDatabaseName
  if ($LASTEXITCODE -ne 0) { throw "No se pudo crear $NewDatabaseName. El nombre puede existir ya; no se modificó la base original." }

  & docker compose exec -T db pg_restore -U postgres --exit-on-error --no-owner --no-privileges --dbname=$NewDatabaseName $containerDump
  if ($LASTEXITCODE -ne 0) { throw "La restauración en $NewDatabaseName falló. La base original permanece intacta; revisa la base nueva antes de eliminarla." }

  & docker compose exec -T db rm -f $containerDump
  if ($LASTEXITCODE -ne 0) { Write-Warning 'No se pudo borrar el archivo temporal del contenedor.' }
  Write-Output "Respaldo restaurado en $NewDatabaseName. La base original no fue modificada."
}
finally {
  Pop-Location
}
