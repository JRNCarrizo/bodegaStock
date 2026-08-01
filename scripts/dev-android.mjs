/**
 * Live reload Android sin tocar a mano capacitor.config.
 *
 * Uso:
 *   npm run dev:android              → celular físico (IP LAN de esta PC)
 *   npm run dev:android:emulator     → emulador (10.0.2.2 = localhost del PC)
 *
 * Al generar APK: npm run cap:sync (sin CAP_SERVER_URL) → embebido, listo para instalar.
 *
 * Evita el menú interactivo de Capacitor (se traba en la terminal de Cursor):
 * pasa --target automáticamente vía adb.
 * Fuerza JAVA_HOME al JBR de Android Studio (Java 25 del sistema rompe Gradle).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { Socket } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const useEmulator = process.argv.includes('--emulator')
const targetArgIdx = process.argv.indexOf('--target')
const targetFromCli =
  targetArgIdx >= 0 && process.argv[targetArgIdx + 1] ? process.argv[targetArgIdx + 1] : null
const PORT = 5173

/** Java del sistema (p. ej. 25) rompe Gradle; preferir JBR de Android Studio. */
function resolveJavaHome() {
  // JBR primero: JAVA_HOME del sistema puede ser Java 25 y Gradle falla
  const candidates = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr'),
    process.env.JAVA_HOME
  ].filter(Boolean)

  for (const dir of candidates) {
    const javaBin =
      process.platform === 'win32'
        ? path.join(dir, 'bin', 'java.exe')
        : path.join(dir, 'bin', 'java')
    if (existsSync(javaBin)) return dir
  }
  return process.env.JAVA_HOME || null
}

function lanIpv4() {
  const nets = os.networkInterfaces()
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      const family = typeof net.family === 'string' ? net.family : String(net.family)
      if (family === 'IPv4' && !net.internal) return net.address
    }
  }
  return null
}

function adbPath() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (fromEnv) {
    const p = path.join(fromEnv, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    if (existsSync(p)) return p
  }
  const local = path.join(
    process.env.LOCALAPPDATA || '',
    'Android',
    'Sdk',
    'platform-tools',
    process.platform === 'win32' ? 'adb.exe' : 'adb'
  )
  if (existsSync(local)) return local
  return 'adb'
}

function listAdbDevices() {
  const adb = adbPath()
  const out = spawnSync(adb, ['devices', '-l'], { encoding: 'utf8' })
  if (out.status !== 0) return []
  return (out.stdout || '')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('*'))
    .map((line) => {
      const [id, state, ...rest] = line.split(/\s+/)
      const meta = rest.join(' ')
      return {
        id,
        state,
        emulator: id.startsWith('emulator-') || /\bemulator\b/i.test(meta)
      }
    })
    .filter((d) => d.state === 'device')
}

function resolveTarget() {
  if (targetFromCli) return targetFromCli
  const devices = listAdbDevices()
  if (devices.length === 0) return null

  if (useEmulator) {
    const emu = devices.find((d) => d.emulator)
    return emu?.id ?? devices[0].id
  }

  const physical = devices.filter((d) => !d.emulator)
  if (physical.length === 1) return physical[0].id
  if (physical.length > 1) {
    console.log('Varios celulares conectados:')
    physical.forEach((d, i) => console.log(`  ${i + 1}. ${d.id}`))
    console.log('Usá: npm run dev:android -- --target ID_DEL_CELULAR')
    return physical[0].id
  }

  return devices[0].id
}

function waitPort(port, host = '127.0.0.1', ms = 90000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const probe = new Socket()
      probe
        .once('connect', () => {
          probe.destroy()
          resolve()
        })
        .once('error', () => {
          probe.destroy()
          if (Date.now() - start > ms) reject(new Error(`Vite no arrancó en :${port}`))
          else setTimeout(tick, 400)
        })
        .connect(port, host)
    }
    tick()
  })
}

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: true
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} → exit ${code}`))
    })
  })
}

const javaHome = resolveJavaHome()
const gradleEnv = {
  ...(javaHome
    ? {
        JAVA_HOME: javaHome,
        PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}`
      }
    : {})
}

const host = useEmulator ? '10.0.2.2' : lanIpv4()
if (!host) {
  console.error('No se encontró IP LAN. Conectá WiFi/Ethernet o usá: npm run dev:android:emulator')
  process.exit(1)
}

const liveUrl = `http://${host}:${PORT}`
const target = resolveTarget()

console.log(`\nLive reload → ${liveUrl}`)
console.log(useEmulator ? '(emulador)' : '(dispositivo físico / misma WiFi)')
if (target) console.log(`Target → ${target}`)
else console.log('Target → (ninguno detectado; Capacitor puede pedir elegir)')
if (javaHome) console.log(`JAVA_HOME → ${javaHome}`)
else console.warn('JAVA_HOME no encontrado; Gradle puede fallar con Java 25 del sistema')
console.log('Para APK de producción: npm run cap:sync  (sin este script)\n')

try {
  await run('npm', ['run', 'build:mobile'])

  const vite = spawn(
    'npx',
    ['vite', '--config', 'vite.config.mobile.ts', '--host', '--port', String(PORT)],
    { cwd: root, stdio: 'inherit', shell: true, env: process.env }
  )

  vite.on('exit', (code) => {
    if (code && code !== 0) process.exit(code)
  })

  process.on('SIGINT', () => {
    vite.kill('SIGINT')
    process.exit(0)
  })

  await waitPort(PORT)
  await run('npx', ['cap', 'sync', 'android'], { CAP_SERVER_URL: liveUrl, ...gradleEnv })
  console.log('\nInstalando / abriendo en Android…\n')

  const runArgs = ['cap', 'run', 'android']
  if (target) runArgs.push('--target', target)

  await run('npx', runArgs, { CAP_SERVER_URL: liveUrl, ...gradleEnv })
  console.log('\nListo. Dejá Vite corriendo; al guardar verás los cambios.')
  console.log('Ctrl+C para cortar el live reload.\n')
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
}
