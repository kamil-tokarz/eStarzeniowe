# eStarzeniowe — AI handoff / stan projektu

> Ten dokument jest punktem ciągłości prac nad aplikacją. GitHub pozostaje źródłem prawdy dla kodu.

## Cel
Pełna działająca aplikacja webowa JagoPro do obsługi testów stabilności/starzeniowych. Wersja testowa: Docker + PostgreSQL; docelowo Azure.

## Kierunek UX/UI
JagoPro Premium Light UI: biel, jasne szarości, turkus JagoPro, dużo whitespace, mocna hierarchia typografii. Czerwony dla NOK/krytycznych problemów, pomarańczowy dla zaległości. Dashboard Technologa ma wyglądać jak interaktywny executive-summary, nie generyczny ERP.

## Role
- Technolog
- Laborant
- Administrator

Technolog widzi wszystkie zlecenia. Laboranci pracują we wspólnej puli. Administrator zarządza użytkownikami, klientami, standardami i słownikami.

## Statusy badania
- DRAFT / Robocze
- ACTIVE / W realizacji
- COMPLETED / Zakończone
- CANCELLED / Anulowane
- INTERRUPTED / Przerwane

## Najważniejsze reguły
- Numer `ES-RRRR-NNNN`, unikalna roczna sekwencja, anulowane numery nie wracają.
- Standard definiuje tylko fizyczny plan próbek i stałe offsety dni.
- Kryteria wybiera Technolog per zlecenie; zakres zamraża się przy przekazaniu.
- W ACTIVE wartość istniejącego kryterium może być wersjonowana z uzasadnieniem; ocena bieżąca wyników jest przeliczana, pierwotna zachowana.
- Przekazanie generuje próbki i blokuje konfigurację.
- Każda próbka ma badania wstępne: waga zawsze, ciśnienie dla aerozolu.
- Wszystkie badania wstępne muszą być kompletne przed badaniami właściwymi.
- Normalna próbka: waga, ciśnienie dla aerozolu i wszystkie wybrane kryteria.
- `Nie wykonano` wymaga powodu. NOK nie blokuje kompletności.
- Mikrobiologia: jeden zbiorczy OK/NOK + opcjonalny raport.
- RF/REF to backup OOS; brak terminu/sprintu; niewykorzystany RF nie blokuje zakończenia.
- Laboratorium ma dwa równorzędne tryby: po badaniu i po próbce.
- Jawny zapis wyników, optimistic concurrency per wynik, częściowy batch save.
- Badanie kończy się automatycznie po komplecie wymaganych próbek bez niewykorzystanych RF.

## Technologia
- Next.js + TypeScript
- PostgreSQL
- Prisma
- lokalne konta
- Docker / Docker Compose
- docelowo Azure

## Konta testowe
- `admin / admin`
- `technolog / test`
- `laborant / test`

## Gałęzie
- robocza: `feat/bootstrap-mvp`
- checkpoint CI: `ci/checkpoint`
- draft PR: #1

CI nie uruchamia się przy każdym commicie roboczym. Pełny test uruchamiany jest tylko na większych checkpointach przez przesunięcie `ci/checkpoint`.

## Aktualnie napisane
- fundament Next.js/TypeScript
- Prisma/PostgreSQL
- Docker Compose
- lokalne logowanie i sesje
- proxy-safe API login/logout pod Codespaces
- seed danych testowych
- Dashboard Technologa z bazy
- rejestr zleceń
- tworzenie DRAFT i numer badania
- pełna edycja DRAFT przed przekazaniem
- komponenty i podstawowe kryteria
- przekazanie do Laboratorium
- generowanie próbek
- badania wstępne
- Laboratorium po próbce
- Laboratorium po badaniu / batch
- `Nie wykonano + powód`
- OK/NOK
- optimistic concurrency
- częściowy batch save
- podstawowa mikrobiologia
- auto-completion
- RF/OOS dla konkretnego NOK
- wersjonowanie wartości kryteriów
- przerwanie badania
- Administracja: użytkownicy, klienci, standardy, słowniki
- standardy: DRAFT → ACTIVE → WITHDRAWN, plan próbek, blokada po pierwszym użyciu

## Pozostało do 100% wersji testowej
1. Pełny katalog kryteriów i dokładne słowniki z workflow (obecnie formularz wykorzystuje podstawowy zestaw pH/gęstość/wygląd/zapach).
2. Dokładne standardy produkcyjne z przypisanymi stałymi offsetami dni; stare nazwy są rozpoznane, ale część wymaga jawnych offsetów.
3. Etykiety A4 4×10.
4. Załącznik raportu mikrobiologicznego.
5. Trendy liczbowe.
6. Eksport Excel + PDF.
7. Dopracowanie dashboardu/filtrów i Wymaga uwagi.
8. Testy akceptacyjne end-to-end i polish UX.
9. Migracje produkcyjne Prisma + finalny pakiet wdrożeniowy Docker/Azure.
10. Ustabilizowanie testowego podglądu Codespaces; nie blokuje budowy funkcji biznesowych.

## Sposób pracy
Nie zatrzymywać użytkownika pytaniami technicznymi, jeśli decyzję można rozsądnie wywnioskować. Wątpliwości biznesowe rozstrzygać zgodnie z zasadą: system dla ludzi, nie ludzie dla systemu. Użytkownik chce najpierw gotową aplikację do testów, a dopiero potem poprawki po feedbacku użytkowników.
