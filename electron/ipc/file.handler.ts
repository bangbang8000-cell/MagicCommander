import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'

export class FileHandler {
  async read(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8')
  }

  async write(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async readExcel(filePath: string, sheetName?: string): Promise<{ name: string; columns: string[]; rows: Record<string, unknown>[] }[]> {
    if (!fsSync.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`)
    }
    const wb = XLSX.readFile(filePath)
    const sheetNames = sheetName ? [sheetName] : wb.SheetNames
    return sheetNames.map((name) => {
      const sheet = wb.Sheets[name]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return { name, columns, rows }
    })
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}
