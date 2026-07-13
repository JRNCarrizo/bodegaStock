import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { app } from 'electron'
import { existsSync } from 'fs'
import http from 'http'
import { join } from 'path'
import { initDatabase } from './db'
import {
  buildConnectionUrls,
  getLanAddresses,
  loadNetworkConfig
} from './network-config'
import { registerAuthHook } from './plugins/auth'
import { authRoutes } from './routes/auth'
import { camionerosRoutes } from './routes/camioneros'
import { consultaRoutes } from './routes/consulta'
import { ingresosRoutes } from './routes/ingresos'
import { planillasRoutes } from './routes/planillas'
import { retornosRoutes } from './routes/retornos'
import { roturasRoutes } from './routes/roturas'
import { movimientosInternosRoutes } from './routes/movimientos-internos'
import { reportesRoutes } from './routes/reportes'
import { inventarioRoutes } from './routes/inventario'
import { productosRoutes } from './routes/productos'
import { sectoresRoutes } from './routes/sectores'
import { usuariosRoutes } from './routes/usuarios'

function resolveRendererDir(): string | null {
  const candidates = [
    join(__dirname, '../renderer'),
    join(process.cwd(), 'out/renderer')
  ]
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir
  }
  return null
}

export interface StartServerOptions {
  host?: string
  port?: number
}

let server: ReturnType<typeof Fastify> | null = null
let activePort = loadNetworkConfig().port

export function checkApiHealth(host: string, port: number): Promise<{
  ok: boolean
  app?: string
  version?: string
}> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/api/health`, (res) => {
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ ok: false })
          return
        }
        try {
          const data = JSON.parse(body) as { app?: string; version?: string }
          resolve({ ok: true, app: data.app, version: data.version })
        } catch {
          resolve({ ok: true })
        }
      })
    })
    req.on('error', () => resolve({ ok: false }))
    req.setTimeout(4000, () => {
      req.destroy()
      resolve({ ok: false })
    })
  })
}

export async function startServer(options: StartServerOptions = {}): Promise<void> {
  if (server?.server?.listening) return

  const config = loadNetworkConfig()
  const host = options.host ?? '0.0.0.0'
  const port = options.port ?? config.port
  activePort = port

  initDatabase()

  server = Fastify({
    logger: false,
    bodyLimit: 15 * 1024 * 1024
  })

  await server.register(cors, {
    origin: true,
    credentials: true
  })

  registerAuthHook(server)

  server.setErrorHandler((error, _request, reply) => {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({ error: 'La imagen es demasiado grande. Probá con otra más chica.' })
    }
    reply.status(error.statusCode ?? 500).send({
      error: error.message ?? 'Error interno del servidor'
    })
  })

  server.get('/api/health', async () => ({
    ok: true,
    app: 'ControlStock',
    version: app.getVersion?.() ?? '0.1.0',
    port: activePort
  }))

  server.get('/api/server/info', async () => ({
    app: 'ControlStock',
    version: app.getVersion?.() ?? '0.1.0',
    port: activePort,
    addresses: getLanAddresses(),
    urls: buildConnectionUrls(activePort)
  }))

  await server.register(authRoutes)
  await server.register(usuariosRoutes)
  await server.register(consultaRoutes)
  await server.register(productosRoutes)
  await server.register(sectoresRoutes)
  await server.register(camionerosRoutes)
  await server.register(ingresosRoutes)
  await server.register(planillasRoutes)
  await server.register(retornosRoutes)
  await server.register(roturasRoutes)
  await server.register(movimientosInternosRoutes)
  await server.register(reportesRoutes)
  await server.register(inventarioRoutes)

  const rendererDir = resolveRendererDir()
  if (rendererDir) {
    await server.register(fastifyStatic, {
      root: rendererDir,
      prefix: '/',
      wildcard: false
    })

    // SPA (HashRouter): cualquier ruta no-API sirve la UI web
    server.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'No encontrado' })
      }
      return reply.sendFile('index.html')
    })
  }

  try {
    await server.listen({ port, host })
    console.log(`[ControlStock] API escuchando en ${host}:${port}`)
    if (rendererDir) {
      console.log(`[ControlStock] UI web disponible en http://<IP-local>:${port}`)
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'EADDRINUSE') {
      const healthy = await checkApiHealth('127.0.0.1', port)
      if (healthy.ok) {
        console.log(`[ControlStock] API ya activa en puerto ${port}`)
        return
      }
    }
    throw err
  }
}

export async function stopServer(): Promise<void> {
  if (server) {
    await server.close()
    server = null
  }
}

export function getServerPort(): number {
  return activePort
}

export function isServerRunning(): boolean {
  return Boolean(server?.server?.listening)
}
