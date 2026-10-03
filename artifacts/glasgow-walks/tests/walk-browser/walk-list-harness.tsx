import { createRoot } from 'react-dom/client';
import AdminWalks from '../../src/AdminWalks';
import { walkListFixture } from './walk-list-walk-store';
import '../../src/index.css';
import '../../src/admin.css';

walkListFixture.reset();
Object.assign(window, { walkListFixture });
createRoot(document.getElementById('root')!).render(<AdminWalks />);