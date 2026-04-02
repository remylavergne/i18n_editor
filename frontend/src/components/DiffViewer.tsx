interface DiffLineProps {
  line: string
}

function DiffLine({ line }: DiffLineProps) {
  const getLineStyle = () => {
    if (line.startsWith('+')) {
      return 'bg-green-100 text-green-800'
    }
    if (line.startsWith('-')) {
      return 'bg-red-100 text-red-800'
    }
    if (line.startsWith('@@')) {
      return 'bg-[#ff6f0d]/15 text-[#ff6f0d]'
    }
    if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
      return 'text-muted-foreground'
    }
    return ''
  }

  const getPrefix = () => {
    if (line.startsWith('+')) return '+'
    if (line.startsWith('-')) return '-'
    if (line.startsWith('@@')) return '@@'
    return ' '
  }

  return (
    <span className={`block px-1 ${getLineStyle()}`}>
      {getPrefix()} {line.substring(1)}
    </span>
  )
}

interface DiffViewerProps {
  content: string
  maxHeight?: string
}

export function DiffViewer({ content, maxHeight = 'max-h-48' }: DiffViewerProps) {
  const lines = content.split('\n')

  return (
    <pre className={`text-xs font-mono overflow-auto bg-yellow-50 border rounded-md ${maxHeight}`}>
      {lines.map((line, index) => (
        <DiffLine key={index} line={line} />
      ))}
    </pre>
  )
}
