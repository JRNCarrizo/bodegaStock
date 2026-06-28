import Fastify from 'fastify'
import cors from '@fastify/cors'
import { app } from 'electron'
import http from 'http'
import { initDatabase } from './db'
import { registerAuthHook } from './plugins/auth'
import { authRoutes } from './routes/auth'
import { camionerosRoutes } from './routes/camioneros'
import { consultaRoutes } from './routes/consulta'
import { ingresosRoutes } from './routes/ingresos'
import { planillasRoutes } from './routes/planillas'
import { retornosRoutes } from './routes/retornos'
import { roturasRoutes } from './routes/roturas'
import { reportesRoutes } from './routes/reportes'
import { productosRoutes } from './routes/productos'
import { sectoresRoutes } from './routes/sectores'
import { usuariosRoutes } from './routes/usuarios'

const PORT = 3847
let server: ReturnType<typeof Fastify> | null = null

function isApiHealthy(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

export async function startServer(): Promise<void> {
  if (server?.server?.listening) return

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
    app: 'BodegaStock',
    version: app.getVersion?.() ?? '0.1.0'
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
  await server.register(reportesRoutes)

  try {
    await server.listen({ port: PORT, host: '127.0.0.1' })
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'EADDRINUSE') {
      const healthy = await isApiHealthy()
      if (healthy) {
        console.log(`[BodegaStock] API ya activa en puerto ${PORT}`)
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
  return PORT
}
