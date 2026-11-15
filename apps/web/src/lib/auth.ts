import { useSyncExternalStore } from "react";

/** Logins live in localStorage so a refreshed tab picks up exactly where it was. */
export interface TeacherAuth {
  token: string;
  teacher: { id: string; name: string; email: string };
}
export interface StudentAuth {
  token: string;
  participant: { id: string; name: string };
  session: { id: string; code: string; title: string };
}

const TEACHER_KEY = "cp.teacher";
const studentKey = (code: string) => `cp.student.${code.toUpperCase()}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: login lasts for this tab only */
  }
  emit();
}

let teacherCache: string | null = null;
let teacherParsed: TeacherAuth | null = null;
function getTeacher(): TeacherAuth | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(TEACHER_KEY);
  } catch {
    /* ignore */
  }
  if (raw !== teacherCache) {
    teacherCache = raw;
    teacherParsed = raw ? (JSON.parse(raw) as TeacherAuth) : null;
  }
  return teacherParsed;
}

export const teacherAuth = {
  get: getTeacher,
  set: (a: TeacherAuth | null) => write(TEACHER_KEY, a),
};
export const studentAuth = {
  get: (code: string) => read<StudentAuth>(studentKey(code)),
  set: (code: string, a: StudentAuth | null) => write(studentKey(code), a),
};

export function useTeacher(): TeacherAuth | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    getTeacher,
  );
}
