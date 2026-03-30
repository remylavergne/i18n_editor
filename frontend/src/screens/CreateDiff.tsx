import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileDiff, GitBranch, FileText } from "lucide-react"

export function CreateDiff() {
  return (
    <div className="container mx-auto py-8 max-w-2xl">
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
            <Label htmlFor="source-branch">Source Branch</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="source-branch" placeholder="main" className="pl-9" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="target-branch">Target Branch</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="target-branch" placeholder="feature/translations" className="pl-9" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-path">File Path</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="file-path" placeholder="locales/en.json" className="pl-9" />
            </div>
          </div>

          <Button className="w-full mt-6">Generate Diff</Button>
        </CardContent>
      </Card>
    </div>
  )
}
