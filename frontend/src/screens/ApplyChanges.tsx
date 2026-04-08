import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, FolderOpen, AlertCircle, CheckCircle, X, ArrowRight } from "lucide-react"
import { ApplyChangeToJson, CheckAlreadyApplied, CreateBackupFile, DeleteFile, OpenFileDialog, ReadTextFile, RestoreFileFromBackup } from "../../wailsjs/go/main/App"
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
  const placeholderContextImageUrl = 'https://www.flandersclassics.be/_media/blocks/image/1701958876/crop/2000/0/892/892.jpg'
  const [targetFileFr, setTargetFileFr] = useState('')
  const [targetFileNl, setTargetFileNl] = useState('')
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
  const [backupFilePathFr, setBackupFilePathFr] = useState('')
  const [backupFilePathNl, setBackupFilePathNl] = useState('')
  const [isContextImageOpen, setIsContextImageOpen] = useState(false)
  const [reviewMode, setReviewMode] = useState<'remaining' | 'all'>('remaining')

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

  const getLanguageValue = (item: main.StandardizedDiffChange, language: 'fr' | 'nl') => {
    return item.values?.[language]
  }

  const convertToLegacyChanges = (items: main.StandardizedDiffChange[], language: 'fr' | 'nl'): DiffChange[] => {
    return items
      .map((item) => {
        const langValue = getLanguageValue(item, language)
        const oldValue = langValue?.oldValue ?? item.oldValue ?? ''
        const newValue = langValue?.newValue ?? item.newValue ?? ''

        const mapped: DiffChange = {
          type: '',
          key: item.path,
          oldValue,
          newValue,
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

  const cleanupBackupFile = async () => {
    if (backupFilePathFr) {
      try {
        await DeleteFile(backupFilePathFr)
      } catch {
        // ignore cleanup errors
      }
    }

    if (backupFilePathNl) {
      try {
        await DeleteFile(backupFilePathNl)
      } catch {
        // ignore cleanup errors
      }
    }

    setBackupFilePathFr('')
    setBackupFilePathNl('')
  }

  const parseStandardizedChangeFile = (content: string): main.StandardizedDiffChange[] => {
    const isValidScreenUrl = (value: string) => {
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    }

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

      if (item.context?.screenUrl && !isValidScreenUrl(item.context.screenUrl)) {
        throw new Error(t('applyChanges.invalidScreenUrlAt', { index: index + 1 }))
      }

      return main.StandardizedDiffChange.createFrom(item)
    })
  }

  const handleSelectTargetFileFr = async () => {
    try {
      const filePath = await OpenFileDialog('Select JSON File', 'JSON Files', '*.json')
      if (filePath) {
        setTargetFileFr(filePath)
      }
    } catch {
      setError(t('applyChanges.selectFileError'))
    }
  }

  const handleSelectTargetFileNl = async () => {
    try {
      const filePath = await OpenFileDialog('Select JSON File', 'JSON Files', '*.json')
      if (filePath) {
        setTargetFileNl(filePath)
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
    if (!targetFileFr || !targetFileNl || !changesFile) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    await cleanupBackupFile()

    try {
      const content = await ReadTextFile(changesFile)
      const parsedStandardized = parseStandardizedChangeFile(content)
      if (parsedStandardized.length === 0) {
        setError(t('applyChanges.noChangesFound'))
        return
      }

      const legacyChangesFr = convertToLegacyChanges(parsedStandardized, 'fr')
      const legacyChangesNl = convertToLegacyChanges(parsedStandardized, 'nl')
      const [alreadyAppliedFr, alreadyAppliedNl] = await Promise.all([
        CheckAlreadyApplied(targetFileFr, legacyChangesFr),
        CheckAlreadyApplied(targetFileNl, legacyChangesNl),
      ])
      const alreadyAppliedResult = alreadyAppliedFr.map((value, index) => value && alreadyAppliedNl[index])

      setStandardizedChanges(parsedStandardized)
      setChanges(legacyChangesFr)
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

  const computeRemainingIndices = (appliedStatus: boolean[], applied: DiffChange[], rejected: DiffChange[]) => {
    return changes
      .map((_, i) => i)
      .filter((i) => {
        return !appliedStatus[i] && !applied.some((a) => a.key === changes[i].key) && !rejected.some((r) => r.key === changes[i].key)
      })
  }

  const getRemainingIndices = () => {
    return computeRemainingIndices(alreadyApplied, appliedChanges, rejectedChanges)
  }

  const getDisplayIndex = (remainingIndices: number[]) => {
    if (reviewMode === 'remaining') {
      return remainingIndices[currentIndex] ?? -1
    }
    return currentIndex
  }

  const handleApply = () => {
    const applyChange = async () => {
      setLoading(true)
      setError('')

      try {
        if (!backupFilePathFr) {
          const createdBackupPathFr = await CreateBackupFile(targetFileFr)
          setBackupFilePathFr(createdBackupPathFr)
        }
        if (!backupFilePathNl) {
          const createdBackupPathNl = await CreateBackupFile(targetFileNl)
          setBackupFilePathNl(createdBackupPathNl)
        }

        const remainingIndices = getRemainingIndices()
        const displayIndex = getDisplayIndex(remainingIndices)
        const change = changes[displayIndex]
        if (!change) {
          setStep('complete')
          return
        }
        const overrideValue = overrides[change.key]
        const newValue = overrideValue || change.newValue

        const changeFr = convertToLegacyChanges([standardizedChanges[displayIndex]], 'fr')[0]
        const changeNl = convertToLegacyChanges([standardizedChanges[displayIndex]], 'nl')[0]
        const overrideValueNl = overrides[`${change.key}__nl`] || ''

        await ApplyChangeToJson(targetFileFr, main.DiffChange.createFrom({
          type: changeFr.type,
          key: changeFr.key,
          oldValue: changeFr.oldValue,
          newValue,
          line: changeFr.line,
        }), newValue)

        await ApplyChangeToJson(targetFileNl, main.DiffChange.createFrom({
          type: changeNl.type,
          key: changeNl.key,
          oldValue: changeNl.oldValue,
          newValue: overrideValueNl || changeNl.newValue,
          line: changeNl.line,
        }), overrideValueNl || changeNl.newValue)

        const updatedAppliedChanges = [...appliedChanges, change]
        const allChangesFr = convertToLegacyChanges(standardizedChanges, 'fr')
        const allChangesNl = convertToLegacyChanges(standardizedChanges, 'nl')
        const [refreshedFr, refreshedNl] = await Promise.all([
          CheckAlreadyApplied(targetFileFr, allChangesFr),
          CheckAlreadyApplied(targetFileNl, allChangesNl),
        ])
        const refreshedAlreadyApplied = refreshedFr.map((value, index) => value && refreshedNl[index])
        setAppliedChanges(updatedAppliedChanges)
        setAlreadyApplied(refreshedAlreadyApplied)

        if (reviewMode === 'remaining') {
          const remainingAfterApply = computeRemainingIndices(refreshedAlreadyApplied, updatedAppliedChanges, rejectedChanges)
          if (remainingAfterApply.length === 0) {
            setStep('complete')
          } else if (currentIndex >= remainingAfterApply.length) {
            setCurrentIndex(remainingAfterApply.length - 1)
          }
        } else {
          const nextIdx = currentIndex + 1
          if (nextIdx < changes.length) {
            setCurrentIndex(nextIdx)
          } else {
            setStep('complete')
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    void applyChange()
  }

  const handleReject = () => {
    const remainingIndices = getRemainingIndices()
    const displayIndex = getDisplayIndex(remainingIndices)
    const change = changes[displayIndex]
    if (!change) {
      setStep('complete')
      return
    }

    setRejectedChanges([...rejectedChanges, change])

    if (reviewMode === 'remaining') {
      const remainingAfterReject = remainingIndices.filter((index) => index !== displayIndex)
      if (remainingAfterReject.length === 0) {
        setStep('complete')
      } else if (currentIndex >= remainingAfterReject.length) {
        setCurrentIndex(remainingAfterReject.length - 1)
      }
    } else {
      const nextIdx = currentIndex + 1
      if (nextIdx < changes.length) {
        setCurrentIndex(nextIdx)
      } else {
        setStep('complete')
      }
    }
  }

  const handleApplyAll = async () => {
    setLoading(true)
    setError('')

    try {
      if (!backupFilePathFr) {
        const createdBackupPathFr = await CreateBackupFile(targetFileFr)
        setBackupFilePathFr(createdBackupPathFr)
      }
      if (!backupFilePathNl) {
        const createdBackupPathNl = await CreateBackupFile(targetFileNl)
        setBackupFilePathNl(createdBackupPathNl)
      }

      const appliedSet = new Set(appliedChanges.map((change) => change.key))
      const rejectedSet = new Set(rejectedChanges.map((change) => change.key))

      const indicesToApply = reviewMode === 'remaining'
        ? getRemainingIndices()
        : changes
            .map((_, index) => index)
            .filter((index) => {
              if (index < currentIndex) return false
              if (alreadyApplied[index]) return false
              if (appliedSet.has(changes[index].key)) return false
              if (rejectedSet.has(changes[index].key)) return false
              return true
            })

      const appliedNow: DiffChange[] = []
      for (const index of indicesToApply) {
        const change = changes[index]
        const overrideValue = overrides[change.key]
        const newValue = overrideValue || change.newValue
        const changeFr = convertToLegacyChanges([standardizedChanges[index]], 'fr')[0]
        const changeNl = convertToLegacyChanges([standardizedChanges[index]], 'nl')[0]

        await ApplyChangeToJson(targetFileFr, main.DiffChange.createFrom({
          type: changeFr.type,
          key: changeFr.key,
          oldValue: changeFr.oldValue,
          newValue,
          line: changeFr.line,
        }), newValue)

        await ApplyChangeToJson(targetFileNl, main.DiffChange.createFrom({
          type: changeNl.type,
          key: changeNl.key,
          oldValue: changeNl.oldValue,
          newValue: changeNl.newValue,
          line: changeNl.line,
        }), changeNl.newValue)

        appliedNow.push(change)
      }

      const updatedAppliedChanges = [...appliedChanges, ...appliedNow]
      const allChangesFr = convertToLegacyChanges(standardizedChanges, 'fr')
      const allChangesNl = convertToLegacyChanges(standardizedChanges, 'nl')
      const [refreshedFr, refreshedNl] = await Promise.all([
        CheckAlreadyApplied(targetFileFr, allChangesFr),
        CheckAlreadyApplied(targetFileNl, allChangesNl),
      ])
      const refreshedAlreadyApplied = refreshedFr.map((value, index) => value && refreshedNl[index])
      setAppliedChanges(updatedAppliedChanges)
      setAlreadyApplied(refreshedAlreadyApplied)
      setStep('complete')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleOverrideChange = (value: string) => {
    const remainingIndices = getRemainingIndices()
    const displayIndex = getDisplayIndex(remainingIndices)
    const currentChange = changes[displayIndex]
    if (!currentChange) {
      return
    }
    setOverrides({
      ...overrides,
      [currentChange.key]: value,
    })
  }

  const handleAbort = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (backupFilePathFr) {
        await RestoreFileFromBackup(targetFileFr, backupFilePathFr)
      }
      if (backupFilePathNl) {
        await RestoreFileFromBackup(targetFileNl, backupFilePathNl)
      }

      setSuccess(t('applyChanges.abortSuccess'))
      setTargetFileFr('')
      setTargetFileNl('')
      setChangesFile('')
      setStandardizedChanges([])
      setChanges([])
      setCurrentIndex(0)
      setAppliedChanges([])
      setRejectedChanges([])
      setAlreadyApplied([])
      setOverrides({})
      setBackupFilePathFr('')
      setBackupFilePathNl('')
      setStep('select')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    await cleanupBackupFile()
    setTargetFileFr('')
    setTargetFileNl('')
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
              <Label className="text-base">{t('applyChanges.targetFileFr')}</Label>
              <div className="flex gap-3">
                <Input
                  value={targetFileFr}
                  placeholder={t('applyChanges.selectFrJsonFile')}
                  onChange={(e) => setTargetFileFr(e.target.value)}
                  className="flex-1 h-12 text-base"
                />
                <Button variant="outline" onClick={handleSelectTargetFileFr} className="h-12 px-5 text-base">
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {t('createDiff.browse')}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-base">{t('applyChanges.targetFileNl')}</Label>
              <div className="flex gap-3">
                <Input
                  value={targetFileNl}
                  placeholder={t('applyChanges.selectNlJsonFile')}
                  onChange={(e) => setTargetFileNl(e.target.value)}
                  className="flex-1 h-12 text-base"
                />
                <Button variant="outline" onClick={handleSelectTargetFileNl} className="h-12 px-5 text-base">
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
                  onChange={(e) => setChangesFile(e.target.value)}
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
              disabled={loading || !targetFileFr || !targetFileNl || !changesFile}
            >
              {loading ? t('applyChanges.loading') : t('applyChanges.loadChanges')}
            </Button>

            <Button
              variant="outline"
              className="w-full h-12 text-base"
              onClick={handleAbort}
              disabled={loading}
            >
              {t('applyChanges.abort')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'review') {
    const remainingIndices = getRemainingIndices()
    const displayIndex = getDisplayIndex(remainingIndices)
    if (displayIndex < 0 || !changes[displayIndex]) {
      return (
        <div className="container mx-auto py-10 max-w-4xl px-4">
          <Card className="shadow-sm border-2">
            <CardHeader className="space-y-3">
              <CardTitle className="flex items-center gap-3 text-2xl">
                <CheckCircle className="h-7 w-7 text-green-600" />
                {t('applyChanges.complete')}
              </CardTitle>
              <CardDescription className="text-base">
                {t('applyChanges.alreadyAppliedMessage')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-3 text-sm text-muted-foreground text-center">
                {appliedChanges.length} {t('applyChanges.applied')} | {rejectedChanges.length} {t('applyChanges.rejected')} | {alreadyApplied.filter(Boolean).length} {t('applyChanges.alreadyApplied')}
              </div>
              <Button variant="outline" className="w-full h-12 text-base" onClick={() => void handleReset()}>
                {t('applyChanges.startOver')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }
    const currentChange = changes[displayIndex]
    const currentStandardized = standardizedChanges[displayIndex]
    const actionStyle = getActionLabel(currentStandardized?.action || currentChange.type)
    const isAlreadyApplied = alreadyApplied[displayIndex]
    const isAppliedByUser = appliedChanges.some((a) => a.key === currentChange.key)
    const isRejectedByUser = rejectedChanges.some((r) => r.key === currentChange.key)
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
              {reviewMode === 'remaining'
                ? `${remainingIndices.length} ${t('applyChanges.remainingChanges')}`
                : t('applyChanges.changeNumber', { current: currentIndex + 1, total: changes.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={reviewMode === 'remaining' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setReviewMode('remaining')
                  setCurrentIndex(0)
                }}
              >
                {t('applyChanges.reviewRemaining')} ({remainingIndices.length})
              </Button>
              <Button
                variant={reviewMode === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setReviewMode('all')
                  setCurrentIndex(0)
                }}
              >
                {t('applyChanges.reviewAll')} ({changes.length})
              </Button>
            </div>

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

              <div className="rounded-md border bg-background p-3 space-y-3">
                <p className="text-sm font-semibold">{t('applyChanges.contextTitle')}</p>
                {currentStandardized?.context?.description && (
                  <p className="text-sm text-muted-foreground">
                    {t('applyChanges.contextDescription')}: {currentStandardized.context.description}
                  </p>
                )}
                {currentStandardized?.context?.componentName && (
                  <p className="text-sm text-muted-foreground">
                    {t('applyChanges.contextComponent')}: {currentStandardized.context.componentName}
                  </p>
                )}
                {currentStandardized?.context?.screenUrl && (
                  <a
                    href={currentStandardized.context.screenUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sm text-primary underline underline-offset-2 break-all"
                  >
                    {t('applyChanges.contextScreenUrl')}: {currentStandardized.context.screenUrl}
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => setIsContextImageOpen(true)}
                  className="block text-left"
                >
                  <img
                    src={placeholderContextImageUrl}
                    alt="Context preview"
                    className="h-36 w-full max-w-xs object-cover rounded-md border cursor-zoom-in"
                  />
                </button>
              </div>

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
              <div className="rounded-md border border-[#ff6f0d]/30 bg-[#ff6f0d]/10 p-4 text-[#ff6f0d] text-base">
                {t('applyChanges.alreadyAppliedMessage')}
              </div>
            )}

            {isAppliedByUser && (
              <div className="rounded-md border border-green-300 bg-green-50 p-4 text-green-700 text-base">
                {t('applyChanges.appliedByUser')}
              </div>
            )}

            {isRejectedByUser && (
              <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-700 text-base">
                {t('applyChanges.rejectedByUser')}
              </div>
            )}

            {isAlreadyApplied ? (
              <Button className="w-full h-12 text-base" onClick={() => {
                if (reviewMode === 'remaining') {
                  const nextIdx = currentIndex + 1
                  if (nextIdx < remainingIndices.length) {
                    setCurrentIndex(nextIdx)
                  } else {
                    setStep('complete')
                  }
                } else {
                  const nextIdx = currentIndex + 1
                  if (nextIdx < changes.length) {
                    setCurrentIndex(nextIdx)
                  } else {
                    setStep('complete')
                  }
                }
              }} disabled={reviewMode === 'remaining' ? currentIndex >= remainingIndices.length - 1 : currentIndex >= changes.length - 1}>
                <ArrowRight className="h-4 w-4 mr-2" />
                {t('applyChanges.nextChange')}
              </Button>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button variant="outline" className="h-12 text-base" onClick={handleReject}>
                  <X className="h-4 w-4 mr-2" />
                  {t('applyChanges.reject')}
                </Button>
                <Button className="h-12 text-base" onClick={handleApply}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('applyChanges.apply')}
                </Button>
                <Button variant="secondary" className="h-12 text-base" onClick={handleApplyAll} disabled={loading}>
                  {t('applyChanges.applyAll')}
                </Button>
              </div>
            )}

            <Button variant="outline" className="w-full h-12 text-base" onClick={handleAbort} disabled={loading}>
              {t('applyChanges.abort')}
            </Button>

            <div className="rounded-md border p-3 text-sm text-muted-foreground text-center">
              {appliedChanges.length} {t('applyChanges.applied')} | {rejectedChanges.length} {t('applyChanges.rejected')} | {alreadyApplied.filter(Boolean).length} {t('applyChanges.alreadyApplied')}
            </div>

            {isContextImageOpen && (
              <div
                className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                onClick={() => setIsContextImageOpen(false)}
              >
                <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="absolute -top-10 right-0 text-white text-sm underline"
                    onClick={() => setIsContextImageOpen(false)}
                  >
                    Close
                  </button>
                  <img
                    src={placeholderContextImageUrl}
                    alt="Context preview large"
                    className="w-full max-h-[85vh] object-contain rounded-md"
                  />
                </div>
              </div>
            )}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Button variant="outline" className="h-12 text-base" onClick={handleReset}>
                {t('applyChanges.startOver')}
              </Button>
              <Button variant="secondary" className="h-12 text-base" onClick={handleAbort} disabled={loading}>
                {t('applyChanges.abort')}
              </Button>
            </div>

            <div className="rounded-md border p-3 text-sm text-muted-foreground text-center">
              {t('applyChanges.multiLangAppliedInfo')}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
