/* eslint-disable @typescript-eslint/explicit-function-return-type -- 纯 JS 脚本无法标注 TS 返回类型 */
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

const DB_FILE_PATTERN = /\.(db|sqlite|sqlite3)(-(wal|shm|journal))?$/i

async function clean(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      await clean(fullPath)
    } else if (entry.isFile() && DB_FILE_PATTERN.test(entry.name)) {
      await rm(fullPath, { force: true })
      console.log(`[clean-package-db] removed ${fullPath}`)
    }
  }
}

const targets = process.argv.slice(2)
for (const target of targets.length > 0 ? targets : ['out', 'resources']) {
  await clean(target)
}
