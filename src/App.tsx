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
import Schedule from "@/pages/Schedule";
import Reports from "@/pages/Reports";
import SettingsPage from "@/pages/SettingsPage";
import Plans from "@/pages/Plans";
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
