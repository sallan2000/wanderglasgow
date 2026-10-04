import { createRoot } from 'react-dom/client';
import AdminStartingAreas from '../../src/AdminStartingAreas';
import WalkPlanner from '../../src/WalkPlanner';
import '../../src/index.css';
import '../../src/admin.css';
import './transport';

const visitor = new URLSearchParams(location.search).get('view') === 'visitor';
createRoot(document.getElementById('root')!).render(visitor
  ? <WalkPlanner categories={['History']} categoriesLoading={false} categoriesError="" onRetryCategories={() => {}} />
  : <div className="adm"><main className="adm-main"><AdminStartingAreas onClose={() => {}} onDirty={() => {}} /></main></div>);