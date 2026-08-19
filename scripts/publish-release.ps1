param(
  [string]$Version = "0.3.37"
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

Corrección de importación offline al PC local en la APK (v0.3.33–0.3.36).

### Nuevo / corregido
- Fix: **Importar al PC** en inventario offline con servidor local (error 415 Unsupported Media Type)
- Modo nube (Railway) sigue usando HTTP nativo; LAN vuelve al comportamiento de la v0.3.29
- Inventario online: reconteo a cero ya no se reprecarga al recargar la pantalla

### Actualización
- **APK:** instalá ``ControlStock-$Version.apk`` en los celulares
- **Windows:** Configuración → Buscar actualizaciones, o Setup de este release

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
  $url = gh release view $tag --json url -q .url
  Write-Host ""
  Write-Host "Release publicado:" -ForegroundColor Green
  Write-Host $url -ForegroundColor Cyan
} else {
  Write-Error "No se pudo publicar el release."
}
