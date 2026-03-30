import { useState } from 'react';
import { Button } from './components/ui/button';
import { CreateDiff } from './screens/CreateDiff';
import { ApplyChanges } from './screens/ApplyChanges';
import { FileDiff, FileSpreadsheet } from 'lucide-react';

type Screen = 'create-diff' | 'apply-changes';

function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('create-diff');

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-card">
        <div className="container mx-auto flex items-center gap-2 p-4">
          <h1 className="text-xl font-bold mr-6">i18n Editor</h1>
          <Button
            variant={currentScreen === 'create-diff' ? 'default' : 'ghost'}
            onClick={() => setCurrentScreen('create-diff')}
            className="gap-2"
          >
            <FileDiff className="h-4 w-4" />
            Create Diff
          </Button>
          <Button
            variant={currentScreen === 'apply-changes' ? 'default' : 'ghost'}
            onClick={() => setCurrentScreen('apply-changes')}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Apply Changes
          </Button>
        </div>
      </nav>
      
      <main>
        {currentScreen === 'create-diff' && <CreateDiff />}
        {currentScreen === 'apply-changes' && <ApplyChanges />}
      </main>
    </div>
  );
}

export default App;
