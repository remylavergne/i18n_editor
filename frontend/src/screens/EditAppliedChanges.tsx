import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, FolderOpen, PencilLine } from 'lucide-react'
import { ApplyChangeToJson, CheckAlreadyApplied, CreateBackupFile, DeleteFile, OpenFileDialog, ReadJsonFile, ReadTextFile, RestoreFileFromBackup } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

interface EditableRow {
  path: string
  action: string
  currentValue: string
  editedValue: string
  context?: main.DiffChangeContext
}

interface LegacyDiffChange {
  type: string
  key: string
  oldValue: string
  newValue: string
  line: number
}

function getNestedValue(obj: Record<string, any>, path: string): unknown {
  const parts = path.split('.')
  let current: any = obj
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined
    }
    current = current[part]
  }
  return current
}

function asEditableString(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}

export function EditAppliedChanges() {
  const { t } = useTranslation()
  const [targetFile, setTargetFile] = useState('')
  const [changesFile, setChangesFile] = useState('')
  const [rows, setRows] = useState<EditableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [savingPath, setSavingPath] = useState('')
  const [backupFilePath, setBackupFilePath] = useState('')

  const cleanupBackupFile = async () => {
    if (!backupFilePath) return
    try {
      await DeleteFile(backupFilePath)
    } catch {
      // ignore cleanup errors
    }
    setBackupFilePath('')
  }

  const handleSelectTargetFile = async () => {
    try {
      const filePath = await OpenFileDialog('Select JSON File', 'JSON Files', '*.json')
      if (filePath) {
        setTargetFile(filePath)
      }
    } catch {
      setError(t('editApplied.selectFileError'))
    }
  }

  const handleSelectChangesFile = async () => {
    try {
      const filePath = await OpenFileDialog('Select Standardized Changes File', 'JSON Files', '*.json')
      if (filePath) {
        setChangesFile(filePath)
      }
    } catch {
      setError(t('editApplied.selectFileError'))
    }
  }

  const handleLoad = async () => {
    if (!targetFile || !changesFile) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await cleanupBackupFile()

      const [jsonRaw, changesRaw] = await Promise.all([
        ReadJsonFile(targetFile),
        ReadTextFile(changesFile),
      ])

      const parsed = JSON.parse(changesRaw)
      if (!Array.isArray(parsed)) {
        throw new Error(t('editApplied.invalidChangesFile'))
      }

      const standardized = parsed
        .map((item) => main.StandardizedDiffChange.createFrom(item))

      const compatibilityChanges: LegacyDiffChange[] = standardized
        .map((item) => {
          if (item.action === 'add') {
            return {
              type: 'add',
              key: item.path,
              oldValue: item.oldValue || '',
              newValue: item.newValue || '',
              line: item.source?.line || 0,
            }
          }

          if (item.action === 'change') {
            return {
              type: 'modify',
              key: item.path,
              oldValue: item.oldValue || '',
              newValue: item.newValue || '',
              line: item.source?.line || 0,
            }
          }

          if (item.action === 'delete') {
            return {
              type: 'delete',
              key: item.path,
              oldValue: item.oldValue || '',
              newValue: '',
              line: item.source?.line || 0,
            }
          }

          return null
        })
        .filter((item): item is LegacyDiffChange => item !== null)

      const appliedStatus = await CheckAlreadyApplied(targetFile, compatibilityChanges)
      const missingCount = appliedStatus.filter((status) => !status).length
      if (missingCount > 0) {
        setRows([])
        setError(t('editApplied.patchNotFullyApplied', { count: missingCount }))
        return
      }

      const editableItems = standardized.filter((item) => item.action === 'add' || item.action === 'change')

      const builtRows: EditableRow[] = editableItems.map((item) => {
        const currentValue = asEditableString(getNestedValue(jsonRaw, item.path))
        return {
          path: item.path,
          action: item.action,
          currentValue,
          editedValue: currentValue,
          context: item.context,
        }
      })

      setRows(builtRows)
      setSuccess(t('editApplied.loadedSummary', { count: builtRows.length }))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleRowInputChange = (path: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.path === path ? { ...row, editedValue: value } : row)))
  }

  const handleApplyRow = async (row: EditableRow) => {
    if (row.editedValue === row.currentValue) {
      return
    }

    setSavingPath(row.path)
    setError('')
    setSuccess('')

    const change = main.DiffChange.createFrom({
      type: 'modify',
      key: row.path,
      oldValue: row.currentValue,
      newValue: row.editedValue,
      line: 0,
    })

    try {
      if (!backupFilePath) {
        const createdBackupPath = await CreateBackupFile(targetFile)
        setBackupFilePath(createdBackupPath)
      }

      await ApplyChangeToJson(targetFile, change, row.editedValue)
      setRows((prev) =>
        prev.map((item) =>
          item.path === row.path
            ? { ...item, currentValue: row.editedValue, editedValue: row.editedValue }
            : item
        )
      )
      setSuccess(t('editApplied.rowSaved', { path: row.path }))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setSavingPath('')
    }
  }

  const handleRollbackAll = async () => {
    if (!backupFilePath) {
      setError(t('editApplied.noRollbackBackup'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await RestoreFileFromBackup(targetFile, backupFilePath)
      setBackupFilePath('')
      const refreshed = await ReadJsonFile(targetFile)
      setRows((prev) =>
        prev.map((row) => {
          const nextValue = asEditableString(getNestedValue(refreshed, row.path))
          return {
            ...row,
            currentValue: nextValue,
            editedValue: nextValue,
          }
        })
      )
      setSuccess(t('editApplied.rollbackSuccess'))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-6xl px-4">
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-3">
            <PencilLine className="h-7 w-7" />
            {t('editApplied.title')}
          </CardTitle>
          <CardDescription className="text-base">{t('editApplied.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-base">{t('editApplied.targetFile')}</Label>
            <div className="flex gap-3">
              <Input className="h-12 text-base" value={targetFile} onChange={(e) => setTargetFile(e.target.value)} placeholder={t('editApplied.selectJsonFile')} />
              <Button variant="outline" className="h-12 px-5 text-base" onClick={handleSelectTargetFile}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">{t('editApplied.changesFile')}</Label>
            <div className="flex gap-3">
              <Input className="h-12 text-base" value={changesFile} onChange={(e) => setChangesFile(e.target.value)} placeholder={t('editApplied.selectChangesFile')} />
              <Button variant="outline" className="h-12 px-5 text-base" onClick={handleSelectChangesFile}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
            </div>
          </div>

          <Button className="w-full h-12 text-base" onClick={handleLoad} disabled={loading || !targetFile || !changesFile}>
            {loading ? t('editApplied.loading') : t('editApplied.load')}
          </Button>

          {error && (
            <div className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <span className="text-base">{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 p-4 rounded-md bg-green-50 text-green-700 border border-green-200">
              <CheckCircle className="h-5 w-5 mt-0.5" />
              <span className="text-base">{success}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card className="border-2 mt-6">
          <CardHeader>
            <CardTitle className="text-xl">{t('editApplied.listTitle', { count: rows.length })}</CardTitle>
            <CardDescription>{t('editApplied.listDescription')}</CardDescription>
            <Button
              variant="outline"
              className="w-full sm:w-fit mt-3"
              onClick={handleRollbackAll}
              disabled={loading || !backupFilePath}
            >
              {t('editApplied.rollbackAll')}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
              {rows.map((row) => {
                const isDirty = row.editedValue !== row.currentValue
                return (
                  <div key={row.path} className="rounded-lg border p-4 bg-muted/30 space-y-3">
                    <div className="flex flex-col gap-1">
                      <p className="text-sm text-muted-foreground">{t('editApplied.path')}</p>
                      <code className="text-sm break-all">{row.path}</code>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-6 gap-3 items-end">
                      <div className="lg:col-span-5 space-y-2">
                        <Label className="text-sm">{t('editApplied.currentOrNewValue')}</Label>
                        <Input
                          value={row.editedValue}
                          onChange={(e) => handleRowInputChange(row.path, e.target.value)}
                          className="h-11 text-base"
                        />
                      </div>
                      <Button
                        className="h-11"
                        onClick={() => handleApplyRow(row)}
                        disabled={!isDirty || savingPath === row.path}
                      >
                        {savingPath === row.path ? t('editApplied.saving') : t('editApplied.applyRow')}
                      </Button>
                    </div>

                    {(row.context?.description || row.context?.componentName || row.context?.screenUrl) && (
                      <div className="rounded-md border bg-background p-3 space-y-1">
                        <p className="text-sm font-semibold">{t('editApplied.context')}</p>
                        {row.context?.description && (
                          <p className="text-sm text-muted-foreground">{row.context.description}</p>
                        )}
                        {row.context?.componentName && (
                          <p className="text-sm text-muted-foreground">
                            {t('editApplied.component')}: {row.context.componentName}
                          </p>
                        )}
                        {row.context?.screenUrl && (
                          <a
                            href={row.context.screenUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-primary underline underline-offset-2 break-all"
                          >
                            {row.context.screenUrl}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
