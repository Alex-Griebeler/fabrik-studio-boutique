import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layouts/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import StudentProfile from "@/pages/StudentProfile";
import Leads from "@/pages/Leads";
import Finance from "@/pages/Finance";
import BankReconciliation from "@/pages/BankReconciliation";
import Schedule from "@/pages/Schedule";
import Reports from "@/pages/Reports";
import Expenses from "@/pages/Expenses";
import SettingsPage from "@/pages/SettingsPage";
import Plans from "@/pages/Plans";
import Instructors from "@/pages/Instructors";
import Payroll from "@/pages/Payroll";
import Analytics from "@/pages/Analytics";
import Commissions from "@/pages/Commissions";
import Tasks from "@/pages/Tasks";
import TrainerPayroll from "@/pages/TrainerPayroll";
import TrainerApp from "@/pages/TrainerApp";
import StudentApp from "@/pages/StudentApp";
import MarketingAI from "@/pages/MarketingAI";
import NotFound from "@/pages/NotFound";
import ResetPassword from "@/pages/ResetPassword";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      gcTime: 10 * 60 * 1000, // 10 min
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager", "reception"]}>
                    <AppLayout><Dashboard /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager", "reception"]}>
                    <AppLayout><Students /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students/:id"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager", "reception"]}>
                    <AppLayout><StudentProfile /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/plans"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><Plans /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leads"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager", "reception"]}>
                    <AppLayout><Leads /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><Finance /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bank-reconciliation"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><BankReconciliation /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/expenses"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AppLayout><Expenses /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/instructors"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><Instructors /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/schedule"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager", "instructor", "reception"]}>
                    <AppLayout><Schedule /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><Reports /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AppLayout><SettingsPage /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payroll"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><Payroll /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><Analytics /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/commissions"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager"]}>
                    <AppLayout><Commissions /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <ProtectedRoute allowedRoles={["admin", "manager", "reception"]}>
                    <AppLayout><Tasks /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trainer/payroll"
                element={
                  <ProtectedRoute allowedRoles={["admin", "instructor"]}>
                    <AppLayout><TrainerPayroll /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trainer-app"
                element={
                  <ProtectedRoute allowedRoles={["admin", "instructor"]}>
                    <TrainerApp />
                  </ProtectedRoute>
                }
              />
               <Route
                 path="/student-app"
                 element={
                   <ProtectedRoute allowedRoles={["admin", "student"]}>
                     <StudentApp />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/marketing-ai"
                 element={
                   <ProtectedRoute allowedRoles={["admin", "reception"]}>
                     <AppLayout><MarketingAI /></AppLayout>
                   </ProtectedRoute>
                 }
               />
               <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
