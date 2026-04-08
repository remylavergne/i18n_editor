import { useState, useEffect, Component, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './components/ui/button'
import { LanguageSelector } from './components/LanguageSelector'
import { CreateDiff } from './screens/CreateDiff'
import { ApplyChanges } from './screens/ApplyChanges'
import { EditAppliedChanges } from './screens/EditAppliedChanges'
import { FileDiff, FileSpreadsheet, PencilLine, AlertTriangle } from 'lucide-react'

import './i18n'

type Screen = 'create-diff' | 'apply-changes' | 'edit-applied'

interface ErrorInfo {
  message: string
  stack?: string
  timestamp: Date
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: ErrorInfo | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: { message: error.message, stack: error.stack, timestamp: new Date() } }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return <ErrorDialog error={this.state.error} onReset={() => this.setState({ hasError: false, error: null })} />
    }
    return this.props.children
  }
}

function ErrorDialog({ error, onReset }: { error: ErrorInfo; onReset: () => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border-2 border-red-500 bg-red-50 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <AlertTriangle className="h-8 w-8 shrink-0 text-red-600" />
          <div className="flex-1 space-y-4">
            <h2 className="text-xl font-bold text-red-800">{t('errors.unexpectedTitle')}</h2>
            <p className="text-base text-red-700">{error.message}</p>
            <div className="flex gap-3">
              <Button onClick={onReset} className="bg-red-600 hover:bg-red-700">
                {t('errors.resetApp')}
              </Button>
              <Button variant="outline" onClick={() => setExpanded(!expanded)}>
                {expanded ? t('errors.hideDetails') : t('errors.showDetails')}
              </Button>
            </div>
            {expanded && error.stack && (
              <pre className="mt-4 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-white p-3 text-xs text-red-800">
                {error.stack}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const { t } = useTranslation()
  const [currentScreen, setCurrentScreen] = useState<Screen>('create-diff')

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      console.error('Global error:', event.error)
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled rejection:', event.reason)
    }
    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <nav className="border-b bg-card">
          <div className="container mx-auto flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold mr-6">{t('app.title')}</h1>
              <Button
                variant={currentScreen === 'create-diff' ? 'default' : 'ghost'}
                onClick={() => setCurrentScreen('create-diff')}
                className="gap-2"
              >
                <FileDiff className="h-4 w-4" />
                {t('app.createDiff')}
              </Button>
              <Button
                variant={currentScreen === 'apply-changes' ? 'default' : 'ghost'}
                onClick={() => setCurrentScreen('apply-changes')}
                className="gap-2"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {t('app.applyChanges')}
              </Button>
              <Button
                variant={currentScreen === 'edit-applied' ? 'default' : 'ghost'}
                onClick={() => setCurrentScreen('edit-applied')}
                className="gap-2"
              >
                <PencilLine className="h-4 w-4" />
                {t('app.editApplied')}
              </Button>
            </div>
            <LanguageSelector />
          </div>
        </nav>
        
        <main>
          {currentScreen === 'create-diff' && <CreateDiff />}
          {currentScreen === 'apply-changes' && <ApplyChanges />}
          {currentScreen === 'edit-applied' && <EditAppliedChanges />}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;