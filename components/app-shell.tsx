import Link from "next/link";
import type { ReactNode } from "react";
import { UserRole } from "@/generated/prisma/client";

const roleLabel: Record<UserRole, string> = {
  ADMIN: "Administrator",
  TECHNOLOGIST: "Technolog",
  LAB_TECHNICIAN: "Laborant",
};

export function AppShell({
  user,
  active,
  children,
}: {
  user: { name: string; role: UserRole };
  active: "dashboard" | "studies" | "lab" | "admin";
  children: ReactNode;
}) {
  const canSeeDashboard = user.role === UserRole.TECHNOLOGIST || user.role === UserRole.ADMIN;
  const canSeeLab = user.role === UserRole.LAB_TECHNICIAN || user.role === UserRole.ADMIN;

  return (
    <div className="page-shell">
      <aside className="sidebar">
        <Link className="brand" href={user.role === UserRole.LAB_TECHNICIAN ? "/lab" : "/"}>
          <span className="brand-mark" aria-hidden="true" />
          <div>eStarzeniowe<small>Testy stabilności produktów</small></div>
        </Link>
        <nav className="nav" aria-label="Główna nawigacja">
          {canSeeDashboard && <Link className={`nav-item ${active === "dashboard" ? "active" : ""}`} href="/">Dashboard</Link>}
          <Link className={`nav-item ${active === "studies" ? "active" : ""}`} href="/studies">Zlecenia</Link>
          {canSeeLab && <Link className={`nav-item ${active === "lab" ? "active" : ""}`} href="/lab">Laboratorium</Link>}
          {user.role === UserRole.ADMIN && <Link className={`nav-item ${active === "admin" ? "active" : ""}`} href="/admin">Administracja</Link>}
        </nav>
        <div className="sidebar-user">
          <div className="secondary-cell">Zalogowano jako</div>
          <div className="primary-cell">{user.name}</div>
          <div className="user-role">{roleLabel[user.role]}</div>
          <form action="/api/auth/logout" method="post"><button className="text-button" type="submit">Wyloguj</button></form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
