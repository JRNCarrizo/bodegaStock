param(
  [string]$Version = "0.3.48"
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

Corrección importante del botón **Buscar actualizaciones** y mejoras de UI acumuladas.

### Corregido
- **Actualizaciones (Windows/APK):** ya no usa ``api.github.com`` (límite 60/h). Lee ``latest.yml`` del release; se limpian bloqueos heredados de v0.3.43.

### Mejorado
- **Consultas:** tocá el total del producto (sin desplegar) para ver pallets + cajas.
- **Ingresos en curso:** mismo toggle total cajas ↔ pallets + cajas en el footer.
- **Listas (planillas, retornos, roturas, movimientos):** botones solo icono + tooltip; cantidad a la derecha; verificar/autorizar en ámbar.
- **Búsqueda productos:** prioriza código + cosecha (ej. ``420-23`` antes que ``4201``).
- **Navegación con flechas:** resaltado más visible en listas.

### Actualización
- **Windows:** Configuración → Buscar actualizaciones, o Setup de este release
- **APK:** ``ControlStock-$Version.apk`` (o Descargar APK desde el PC)

Login inicial (base vacía): **admin** / **admin123**
"@

Write-Host "Publicando release $tag..." -ForegroundColor Green

$existing = $null
try {
  $existing = gh release view $tag 2>$null
} catch {
  $existing = $null
}
if ($LASTEXITCODE -eq 0 -and $existing) {
  Write-Host "El release $tag ya existe. Subiendo assets..." -ForegroundColor Yellow
  gh release upload $tag @assets --clobber
} else {
  $global:LASTEXITCODE = 0
  gh release create $tag @assets --title "ControlStock v$Version" --notes $notes
}

if ($LASTEXITCODE -eq 0) {
  Write-Host "Listo: https://github.com/JRNCarrizo/bodegaStock/releases/tag/$tag" -ForegroundColor Green
} else {
  exit $LASTEXITCODE
}
