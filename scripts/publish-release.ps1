param(
  [string]$Version = "0.2.1"
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"
$root = Join-Path $PSScriptRoot ".."
Set-Location $root

$exeCandidates = @(
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
$exeName = Split-Path $exe -Leaf

$notes = @"
## ControlStock v$Version

Red local, etiquetas de barras, login renovado e icono en Windows.

### Nuevo
- **Servidor / cliente en red:** PC servidor + otras PCs por WiFi/LAN (puerto 3847)
- **Configuración de red:** modo servidor o cliente, probar conexión, URLs, QR para celulares
- **Etiquetas de código de barras:** imprimir y descargar PNG desde Productos
- **Login** rediseñado (panel de marca + formulario moderno)
- **Icono** embebido en el instalador Windows y en desarrollo (barra de tareas)

### Mejoras
- Detalle unificado en ingresos, retornos, roturas, planillas y movimientos
- Configuración cliente: ayuda para pegar IP del servidor (sin 127.0.0.1)

### Instalación
1. **PC servidor:** instalá el .exe → Configuración → *Esta PC es el servidor*
2. **Otras PCs:** mismo instalador → *Esta PC es cliente* → IP del servidor → puerto **3847**

Login inicial: **admin** / **admin123** (cambiar después del primer acceso).
"@

Write-Host "Publicando release $tag..." -ForegroundColor Green

$existing = gh release view $tag 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "El release $tag ya existe. Subiendo instalador..." -ForegroundColor Yellow
  gh release upload $tag $exe --clobber
} else {
  gh release create $tag $exe --title "ControlStock v$Version" --notes $notes
}

if ($LASTEXITCODE -eq 0) {
  $url = gh release view $tag --json url -q .url
  Write-Host ""
  Write-Host "Release publicado:" -ForegroundColor Green
  Write-Host $url -ForegroundColor Cyan
} else {
  Write-Error "No se pudo publicar el release."
}
