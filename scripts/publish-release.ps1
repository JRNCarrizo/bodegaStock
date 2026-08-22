param(
  [string]$Version = "0.3.43"
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

Menos presión a GitHub al buscar actualizaciones (evita errores 429).

### Nuevo / Mejorado
- Cooldown de **15 min** entre búsquedas de update en escritorio (30 min tras un rate limit)
- Single-flight: no se lanzan checks concurrentes
- Mensaje claro + botón **Abrir Releases** si GitHub limita
- Cooldown corto también al buscar/descargar APK

### Actualización
- Si seguís con 429: instalá a mano ``ControlStock-Setup-$Version.exe`` desde el navegador
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
