import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useMatch, useParams } from 'react-router-dom';
import { ThemeProvider } from '@/features/theme';
import { AuthProvider, useAuth } from '@/features/auth';
import { DataProvider } from '@/features/data';
import { FeedbackProvider } from '@/components/feedback';
import { Layout } from '@/components/Layout';
import { PageLoader } from '@/components/ui';
import { LoginPage, NoAccessPage, SplashScreen } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { RepairsPage } from '@/pages/Repairs';
import { RepairDetailPage } from '@/pages/RepairDetail';
import { RepairNewPage } from '@/pages/RepairNew';
import { OrdersPage } from '@/pages/Orders';
import { CalendarPage } from '@/pages/Calendar';
import { CustomersPage } from '@/pages/Customers';
import { CustomerDetailPage } from '@/pages/CustomerDetail';

const StatsPage = lazy(() => import('@/pages/Stats'));
const PriceListPage = lazy(() => import('@/pages/PriceList'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const AssistantPage = lazy(() => import('@/pages/Assistant'));
const PrintPage = lazy(() => import('@/pages/Print'));
const PublicStatusPage = lazy(() => import('@/pages/PublicStatus'));

function PublicStatus({ id }: { id: string }) {
  return (
    <Suspense fallback={<SplashScreen />}>
      <PublicStatusPage id={id} />
    </Suspense>
  );
}

function PublicStatusRoute() {
  const { id = '' } = useParams();
  return <PublicStatus id={id} />;
}

function Gate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  // QR kód z protokolu vedie na /zakazky/:id – neprihlásenému (zákazníkovi) ukážeme stav opravy.
  const repairMatch = useMatch('/zakazky/:id');
  const publicId = repairMatch?.params.id && repairMatch.params.id !== 'nova' ? repairMatch.params.id : null;
  if (status === 'loading') return <SplashScreen />;
  if (publicId && (status === 'signedOut' || status === 'noAccess')) return <PublicStatus id={publicId} />;
  if (status === 'signedOut') return <LoginPage />;
  if (status === 'noAccess') return <NoAccessPage />;
  return <DataProvider>{children}</DataProvider>;
}

export function App() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/stav/:id" element={<PublicStatusRoute />} />
              <Route path="*" element={<AppRoutes />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
}

function AppRoutes() {
  return (
    <Gate>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/tlac/:kind/:id" element={<PrintPage />} />
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="zakazky" element={<RepairsPage />} />
            <Route path="zakazky/nova" element={<RepairNewPage />} />
            <Route path="zakazky/:id" element={<RepairDetailPage />} />
            <Route path="objednavky" element={<OrdersPage />} />
            <Route path="objednavky/:id" element={<OrdersPage />} />
            <Route path="kalendar" element={<CalendarPage />} />
            <Route path="zakaznici" element={<CustomersPage />} />
            <Route path="zakaznici/:id" element={<CustomerDetailPage />} />
            <Route path="statistiky" element={<StatsPage />} />
            <Route path="cennik" element={<PriceListPage />} />
            <Route path="asistent" element={<AssistantPage />} />
            <Route path="asistent/:threadId" element={<AssistantPage />} />
            <Route path="nastavenia" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </Gate>
  );
}
