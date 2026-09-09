import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { RoleProvider } from "./contexts/RoleContext";
import { LanguageProvider, useLanguage } from "./contexts/LanguageContext";
import { CurrencyProvider } from "./contexts/CurrencyContext";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import BottomNavigationBar from "./components/BottomNavigationBar";
import ConsentAnalytics from "./components/ConsentAnalytics";
import BreadcrumbNav from "./components/BreadcrumbNav";
import { PageTransition } from "./components/PageTransition";
import { lazy, Suspense } from "react";
import { useAuth } from "./_core/hooks/useAuth";
import { startLogin } from "./const";
import { Button } from "@/components/ui/button";

// Lazy-loaded pages and global widgets keep the initial mobile bundle small.
const HostDashboard = lazy(() => import("./pages/HostDashboard"));
const AgencySettingsPage = lazy(() => import("./pages/AgencySettings"));
const AIChatWidget = lazy(() => import('./components/AIChatWidget'));

const HomePage = lazy(() => import("./pages/Home"));
const SearchPage = lazy(() => import("./pages/Search"));
const PropertyDetailPage = lazy(() => import("./pages/PropertyDetailWithVideo"));
const DisputeResolutionPage = lazy(() => import('./pages/DisputeResolution'));
const TermsPage = lazy(() => import('./pages/TermsOfService'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPolicy'));
const AddCarPage = lazy(() => import("./pages/AddCar"));
const MyBookingsPage = lazy(() => import("./pages/MyBookings"));
const HelpPage = lazy(() => import("./pages/Help"));
const FavoritesPage = lazy(() => import("./pages/Favorites"));
const AboutPage = lazy(() => import("./pages/About"));
const SupportTicketsPage = lazy(() => import("./pages/SupportTickets"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const CarDetailsPage = lazy(() => import("./pages/CarDetails"));
const BookingPage = lazy(() => import("./pages/Booking"));
const SuccessPage = lazy(() => import("./pages/Success"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboard"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const CheckoutPage = lazy(() => import("./pages/Checkout"));
const KycVerificationPage = lazy(() => import("./pages/KycVerification"));
const VoucherPage = lazy(() => import("./pages/Voucher"));
const BookingMessagesPage = lazy(() => import("./pages/BookingMessages"));
const RegisterPage = lazy(() => import("./pages/Register"));
const LocationLandingPage = lazy(() => import("./pages/LocationLanding"));

function PageLoader() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground">
      <div className="animate-spin text-amber-500 font-bold text-lg" role="status" aria-live="polite">
        {t("loadingPage")}
      </div>
    </div>
  );
}

function AccessGuard({ area, children }: { area: 'admin' | 'host'; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  if (loading) return <div className="min-h-[50vh] flex items-center justify-center">{t("accessChecking")}</div>;
  if (!user) return <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-6 text-center"><h1 className="text-2xl font-bold">{t("loginRequired")}</h1><p className="text-muted-foreground">{t("loginRequiredDesc")}</p><Button onClick={() => startLogin()}>{t("loginAction")}</Button></div>;
  if (user.accountStatus && user.accountStatus !== 'active') return <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 text-center"><h1 className="text-2xl font-bold">{t("accountInactive")}</h1><p className="text-muted-foreground">{t("accountInactiveDesc")}</p></div>;
  const allowed = area === 'admin' ? user.role === 'admin' : user.role === 'owner' || user.role === 'admin';
  if (!allowed) return <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 text-center"><h1 className="text-2xl font-bold">{t("forbiddenTitle")}</h1><p className="text-muted-foreground">{t("forbiddenDesc")}</p></div>;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/"}>
        <Suspense fallback={<PageLoader />}>
          <HomePage />
        </Suspense>
      </Route>
      <Route path={"/search"}>
        {() => (
          <Suspense fallback={<PageLoader />}>
            <SearchPage />
          </Suspense>
        )}
      </Route>
      <Route path="/property/:id" component={PropertyDetailPage} />
      <Route path="/locations/marrakech-car-rental">{() => <Suspense fallback={<PageLoader />}><LocationLandingPage location="marrakech" /></Suspense>}</Route>
      <Route path="/locations/mohammed-v-airport-car-rental">{() => <Suspense fallback={<PageLoader />}><LocationLandingPage location="casablancaAirport" /></Suspense>}</Route>
      <Route path="/car/:id">
        {params => (
          <Suspense fallback={<PageLoader />}>
            <CarDetailsPage />
          </Suspense>
        )}
      </Route>
      <Route path={"/booking"}>
        {() => (
          <Suspense fallback={<PageLoader />}>
            <BookingPage />
          </Suspense>
        )}
      </Route>
      <Route path={"/success"}>
        {() => (
          <Suspense fallback={<PageLoader />}>
            <SuccessPage />
          </Suspense>
        )}
      </Route>
      <Route path="/dashboard">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/admin">{() => <AccessGuard area="admin"><Suspense fallback={<PageLoader />}><AdminDashboardPage /></Suspense></AccessGuard>}</Route>
      <Route path="/dispute-resolution" component={DisputeResolutionPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/register">{() => <Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>}</Route>
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/host">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/host-dashboard">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/host/settings">{() => <AccessGuard area="host"><Suspense fallback={<PageLoader />}><AgencySettingsPage /></Suspense></AccessGuard>}</Route>
      <Route path="/partner">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/partner-dashboard">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/add-car">{() => <AccessGuard area="host"><AddCarPage /></AccessGuard>}</Route>
      <Route path={"/my-bookings"} component={MyBookingsPage} />
      <Route path={"/profile"} component={ProfilePage} />
      <Route path={"/checkout"} component={CheckoutPage} />
      <Route path={"/kyc"}>{() => <Suspense fallback={<PageLoader />}><KycVerificationPage /></Suspense>}</Route>
      <Route path="/voucher/:code">{() => <Suspense fallback={<PageLoader />}><VoucherPage /></Suspense>}</Route>
      <Route path="/messages/:bookingId">{() => <Suspense fallback={<PageLoader />}><BookingMessagesPage /></Suspense>}</Route>
      <Route path={"/help"}>{() => <Redirect to="/support-tickets" replace />}</Route>
      <Route path={"/support-tickets"} component={SupportTicketsPage} />
      <Route path={"/notifications"} component={NotificationsPage} />
      <Route path={"/favorites"} component={FavoritesPage} />
      <Route path={"/about"}>
        <AboutPage />
      </Route>
      <Route path={"/blog"}>
        <BlogPage />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <RoleProvider>
          <LanguageProvider>
            <CurrencyProvider>
              <TooltipProvider>
                <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
                  <ConsentAnalytics />
                  <Navbar />
                  <BreadcrumbNav />
                  <main className="b2-main-content flex-1 pb-16 md:pb-0">
                    <PageTransition>
                      <Suspense fallback={<PageLoader />}>
                        <Router />
                      </Suspense>
                    </PageTransition>
                  </main>
                  <Footer />
                  <BottomNavigationBar />
                  <Suspense fallback={null}>
                    <AIChatWidget />
                  </Suspense>
                </div>
              </TooltipProvider>
            </CurrencyProvider>
          </LanguageProvider>
        </RoleProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
