import { Route, Routes } from "react-router-dom";

import { AppShell } from "../layout/app-shell";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<AppShell />} />
    </Routes>
  );
}
