import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './components/ui/button';
import { LanguageSelector } from './components/LanguageSelector';
import { CreateDiff } from './screens/CreateDiff';
import { ApplyChanges } from './screens/ApplyChanges';
import { FileDiff, FileSpreadsheet } from 'lucide-react';

import './i18n';

type Screen = 'create-diff' | 'apply-changes';

function App() {
  const { t } = useTranslation();
  const [currentScreen, setCurrentScreen] = useState<Screen>('create-diff');

  return (
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
          </div>
          <LanguageSelector />
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
