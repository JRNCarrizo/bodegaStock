param(
  [string]$Version = "0.3.60"
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

Mejoras de consulta, movimientos del día y layout.

### Consulta
- Tras ajustar stock, el total ya no queda en 0 en pantalla (el dato sí se guardaba bien).
- Por sector: **Armar / reorganizar** a la izquierda de la cantidad.

### Movimientos del día
- Fechas, período y fórmula de balance en una sola franja más compacta.
- Si hay ajustes, aparecen en la card de **Balance final** (arriba a la derecha).

### App
- En PC: solo la raya de color de la logística arriba (sin la franja blanca fija).

### Actualizacion
1. Cerra ControlStock.
2. PC: Config → Buscar actualizaciones, o instalá ``ControlStock-Setup-$Version.exe``.
3. Celular: ``ControlStock-$Version.apk``.

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

if (Test-Path $apkPath) {
  $apkSize = (Get-Item $apkPath).Length
  $remoteApk = [int64](($releaseJson.assets | Where-Object { $_.name -like '*.apk' } | Select-Object -First 1).size)
  Write-Host "GitHub APK size: $remoteApk (local $apkSize)" -ForegroundColor Cyan
}

Write-Host "Listo: https://github.com/JRNCarrizo/bodegaStock/releases/tag/$tag" -ForegroundColor Green
