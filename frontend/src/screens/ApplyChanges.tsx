import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, FolderOpen, AlertCircle, CheckCircle, ChevronRight, Save, ArrowRight, X, SkipForward } from "lucide-react"
import { ParseDiffFile, ReadJsonFile, SaveAppliedChanges, CheckAlreadyApplied, OpenFileDialog, ReadTextFile, GetAppliedChangesAsJson, SaveFileDialog, SaveTextFile } from "../../wailsjs/go/main/App"
import { DiffViewer } from "@/components/DiffViewer"

interface DiffChange {
  type: string
  key: string
  oldValue: string
  newValue: string
  line: number
}

export function ApplyChanges() {
  const { t } = useTranslation()
  const [targetFile, setTargetFile] = useState('')
  const [diffFile, setDiffFile] = useState('')
  const [diffContent, setDiffContent] = useState('')
  const [changes, setChanges] = useState<DiffChange[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [appliedChanges, setAppliedChanges] = useState<DiffChange[]>([])
  const [rejectedChanges, setRejectedChanges] = useState<DiffChange[]>([])
  const [alreadyApplied, setAlreadyApplied] = useState<boolean[]>([])
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'select' | 'review' | 'complete'>('select')

  const handleSelectTargetFile = async () => {
    try {
      const filePath = await OpenFileDialog('Select JSON File', 'JSON Files', '*.json')
      if (filePath) {
        setTargetFile(filePath)
      }
    } catch (err) {
      setError('Failed to select file')
    }
  }

  const handleSelectDiffFile = async () => {
    try {
      const filePath = await OpenFileDialog('Select Diff File', 'Diff/Patch Files', '*.patch;*.diff;*.txt')
      if (filePath) {
        setDiffFile(filePath)
        const content = await ReadTextFile(filePath)
        setDiffContent(content)
      }
    } catch (err) {
      setError('Failed to select file')
    }
  }

  const handleLoadDiff = async () => {
    if (!targetFile || !diffFile) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')

    if (!diffContent) {
      setError('Diff file is empty or not loaded')
      setLoading(false)
      return
    }

    try {
      const parsedChanges = await ParseDiffFile(diffContent)
      if (!parsedChanges || parsedChanges.length === 0) {
        setError('No changes found in diff file')
        return
      }

      const alreadyAppliedResult = await CheckAlreadyApplied(targetFile, parsedChanges)
      setAlreadyApplied(alreadyAppliedResult)
      setChanges(parsedChanges)
      setCurrentIndex(0)
      setAppliedChanges([])
      setRejectedChanges([])
      setOverrides({})
      setStep('review')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError('Error parsing diff: ' + errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    const currentChange = changes[currentIndex]
    setAppliedChanges([...appliedChanges, currentChange])
    moveToNext()
  }

  const handleApplyWithOverride = () => {
    const currentChange = changes[currentIndex]
    setAppliedChanges([...appliedChanges, currentChange])
    moveToNext()
  }

  const handleReject = () => {
    const currentChange = changes[currentIndex]
    setRejectedChanges([...rejectedChanges, currentChange])
    moveToNext()
  }

  const moveToNext = () => {
    if (currentIndex < changes.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      setStep('complete')
    }
  }

  const handleDownload = async () => {
    setLoading(true)
    setError('')

    if (appliedChanges.length === 0) {
      setError('No changes applied')
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
        setError('No content returned')
        alert('No content returned')
        return
      }

      await SaveTextFile(savePath, jsonContent)
      alert('File saved to: ' + savePath)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('Download error:', errorMessage)
      alert('Error: ' + errorMessage)
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
    setDiffFile('')
    setDiffContent('')
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

  const handleOverrideChange = (value: string) => {
    const currentChange = changes[currentIndex]
    setOverrides({
      ...overrides,
      [currentChange.key]: value
    })
  }

  const getChangeTypeLabel = (type: string) => {
    switch (type) {
      case 'add': return { label: t('applyChanges.add'), color: 'text-green-600' }
      case 'modify': return { label: t('applyChanges.modify'), color: 'text-yellow-600' }
      case 'delete': return { label: t('applyChanges.delete'), color: 'text-red-600' }
      default: return { label: type, color: 'text-gray-600' }
    }
  }

  if (step === 'select') {
    return (
      <div className="container mx-auto py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              {t('applyChanges.title')}
            </CardTitle>
            <CardDescription>
              {t('applyChanges.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('applyChanges.targetFile')}</Label>
              <div className="flex gap-2">
                <Input 
                  value={targetFile} 
                  placeholder={t('applyChanges.selectJsonFile')} 
                  readOnly 
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleSelectTargetFile}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {t('createDiff.browse')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('applyChanges.diffFile')}</Label>
              <div className="flex gap-2">
                <Input 
                  value={diffFile} 
                  placeholder={t('applyChanges.selectDiffFile')} 
                  readOnly 
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleSelectDiffFile}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  {t('createDiff.browse')}
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <Button 
              className="w-full mt-6" 
              onClick={handleLoadDiff}
              disabled={loading || !targetFile || !diffFile}
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
    const changeType = getChangeTypeLabel(currentChange.type)
    const isAlreadyApplied = alreadyApplied[currentIndex]

    const extractDiffSection = () => {
      if (!diffContent) return ''
      const lines = diffContent.split('\n')
      const relevantLines: string[] = []
      let foundKey = false
      let linesAdded = 0
      
      for (const line of lines) {
        const keyPart = currentChange.key.split('.').pop() || ''
        if (line.includes(keyPart)) {
          foundKey = true
        }
        if (foundKey) {
          relevantLines.push(line)
          linesAdded++
          if (linesAdded >= 6) break
        }
      }
      return relevantLines.join('\n')
    }

    const diffSection = extractDiffSection()

    return (
      <div className="container mx-auto py-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              {t('applyChanges.reviewChanges')}
            </CardTitle>
            <CardDescription>
              {t('applyChanges.changeNumber', { current: currentIndex + 1, total: changes.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <details className="rounded-md border">
              <summary className="px-4 py-2 cursor-pointer bg-muted font-medium text-sm">
                {t('applyChanges.fullDiff')} ({changes.length} {t('applyChanges.changes')})
              </summary>
              <div className="p-3">
                <DiffViewer content={diffContent} maxHeight="max-h-48" />
              </div>
            </details>

            {diffSection && (
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">{t('applyChanges.rawDiff')}</Label>
                <DiffViewer content={diffSection} maxHeight="max-h-32" />
              </div>
            )}

            <div className="p-4 rounded-lg bg-muted space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Key:</span>
                <code className="bg-background px-2 py-1 rounded text-sm">{currentChange.key}</code>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Type:</span>
                <span className={`text-sm font-medium ${changeType.color}`}>
                  {changeType.label}
                </span>
                {isAlreadyApplied && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                    {t('applyChanges.alreadyApplied')}
                  </span>
                )}
              </div>

              {currentChange.type !== 'add' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('applyChanges.currentValue')}:</span>
                  <code className="bg-background px-2 py-1 rounded text-sm text-red-500">
                    {currentChange.oldValue || '(empty)'}
                  </code>
                </div>
              )}

              {(currentChange.type === 'add' || currentChange.type === 'modify') && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('applyChanges.newValue')}:</span>
                  <code className="bg-background px-2 py-1 rounded text-sm text-green-500">
                    {currentChange.newValue}
                  </code>
                </div>
              )}
            </div>

            {(currentChange.type === 'add' || currentChange.type === 'modify') && !isAlreadyApplied && (
              <div className="space-y-2">
                <Label>{t('applyChanges.overrideValue')} ({t('applyChanges.optional')})</Label>
                <Input
                  placeholder={currentChange.newValue}
                  value={overrides[currentChange.key] || ''}
                  onChange={(e) => handleOverrideChange(e.target.value)}
                />
              </div>
            )}

            {isAlreadyApplied ? (
              <Button 
                className="w-full"
                onClick={moveToNext}
              >
                <ChevronRight className="h-4 w-4 mr-2" />
                {t('applyChanges.nextChange')}
              </Button>
            ) : (
              <div className="flex gap-4">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={handleReject}
                >
                  <X className="h-4 w-4 mr-2" />
                  {t('applyChanges.reject')}
                </Button>
                <Button 
                  className="flex-1"
                  onClick={currentChange.type === 'delete' ? handleApply : handleApplyWithOverride}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('applyChanges.apply')}
                </Button>
              </div>
            )}

            <div className="text-sm text-muted-foreground text-center">
              {appliedChanges.length} {t('applyChanges.applied')} | {rejectedChanges.length} {t('applyChanges.rejected')} | {alreadyApplied.filter(a => a).length} {t('applyChanges.alreadyApplied')}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'complete') {
    return (
      <div className="container mx-auto py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              {t('applyChanges.complete')}
            </CardTitle>
            <CardDescription>
              {t('applyChanges.summary', { applied: appliedChanges.length, rejected: rejectedChanges.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {appliedChanges.length > 0 && (
              <div className="space-y-2">
                <Label>{t('applyChanges.willApply')}</Label>
                <div className="space-y-1">
                  {appliedChanges.map((change, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">+</span>
                      <code className="bg-muted px-2 py-1 rounded">{change.key}</code>
                      {overrides[change.key] && (
                        <span className="text-muted-foreground">→ {overrides[change.key]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rejectedChanges.length > 0 && (
              <div className="space-y-2">
                <Label>{t('applyChanges.willReject')}</Label>
                <div className="space-y-1">
                  {rejectedChanges.map((change, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-red-500">-</span>
                      <code className="bg-muted px-2 py-1 rounded">{change.key}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 text-green-700 border border-green-200">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{success}</span>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-4">
              <div className="flex gap-4">
                <Button variant="outline" className="flex-1" onClick={handleReset}>
                  {t('applyChanges.startOver')}
                </Button>
              </div>
              <div className="flex gap-4">
                <Button className="flex-1" onClick={handleDownload} disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {t('applyChanges.downloadFile')}
                </Button>
                <Button variant="secondary" className="flex-1" onClick={handleOverwrite} disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {t('applyChanges.overwriteFile')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}
