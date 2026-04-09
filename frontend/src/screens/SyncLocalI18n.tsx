import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, FolderOpen, RefreshCcw } from 'lucide-react'
import { OpenDirectoryDialog, ReadJsonFile, WriteJsonFile } from '../../wailsjs/go/main/App'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

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

function deepClone(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function isDeepEqual(a: JsonValue, b: JsonValue) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function updateLocalLeavesOnly(localValue: JsonValue, clientLeaves: Map<string, JsonValue>, basePath = ''): { value: JsonValue; updates: number } {
  if (localValue !== null && typeof localValue === 'object' && !Array.isArray(localValue)) {
    const obj = localValue as Record<string, JsonValue>
    const keys = Object.keys(obj)
    if (keys.length === 0) {
      if (basePath && clientLeaves.has(basePath)) {
        const next = clientLeaves.get(basePath) as JsonValue
        if (!isDeepEqual(localValue, next)) {
          return { value: deepClone(next), updates: 1 }
        }
      }
      return { value: localValue, updates: 0 }
    }

    const updatedObj: Record<string, JsonValue> = {}
    let updates = 0
    for (const key of keys) {
      const nextPath = basePath ? `${basePath}.${key}` : key
      const result = updateLocalLeavesOnly(obj[key], clientLeaves, nextPath)
      updatedObj[key] = result.value
      updates += result.updates
    }
    return { value: updatedObj, updates }
  }

  if (basePath && clientLeaves.has(basePath)) {
    const next = clientLeaves.get(basePath) as JsonValue
    if (!isDeepEqual(localValue, next)) {
      return { value: deepClone(next), updates: 1 }
    }
  }

  return { value: localValue, updates: 0 }
}

export function SyncLocalI18n() {
  const { t } = useTranslation()
  const [localDir, setLocalDir] = useState('')
  const [clientDir, setClientDir] = useState('')
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

  const handleSync = async () => {
    if (!localDir || !clientDir) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const localFrPath = joinPath(localDir, 'fr.json')
      const localNlPath = joinPath(localDir, 'nl.json')
      const clientFrPath = joinPath(clientDir, 'fr.json')
      const clientNlPath = joinPath(clientDir, 'nl.json')

      const [localFr, localNl, clientFr, clientNl] = await Promise.all([
        readRequiredJson(localFrPath, 'local'),
        readRequiredJson(localNlPath, 'local'),
        readRequiredJson(clientFrPath, 'client'),
        readRequiredJson(clientNlPath, 'client'),
      ])

      const clientFrLeaves = new Map<string, JsonValue>()
      const clientNlLeaves = new Map<string, JsonValue>()
      collectLeafValues(clientFr as JsonValue, '', clientFrLeaves)
      collectLeafValues(clientNl as JsonValue, '', clientNlLeaves)

      const updatedFr = updateLocalLeavesOnly(localFr as JsonValue, clientFrLeaves)
      const updatedNl = updateLocalLeavesOnly(localNl as JsonValue, clientNlLeaves)

      await Promise.all([
        WriteJsonFile(localFrPath, updatedFr.value as Record<string, unknown>),
        WriteJsonFile(localNlPath, updatedNl.value as Record<string, unknown>),
      ])

      setSuccess(t('syncLocal.success', { frCount: updatedFr.updates, nlCount: updatedNl.updates }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl px-4">
      <Card className="border-2">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl flex items-center gap-3">
            <RefreshCcw className="h-6 w-6" />
            {t('syncLocal.title')}
          </CardTitle>
          <CardDescription className="text-base">
            {t('syncLocal.description')}
          </CardDescription>
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

          <Button className="w-full h-12 text-base" onClick={handleSync} disabled={loading}>
            {loading ? t('syncLocal.syncing') : t('syncLocal.syncButton')}
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
        </CardContent>
      </Card>
    </div>
  )
}
