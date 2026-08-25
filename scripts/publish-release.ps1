param(
  [string]$Version = "0.3.51"
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"
$root = Join-Path $PSScriptRoot ".."
Set-Location $root

$exeCandidates = @(
  (Join-Path $root "release\ControlStock-Setup-$Version.exe"),
  (Join-Path $root "release\ControlStock Setup $Version.exe"),
  (Join-Path $root "release\BodegaStock Setup $Version.exe")
)

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "GitHub CLI no encontrado. Instalá con: winget install GitHub.cli"
}

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Primero iniciá sesión en GitHub:" -ForegroundColor Yellow
  Write-Host "  gh auth login" -ForegroundColor Cyan
  Write-Host ""
  Write-Host $auth
  exit 1
}

$exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exePath) {
  Write-Host "Generando instalador (npm run dist)..." -ForegroundColor Yellow
  npm run dist
  $exePath = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

if (-not $exePath) {
  $found = Get-ChildItem (Join-Path $root "release") -Filter "*Setup $Version.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { $exePath = $found.FullName }
}

if (-not $exePath) {
  Write-Error "No se encontró el instalador en release\* Setup $Version.exe"
}

$exe = (Resolve-Path $exePath).Path

$apkPath = Join-Path $root "release\ControlStock-$Version.apk"
$assets = @($exe)
if (Test-Path $apkPath) { $assets += (Resolve-Path $apkPath).Path }
$ymlPath = Join-Path $root "release\latest.yml"
if (Test-Path $ymlPath) { $assets += (Resolve-Path $ymlPath).Path }

$notes = @"
## ControlStock v$Version

Pulido de UI: tema logística, listas más claras y totales en ingresos.

### Mejoras
- **Tema logística Nakbe’:** botones primarios y chips de filtro con la paleta del cliente.
- **Ingresos:** toggle total cajas ↔ pallets+cajas en detalle/lista; totales recalculados bien.
- **Consulta:** “Exportar stock”; botones de export arriba; sin chips de tecleo.
- **Listas / admin:** botones solo icono (ingresos, sectores, productos); orden Agenda → Camioneros → Usuarios.
- **Agenda de turnos:** Días / Nuevo turno en la misma fila que Semana / Historial.
- **Limpieza:** sin indicadores de tecleo en Consulta, Movimientos del día y pantallas con “Nuevo…”.

### Actualización
- **Windows:** Configuración → Buscar actualizaciones, o Setup de este release
- **APK:** ``ControlStock-$Version.apk``

Login inicial (base vacía): **admin** / **admin123**
"@

Write-Host "Publicando release $tag..." -ForegroundColor Green

$existing = $null
try {
  $existing = gh release view $tag 2>$null
} catch {
  $existing = $null
}
$notesPath = Join-Path $root "release\release-notes-$Version.md"
$notes | Set-Content -Path $notesPath -Encoding utf8

if ($LASTEXITCODE -eq 0 -and $existing) {
  Write-Host "El release $tag ya existe. Subiendo assets..." -ForegroundColor Yellow
  gh release upload $tag @assets --clobber
} else {
  $global:LASTEXITCODE = 0
  gh release create $tag @assets --title "ControlStock v$Version" --notes-file $notesPath
}

if ($LASTEXITCODE -eq 0) {
  Write-Host "Listo: https://github.com/JRNCarrizo/bodegaStock/releases/tag/$tag" -ForegroundColor Green
} else {
  exit $LASTEXITCODE
}
