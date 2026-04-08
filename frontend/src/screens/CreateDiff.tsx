import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileDiff, GitBranch, FolderOpen, AlertCircle } from "lucide-react"
import { GitDiffBranches, OpenDirectoryDialog, ParseDiffToStandardChanges, SaveFileDialog, SaveTextFile } from "../../wailsjs/go/main/App"
import { main } from "../../wailsjs/go/models"
import { DiffViewer } from "@/components/DiffViewer"

export function CreateDiff() {
  const { t } = useTranslation()
  const [repoPath, setRepoPath] = useState('')
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [filePath, setFilePath] = useState('')
  const [diffResult, setDiffResult] = useState('')
  const [standardizedChanges, setStandardizedChanges] = useState<main.StandardizedDiffChange[]>([])
  const [jiraTableOutput, setJiraTableOutput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSelectRepo = async () => {
    try {
      const dir = await OpenDirectoryDialog('Select Repository Folder')
      if (dir) {
        setRepoPath(dir)
      }
    } catch {
      setError('Failed to select repository')
    }
  }

  const handleGenerateDiff = async () => {
    if (!repoPath || !sourceBranch || !targetBranch || !filePath) {
      setError(t('errors.fillAllFields'))
      return
    }

    setLoading(true)
    setError('')
    setDiffResult('')
    setStandardizedChanges([])

    try {
      const result = await GitDiffBranches(repoPath, sourceBranch, targetBranch, filePath)
      console.log('GitDiffBranches result type:', typeof result, 'value:', result)
      if (typeof result !== 'string') {
        throw new Error(`Expected string from GitDiffBranches, got ${typeof result}: ${JSON.stringify(result)}`)
      }
      setDiffResult(result)
      const changes = await ParseDiffToStandardChanges(result)
      setStandardizedChanges(changes)
      setJiraTableOutput('')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('GitDiffBranches error:', err)
      setError(errorMessage)
      setDiffResult('')
    } finally {
      setLoading(false)
    }
  }

  const downloadBlob = async (content: string, filename: string) => {
    try {
      const filePath = await SaveFileDialog("Save File", filename)
      if (!filePath) {
        console.log("Save cancelled by user")
        return
      }
      await SaveTextFile(filePath, content)
    } catch (err) {
      console.error('Download failed:', err)
      alert('Download failed: ' + String(err))
    }
  }

  const getTimestamp = () => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  }

  const getBaseFilename = () => {
    const fileName = filePath.split('/').pop() || 'file'
    return `diff-${sourceBranch}-${targetBranch}-${fileName}-${getTimestamp()}`
  }

  const handleDownloadPatch = async () => {
    console.log('handleDownloadPatch called, diffResult:', diffResult)
    if (!diffResult || typeof diffResult !== 'string' || diffResult.length <= 0) {
      alert('No diff result to download')
      return
    }
    await downloadBlob(diffResult, `${getBaseFilename()}.patch`)
  }

  const handleDownloadStandardized = async () => {
    console.log('handleDownloadStandardized called, changes count:', standardizedChanges?.length)
    if (!diffResult || typeof diffResult !== 'string' || diffResult.length <= 0) {
      alert('No diff result to download')
      return
    }
    const exportPayload = JSON.stringify(standardizedChanges, null, 2)
    await downloadBlob(exportPayload, `${getBaseFilename()}.json`)
  }

  const formatActionForTable = (action: string) => {
    if (action === 'change') {
      return 'modified'
    }
    return action
  }

  const escapeTableCell = (value: string) => {
    return value
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, ' ')
      .trim()
  }

  const getFrValueForAction = (change: main.StandardizedDiffChange) => {
    if (change.action === 'delete') {
      return change.oldValue || ''
    }
    return change.newValue || ''
  }

  const buildJiraConfluenceTable = (changes: main.StandardizedDiffChange[]) => {
    const sorted = [...changes].sort((a, b) => {
      const pathCompare = a.path.localeCompare(b.path)
      if (pathCompare !== 0) {
        return pathCompare
      }
      return a.action.localeCompare(b.action)
    })

    const header = "|| Path || Action || Traduction FR || Traduction NL || Limitations techniques eventuelles || transversalite ||"
    const rows = sorted.map((change) => {
      const path = escapeTableCell(change.path || '')
      const action = escapeTableCell(formatActionForTable(change.action || ''))
      const frValue = escapeTableCell(getFrValueForAction(change))
      return `| ${path} | ${action} | ${frValue} |  |  |  |`
    })

    return [header, ...rows].join('\n')
  }

  const handleGenerateJiraTable = async () => {
    if (!standardizedChanges || standardizedChanges.length === 0) {
      alert('No standardized changes to export')
      return
    }

    const output = buildJiraConfluenceTable(standardizedChanges)
    setJiraTableOutput(output)

    try {
      await navigator.clipboard.writeText(output)
    } catch {
      // Clipboard may be unavailable in some environments.
    }
  }

  const handleCopyJiraTable = async () => {
    if (!jiraTableOutput) {
      return
    }

    try {
      await navigator.clipboard.writeText(jiraTableOutput)
    } catch {
      alert('Unable to copy automatically. Please select and copy manually.')
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDiff className="h-6 w-6" />
            {t('createDiff.title')}
          </CardTitle>
          <CardDescription>
            {t('createDiff.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repo-path">{t('createDiff.repoPath')}</Label>
            <div className="flex gap-2">
              <Input 
                id="repo-path" 
                placeholder={t('createDiff.selectRepo')} 
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectRepo}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-path">{t('createDiff.filePath')}</Label>
            <Input 
              id="file-path" 
              placeholder={t('createDiff.filePathPlaceholder')} 
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-branch">{t('createDiff.sourceBranch')}</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                id="source-branch" 
                placeholder={t('createDiff.sourceBranchPlaceholder')} 
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className="pl-9" 
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="target-branch">{t('createDiff.targetBranch')}</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                id="target-branch" 
                placeholder={t('createDiff.targetBranchPlaceholder')} 
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="pl-9" 
              />
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
            onClick={handleGenerateDiff}
            disabled={loading}
          >
            {loading ? t('createDiff.generating') : t('createDiff.generateDiff')}
          </Button>

          {diffResult && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('createDiff.diffResult')}</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleDownloadPatch}>
                    {t('createDiff.downloadPatch')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadStandardized}>
                    {t('createDiff.downloadStandardized')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleGenerateJiraTable}>
                    {t('createDiff.generateJiraTable')}
                  </Button>
                </div>
              </div>
              <DiffViewer content={diffResult} maxHeight="max-h-96" />

              {jiraTableOutput && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between">
                    <Label>{t('createDiff.jiraTableResult')}</Label>
                    <Button variant="outline" size="sm" onClick={handleCopyJiraTable}>
                      {t('createDiff.copyJiraTable')}
                    </Button>
                  </div>
                  <textarea
                    className="w-full min-h-[220px] rounded-md border bg-background p-3 text-sm font-mono"
                    value={jiraTableOutput}
                    readOnly
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
