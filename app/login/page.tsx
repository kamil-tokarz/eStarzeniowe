import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-lockup">
          <div className="brand-mark">jago<span>PRO</span></div>
          <div className="brand-divider" />
          <div>
            <strong>eStarzeniowe</strong>
            <span>Stability Management</span>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">JagoPro · R&amp;D &amp; Laboratory</p>
          <h1>Testy stabilności.<br />Jasno i pod kontrolą.</h1>
          <p>Jedno miejsce do planowania badań, pracy Laboratorium i obserwowania wyników.</p>
        </div>

        <form action="/api/auth/login" method="post" className="login-form">
          <label>
            Login
            <input name="login" autoComplete="username" defaultValue="admin" required />
          </label>
          <label>
            Hasło
            <input name="password" type="password" autoComplete="current-password" defaultValue="admin" required />
          </label>
          {error && <div className="form-error">{error === "missing" ? "Uzupełnij login i hasło." : "Nieprawidłowy login lub hasło."}</div>}
          <button className="primary-button" type="submit">Zaloguj się</button>
        </form>

        <div className="test-credentials">
          <span>Wersja testowa</span>
          <code>admin / admin</code>
        </div>
      </section>
      <aside className="login-visual" aria-hidden="true">
        <div className="visual-orb visual-orb-a" />
        <div className="visual-orb visual-orb-b" />
        <div className="visual-card visual-card-a">
          <span>Aktywne badania</span><strong>42</strong><small>pełny portfel R&amp;D</small>
        </div>
        <div className="visual-card visual-card-b danger-card">
          <span>Wymaga uwagi</span><strong>4 NOK</strong><small>czytelny sygnał, bez szumu</small>
        </div>
        <div className="visual-card visual-card-c">
          <span>Laboratorium</span><strong>86</strong><small>próbek w bieżącym sprincie</small>
        </div>
      </aside>
    </main>
  );
}
