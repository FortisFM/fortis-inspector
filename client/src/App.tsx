import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import Sites from "@/pages/Sites";
import SiteDetail from "@/pages/SiteDetail";
import SiteEdit from "@/pages/SiteEdit";
import RunInspection from "@/pages/RunInspection";
import ViewInspection from "@/pages/ViewInspection";
import Issues from "@/pages/Issues";
import IssueDetail from "@/pages/IssueDetail";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Sites} />
      <Route path="/sites" component={Sites} />
      <Route path="/sites/new" component={Sites} />
      <Route path="/sites/:id/edit" component={SiteEdit} />
      <Route path="/sites/:id/inspect/:inspectionId" component={RunInspection} />
      <Route path="/sites/:id" component={SiteDetail} />
      <Route path="/inspections/:id" component={ViewInspection} />
      <Route path="/issues/:id" component={IssueDetail} />
      <Route path="/issues" component={Issues} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function Gate() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <AppLayout>
      <AppRouter />
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthProvider>
          <Router hook={useHashLocation}>
            <Gate />
          </Router>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
