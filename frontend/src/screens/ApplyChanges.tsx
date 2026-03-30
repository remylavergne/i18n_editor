import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileSpreadsheet, FolderOpen } from "lucide-react"

export function ApplyChanges() {
  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6" />
            Apply Changes
          </CardTitle>
          <CardDescription>
            Apply a diff file to update translations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-file">Target File (To Update)</Label>
            <div className="flex gap-2">
              <Input id="target-file" placeholder="Select target translation file" readOnly />
              <Button variant="outline" size="icon">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="diff-file">Diff File</Label>
            <div className="flex gap-2">
              <Input id="diff-file" placeholder="Select diff file to apply" readOnly />
              <Button variant="outline" size="icon">
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button className="w-full mt-6">Apply Changes</Button>
        </CardContent>
      </Card>
    </div>
  )
}
