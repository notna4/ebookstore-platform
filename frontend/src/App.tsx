import { Content, GlobalTheme, InlineNotification } from '@carbon/react';
import { useMemo } from 'react';
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import { readApiConfig } from './api/config';
import { AppHeader } from './components/AppHeader';
import { AuthCallback } from './components/AuthCallback';
import { LoginModal } from './components/LoginModal';
import { BookPage } from './pages/BookPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { OrdersPage } from './pages/OrdersPage';
import { WishlistPage } from './pages/WishlistPage';
import { WritersPage } from './pages/WritersPage';
import { ApiStoreProvider } from './store/ApiStoreProvider';
import { StoreProvider, useStore } from './store/StoreContext';
import type { StoreState } from './store/reducer';
import { ThemeProvider, useAppTheme } from './store/ThemeContext';
import { UiProvider } from './store/UiContext';

function NotFound() {
  return (
    <div className="page">
      <h1>Page not found</h1>
      <p><Link to="/">Back to the catalogue</Link></p>
    </div>
  );
}

function SyncBanner() {
  const { syncError } = useStore();
  if (!syncError) return null;
  return <InlineNotification hideCloseButton lowContrast kind="error" title="Connection problem" subtitle={syncError} />;
}

export function AppRoutes() {
  return (
    <>
      <AppHeader />
      <Content id="main-content" className="app-content">
        <SyncBanner />
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/book/:id" element={<BookPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/writers" element={<WritersPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Content>
      <LoginModal />
    </>
  );
}

function CarbonTheme({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme();
  return <GlobalTheme theme={theme === 'dark' ? 'g100' : 'white'}>{children}</GlobalTheme>;
}

/** Talks to the REST API when VITE_API_URL is configured; otherwise runs as a self-contained demo. */
function Store({ initialState, children }: { initialState?: StoreState; children: React.ReactNode }) {
  const api = useMemo(readApiConfig, []);
  return api ? (
    <ApiStoreProvider config={api}>{children}</ApiStoreProvider>
  ) : (
    <StoreProvider initialState={initialState}>{children}</StoreProvider>
  );
}

export function App({ initialState }: { initialState?: StoreState }) {
  return (
    <ThemeProvider>
      <CarbonTheme>
        <Store initialState={initialState}>
          <UiProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </UiProvider>
        </Store>
      </CarbonTheme>
    </ThemeProvider>
  );
}
