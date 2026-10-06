import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { ThemeProvider, useTheme } from 'next-themes';
import { initializeTheme } from '@/lib/theme';
import './index.css';

// Apply stored preference / system preference before first paint to avoid theme flash.
initializeTheme();

function AppWithTheme() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<AppWithTheme />);
