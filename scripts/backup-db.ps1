$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupDirectory = Join-Path $projectRoot 'backups'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fileName = "importadora-$timestamp.dump"
$containerDump = "/tmp/$fileName"
$backupPath = Join-Path $backupDirectory $fileName

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
Push-Location $projectRoot
try {
  & docker compose exec -T db pg_dump -U postgres -d importadora -Fc -Z 9 -f $containerDump
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo generar el respaldo desde PostgreSQL.' }

  & docker cp "importadora-postgres:$containerDump" $backupPath
  if ($LASTEXITCODE -ne 0) { throw 'El respaldo se creó en el contenedor, pero no se pudo copiar al equipo.' }

  & docker compose exec -T db rm -f $containerDump
  if ($LASTEXITCODE -ne 0) { Write-Warning 'No se pudo borrar el archivo temporal del contenedor.' }
  Write-Output "Respaldo creado: $backupPath"
}
finally {
  Pop-Location
}
