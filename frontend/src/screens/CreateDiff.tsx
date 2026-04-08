import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileDiff, GitBranch, FolderOpen, AlertCircle } from "lucide-react"
import { GitDiffBranches, OpenDirectoryDialog, OpenFileDialog, ParseDiffToStandardChanges, ReadTextFile, SaveFileDialog, SaveTextFile } from "../../wailsjs/go/main/App"
import { main } from "../../wailsjs/go/models"
import { DiffViewer } from "@/components/DiffViewer"

export function CreateDiff() {
  const { t } = useTranslation()
  const [repoPath, setRepoPath] = useState('')
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [filePath, setFilePath] = useState('')
  const [standardizedFilePath, setStandardizedFilePath] = useState('')
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

  const handleSelectStandardizedFile = async () => {
    try {
      const selectedPath = await OpenFileDialog('Select Standardized Changes File', 'JSON Files', '*.json')
      if (selectedPath) {
        setStandardizedFilePath(selectedPath)
      }
    } catch {
      setError(t('applyChanges.selectFileError'))
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

  const parseStandardizedChanges = (raw: string) => {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error(t('applyChanges.invalidChangesFile'))
    }
    return parsed.map((item) => main.StandardizedDiffChange.createFrom(item))
  }

  const formatActionForTable = (action: string) => {
    if (action === 'add') {
      return '🟢 + add'
    }
    if (action === 'change') {
      return '✏️ modified'
    }
    if (action === 'delete') {
      return '🔴 delete'
    }
    return action
  }

  const escapeTableCell = (value: string) => {
    return value
      .replace(/\t/g, ' ')
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

    const header = [
      'Path',
      'Action',
      'Traduction FR',
      'Traduction NL',
      'Traduction DE',
      'Limitations techniques eventuelles',
      'transversalite',
    ].join('\t')

    const rows = sorted.map((change) => {
      const path = escapeTableCell(change.path || '')
      const action = escapeTableCell(formatActionForTable(change.action || ''))
      const frValue = escapeTableCell(getFrValueForAction(change))
      return [path, action, frValue, '', '', '', ''].join('\t')
    })

    return [header, ...rows].join('\n')
  }

  const buildJiraConfluenceHtmlTable = (changes: main.StandardizedDiffChange[]) => {
    const sorted = [...changes].sort((a, b) => {
      const pathCompare = a.path.localeCompare(b.path)
      if (pathCompare !== 0) {
        return pathCompare
      }
      return a.action.localeCompare(b.action)
    })

    const escapeHtml = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    const cells = sorted.map((change) => {
      const path = escapeHtml(change.path || '')
      const action = escapeHtml(formatActionForTable(change.action || ''))
      const frValue = escapeHtml(getFrValueForAction(change))
      return `<tr><td>${path}</td><td>${action}</td><td>${frValue}</td><td></td><td></td><td></td><td></td></tr>`
    }).join('')

    return `<table><thead><tr><th>Path</th><th>Action</th><th>Traduction FR</th><th>Traduction NL</th><th>Traduction DE</th><th>Limitations techniques eventuelles</th><th>transversalite</th></tr></thead><tbody>${cells}</tbody></table>`
  }

  const copyJiraTable = async (textTable: string, htmlTable: string) => {
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const item = new ClipboardItem({
          'text/plain': new Blob([textTable], { type: 'text/plain' }),
          'text/html': new Blob([htmlTable], { type: 'text/html' }),
        })
        await navigator.clipboard.write([item])
        return true
      }

      await navigator.clipboard.writeText(textTable)
      return true
    } catch {
      return false
    }
  }

  const handleGenerateJiraTable = async () => {
    if (!standardizedChanges || standardizedChanges.length === 0) {
      alert('No standardized changes to export')
      return
    }

    const output = buildJiraConfluenceTable(standardizedChanges)
    const htmlOutput = buildJiraConfluenceHtmlTable(standardizedChanges)
    setJiraTableOutput(output)

    const copied = await copyJiraTable(output, htmlOutput)
    if (!copied) {
      alert('Table generated. Clipboard access failed, please copy from the text box.')
    }
  }

  const handleGenerateJiraTableFromFile = async () => {
    if (!standardizedFilePath) {
      alert(t('errors.fillAllFields'))
      return
    }

    try {
      setError('')
      const raw = await ReadTextFile(standardizedFilePath)
      const changes = parseStandardizedChanges(raw)
      if (changes.length === 0) {
        alert(t('applyChanges.noChangesFound'))
        return
      }

      setStandardizedChanges(changes)
      const output = buildJiraConfluenceTable(changes)
      const htmlOutput = buildJiraConfluenceHtmlTable(changes)
      setJiraTableOutput(output)

      const copied = await copyJiraTable(output, htmlOutput)
      if (!copied) {
        alert('Table generated. Clipboard access failed, please copy from the text box.')
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    }
  }

  const handleCopyJiraTable = async () => {
    if (!jiraTableOutput) {
      return
    }

    const htmlOutput = buildJiraConfluenceHtmlTable(standardizedChanges)
    const copied = await copyJiraTable(jiraTableOutput, htmlOutput)
    if (!copied) {
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

          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <Label className="text-sm font-medium">{t('createDiff.generateFromStandardizedFile')}</Label>
            <div className="flex gap-2">
              <Input
                placeholder={t('createDiff.selectStandardizedFile')}
                value={standardizedFilePath}
                onChange={(e) => setStandardizedFilePath(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectStandardizedFile}>
                <FolderOpen className="h-4 w-4 mr-2" />
                {t('createDiff.browse')}
              </Button>
              <Button variant="outline" onClick={handleGenerateJiraTableFromFile}>
                {t('createDiff.generateJiraTable')}
              </Button>
            </div>
          </div>

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
            </div>
          )}

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
              <p className="text-xs text-muted-foreground">
                {t('createDiff.jiraTableHint')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
