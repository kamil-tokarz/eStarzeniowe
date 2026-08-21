# eStarzeniowe

Wewnętrzna aplikacja JagoPro do obsługi testów stabilności: zlecenia Technologa, standardy, próbki, badania wstępne, sprint Laboratorium, wyniki OK/NOK, próbki RF/OOS, mikrobiologia, wersjonowane kryteria i audit trail.

## Uruchomienie środowiska testowego

```bash
docker compose up -d --build
```

Przy **pierwszym** uruchomieniu lub gdy świadomie chcesz odtworzyć dane demonstracyjne:

```bash
docker compose exec app npx prisma db seed
```

> `db seed` usuwa i odtwarza dane demonstracyjne. Nie jest wykonywany automatycznie przy restarcie aplikacji.

Aplikacja: `http://localhost:3000`

Konta demonstracyjne po seedzie:
- `admin / admin`
- `technolog / test`
- `laborant / test`

## Dane źródłowe workflow

Seed referencyjny zawiera 24 pozycje mikrobiologii oraz 7 planów standardów odtworzonych z obecnego workflow Comarch BPM (217 definicji próbek). Zaimportowane standardy pozostają w statusie DRAFT do zatwierdzenia przez Administratora, ponieważ etykiety miesięczne są w nowym systemie przeliczane na stałe offsety dni (`1M = 30 dni`).

## CI

Pull request do `main` uruchamia PostgreSQL 17, Prisma, pełny seed, weryfikację danych referencyjnych, ESLint i produkcyjny build Next.js.
