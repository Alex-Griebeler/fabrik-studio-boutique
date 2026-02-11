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

const queryClient = new QueryClient();

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
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <AppLayout><Dashboard /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students"
                element={
                  <ProtectedRoute>
                    <AppLayout><Students /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/students/:id"
                element={
                  <ProtectedRoute>
                    <AppLayout><StudentProfile /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/plans"
                element={
                  <ProtectedRoute>
                    <AppLayout><Plans /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leads"
                element={
                  <ProtectedRoute>
                    <AppLayout><Leads /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/finance"
                element={
                  <ProtectedRoute>
                    <AppLayout><Finance /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bank-reconciliation"
                element={
                  <ProtectedRoute>
                    <AppLayout><BankReconciliation /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/expenses"
                element={
                  <ProtectedRoute>
                    <AppLayout><Expenses /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/instructors"
                element={
                  <ProtectedRoute>
                    <AppLayout><Instructors /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/schedule"
                element={
                  <ProtectedRoute>
                    <AppLayout><Schedule /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <AppLayout><Reports /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <AppLayout><SettingsPage /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payroll"
                element={
                  <ProtectedRoute>
                    <AppLayout><Payroll /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute>
                    <AppLayout><Analytics /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/commissions"
                element={
                  <ProtectedRoute>
                    <AppLayout><Commissions /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tasks"
                element={
                  <ProtectedRoute>
                    <AppLayout><Tasks /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trainer/payroll"
                element={
                  <ProtectedRoute>
                    <AppLayout><TrainerPayroll /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trainer-app"
                element={
                  <ProtectedRoute>
                    <TrainerApp />
                  </ProtectedRoute>
                }
              />
               <Route
                 path="/student-app"
                 element={
                   <ProtectedRoute>
                     <StudentApp />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/marketing-ai"
                 element={
                   <ProtectedRoute>
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
