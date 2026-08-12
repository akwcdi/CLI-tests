import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from './pages/LoginPage.tsx';
import { AppTopPage } from './pages/AppTopPage.tsx';
import { RequestDetailPage } from './pages/RequestDetailPage.tsx';
import { RequestsPage } from './pages/RequestsPage.tsx';
import { UserDetailPage } from './pages/UserDetailPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';
import { RequireSession } from './session.tsx';

/** サインインが要る画面はすべて RequireSession を通す。 */
function guarded(element: React.ReactElement) {
  return <RequireSession>{element}</RequireSession>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={guarded(<AppTopPage />)} />
      <Route path="/users" element={guarded(<UsersPage />)} />
      <Route path="/users/:id" element={guarded(<UserDetailPage />)} />
      <Route path="/requests" element={guarded(<RequestsPage />)} />
      <Route path="/requests/:id" element={guarded(<RequestDetailPage />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
