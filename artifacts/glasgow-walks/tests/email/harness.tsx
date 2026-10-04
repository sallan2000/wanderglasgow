import { createRoot } from 'react-dom/client';
import App from '../../src/App';
import '../../src/index.css';

// Actual visitor app and transport. All services are intercepted by the tests.
createRoot(document.getElementById('root')!).render(<App />);