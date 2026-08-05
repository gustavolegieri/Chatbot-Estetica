import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AnimatePresence } from "framer-motion";
import { SEOInjector } from "@/components/SEOInjector";
import { AffiliateTracker } from "@/components/AffiliateTracker";
import { RequireAuth, RequireAdmin } from "@/components/RequireAuth";

// Eagerly load Index (landing page) for fast first paint
import Index from "./pages/Index";

// Lazy load all other pages
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Pricing = lazy(() => import("./pages/Pricing"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const NewDiagnosis = lazy(() => import("./pages/NewDiagnosis"));
const DiagnosisResult = lazy(() => import("./pages/DiagnosisResult"));
const DiagnosisPrint = lazy(() => import("./pages/DiagnosisPrint"));
const SharedDiagnosis = lazy(() => import("./pages/SharedDiagnosis"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Cookies = lazy(() => import("./pages/Cookies"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Profile = lazy(() => import("./pages/Profile"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentFailed = lazy(() => import("./pages/PaymentFailed"));
const FAQ = lazy(() => import("./pages/FAQ"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminPlans = lazy(() => import("./pages/admin/AdminPlans"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminLibrary = lazy(() => import("./pages/admin/AdminLibrary"));
const AdminFinance = lazy(() => import("./pages/admin/AdminFinance"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminUserDetail = lazy(() => import("./pages/admin/AdminUserDetail"));
const AdminBlog = lazy(() => import("./pages/admin/AdminBlog"));
const AdminAffiliates = lazy(() => import("./pages/admin/AdminAffiliates"));
const AdminFashionProducts = lazy(() => import("./pages/admin/AdminFashionProducts"));
const AdminDiagnoses = lazy(() => import("./pages/admin/AdminDiagnoses"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Affiliates = lazy(() => import("./pages/Affiliates"));
const AffiliateRedirect = lazy(() => import("./pages/AffiliateRedirect"));
const Experience = lazy(() => import("./pages/Experience"));
const GoogleImagesTestPage = lazy(() => import("./pages/GoogleImagesTestPage"));


function LazyFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">Carregando...</p>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/account" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/planos" element={<Pricing />} />
        <Route path="/experience" element={<Experience />} />
        <Route path="/experiencia" element={<Experience />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/new-diagnosis" element={<RequireAuth><NewDiagnosis /></RequireAuth>} />
        <Route path="/diagnosis/share/:token" element={<SharedDiagnosis />} />
        <Route path="/diagnosis/:id/print" element={<RequireAuth><DiagnosisPrint /></RequireAuth>} />
        <Route path="/diagnosis/:id" element={<RequireAuth><DiagnosisResult /></RequireAuth>} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/payment-success" element={<RequireAuth><PaymentSuccess /></RequireAuth>} />
        <Route path="/payment-failed" element={<PaymentFailed />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<AdminDashboard />} />
          <Route path="finance" element={<AdminFinance />} />
          <Route path="plans" element={<AdminPlans />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminUserDetail />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="library" element={<AdminLibrary />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="blog" element={<AdminBlog />} />
          <Route path="posts" element={<AdminBlog />} />
          <Route path="affiliates" element={<AdminAffiliates />} />
          <Route path="fashion-products" element={<AdminFashionProducts />} />
          <Route path="diagnoses" element={<AdminDiagnoses />} />
        </Route>
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/afiliados" element={<Affiliates />} />
        <Route path="/r/:code" element={<AffiliateRedirect />} />
        <Route path="/ref/:code" element={<AffiliateRedirect />} />
        <Route path="/test-google-images" element={<GoogleImagesTestPage />} />
        
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Sonner position="bottom-right" richColors toastOptions={{ style: { zIndex: 999999 } }} />
        <BrowserRouter>
          <SEOInjector />
          <AffiliateTracker />
          <Suspense fallback={<LazyFallback />}>
            <AnimatedRoutes />
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
