param(
  [string]$Version = "0.3.59"
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
  Write-Error "GitHub CLI no encontrado. Instala con: winget install GitHub.cli"
}

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Primero inicia sesion en GitHub:" -ForegroundColor Yellow
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
  Write-Error "No se encontro el instalador en release\* Setup $Version.exe"
}

$exe = (Resolve-Path $exePath).Path
$exeSize = (Get-Item $exe).Length
if ($exeSize -lt 100MB) {
  Write-Error "Setup demasiado chico ($exeSize bytes). Regenera con npm run dist."
}

$apkPath = Join-Path $root "release\ControlStock-$Version.apk"
$assets = @($exe)
if (Test-Path $apkPath) { $assets += (Resolve-Path $apkPath).Path }
$ymlPath = Join-Path $root "release\latest.yml"
if (Test-Path $ymlPath) { $assets += (Resolve-Path $ymlPath).Path }

$notes = @"
## ControlStock v$Version

Actualizador más fiable, retornos más claros y confirmaciones sin romper el foco en Windows.

### Actualizaciones (PC)
- Buscar actualizaciones en Configuración ya no depende del check frágil de Electron con redirects de GitHub.
- Lee ``latest.yml`` de forma directa y descarga desde el tag del release (menos errores 403/“GitHub ocupado”).
- **Importante:** esta es la primera versión con el arreglo. Si venías de una anterior, instalá este Setup **una vez a mano**; después Config debería actualizar solo.

### Retornos
- Si elegís camionero, el vehículo pasa a ser obligatorio.
- El sector por defecto se configura en **Sectores** (como ingresos), no en el formulario de alta.

### Confirmaciones
- Los diálogos nativos se reemplazan por modales de la app (evita el bug de Electron en Windows donde no se podía escribir en los campos hasta minimizar/maximizar).

### Login / Sectores
- En el login se muestran versión y créditos.
- En Sectores: checkbox “Destino por defecto en retornos”.

### Inventario
- Importación más permisiva: PALLET con 0 pallets y cantidad suelta > 0 (caso NAKBE).

### Actualizacion
1. Cerra ControlStock si esta abierto.
2. Descarga e instala ``ControlStock-Setup-$Version.exe``.
3. Desde esta versión en adelante: Configuracion -> Buscar actualizaciones.

Login inicial (base vacia): **admin** / **admin123**
"@

Write-Host "Publicando release $tag (Setup $([math]::Round($exeSize/1MB,2)) MB)..." -ForegroundColor Green

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

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

# Verificar que GitHub recibio el Setup completo (evitar truncado).
# Parseo en PowerShell: el --jq de gh se rompe con pipes/comillas en este shell.
Start-Sleep -Seconds 2
$releaseJson = gh api "repos/JRNCarrizo/bodegaStock/releases/tags/$tag" | ConvertFrom-Json
$remoteSize = [int64](($releaseJson.assets | Where-Object { $_.name -like '*Setup*' } | Select-Object -First 1).size)
Write-Host "GitHub Setup size: $remoteSize (local $exeSize)" -ForegroundColor Cyan
if ($remoteSize -ne $exeSize) {
  Write-Host "Tamano distinto - reintentando upload con clobber..." -ForegroundColor Yellow
  gh release upload $tag $exe --clobber
  Start-Sleep -Seconds 3
  $releaseJson = gh api "repos/JRNCarrizo/bodegaStock/releases/tags/$tag" | ConvertFrom-Json
  $remoteSize = [int64](($releaseJson.assets | Where-Object { $_.name -like '*Setup*' } | Select-Object -First 1).size)
  if ($remoteSize -ne $exeSize) {
    Write-Error "Setup en GitHub sigue truncado: $remoteSize vs $exeSize. Subi a mano."
  }
}

Write-Host "Listo: https://github.com/JRNCarrizo/bodegaStock/releases/tag/$tag" -ForegroundColor Green
