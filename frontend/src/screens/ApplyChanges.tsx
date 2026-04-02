import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, FolderOpen, AlertCircle, CheckCircle, Save, X, ArrowRight } from "lucide-react"
import { CheckAlreadyApplied, GetAppliedChangesAsJson, OpenFileDialog, ReadTextFile, SaveAppliedChanges, SaveFileDialog, SaveTextFile } from "../../wailsjs/go/main/App"
import { main } from "../../wailsjs/go/models"

interface DiffChange {
  type: string
  key: string
  oldValue: string
  newValue: string
  line: number
}

type Step = 'select' | 'review' | 'complete'

export function ApplyChanges() {
  const { t } = useTranslation()
  const [targetFile, setTargetFile] = useState('')
  const [changesFile, setChangesFile] = useState('')
  const [standardizedChanges, setStandardizedChanges] = useState<main.StandardizedDiffChange[]>([])
  const [changes, setChanges] = useState<DiffChange[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [appliedChanges, setAppliedChanges] = useState<DiffChange[]>([])
  const [rejectedChanges, setRejectedChanges] = useState<DiffChange[]>([])
  const [alreadyApplied, setAlreadyApplied] = useState<boolean[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<Step>('select')

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'add':
        return { label: t('applyChanges.add'), color: 'text-green-700 bg-green-100' }
      case 'change':
      case 'modify':
        return { label: t('applyChanges.modify'), color: 'text-amber-700 bg-amber-100' }
      case 'delete':
        return { label: t('applyChanges.delete'), color: 'text-red-700 bg-red-100' }
      default:
        return { label: action, color: 'text-slate-700 bg-slate-100' }
    }
  }

  const getActionCounts = (items: main.StandardizedDiffChange[]) => {
    return items.reduce(
      (acc, item) => {
        if (item.action === 'add') acc.add += 1
        if (item.action === 'change') acc.change += 1
        if (item.action === 'delete') acc.delete += 1
        return acc
      },
      { add: 0, change: 0, delete: 0 }
    )
  }

  const convertToLegacyChanges = (items: main.StandardizedDiffChange[]): DiffChange[] => {
    return items
      .map((item) => {
        const mapped: DiffChange = {
          type: '',
          key: item.path,
          oldValue: item.oldValue || '',
          newValue: item.newValue || '',
          line: item.source?.line || 0,
        }

        if (item.action === 'add') {
          mapped.type = 'add'
        } else if (item.action === 'change') {
          mapped.type = 'modify'
        } else if (item.action === 'delete') {
          mapped.type = 'delete'
        }

        return mapped
      })
      .filter((change) => change.type !== '')
  }

  const parseStandardizedChangeFile = (content: string): main.StandardizedDiffChange[] => {
    const raw = JSON.parse(content)
    if (!Array.isArray(raw)) {
      throw new Error(t('applyChanges.invalidChangesFile'))
    }

    return raw.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error(t('applyChanges.invalidChangeAt', { index: index + 1 }))
      }

      if (!item.action || !item.path) {
        throw new Error(t('applyChanges.invalidChangeAt', { index: index + 1 }))
      }

      return main.StandardizedDiffChange.createFrom(item)
    })
  }

  const handleSelectTargetFile = async () => {
    try {
      const filePath = await OpenFileDialog('Select JSON File', 'JSON Files', '*.json')
      if (filePath) {
        setTargetFile(filePath)
      }
    } catch {
      setError(t('applyChanges.selectFileError'))
    }
  }

  const handleSelectChangesFile = async () => {
    try {
      const filePath = await OpenFileDialog('Select Standardized Changes File', 'JSON Files', '*.json')
      if (filePath) {
        setChangesFile(filePath)
      }
    } catch {
      setError(t('applyChanges.selectFileError'))
    }
  }

  const handleLoadChanges = async () => {
    if (!targetFile || !changesFile) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const content = await ReadTextFile(changesFile)
      const parsedStandardized = parseStandardizedChangeFile(content)
      if (parsedStandardized.length === 0) {
        setError(t('applyChanges.noChangesFound'))
        return
      }

      const legacyChanges = convertToLegacyChanges(parsedStandardized)
      const alreadyAppliedResult = await CheckAlreadyApplied(targetFile, legacyChanges)

      setStandardizedChanges(parsedStandardized)
      setChanges(legacyChanges)
      setAlreadyApplied(alreadyAppliedResult)
      setCurrentIndex(0)
      setAppliedChanges([])
      setRejectedChanges([])
      setOverrides({})
      setStep('review')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const moveToNext = () => {
    if (currentIndex < changes.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setStep('complete')
    }
  }

  const handleApply = () => {
    setAppliedChanges([...appliedChanges, changes[currentIndex]])
    moveToNext()
  }

  const handleReject = () => {
    setRejectedChanges([...rejectedChanges, changes[currentIndex]])
    moveToNext()
  }

  const handleOverrideChange = (value: string) => {
    const currentChange = changes[currentIndex]
    setOverrides({
      ...overrides,
      [currentChange.key]: value,
    })
  }

  const handleDownload = async () => {
    setLoading(true)
    setError('')

    if (appliedChanges.length === 0) {
      setError(t('applyChanges.noAppliedChanges'))
      setLoading(false)
      return
    }

    try {
      const defaultName = targetFile.split('/').pop()?.replace('.json', '_translated.json') || 'translated.json'
      const savePath = await SaveFileDialog('Save translated file', defaultName)

      if (!savePath) {
        setLoading(false)
        return
      }

      const jsonContent = await GetAppliedChangesAsJson(targetFile, appliedChanges, overrides)
      if (!jsonContent) {
        setError(t('applyChanges.emptyOutputError'))
        return
      }

      await SaveTextFile(savePath, jsonContent)
      setSuccess(t('applyChanges.downloadSuccess'))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleOverwrite = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await SaveAppliedChanges(targetFile, appliedChanges, overrides, targetFile)
      setSuccess(t('applyChanges.overwriteSuccess'))
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setTargetFile('')
    setChangesFile('')
    setStandardizedChanges([])
    setChanges([])
    setCurrentIndex(0)
    setAppliedChanges([])
    setRejectedChanges([])
    setAlreadyApplied([])
    setOverrides({})
    setError('')
    setSuccess('')
    setStep('select')
  }

  if (step === 'select') {
    return (
      <div className="container mx-auto py-10 max-w-4xl px-4">
        <Card className="shadow-sm border-2">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-3 text-2xl">
              <FileSpreadsheet className="h-7 w-7" />
              {t('applyChanges.title')}
            </CardTitle>
            <CardDescription className="text-base leading-6">
              {t('applyChanges.descriptionStandardized')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-muted/40 p-5 space-y-2 text-sm">
              <p className="font-semibold text-base">{t('applyChanges.stepsTitle')}</p>
              <p>{t('applyChanges.step1')}</p>
              <p>{t('applyChanges.step2')}</p>
              <p>{t('applyChanges.step3')}</p>
            </div>

            <div className="space-y-3">
              <Label className="text-base">{t('applyChanges.targetFile')}</Label>
              <div className="flex gap-3">
                <Input
                  value={targetFile}
                  placeholder={t('applyChanges.selectJsonFile')}
                  readOnly
                  className="flex-1 h-12 text-base"
                />
                <Button variant="outline" onClick={handleSelectTargetFile} className="h-12 px-5 text-base">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {t('createDiff.browse')}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base">{t('applyChanges.changesFile')}</Label>
              <div className="flex gap-3">
                <Input
                  value={changesFile}
                  placeholder={t('applyChanges.selectChangesFile')}
                  readOnly
                  className="flex-1 h-12 text-base"
                />
                <Button variant="outline" onClick={handleSelectChangesFile} className="h-12 px-5 text-base">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {t('createDiff.browse')}
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5 mt-0.5" />
                <span className="text-base">{error}</span>
              </div>
            )}

            <Button
              className="w-full h-12 mt-3 text-base"
              onClick={handleLoadChanges}
              disabled={loading || !targetFile || !changesFile}
            >
              {loading ? t('applyChanges.loading') : t('applyChanges.loadChanges')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'review') {
    const currentChange = changes[currentIndex]
    const currentStandardized = standardizedChanges[currentIndex]
    const actionStyle = getActionLabel(currentStandardized?.action || currentChange.type)
    const isAlreadyApplied = alreadyApplied[currentIndex]
    const actionCounts = getActionCounts(standardizedChanges)

    return (
      <div className="container mx-auto py-10 max-w-4xl px-4">
        <Card className="shadow-sm border-2">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-3 text-2xl">
              <FileSpreadsheet className="h-7 w-7" />
              {t('applyChanges.reviewChanges')}
            </CardTitle>
            <CardDescription className="text-base">
              {t('applyChanges.changeNumber', { current: currentIndex + 1, total: changes.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground mb-2">{t('applyChanges.changesSummaryTitle')}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                  {t('applyChanges.add')}: {actionCounts.add}
                </span>
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {t('applyChanges.modify')}: {actionCounts.change}
                </span>
                <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                  {t('applyChanges.delete')}: {actionCounts.delete}
                </span>
              </div>
            </div>

            <div className="rounded-lg border p-5 bg-muted/40 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('applyChanges.translationKey')}</p>
                  <p className="text-lg font-semibold break-all">{currentChange.key}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${actionStyle.color}`}>
                  {actionStyle.label}
                </span>
              </div>

              {currentStandardized?.source?.file && (
                <p className="text-sm text-muted-foreground">
                  {t('applyChanges.sourceFile')}: {currentStandardized.source.file}
                </p>
              )}

              {currentChange.type !== 'add' && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('applyChanges.currentValue')}</p>
                  <div className="rounded-md border bg-background p-3 text-base text-red-600 break-words">
                    {currentChange.oldValue || '(empty)'}
                  </div>
                </div>
              )}

              {currentChange.type !== 'delete' && (
                <div>
                  <p className="text-sm font-medium mb-1">{t('applyChanges.newValue')}</p>
                  <div className="rounded-md border bg-background p-3 text-base text-green-700 break-words">
                    {currentChange.newValue || '(empty)'}
                  </div>
                </div>
              )}

              {(currentChange.type === 'add' || currentChange.type === 'modify') && !isAlreadyApplied && (
                <div className="space-y-2">
                  <Label className="text-base">{t('applyChanges.overrideValue')} ({t('applyChanges.optional')})</Label>
                  <Input
                    placeholder={currentChange.newValue}
                    value={overrides[currentChange.key] || ''}
                    onChange={(e) => handleOverrideChange(e.target.value)}
                    className="h-12 text-base"
                  />
                </div>
              )}
            </div>

            {isAlreadyApplied && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-blue-700 text-base">
                {t('applyChanges.alreadyAppliedMessage')}
              </div>
            )}

            {isAlreadyApplied ? (
              <Button className="w-full h-12 text-base" onClick={moveToNext}>
                <ArrowRight className="h-4 w-4 mr-2" />
                {t('applyChanges.nextChange')}
              </Button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="outline" className="h-12 text-base" onClick={handleReject}>
                  <X className="h-4 w-4 mr-2" />
                  {t('applyChanges.reject')}
                </Button>
                <Button className="h-12 text-base" onClick={handleApply}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('applyChanges.apply')}
                </Button>
              </div>
            )}

            <div className="rounded-md border p-3 text-sm text-muted-foreground text-center">
              {appliedChanges.length} {t('applyChanges.applied')} | {rejectedChanges.length} {t('applyChanges.rejected')} | {alreadyApplied.filter(Boolean).length} {t('applyChanges.alreadyApplied')}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'complete') {
    return (
      <div className="container mx-auto py-10 max-w-4xl px-4">
        <Card className="shadow-sm border-2">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-3 text-2xl">
              <CheckCircle className="h-7 w-7 text-green-600" />
              {t('applyChanges.complete')}
            </CardTitle>
            <CardDescription className="text-base">
              {t('applyChanges.summary', { applied: appliedChanges.length, rejected: rejectedChanges.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {appliedChanges.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base">{t('applyChanges.willApply')}</Label>
                <div className="space-y-2">
                  {appliedChanges.map((change, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm bg-muted/40 rounded-md p-2">
                      <span className="text-green-600 mt-0.5">+</span>
                      <code className="break-all">{change.key}</code>
                      {overrides[change.key] && (
                        <span className="text-muted-foreground">→ {overrides[change.key]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rejectedChanges.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base">{t('applyChanges.willReject')}</Label>
                <div className="space-y-2">
                  {rejectedChanges.map((change, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm bg-muted/40 rounded-md p-2">
                      <span className="text-red-600 mt-0.5">-</span>
                      <code className="break-all">{change.key}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <Button variant="outline" className="h-12 text-base" onClick={handleReset}>
                {t('applyChanges.startOver')}
              </Button>
              <Button className="h-12 text-base" onClick={handleDownload} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {t('applyChanges.downloadFile')}
              </Button>
              <Button variant="secondary" className="h-12 text-base" onClick={handleOverwrite} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {t('applyChanges.overwriteFile')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
