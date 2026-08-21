const attentionRows = [
  { id: "ES-2026-0042", project: "DEODORANT TO BE FREE", client: "Brooklyn Soap", issue: "3 próbki zaległe", tone: "warning", progress: "8 / 52", date: "21.08.2026" },
  { id: "ES-2026-0037", project: "BODY LOTION SENSITIVE", client: "Nova Cosmetics", issue: "2 wyniki NOK", tone: "danger", progress: "12 / 36", date: "19.08.2026" },
  { id: "ES-2026-0031", project: "HAIR CONDITIONER REPAIR", client: "HairLab", issue: "1 próbka przeterminowana", tone: "danger", progress: "10 / 40", date: "18.08.2026" },
  { id: "ES-2026-0028", project: "FACE CREAM MOISTURE", client: "Nova Cosmetics", issue: "1 próbka zaległa", tone: "warning", progress: "9 / 28", date: "20.08.2026" },
] as const;

const studies = [
  { id: "ES-2026-0042", project: "DEODORANT TO BE FREE", client: "Brooklyn Soap", conditions: "RT, 40°C, 5°C", done: 18, total: 52, nok: 3, late: 2, overdue: 0 },
  { id: "ES-2026-0037", project: "BODY LOTION SENSITIVE", client: "Nova Cosmetics", conditions: "RT, 40°C", done: 12, total: 36, nok: 2, late: 1, overdue: 0 },
  { id: "ES-2026-0031", project: "HAIR CONDITIONER REPAIR", client: "HairLab", conditions: "RT, 40°C, 5°C", done: 10, total: 40, nok: 1, late: 0, overdue: 1 },
  { id: "ES-2026-0028", project: "FACE CREAM MOISTURE", client: "Nova Cosmetics", conditions: "RT, 40°C", done: 9, total: 28, nok: 0, late: 1, overdue: 0 },
  { id: "ES-2026-0020", project: "HAND WASH FRESH", client: "CleanLife", conditions: "RT, 5°C", done: 28, total: 28, nok: 0, late: 0, overdue: 0 },
] as const;

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          eStarzeniowe
          <small>Testy stabilności produktów</small>
        </div>
      </div>

      <nav className="nav" aria-label="Główna nawigacja">
        <a className="nav-item active" href="#">Dashboard</a>
        <a className="nav-item" href="#">Zlecenia</a>
        <a className="nav-item" href="#">Laboratorium</a>
        <a className="nav-item" href="#">Próbki</a>
        <a className="nav-item" href="#">Raporty</a>
        <a className="nav-item" href="#">Administracja</a>
      </nav>

      <div style={{ marginTop: "auto" }}>
        <div style={{ fontSize: 12, color: "var(--jp-muted)", marginBottom: 5 }}>Zalogowano jako</div>
        <div style={{ fontWeight: 720, fontSize: 14 }}>Kamil Tokarz</div>
        <div style={{ color: "var(--jp-teal)", fontSize: 12, marginTop: 2 }}>Technolog</div>
      </div>
    </aside>
  );
}

export default function Home() {
  return (
    <div className="page-shell">
      <Sidebar />
      <main className="main">
        <div className="topline">
          <div>
            <div className="eyebrow">Testy stabilności · 21 sierpnia 2026</div>
            <h1>Dzień dobry, Kamil</h1>
            <div className="subtle">Najważniejsze informacje o aktywnych badaniach w jednym miejscu.</div>
          </div>
          <div className="top-actions">
            <button className="btn btn-secondary">Wymaga uwagi</button>
            <button className="btn btn-primary">+ Nowe zlecenie</button>
          </div>
        </div>

        <section className="kpi-grid" aria-label="Podsumowanie">
          <div className="kpi teal">
            <div className="kpi-value">42</div>
            <div className="kpi-label">Aktywne badania</div>
            <div className="kpi-note">12 zakończonych w tym roku</div>
          </div>
          <div className="kpi danger">
            <div className="kpi-value">7</div>
            <div className="kpi-label">Z wynikami NOK</div>
            <div className="kpi-note">wymagają decyzji Technologa</div>
          </div>
          <div className="kpi warning">
            <div className="kpi-value">4</div>
            <div className="kpi-label">Zaległe próbki</div>
            <div className="kpi-note">w bieżącym sprincie</div>
          </div>
          <div className="kpi danger">
            <div className="kpi-value">2</div>
            <div className="kpi-label">Przeterminowane</div>
            <div className="kpi-note">przeniesione z poprzednich sprintów</div>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow">Priorytet</div>
              <div className="section-title">Wymaga uwagi</div>
            </div>
            <a href="#" className="section-link">Zobacz wszystkie →</a>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Badanie</th>
                  <th>Klient</th>
                  <th>Przyczyna</th>
                  <th>Postęp</th>
                  <th>Najbliższy termin</th>
                </tr>
              </thead>
              <tbody>
                {attentionRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="primary-cell">{row.project}</div>
                      <div className="secondary-cell">{row.id}</div>
                    </td>
                    <td>{row.client}</td>
                    <td><span className={`badge ${row.tone}`}><span className="dot" />{row.issue}</span></td>
                    <td>{row.progress}</td>
                    <td>{row.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <div>
              <div className="eyebrow">Portfel badań</div>
              <div className="section-title">Wszystkie aktywne badania</div>
            </div>
            <a href="#" className="section-link">Zobacz wszystkie →</a>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Kod</th>
                  <th>Projekt</th>
                  <th>Klient</th>
                  <th>Warunki</th>
                  <th>Postęp próbek</th>
                  <th>NOK</th>
                  <th>Zaległe</th>
                  <th>Przeterm.</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {studies.map((study) => {
                  const percent = Math.round((study.done / study.total) * 100);
                  const completed = study.done === study.total;
                  return (
                    <tr key={study.id}>
                      <td className="primary-cell">{study.id}</td>
                      <td><div className="primary-cell">{study.project}</div></td>
                      <td>{study.client}</td>
                      <td className="subtle">{study.conditions}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div className="progress"><span style={{ width: `${percent}%` }} /></div>
                          <span>{study.done} / {study.total}</span>
                        </div>
                      </td>
                      <td style={{ color: study.nok ? "var(--jp-danger)" : undefined, fontWeight: study.nok ? 760 : 500 }}>{study.nok}</td>
                      <td style={{ color: study.late ? "var(--jp-warning)" : undefined, fontWeight: study.late ? 760 : 500 }}>{study.late}</td>
                      <td style={{ color: study.overdue ? "var(--jp-danger)" : undefined, fontWeight: study.overdue ? 760 : 500 }}>{study.overdue}</td>
                      <td><span className={`badge ${completed ? "success" : "teal"}`}>{completed ? "Zakończone" : "W realizacji"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
