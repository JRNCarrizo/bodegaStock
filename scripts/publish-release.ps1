param(
  [string]$Version = "0.3.64"
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

if (Test-Path $ymlPath) {
  $ymlText = Get-Content $ymlPath -Raw
  $versionPattern = 'version:\s*' + [regex]::Escape($Version) + '(\s|$)'
  if ($ymlText -notmatch $versionPattern) {
    Write-Error "latest.yml no coincide con v$Version. Regenera con npm run dist antes de publicar."
  }
  if ($ymlText -match 'path:\s*ControlStock-Setup-([0-9.]+)\.exe') {
    $setupInYml = $Matches[1]
    if ($setupInYml -ne $Version) {
      Write-Error "latest.yml apunta al Setup $setupInYml pero la version es $Version. Regenera con npm run dist."
    }
  }
} else {
  Write-Host "Advertencia: no hay release\latest.yml. Regenera con npm run dist." -ForegroundColor Yellow
}

$notesPath = Join-Path $root "release\release-notes-$Version.md"
@'
## ControlStock v{0}

Layout de carga, ingresos con cajas sueltas, planillas y actualizaciones desde Configuracion.

### UI - pantallas de carga
- Barra de total + Confirmar pegada abajo en ingresos, planillas, retornos, roturas y movimientos.

### Ingresos
- Permite cargar solo cajas sueltas (0 pallets + sueltas), como en inventario.
- Etiquetas mas claras cuando no hay pallets.

### Planillas
- Salidas del dia agrupadas por vehiculo (camionero como subtitulo).
- Vehiculo obligatorio si hay camionero asignado (validacion en app y servidor).

### Actualizacion (PC)
- Detecta bien la version Latest aunque latest.yml en GitHub este desactualizado.
- Buscar actualizaciones fuerza la consulta (sin cooldown molesto).
- Instalacion mas rapida: cierra la app antes, menos pausas y sin cartel de app abierta.

### Instalacion
1. Cerra ControlStock.
2. PC: Config > Buscar actualizaciones, o instala ControlStock-Setup-{0}.exe.
3. Celular: ControlStock-{0}.apk.

Importante: actualiza primero el servidor/PC servidor, despues los clientes.

Login inicial (base vacia): admin / admin123
'@ -f $Version | Set-Content -Path $notesPath -Encoding utf8
$notes = Get-Content -Path $notesPath -Raw
Write-Host "Publicando release $tag (Setup $([math]::Round($exeSize/1MB,2)) MB)..." -ForegroundColor Green

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
