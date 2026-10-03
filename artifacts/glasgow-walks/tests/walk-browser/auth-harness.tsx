import { createRoot } from 'react-dom/client';
import { SignIn } from '../../src/AdminAuth';
import '../../src/index.css';
import '../../src/admin.css';

createRoot(document.getElementById('root')!).render(<SignIn />);