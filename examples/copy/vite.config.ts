import path from 'node:path'
import { rmSync } from 'node:fs'
import { defineConfig } from 'vite'
import electron from 'vite-electron-plugin'
import { copy } from 'vite-electron-plugin/plugin'

rmSync(path.join(__dirname, 'dist-electron'), { recursive: true, force: true })

export default defineConfig({
  plugins: [electron({
    include: [
      'electron',
    ],
    plugins: [
      copy([
        { from: 'static/**/*', to: 'dist-electron/static' },
      ]),
    ],
  })],
})
