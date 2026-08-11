import { Navigate, Route, Routes } from 'react-router-dom';

import { RequireAuth } from './RequireAuth.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { UserDetailPage } from './pages/UserDetailPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/users"
        element={
          <RequireAuth>
            <UsersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/users/:id"
        element={
          <RequireAuth>
            <UserDetailPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  );
}
