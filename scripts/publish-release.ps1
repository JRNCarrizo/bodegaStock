param(
  [string]$Version = "0.3.55"
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
$exeSize = (Get-Item $exe).Length
if ($exeSize -lt 100MB) {
  Write-Error "Setup demasiado chico ($exeSize bytes). Regenerá con npm run dist."
}

$apkPath = Join-Path $root "release\ControlStock-$Version.apk"
$assets = @($exe)
if (Test-Path $apkPath) { $assets += (Resolve-Path $apkPath).Path }
$ymlPath = Join-Path $root "release\latest.yml"
if (Test-Path $ymlPath) { $assets += (Resolve-Path $ymlPath).Path }

$notes = @"
## ControlStock v$Version

Stock inicial continuo día a día en Movimientos del día.

### Corregido
- **Stock inicial:** se reconstruye como ``stock actual − movimientos desde ese día hasta hoy`` (agregado), así ``inicial(D+1) = balance(D)``.
- Sin el salto raro entre días (ej. 899 → 998) ni el +1 por rotura del mismo día.
- El total de la tarjeta ya no se arma sumando solo productos filtrados del detalle.

### Actualización
1. Cerrá ControlStock (Administrador de tareas si hace falta).
2. Descargá e instalá ``ControlStock-Setup-$Version.exe`` (~104 MB).
3. O Configuración → Buscar actualizaciones.

Login inicial (base vacía): **admin** / **admin123**
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

# Verificar que GitHub recibió el Setup completo (evitar truncado).
Start-Sleep -Seconds 2
$remoteSize = [int64](gh api "repos/JRNCarrizo/bodegaStock/releases/tags/$tag" --jq '.assets[] | select(.name|test("Setup")) | .size')
Write-Host "GitHub Setup size: $remoteSize (local $exeSize)" -ForegroundColor Cyan
if ($remoteSize -ne $exeSize) {
  Write-Host "Tamaño distinto — reintentando upload con clobber..." -ForegroundColor Yellow
  gh release upload $tag $exe --clobber
  Start-Sleep -Seconds 3
  $remoteSize = [int64](gh api "repos/JRNCarrizo/bodegaStock/releases/tags/$tag" --jq '.assets[] | select(.name|test("Setup")) | .size')
  if ($remoteSize -ne $exeSize) {
    Write-Error ("Setup en GitHub sigue truncado ({0} vs {1}). Subí a mano." -f $remoteSize, $exeSize)
  }
}

Write-Host "Listo: https://github.com/JRNCarrizo/bodegaStock/releases/tag/$tag" -ForegroundColor Green
