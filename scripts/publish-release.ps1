param(
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"
$root = Join-Path $PSScriptRoot ".."
Set-Location $root
$exePath = Join-Path $root "release\BodegaStock Setup $Version.exe"

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

if (-not (Test-Path $exePath)) {
  Write-Host "Generando instalador (npm run dist)..." -ForegroundColor Yellow
  npm run dist
}

if (-not (Test-Path $exePath)) {
  Write-Error "No se encontró el instalador en $exePath"
}

$exe = (Resolve-Path $exePath).Path

$notes = @"
## BodegaStock v$Version

Primera versión estable para uso en bodega.

### Incluye
- Productos, sectores y consulta de stock
- Ingresos, planillas, retornos y roturas
- Movimientos del día (reportes)
- Usuarios, camioneros y permisos

### Instalación
Descargá el instalador **BodegaStock Setup $Version.exe** e instalá en Windows 64 bits.

Login inicial: **admin** / **admin123** (cambiar después del primer acceso).

### Datos
La base de datos se guarda en ``%APPDATA%\bodega-stock\`` en cada PC. No se incluye en el instalador.
"@

Write-Host "Publicando release $tag..." -ForegroundColor Green

$existing = gh release view $tag 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "El release $tag ya existe. Subiendo instalador..." -ForegroundColor Yellow
  gh release upload $tag $exe --clobber
} else {
  gh release create $tag $exe --title "BodegaStock v$Version" --notes $notes
}

if ($LASTEXITCODE -eq 0) {
  $url = gh release view $tag --json url -q .url
  Write-Host ""
  Write-Host "Release publicado:" -ForegroundColor Green
  Write-Host $url -ForegroundColor Cyan
} else {
  Write-Error "No se pudo publicar el release."
}
