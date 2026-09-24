import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch, useLocation } from "wouter";
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
import { useNoIndex } from "@/lib/seo";
import { startLogin } from "./const";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TrpcUnbatchedProvider } from "./lib/TrpcUnbatchedProvider";

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
const ConditionsUtilisationPage = lazy(() => import('./pages/ConditionsUtilisation'));
const PolitiqueConfidentialitePage = lazy(() => import('./pages/PolitiqueConfidentialite'));
const MentionsLegalesPage = lazy(() => import('./pages/MentionsLegales'));
const AddCarPage = lazy(() => import("./pages/AddCar"));
const MyBookingsPage = lazy(() => import("./pages/MyBookings"));
const HelpPage = lazy(() => import("./pages/Help"));
const FavoritesPage = lazy(() => import("./pages/Favorites"));
const AboutPage = lazy(() => import("./pages/About"));
const SupportTicketsPage = lazy(() => import("./pages/SupportTickets"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const BlogPage = lazy(() => import("./pages/BlogPage"));
const CarDetailsPage = lazy(() => import("./pages/CarDetails"));
const SuccessPage = lazy(() => import("./pages/Success"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboard"));
const SuperDashboardPage = lazy(() => import("./pages/SuperDashboard"));
const SuperAdminDashboardPage = lazy(() => import("./pages/SuperAdminDashboard"));
const ProfilePage = lazy(() => import("./pages/Profile"));
const CheckoutPage = lazy(() => import("./pages/Checkout"));
const KycVerificationPage = lazy(() => import("./pages/KycVerification"));
const VoucherPage = lazy(() => import("./pages/Voucher"));
const BookingMessagesPage = lazy(() => import("./pages/BookingMessages"));
const AgencyDashboardPage = lazy(() => import("./pages/AgencyDashboard"));
const RegisterPage = lazy(() => import("./pages/Register"));
const DirectLoginPage = lazy(() => import("./pages/DirectLogin"));
const AgencyOnboardingPage = lazy(() => import("./pages/AgencyOnboarding"));
const PartnerWithUsPage = lazy(() => import("./pages/PartnerWithUs"));
const PartnerApplyPage = lazy(() => import("./pages/PartnerApply"));
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

function AccessGuard({ area, children }: { area: 'admin' | 'superadmin' | 'host'; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  useNoIndex();
  if (loading) return <div className="min-h-[50vh] flex items-center justify-center">{t("accessChecking")}</div>;
  if (!user) return <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-6 text-center"><h1 className="text-2xl font-bold">{t("loginRequired")}</h1><p className="text-muted-foreground">{t("loginRequiredDesc")}</p><Button onClick={() => startLogin()}>{t("loginAction")}</Button></div>;
  if (user.accountStatus && user.accountStatus !== 'active') return <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 text-center"><h1 className="text-2xl font-bold">{t("accountInactive")}</h1><p className="text-muted-foreground">{t("accountInactiveDesc")}</p></div>;
  const allowed = area === 'admin'
    ? user.role === 'admin' || user.role === 'SUPER_ADMIN'
    : area === 'superadmin'
      ? user.role === 'SUPER_ADMIN'
      : user.role === 'owner' || user.role === 'admin' || user.role === 'partner' || user.role === 'SUPER_ADMIN';
  if (!allowed) return <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 text-center"><h1 className="text-2xl font-bold">{t("forbiddenTitle")}</h1><p className="text-muted-foreground">{t("forbiddenDesc")}</p></div>;
  return <>{children}</>;
}

function BottomNavGate() {
  const [location] = useLocation();
  const path = location.split("?")[0];
  // Detail pages render BookingWidget's own fixed mobile CTA — suppress the
  // global bottom nav there so the two bars can never overlap.
  if (/^\/(car|property)\//.test(path)) return null;
  return <BottomNavigationBar />;
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
      <Route path="/locations">{() => <Suspense fallback={<PageLoader />}><LocationLandingPage /></Suspense>}</Route>
      <Route path="/locations/:slug">{() => <Suspense fallback={<PageLoader />}><LocationLandingPage /></Suspense>}</Route>
      <Route path="/city/:slug">{({ slug }) => <Suspense fallback={<PageLoader />}><LocationLandingPage slug={slug} canonicalPath={`/city/${slug}`} /></Suspense>}</Route>
      <Route path="/car/:id">
        {params => (
          <Suspense fallback={<PageLoader />}>
            <CarDetailsPage />
          </Suspense>
        )}
      </Route>
      {/* Legacy /booking flow now hands off directly to the secure checkout. */}
      <Route path={"/booking"}>
        {() => <Redirect to={`/checkout${window.location.search}`} replace />}
      </Route>
      <Route path={"/success"}>
        {() => (
          <Suspense fallback={<PageLoader />}>
            <SuccessPage />
          </Suspense>
        )}
      </Route>
      <Route path="/dashboard">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/admin">{() => <AccessGuard area="admin"><Suspense fallback={<PageLoader />}><TrpcUnbatchedProvider><AdminDashboardPage /></TrpcUnbatchedProvider></Suspense></AccessGuard>}</Route>
      <Route path="/admin/super">{() => <AccessGuard area="superadmin"><Suspense fallback={<PageLoader />}><SuperDashboardPage /></Suspense></AccessGuard>}</Route>
      <Route path="/admin/super/dashboard">{() => <AccessGuard area="superadmin"><Suspense fallback={<PageLoader />}><SuperAdminDashboardPage /></Suspense></AccessGuard>}</Route>
      <Route path="/dispute-resolution" component={DisputeResolutionPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/conditions-utilisation" component={ConditionsUtilisationPage} />
      <Route path="/politique-confidentialite" component={PolitiqueConfidentialitePage} />
      <Route path="/mentions-legales" component={MentionsLegalesPage} />
      <Route path="/register">{() => <Suspense fallback={<PageLoader />}><RegisterPage /></Suspense>}</Route>
      <Route path="/direct-login">{() => <Suspense fallback={<PageLoader />}><DirectLoginPage /></Suspense>}</Route>
      <Route path="/become-partner">{() => <Suspense fallback={<PageLoader />}><PartnerWithUsPage /></Suspense>}</Route>
      <Route path="/become-partner/car-rental">{() => <Suspense fallback={<PageLoader />}><PartnerApplyPage /></Suspense>}</Route>
      <Route path="/become-partner/real-estate">{() => <Suspense fallback={<PageLoader />}><PartnerApplyPage /></Suspense>}</Route>
      <Route path="/become-agency">{() => <Suspense fallback={<PageLoader />}><AgencyOnboardingPage /></Suspense>}</Route>
      <Route path="/agency/register">{() => <Suspense fallback={<PageLoader />}><AgencyOnboardingPage /></Suspense>}</Route>
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/host">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/host-dashboard">{() => <AccessGuard area="host"><HostDashboard /></AccessGuard>}</Route>
      <Route path="/agency-dashboard">{() => <AccessGuard area="host"><Suspense fallback={<PageLoader />}><AgencyDashboardPage /></Suspense></AccessGuard>}</Route>
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
      <ThemeProvider defaultTheme="light" switchable>
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
                  <BottomNavGate />
                  <Suspense fallback={null}>
                    <AIChatWidget />
                  </Suspense>
                </div>
                <Toaster />
              </TooltipProvider>
            </CurrencyProvider>
          </LanguageProvider>
        </RoleProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
