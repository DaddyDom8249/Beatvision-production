import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { routes } from './routes';
import ProjectDebugTrace from '@/components/debug/ProjectDebugTrace';

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <IntersectObserver />
        <div className="flex flex-col min-h-screen bg-background">
          <main className="flex-grow">
            <RouteGuard>
              <Routes>
                {routes.map((route, index) => (
                  <Route key={index} path={route.path} element={route.element} />
                ))}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </RouteGuard>
          </main>
        </div>
        <ProjectDebugTrace />
        <Toaster position="top-right" theme="dark" />
      </AuthProvider>
    </Router>
  );
};

export default App;
