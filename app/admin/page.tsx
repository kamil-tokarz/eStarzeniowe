import { redirect } from "next/navigation";
import { SampleRole, StandardStatus, UserRole } from "@/generated/prisma/client";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const roleLabel: Record<UserRole, string> = {
  ADMIN: "Administrator",
  TECHNOLOGIST: "Technolog",
  LAB_TECHNICIAN: "Laborant",
};

const standardLabel: Record<StandardStatus, string> = {
  DRAFT: "Roboczy",
  ACTIVE: "Aktywny",
  WITHDRAWN: "Wycofany",
};

const sampleRoleLabel: Record<SampleRole, string> = {
  STANDARD: "Standardowa",
  MICROBIOLOGY: "Mikrobiologia",
  REFERENCE: "RF / OOS",
};

const messageMap: Record<string, string> = {
  "user-created": "Użytkownik został utworzony.",
  "user-updated": "Status użytkownika został zmieniony.",
  "password-reset": "Hasło zostało zresetowane, a aktywne sesje zakończone.",
  "client-created": "Klient został dodany.",
  "client-updated": "Status klienta został zmieniony.",
  "dictionary-created": "Wartość słownika została dodana.",
  "dictionary-updated": "Status wartości słownika został zmieniony.",
  "standard-created": "Standard roboczy został utworzony.",
  "standard-updated": "Dane standardu zostały zapisane.",
  "definition-created": "Pozycja planu próbek została dodana.",
  "definition-removed": "Pozycja planu próbek została usunięta.",
  "standard-activated": "Standard został aktywowany.",
  "standard-withdrawn": "Standard został wycofany.",
};

const errorMap: Record<string, string> = {
  "invalid-user": "Uzupełnij użytkownika poprawnie. Hasło startowe musi mieć co najmniej 8 znaków.",
  "duplicate-user": "Taki login już istnieje.",
  "self-disable": "Nie możesz dezaktywować własnego konta.",
  "short-password": "Nowe hasło musi mieć co najmniej 8 znaków.",
  "invalid-client": "Podaj nazwę klienta.",
  "duplicate-client": "Taki klient już istnieje.",
  "invalid-dictionary": "Podaj kategorię i wartość słownika.",
  "duplicate-dictionary": "Taka wartość już istnieje w tym słowniku.",
  "invalid-standard": "Podaj nazwę standardu.",
  "duplicate-standard": "Standard o takiej nazwie już istnieje.",
  "standard-locked": "Tego standardu nie można już edytować — został użyty lub wycofany.",
  "invalid-definition": "Uzupełnij kod, warunek przechowywania i poprawne dane próbki.",
  "missing-days": "Próbka zwykła lub mikrobiologiczna musi mieć stały offset dni.",
  "duplicate-definition": "Ten kod próbki już występuje w standardzie.",
  "cannot-activate": "Standard można aktywować dopiero po dodaniu co najmniej jednej próbki.",
  "cannot-withdraw": "Wycofać można wyłącznie aktywny standard.",
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ adminOk?: string; adminError?: string }> }) {
  const user = await requireUser();
  if (user.role !== UserRole.ADMIN) redirect("/");
  const params = await searchParams;

  const [users, clients, standards, dictionaryEntries] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.client.findMany({ include: { _count: { select: { studies: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.stabilityStandard.findMany({
      include: {
        definitions: { orderBy: { sortOrder: "asc" } },
        _count: { select: { studies: true } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.dictionaryEntry.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { value: "asc" }] }),
  ]);

  const dictionaryGroups = new Map<string, typeof dictionaryEntries>();
  for (const entry of dictionaryEntries) {
    const group = dictionaryGroups.get(entry.category) ?? [];
    group.push(entry);
    dictionaryGroups.set(entry.category, group);
  }

  return (
    <AppShell user={user} active="admin">
      <div className="topline">
        <div>
          <div className="eyebrow">Konfiguracja systemu</div>
          <h1>Administracja</h1>
          <div className="subtle">Użytkownicy, klienci, standardy i słowniki — bez osobnego dashboardu administracyjnego.</div>
        </div>
      </div>

      {(params.adminOk || params.adminError) && (
        <div className={`admin-flash ${params.adminError ? "error" : "success"}`}>
          {params.adminError ? errorMap[params.adminError] ?? "Operacja nie powiodła się." : messageMap[params.adminOk ?? ""] ?? "Zapisano zmiany."}
        </div>
      )}

      <nav className="admin-nav" aria-label="Sekcje administracji">
        <a href="#users">Użytkownicy</a><a href="#clients">Klienci</a><a href="#standards">Standardy</a><a href="#dictionaries">Słowniki</a>
      </nav>

      <section className="section" id="users">
        <div className="section-head"><div><div className="eyebrow">Dostęp</div><div className="section-title">Użytkownicy</div></div></div>
        <div className="admin-split">
          <div className="table-card"><table><thead><tr><th>Użytkownik</th><th>Rola</th><th>Status</th><th>Akcje</th></tr></thead><tbody>
            {users.map((row) => <tr key={row.id}>
              <td><div className="primary-cell">{row.name}</div><div className="secondary-cell">{row.login}</div></td>
              <td>{roleLabel[row.role]}</td>
              <td><span className={`badge ${row.active ? "success" : "neutral"}`}>{row.active ? "Aktywny" : "Nieaktywny"}</span>{row.mustChangePassword && <div className="secondary-cell">zmiana hasła przy pierwszym użyciu</div>}</td>
              <td><div className="admin-actions">
                <form method="post" action="/api/admin/users"><input type="hidden" name="intent" value="toggle"/><input type="hidden" name="userId" value={row.id}/><button className="btn btn-secondary btn-small" type="submit">{row.active ? "Dezaktywuj" : "Aktywuj"}</button></form>
                <form method="post" action="/api/admin/users" className="inline-mini-form"><input type="hidden" name="intent" value="reset-password"/><input type="hidden" name="userId" value={row.id}/><input name="password" type="password" placeholder="Nowe hasło" minLength={8} required/><button className="btn btn-secondary btn-small" type="submit">Resetuj</button></form>
              </div></td>
            </tr>)}
          </tbody></table></div>
          <form className="admin-card" method="post" action="/api/admin/users">
            <input type="hidden" name="intent" value="create"/><div className="eyebrow">Nowe konto</div><h3>Dodaj użytkownika</h3>
            <label>Imię i nazwisko<input name="name" required/></label><label>Login<input name="login" required/></label>
            <label>Rola<select name="role" defaultValue={UserRole.LAB_TECHNICIAN}><option value={UserRole.TECHNOLOGIST}>Technolog</option><option value={UserRole.LAB_TECHNICIAN}>Laborant</option><option value={UserRole.ADMIN}>Administrator</option></select></label>
            <label>Hasło startowe<input name="password" type="password" minLength={8} required/></label>
            <button className="btn btn-primary" type="submit">Utwórz konto</button>
          </form>
        </div>
      </section>

      <section className="section" id="clients">
        <div className="section-head"><div><div className="eyebrow">Centralny słownik</div><div className="section-title">Klienci</div></div></div>
        <div className="admin-split">
          <div className="table-card"><table><thead><tr><th>Klient</th><th>Badania</th><th>Status</th><th></th></tr></thead><tbody>
            {clients.map((client) => <tr key={client.id}><td className="primary-cell">{client.name}</td><td>{client._count.studies}</td><td><span className={`badge ${client.active ? "success" : "neutral"}`}>{client.active ? "Aktywny" : "Nieaktywny"}</span></td><td><form method="post" action="/api/admin/clients"><input type="hidden" name="intent" value="toggle"/><input type="hidden" name="clientId" value={client.id}/><button className="btn btn-secondary btn-small" type="submit">{client.active ? "Dezaktywuj" : "Aktywuj"}</button></form></td></tr>)}
          </tbody></table></div>
          <form className="admin-card" method="post" action="/api/admin/clients"><input type="hidden" name="intent" value="create"/><div className="eyebrow">Nowy klient</div><h3>Dodaj do słownika</h3><label>Nazwa klienta<input name="name" required/></label><button className="btn btn-primary" type="submit">Dodaj klienta</button><p className="admin-help">Klienta użytego w badaniu nie usuwamy. Można go później dezaktywować.</p></form>
        </div>
      </section>

      <section className="section" id="standards">
        <div className="section-head"><div><div className="eyebrow">Plan fizycznych próbek</div><div className="section-title">Standardy badań stabilności</div><div className="subtle">Standard definiuje wyłącznie próbki, warunki i stałe offsety dni. Nie przechowuje kryteriów akceptacji.</div></div></div>
        <form className="admin-card admin-create-standard" method="post" action="/api/admin/standards"><input type="hidden" name="intent" value="create"/><div><div className="eyebrow">Nowy standard</div><h3>Utwórz wersję roboczą</h3></div><label>Nazwa<input name="name" required/></label><label>Opis<input name="description"/></label><button className="btn btn-primary" type="submit">Utwórz</button></form>
        <div className="standard-admin-list">
          {standards.map((standard) => {
            const editable = !standard.locked && standard._count.studies === 0 && standard.status !== StandardStatus.WITHDRAWN;
            return <details className="standard-admin-card" key={standard.id} open={standard.status === StandardStatus.DRAFT}>
              <summary><div><strong>{standard.name}</strong><span>{standard.description || "Bez opisu"}</span></div><div className="standard-summary-meta"><span className={`badge ${standard.status === StandardStatus.ACTIVE ? "success" : standard.status === StandardStatus.DRAFT ? "warning" : "neutral"}`}>{standardLabel[standard.status]}</span><small>{standard.definitions.length} pozycji · użyty w {standard._count.studies} badaniach</small></div></summary>
              <div className="standard-admin-body">
                {editable && <form className="admin-inline-grid" method="post" action="/api/admin/standards"><input type="hidden" name="intent" value="update"/><input type="hidden" name="standardId" value={standard.id}/><label>Nazwa<input name="name" defaultValue={standard.name} required/></label><label>Opis<input name="description" defaultValue={standard.description ?? ""}/></label><button className="btn btn-secondary" type="submit">Zapisz opis</button></form>}
                <div className="table-card"><table><thead><tr><th>Kod</th><th>Rola</th><th>Checkpoint</th><th>Offset</th><th>Warunek</th><th>Pozycja</th><th>Ilość</th><th></th></tr></thead><tbody>
                  {standard.definitions.length ? standard.definitions.map((def) => <tr key={def.id}><td className="primary-cell">{def.code}</td><td>{sampleRoleLabel[def.role]}</td><td>{def.checkpointLabel ?? "—"}</td><td>{def.checkpointDays == null ? "—" : `+${def.checkpointDays} dni`}</td><td>{def.storageCondition}</td><td>{def.position ?? "—"}</td><td>{def.quantity}</td><td>{editable && <form method="post" action="/api/admin/standards"><input type="hidden" name="intent" value="remove-definition"/><input type="hidden" name="standardId" value={standard.id}/><input type="hidden" name="definitionId" value={def.id}/><button className="text-button danger-text" type="submit">Usuń</button></form>}</td></tr>) : <tr><td colSpan={8}><div className="empty-state"><strong>Brak próbek</strong><span>Dodaj plan próbek, zanim aktywujesz standard.</span></div></td></tr>}
                </tbody></table></div>
                {editable && <form className="definition-form" method="post" action="/api/admin/standards"><input type="hidden" name="intent" value="add-definition"/><input type="hidden" name="standardId" value={standard.id}/><label>Kod<input name="code" placeholder="R03a" required/></label><label>Rola<select name="role" defaultValue={SampleRole.STANDARD}><option value={SampleRole.STANDARD}>Standardowa</option><option value={SampleRole.MICROBIOLOGY}>Mikrobiologia</option><option value={SampleRole.REFERENCE}>RF / OOS</option></select></label><label>Checkpoint<input name="checkpointLabel" placeholder="90D"/></label><label>Offset dni<input name="checkpointDays" type="number" min="0" placeholder="90"/></label><label>Warunek<input name="storageCondition" placeholder="RT (20-25°C)" required/></label><label>Pozycja<input name="position" placeholder="np. pionowo"/></label><label>Ilość<input name="quantity" type="number" min="1" defaultValue="1" required/></label><button className="btn btn-secondary" type="submit">Dodaj próbkę</button></form>}
                <div className="admin-actions standard-actions">
                  {standard.status === StandardStatus.DRAFT && <form method="post" action="/api/admin/standards"><input type="hidden" name="intent" value="activate"/><input type="hidden" name="standardId" value={standard.id}/><button className="btn btn-primary" type="submit">Aktywuj standard</button></form>}
                  {standard.status === StandardStatus.ACTIVE && <form method="post" action="/api/admin/standards"><input type="hidden" name="intent" value="withdraw"/><input type="hidden" name="standardId" value={standard.id}/><button className="btn btn-secondary" type="submit">Wycofaj standard</button></form>}
                  {!editable && <span className="admin-help">{standard.status === StandardStatus.WITHDRAWN ? "Standard historyczny — tylko do odczytu." : "Standard został użyty w badaniu i jest niezmienny."}</span>}
                </div>
              </div>
            </details>;
          })}
        </div>
      </section>

      <section className="section" id="dictionaries">
        <div className="section-head"><div><div className="eyebrow">Wartości wspólne</div><div className="section-title">Słowniki</div></div></div>
        <form className="admin-inline-grid dictionary-create" method="post" action="/api/admin/dictionaries"><input type="hidden" name="intent" value="create"/><label>Kategoria<input name="category" placeholder="np. microbiology" required/></label><label>Wartość<input name="value" placeholder="Nowa wartość" required/></label><button className="btn btn-primary" type="submit">Dodaj wartość</button></form>
        <div className="dictionary-grid">
          {[...dictionaryGroups.entries()].map(([category, entries]) => <div className="dictionary-card" key={category}><div className="dictionary-card-head"><strong>{category}</strong><span>{entries.filter((e) => e.active).length}/{entries.length} aktywnych</span></div><div className="dictionary-list">{entries.map((entry) => <div className="dictionary-row" key={entry.id}><span className={entry.active ? "" : "muted-value"}>{entry.value}</span><form method="post" action="/api/admin/dictionaries"><input type="hidden" name="intent" value="toggle"/><input type="hidden" name="entryId" value={entry.id}/><button className="text-button" type="submit">{entry.active ? "Wyłącz" : "Włącz"}</button></form></div>)}</div></div>)}
        </div>
      </section>
    </AppShell>
  );
}
