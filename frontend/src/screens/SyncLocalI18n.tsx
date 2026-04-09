import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, FolderOpen, RefreshCcw } from 'lucide-react'
import { OpenDirectoryDialog, ReadJsonFile, WriteJsonFile } from '../../wailsjs/go/main/App'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type DecisionStatus = 'pending' | 'applied' | 'rejected'

interface SyncUpdateRow {
  id: string
  language: 'fr' | 'nl'
  path: string
  oldValue: JsonValue
  newValue: JsonValue
  status: DecisionStatus
}

function joinPath(dir: string, fileName: string) {
  if (!dir) {
    return fileName
  }
  const trimmed = dir.replace(/[\\/]+$/, '')
  if (trimmed.includes('\\')) {
    return `${trimmed}\\${fileName}`
  }
  return `${trimmed}/${fileName}`
}

function collectLeafValues(value: JsonValue, basePath = '', out: Map<string, JsonValue>) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      if (basePath) {
        out.set(basePath, value)
      }
      return
    }

    for (const [key, child] of entries) {
      const nextPath = basePath ? `${basePath}.${key}` : key
      collectLeafValues(child as JsonValue, nextPath, out)
    }
    return
  }

  if (basePath) {
    out.set(basePath, value)
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isDeepEqual(a: JsonValue, b: JsonValue) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function formatJsonValue(value: JsonValue) {
  if (typeof value === 'string') {
    return value
  }
  if (value === null) {
    return 'null'
  }
  return JSON.stringify(value)
}

function setNestedValue(root: JsonValue, path: string, value: JsonValue): JsonValue {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    return root
  }

  const keys = path.split('.').filter(Boolean)
  if (keys.length === 0) {
    return root
  }

  let current = root as Record<string, JsonValue>
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]
    const next = current[key]
    if (next !== null && typeof next === 'object' && !Array.isArray(next)) {
      current = next as Record<string, JsonValue>
      continue
    }
    return root
  }

  current[keys[keys.length - 1]] = deepClone(value)
  return root
}

function getCounts(rows: SyncUpdateRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc[row.status] += 1
      return acc
    },
    { pending: 0, applied: 0, rejected: 0 },
  )
}

export function SyncLocalI18n() {
  const { t } = useTranslation()
  const [localDir, setLocalDir] = useState('')
  const [clientDir, setClientDir] = useState('')
  const [localFrPath, setLocalFrPath] = useState('')
  const [localNlPath, setLocalNlPath] = useState('')
  const [localFrOriginal, setLocalFrOriginal] = useState<JsonValue | null>(null)
  const [localNlOriginal, setLocalNlOriginal] = useState<JsonValue | null>(null)
  const [rows, setRows] = useState<SyncUpdateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSelectLocalDir = async () => {
    try {
      const selected = await OpenDirectoryDialog(t('syncLocal.selectLocalFolder'))
      if (selected) {
        setLocalDir(selected)
      }
    } catch {
      setError(t('syncLocal.selectFolderError'))
    }
  }

  const handleSelectClientDir = async () => {
    try {
      const selected = await OpenDirectoryDialog(t('syncLocal.selectClientFolder'))
      if (selected) {
        setClientDir(selected)
      }
    } catch {
      setError(t('syncLocal.selectFolderError'))
    }
  }

  const readRequiredJson = async (filePath: string, scopeLabel: string) => {
    try {
      return await ReadJsonFile(filePath)
    } catch {
      throw new Error(t('syncLocal.missingFileError', { scope: scopeLabel, file: filePath }))
    }
  }

  const handleLoadUpdates = async () => {
    if (!localDir || !clientDir) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')
    setRows([])

    try {
      const nextLocalFrPath = joinPath(localDir, 'fr.json')
      const nextLocalNlPath = joinPath(localDir, 'nl.json')
      const clientFrPath = joinPath(clientDir, 'fr.json')
      const clientNlPath = joinPath(clientDir, 'nl.json')

      const [localFrRaw, localNlRaw, clientFrRaw, clientNlRaw] = await Promise.all([
        readRequiredJson(nextLocalFrPath, 'local'),
        readRequiredJson(nextLocalNlPath, 'local'),
        readRequiredJson(clientFrPath, 'client'),
        readRequiredJson(clientNlPath, 'client'),
      ])

      const localFr = localFrRaw as JsonValue
      const localNl = localNlRaw as JsonValue
      const clientFr = clientFrRaw as JsonValue
      const clientNl = clientNlRaw as JsonValue

      const localFrLeaves = new Map<string, JsonValue>()
      const localNlLeaves = new Map<string, JsonValue>()
      const clientFrLeaves = new Map<string, JsonValue>()
      const clientNlLeaves = new Map<string, JsonValue>()
      collectLeafValues(localFr, '', localFrLeaves)
      collectLeafValues(localNl, '', localNlLeaves)
      collectLeafValues(clientFr, '', clientFrLeaves)
      collectLeafValues(clientNl, '', clientNlLeaves)

      const nextRows: SyncUpdateRow[] = []
      for (const [path, oldValue] of localFrLeaves) {
        const clientValue = clientFrLeaves.get(path)
        if (typeof clientValue === 'undefined') {
          continue
        }
        if (!isDeepEqual(oldValue, clientValue)) {
          nextRows.push({
            id: `fr:${path}`,
            language: 'fr',
            path,
            oldValue: deepClone(oldValue),
            newValue: deepClone(clientValue),
            status: 'pending',
          })
        }
      }

      for (const [path, oldValue] of localNlLeaves) {
        const clientValue = clientNlLeaves.get(path)
        if (typeof clientValue === 'undefined') {
          continue
        }
        if (!isDeepEqual(oldValue, clientValue)) {
          nextRows.push({
            id: `nl:${path}`,
            language: 'nl',
            path,
            oldValue: deepClone(oldValue),
            newValue: deepClone(clientValue),
            status: 'pending',
          })
        }
      }

      nextRows.sort((a, b) => {
        const pathCompare = a.path.localeCompare(b.path)
        if (pathCompare !== 0) {
          return pathCompare
        }
        return a.language.localeCompare(b.language)
      })

      setLocalFrPath(nextLocalFrPath)
      setLocalNlPath(nextLocalNlPath)
      setLocalFrOriginal(deepClone(localFr))
      setLocalNlOriginal(deepClone(localNl))
      setRows(nextRows)

      if (nextRows.length === 0) {
        setSuccess(t('syncLocal.noUpdates'))
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = (id: string, status: DecisionStatus) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)))
  }

  const handleApplyAll = () => {
    setRows((prev) => prev.map((row) => (row.status === 'pending' ? { ...row, status: 'applied' } : row)))
  }

  const handleRejectAll = () => {
    setRows((prev) => prev.map((row) => (row.status === 'pending' ? { ...row, status: 'rejected' } : row)))
  }

  const handleSaveApplied = async () => {
    if (!localFrOriginal || !localNlOriginal || !localFrPath || !localNlPath) {
      setError(t('syncLocal.loadFirstError'))
      return
    }

    const appliedRows = rows.filter((row) => row.status === 'applied')
    if (appliedRows.length === 0) {
      setError(t('syncLocal.noAppliedError'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const nextFr = deepClone(localFrOriginal)
      const nextNl = deepClone(localNlOriginal)

      for (const row of appliedRows) {
        if (row.language === 'fr') {
          setNestedValue(nextFr, row.path, row.newValue)
        } else {
          setNestedValue(nextNl, row.path, row.newValue)
        }
      }

      await Promise.all([
        WriteJsonFile(localFrPath, nextFr as Record<string, unknown>),
        WriteJsonFile(localNlPath, nextNl as Record<string, unknown>),
      ])

      const counts = getCounts(rows)
      setSuccess(
        t('syncLocal.applySuccess', {
          applied: counts.applied,
          rejected: counts.rejected,
          pending: counts.pending,
        }),
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const counts = getCounts(rows)

  return (
    <div className="container mx-auto py-10 max-w-5xl px-4">
      <Card className="border-2">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl flex items-center gap-3">
            <RefreshCcw className="h-6 w-6" />
            {t('syncLocal.title')}
          </CardTitle>
          <CardDescription className="text-base">{t('syncLocal.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-base">{t('syncLocal.localFolder')}</Label>
            <div className="flex gap-3">
              <Input
                className="h-12 text-base"
                value={localDir}
                onChange={(e) => setLocalDir(e.target.value)}
                placeholder={t('syncLocal.localFolderPlaceholder')}
              />
              <Button variant="outline" className="h-12 px-5 text-base" onClick={handleSelectLocalDir}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">{t('syncLocal.clientFolder')}</Label>
            <div className="flex gap-3">
              <Input
                className="h-12 text-base"
                value={clientDir}
                onChange={(e) => setClientDir(e.target.value)}
                placeholder={t('syncLocal.clientFolderPlaceholder')}
              />
              <Button variant="outline" className="h-12 px-5 text-base" onClick={handleSelectClientDir}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
            </div>
          </div>

          <Button className="w-full h-12 text-base" onClick={handleLoadUpdates} disabled={loading}>
            {loading ? t('syncLocal.loadingUpdates') : t('syncLocal.loadUpdatesButton')}
          </Button>

          {error && (
            <div className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <span className="text-base">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-4 rounded-md bg-green-100 text-green-800">
              <CheckCircle className="h-5 w-5 mt-0.5" />
              <span className="text-base">{success}</span>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                {t('syncLocal.summary', {
                  total: rows.length,
                  applied: counts.applied,
                  rejected: counts.rejected,
                  pending: counts.pending,
                })}
              </div>

              <div className="max-h-96 overflow-y-auto rounded border bg-muted/30 p-3 space-y-3">
                {rows.map((row) => (
                  <div key={row.id} className="rounded border bg-background p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">{row.language.toUpperCase()}</div>
                        <div className="text-sm font-mono break-all">{row.path}</div>
                      </div>
                      <span
                        className={
                          row.status === 'applied'
                            ? 'text-xs px-2 py-1 rounded bg-green-100 text-green-800'
                            : row.status === 'rejected'
                              ? 'text-xs px-2 py-1 rounded bg-red-100 text-red-800'
                              : 'text-xs px-2 py-1 rounded bg-amber-100 text-amber-800'
                        }
                      >
                        {row.status === 'applied'
                          ? t('syncLocal.statusApplied')
                          : row.status === 'rejected'
                            ? t('syncLocal.statusRejected')
                            : t('syncLocal.statusPending')}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">{t('syncLocal.oldValueLabel')}: </span>
                      <span className="font-mono break-all">{formatJsonValue(row.oldValue)}</span>
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">{t('syncLocal.newValueLabel')}: </span>
                      <span className="font-mono break-all">{formatJsonValue(row.newValue)}</span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => updateStatus(row.id, 'applied')}>
                        {t('syncLocal.applyChangeButton')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(row.id, 'rejected')}>
                        {t('syncLocal.rejectChangeButton')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button className="flex-1" variant="outline" onClick={handleApplyAll} disabled={loading || counts.pending === 0}>
                  {t('syncLocal.applyAllButton')}
                </Button>
                <Button className="flex-1" variant="outline" onClick={handleRejectAll} disabled={loading || counts.pending === 0}>
                  {t('syncLocal.rejectAllButton')}
                </Button>
                <Button className="flex-1" onClick={handleSaveApplied} disabled={loading || counts.applied === 0}>
                  {loading ? t('syncLocal.syncing') : t('syncLocal.syncButton')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
