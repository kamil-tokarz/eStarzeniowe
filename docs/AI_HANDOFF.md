# eStarzeniowe — AI handoff / stan projektu

> GitHub jest źródłem prawdy dla kodu. Ten plik służy wyłącznie do szybkiego wznowienia pracy bez ponownego odtwarzania ustaleń.

## Cel
Działająca wewnętrzna aplikacja JagoPro do obsługi testów stabilności/starzeniowych. Środowisko testowe: Docker + PostgreSQL; docelowo Azure.

## Kierunek UX/UI
JagoPro Premium Light UI: biel, jasne szarości, turkus JagoPro, dużo whitespace, mocna hierarchia typografii. Czerwony jest zarezerwowany dla NOK/krytycznych problemów, pomarańczowy dla zaległości. Dashboard Technologa ma przypominać interaktywny executive-summary, nie generyczny ERP.

## Role i nawigacja
- Technolog: Dashboard + Zlecenia.
- Laborant: Laboratorium + Zlecenia; wejście na `/` przekierowuje do `/lab`.
- Administrator: Dashboard + Zlecenia + Laboratorium + Administracja.

Technologowie widzą wszystkie zlecenia. Laboranci pracują we wspólnej puli.

## Statusy badania
- DRAFT / Robocze
- ACTIVE / W realizacji
- COMPLETED / Zakończone
- CANCELLED / Anulowane
- INTERRUPTED / Przerwane

## Najważniejsze reguły domenowe
- Numer `ES-RRRR-NNNN`, roczna unikalna sekwencja; anulowane numery nie wracają; generowanie chronione blokadą transakcyjną PostgreSQL.
- Standard definiuje wyłącznie fizyczny plan próbek i stałe offsety dni.
- Kryteria wybiera Technolog per zlecenie; zakres zamraża się przy przekazaniu.
- W ACTIVE wartość istniejącego kryterium może być wersjonowana z uzasadnieniem; zachowane są ocena pierwotna i bieżąca.
- Przekazanie jest transakcyjne: walidacja → ACTIVE → zamrożenie konfiguracji → próbki/testy/badania wstępne.
- Każda próbka ma badania wstępne: waga zawsze, ciśnienie dla aerozolu.
- Wszystkie badania wstępne całego zlecenia muszą być kompletne przed badaniami właściwymi.
- Normalna próbka: waga, ciśnienie dla aerozolu i wszystkie wybrane kryteria.
- `Nie wykonano` wymaga powodu. NOK nie blokuje kompletności.
- Mikrobiologia: jeden zbiorczy OK/NOK + opcjonalny raport.
- RF/REF to backup OOS; brak terminu/sprintu; niewykorzystany RF nie blokuje zakończenia; aktywowany RF liczy się do realizacji.
- Laboratorium ma tryby `Po badaniu` i `Po próbce`.
- Jawny zapis wyników, optimistic concurrency per wynik, częściowy batch save.
- Badanie kończy się automatycznie po komplecie wymaganych próbek; dostępne nieużyte RF przechodzą na UNUSED.
- Waga wsadu jest wyliczana po stronie serwera: waga nastawu + waga gazu; dla nieaerozolu = waga nastawu.

## Źródłowe katalogi z Comarch Workflow
Zaimportowano rzeczywiste słowniki z `Harmonogram Testów Starzeniowych(1).workflow`:
- wygląd: 30 unikalnych wartości źródłowych,
- zapach: 2,
- barwa: 23,
- rozpył: 3,
- konfiguracje zagniotu szerokość: 5,
- konfiguracje zagniotu wysokość: 6,
- rodzaje komponentów: 32,
- mikrobiologia: dokładnie 24 pozycje.

Nie używać uproszczonych wartości demonstracyjnych `Bez zmian` jako źródłowych odpowiedzi jakościowych.

## Standardy z workflow
`prisma/seed-standards.ts` zawiera pełny plan 217 pozycji z obecnego workflow dla 7 standardów:
1. Produkty wrażliwe mikrobiologicznie — 26 pozycji
2. Filtry UV — 30
3. Wyroby medyczne — 30
4. Produkty niewrażliwe mikrobiologicznie — 18
5. Standard WD-40_3M — 30
6. Standard WD-40_60M — 66
7. Standardowe 3M — 17

Kody, warunki, kolejność, RF i oznaczenia mikrobiologii są przeniesione ze źródła. Stary workflow liczył terminy przez `DATEADD(MONTH, ...)`, natomiast docelowy model wymaga stałych offsetów DAY. Seed jawnie konwertuje `nM → n×30 dni`, ale wszystkie te standardy pozostawia jako DRAFT z opisem „zweryfikuj przed aktywacją”. Administrator ma świadomie zatwierdzić offsety przed użyciem produkcyjnym.

## Technologia
- Next.js + TypeScript
- PostgreSQL
- Prisma
- lokalne konta i sesje
- Docker / Docker Compose
- docelowo Azure

## Konta testowe
- `admin / admin`
- `technolog / test`
- `laborant / test`

## Gałęzie / PR
- robocza: `feat/bootstrap-mvp`
- checkpoint CI: `ci/checkpoint`
- draft PR: #1 do `main`

CI: PostgreSQL 17 → `prisma generate` → `prisma db push` → pełny seed → ESLint → produkcyjny `next build`. Workflow działa na PR do main oraz checkpointach.

## Zaimplementowane
- Next.js/TypeScript + Prisma/PostgreSQL + Docker Compose
- logowanie, sesje, zmiana hasła, proxy-safe POST-y pod Codespaces/Azure
- role i nawigacja
- Dashboard Technologa + Wymaga uwagi
- pełny rejestr zleceń
- tworzenie i pełna edycja DRAFT
- walidacja serwerowa aktywnego klienta/Technologa/standardu/słowników i wartości liczbowych
- bezpieczna roczna numeracja badania
- komponenty ze źródłowym słownikiem
- pełny katalog kryteriów używanych w workflow
- 24 pozycje mikrobiologii
- przekazanie do Laboratorium
- generowanie próbek
- badania wstępne
- Laboratorium po próbce
- Laboratorium po badaniu / batch
- Nie wykonano + powód
- OK/NOK + historia zmian
- optimistic concurrency + częściowy batch save
- mikrobiologia + załącznik raportu
- auto-completion
- RF/OOS dla konkretnego NOK
- wersjonowanie wartości kryteriów i przeliczanie bieżącej oceny
- anulowanie/przerwanie badania
- Administracja: użytkownicy, klienci, standardy, słowniki
- standardy DRAFT → ACTIVE → WITHDRAWN, blokada po pierwszym użyciu
- etykiety A4 4×10
- trendy liczbowe
- eksport Excel + PDF
- 42 scenariusze akceptacyjne GIVEN/WHEN/THEN w `docs/ACCEPTANCE_TESTS.md`
- 7 rzeczywistych standardów/217 pozycji z workflow jako DRAFT do zatwierdzenia offsetów

## Co realnie pozostaje przed oddaniem wersji testowej
1. Ostatni zielony CI na aktualnym HEAD po imporcie standardów i słowników.
2. Krótki końcowy audit diff/PR: brak martwych Server Actions w krytycznych formularzach, brak oczywistych luk uprawnień, zgodność dokumentacji.
3. Ręczny smoke test w działającym Codespace/Azure przez użytkownika na trzech kontach; ewentualne poprawki wynikające z realnego kliknięcia aplikacji.
4. Przed produkcją: zatwierdzić stałe DAY offsety 7 zaimportowanych standardów i przygotować właściwe migracje/sekrety/storage Azure.

## Zasada pracy
Nie zatrzymywać użytkownika pytaniami technicznymi, jeśli decyzję można bezpiecznie wywnioskować. Nie dodawać workflow dla samego workflow. Priorytet: prostota pracy Technologa i Laboratorium, traceability danych oraz brak cichych nadpisań.
