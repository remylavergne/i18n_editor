import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileDiff, GitBranch, FileText, FolderOpen, AlertCircle, CheckCircle } from "lucide-react"
import { GitDiffBranches, GetWorkingDirectory } from "../../wailsjs/go/main/App"

export function CreateDiff() {
  const [repoPath, setRepoPath] = useState('')
  const [sourceBranch, setSourceBranch] = useState('')
  const [targetBranch, setTargetBranch] = useState('')
  const [filePath, setFilePath] = useState('')
  const [diffResult, setDiffResult] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSelectFolder = async () => {
    // Use the current working directory as default
    try {
      const wd = await GetWorkingDirectory()
      setRepoPath(wd)
    } catch (err) {
      setError('Failed to get working directory')
    }
  }

  const handleGenerateDiff = async () => {
    if (!repoPath || !sourceBranch || !targetBranch || !filePath) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    setError('')
    setDiffResult('')

    try {
      const result = await GitDiffBranches(repoPath, sourceBranch, targetBranch, filePath)
      setDiffResult(result)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!diffResult) return
    
    const blob = new Blob([diffResult], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `diff-${sourceBranch}-${targetBranch}-${filePath.replace(/\//g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDiff className="h-6 w-6" />
            Create Diff
          </CardTitle>
          <CardDescription>
            Generate a diff between two branches for a specific file
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="repo-path">Repository Path</Label>
            <div className="flex gap-2">
              <Input 
                id="repo-path" 
                placeholder="Select repository folder" 
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectFolder}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Browse
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source-branch">Source Branch</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                id="source-branch" 
                placeholder="main" 
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className="pl-9" 
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="target-branch">Target Branch</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                id="target-branch" 
                placeholder="feature/translations" 
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="pl-9" 
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-path">File Path</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                id="file-path" 
                placeholder="locales/en.json" 
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
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
            {loading ? 'Generating...' : 'Generate Diff'}
          </Button>

          {diffResult && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Diff Result</Label>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  Download
                </Button>
              </div>
              <pre className="p-4 rounded-md bg-muted text-muted-foreground overflow-auto max-h-96 text-xs font-mono">
                {diffResult}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
