import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, CheckCircle, FolderOpen, Languages } from 'lucide-react'
import { OpenFileDialog, ReadJsonFile } from '../../wailsjs/go/main/App'

function collectLeafPaths(value: unknown, basePath = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return basePath ? [basePath] : []
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) {
    return basePath ? [basePath] : []
  }

  const paths: string[] = []
  for (const [key, child] of entries) {
    const nextPath = basePath ? `${basePath}.${key}` : key
    paths.push(...collectLeafPaths(child, nextPath))
  }

  return paths
}

export function I18nChecks() {
  const { t } = useTranslation()
  const [frFilePath, setFrFilePath] = useState('')
  const [nlFilePath, setNlFilePath] = useState('')
  const [missingInNl, setMissingInNl] = useState<string[]>([])
  const [missingInFr, setMissingInFr] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)

  const handleSelectFrFile = async () => {
    try {
      const selectedPath = await OpenFileDialog('Select FR JSON File', 'JSON Files', '*.json')
      if (selectedPath) {
        setFrFilePath(selectedPath)
      }
    } catch {
      setError(t('i18nChecks.selectFileError'))
    }
  }

  const handleSelectNlFile = async () => {
    try {
      const selectedPath = await OpenFileDialog('Select NL JSON File', 'JSON Files', '*.json')
      if (selectedPath) {
        setNlFilePath(selectedPath)
      }
    } catch {
      setError(t('i18nChecks.selectFileError'))
    }
  }

  const handleRunChecks = async () => {
    if (!frFilePath || !nlFilePath) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')
    setChecked(false)

    try {
      const [frJson, nlJson] = await Promise.all([
        ReadJsonFile(frFilePath),
        ReadJsonFile(nlFilePath),
      ])

      const frPaths = new Set(collectLeafPaths(frJson))
      const nlPaths = new Set(collectLeafPaths(nlJson))

      const missingFromNl = [...frPaths].filter((key) => !nlPaths.has(key)).sort((a, b) => a.localeCompare(b))
      const missingFromFr = [...nlPaths].filter((key) => !frPaths.has(key)).sort((a, b) => a.localeCompare(b))

      setMissingInNl(missingFromNl)
      setMissingInFr(missingFromFr)
      setChecked(true)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-5xl px-4">
      <Card className="border-2">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl flex items-center gap-3">
            <Languages className="h-7 w-7" />
            {t('i18nChecks.title')}
          </CardTitle>
          <CardDescription className="text-base">
            {t('i18nChecks.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <span className="font-semibold">{t('i18nChecks.referenceHintTitle')}: </span>
            {t('i18nChecks.referenceHint')}
          </div>

          <div className="space-y-2">
            <Label className="text-base">{t('i18nChecks.frFile')}</Label>
            <div className="flex gap-3">
              <Input
                className="h-12 text-base"
                value={frFilePath}
                onChange={(e) => setFrFilePath(e.target.value)}
                placeholder={t('i18nChecks.selectFrFile')}
              />
              <Button variant="outline" className="h-12 px-5 text-base" onClick={handleSelectFrFile}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-base">{t('i18nChecks.nlFile')}</Label>
            <div className="flex gap-3">
              <Input
                className="h-12 text-base"
                value={nlFilePath}
                onChange={(e) => setNlFilePath(e.target.value)}
                placeholder={t('i18nChecks.selectNlFile')}
              />
              <Button variant="outline" className="h-12 px-5 text-base" onClick={handleSelectNlFile}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
            </div>
          </div>

          <Button className="w-full h-12 text-base" onClick={handleRunChecks} disabled={loading}>
            {loading ? t('i18nChecks.checking') : t('i18nChecks.runChecks')}
          </Button>

          {error && (
            <div className="flex items-start gap-2 p-4 rounded-md bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <span className="text-base">{error}</span>
            </div>
          )}

          {checked && !error && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('i18nChecks.missingInNl')}</CardTitle>
                  <CardDescription>
                    {t('i18nChecks.missingCount', { count: missingInNl.length })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {missingInNl.length === 0 ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-4 w-4" />
                      <span>{t('i18nChecks.noMissing')}</span>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto rounded border p-2 bg-muted/30">
                      {missingInNl.map((key) => (
                        <div key={key} className="py-1 px-2 text-sm font-mono break-all">
                          {key}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('i18nChecks.missingInFr')}</CardTitle>
                  <CardDescription>
                    {t('i18nChecks.missingCount', { count: missingInFr.length })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {missingInFr.length === 0 ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="h-4 w-4" />
                      <span>{t('i18nChecks.noMissing')}</span>
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto rounded border p-2 bg-muted/30">
                      {missingInFr.map((key) => (
                        <div key={key} className="py-1 px-2 text-sm font-mono break-all">
                          {key}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
