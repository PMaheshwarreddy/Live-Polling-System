import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useTeacher } from "./lib/auth";
import { Landing } from "./pages/Landing";
import { TeacherAuth } from "./pages/TeacherAuth";
import { TeacherHome } from "./pages/TeacherHome";
import { TeacherSession } from "./pages/TeacherSession";
import { Present } from "./pages/Present";
import { Report } from "./pages/Report";
import { StudentJoin } from "./pages/StudentJoin";
import { StudentLive } from "./pages/StudentLive";
import { NotFound } from "./pages/NotFound";

function TeacherOnly({ children }: { children: ReactNode }) {
  return useTeacher() ? children : <Navigate to="/teacher/login" replace />;
}

export function App() {
  return (
    <>
      <div className="backdrop" aria-hidden />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<StudentJoin />} />
        <Route path="/join/:code" element={<StudentJoin />} />
        <Route path="/s/:code" element={<StudentLive />} />
        <Route path="/teacher/login" element={<TeacherAuth mode="login" />} />
        <Route path="/teacher/signup" element={<TeacherAuth mode="signup" />} />
        <Route path="/teacher" element={<TeacherOnly><TeacherHome /></TeacherOnly>} />
        <Route path="/teacher/session/:id" element={<TeacherOnly><TeacherSession /></TeacherOnly>} />
        <Route path="/teacher/session/:id/present" element={<TeacherOnly><Present /></TeacherOnly>} />
        <Route path="/teacher/session/:id/report" element={<TeacherOnly><Report /></TeacherOnly>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
