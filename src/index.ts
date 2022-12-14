import type { AddressInfo } from 'node:net'
import type {
  ResolvedConfig as ViteResolvedConfig,
  Plugin as VitePlugin,
  ViteDevServer,
  UserConfig,
} from 'vite'
import {
  type Configuration,
  type ResolvedConfig,
  type Plugin,
  polyfillConfig,
} from './config'

import {
  build as notbundleBuild,
  watch as notbundleWatch,
} from 'notbundle'

// public export
export {
  type Configuration,
  type ResolvedConfig,
  type Plugin,
  build,
  watch,
  startup,
  defineConfig,
  electron as default,
}

function defineConfig(config: Configuration) {
  return config
}

function build(config: Configuration) {
  return notbundleBuild(polyfillConfig(config) as any)
}

function watch(config: Configuration) {
  return notbundleWatch(polyfillConfig(config) as any)
}

function electron(config: Configuration): VitePlugin[] {
  let userConfig: UserConfig
  let resolvedConfig: ViteResolvedConfig
  let viteDevServer: ViteDevServer
  const getConfig = (_config = config) => {
    _config.api ??= {}
    _config.api.vite ??= {}
    _config.api.vite.config ??= userConfig
    _config.api.vite.resolvedConfig ??= resolvedConfig
    _config.api.vite.server ??= viteDevServer
    return _config
  }
  const options: Partial<VitePlugin> = {
    config(_config) {
      // Make sure that Electron App can be loaded into the local file using `loadFile` after build
      _config.base ??= './'
      userConfig = _config
    },
    configResolved(_config) {
      resolvedConfig = _config
    },
  }

  return [
    {
      name: 'vite-electron-plugin',
      apply: 'serve',
      ...options,
      configureServer(server) {
        viteDevServer = server
        server.httpServer?.once('listening', async () => {
          const addressInfo = server.httpServer!.address() as AddressInfo
          Object.assign(process.env, {
            // For `vite serve` command
            VITE_DEV_SERVER_URL: `http://localhost:${addressInfo.port}`,
          })

          const _config = getConfig()
          _config.plugins ??= []
          _config.plugins.push(startupPlugin())

          // @ts-ignore
          process._plugin_watcher?.close(); process._plugin_watcher = await watch(_config)
        })
      },
    },
    {
      name: 'vite-electron-plugin',
      apply: 'build',
      ...options,
      closeBundle() {
        build(getConfig())
      },
    },
  ]
}

function startupPlugin(): Plugin {
  let config: ViteResolvedConfig | undefined
  let startup_fn: () => void
  const files: string[] = []

  return {
    name: ':startup',
    configResolved(_config) {
      const { api: { vite }, experimental } = _config
      config = vite?.resolvedConfig
      if (config?.command === 'serve') {
        startup_fn = debounce(() => {
          /**
           * e.g.
           * - `foo.reload.js`
           * - `preload.ts`
           */
          const reload = _config.extensions.some(ext => files.every(file => file.endsWith('reload' + ext)))
          files.length = 0

          if (reload) {
            experimental.reload()
          } else {
            experimental.startup()
          }
        })
      }
    },
    ondone({ filename }) {
      if (config?.command === 'serve') {
        files.push(filename)
        startup_fn()
      }
    },
  }
}

function debounce<Fn extends (...args: any[]) => void>(fn: Fn, delay = 299) {
  let t: NodeJS.Timeout
  return <Fn>((...args) => {
    // !t && fn(...args) // first call
    clearTimeout(t)
    t = setTimeout(() => fn(...args), delay)
  })
}

/**
 * Electron App startup function.  
 * It will mount the Electron App child-process to `process.electronApp`.  
 * @param argv default value `['.', '--no-sandbox']`
 */
async function startup(argv = ['.', '--no-sandbox']) {
  const { spawn } = await import('node:child_process')
  // @ts-ignore
  const electron = await import('electron')
  const electronPath = <any>(electron.default ?? electron)

  startup.exit()
  // Start Electron.app
  process.electronApp = spawn(electronPath, argv, { stdio: 'inherit' })
  // Exit command after Electron.app exits
  process.electronApp.once('exit', process.exit)

  if (!startup.hookProcessExit) {
    startup.hookProcessExit = true
    process.once('exit', startup.exit)
  }
}
startup.hookProcessExit = false
startup.exit = () => {
  if (process.electronApp) {
    process.electronApp.removeAllListeners()
    process.electronApp.kill()
  }
}
