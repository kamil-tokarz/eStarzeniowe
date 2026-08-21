# eStarzeniowe — AI handoff / stan projektu

> Ten dokument jest punktem ciągłości prac nad aplikacją. Aktualizować przy większych checkpointach. GitHub pozostaje źródłem prawdy dla kodu.

## Cel
Pełna, działająca aplikacja webowa JagoPro do obsługi testów stabilności/starzeniowych — nie makieta. Wersja testowa ma działać end-to-end na Docker + PostgreSQL, a docelowo zostać wdrożona na Azure.

## Kierunek UX/UI
JagoPro Premium Light UI: biel, bardzo jasne szarości, turkus JagoPro, dużo whitespace, duża hierarchiczna typografia, minimum dekoracji. Czerwony głównie dla NOK/krytycznych problemów, pomarańczowy dla zaległości. Dashboard Technologa ma przypominać interaktywny executive-summary slide, nie generyczny panel ERP/admin.

## Role
- Technolog
- Laborant
- Administrator

Technolog widzi wszystkie zlecenia. Laboranci pracują we wspólnej puli. Administrator zarządza użytkownikami, klientami, standardami i słownikami.

## Główne statusy badania
- DRAFT / Robocze
- ACTIVE / W realizacji
- COMPLETED / Zakończone
- CANCELLED / Anulowane (tylko z DRAFT, powód obowiązkowy)
- INTERRUPTED / Przerwane (tylko z ACTIVE, powód obowiązkowy, bez wznowienia)

## Najważniejsze reguły domenowe
- Numer badania: `ES-RRRR-NNNN`, unikalny, roczna sekwencja, anulowane numery nie wracają.
- Standard stabilności definiuje tylko fizyczny plan próbek i stałe offsety dni od daty rozpoczęcia.
- Kryteria akceptacji wybiera Technolog per zlecenie; zakres zamraża się przy przekazaniu do Laboratorium.
- W ACTIVE Technolog może zmieniać wartość istniejącego kryterium z obowiązkowym uzasadnieniem i wersjonowaniem; historyczne wyniki zachowują ocenę pierwotną, a bieżąca ocena jest przeliczana.
- Przekazanie do Laboratorium generuje fizyczne próbki i zamraża konfigurację.
- Data rozpoczęcia może być późniejsza od przekazania, ale nie wcześniejsza.
- Każda próbka ma badania wstępne: waga zawsze, ciśnienie dla aerozolu. Wynik albo `Nie wykonano + powód`.
- Wszystkie badania wstępne całego badania muszą być kompletne przed badaniami właściwymi.
- Normalna próbka: waga bieżąca, ciśnienie bieżące dla aerozolu oraz wszystkie wybrane kryteria.
- Pusty wymagany wynik blokuje kompletność; NOK nie blokuje kompletności.
- Mikrobiologia: jedna zbiorcza ocena OK/NOK dla próbki mikro + opcjonalny raport.
- RF/REF = próbka referencyjna / OOS backup, nie checkpoint czasowy.
- RF generowana przy przekazaniu, ma badania wstępne, ale brak terminu/sprintu. Niewykorzystana RF nie blokuje zakończenia i nie wchodzi do zwykłego progressu.
- Przy konkretnym NOK Technolog może wybrać `Użyj próbki referencyjnej`; wynik RF jest osobnym wynikiem połączonym ze źródłowym NOK, bez nadpisywania historii.
- Sprint jest liczony dynamicznie jako tydzień poniedziałek–niedziela zawierający datę nominalną; brak osobnej encji sprintu.
- Laboratorium ma dwa równorzędne tryby: po badaniu (batch) i po próbce.
- Zapis wyników jest jawny (`Zapisz wyniki`), bez autosave.
- Optimistic concurrency per pojedynczy wynik; brak locka całej próbki/formularza.
- Batch save zapisuje poprawne rekordy, a konflikty/błędy raportuje osobno.
- Badanie kończy się automatycznie, gdy wszystkie wymagane próbki (bez niewykorzystanych RF) są kompletne.

## Technologia
- Next.js + TypeScript
- PostgreSQL
- Prisma
- lokalne konta użytkowników
- Docker / Docker Compose
- docelowo Azure

## Konta testowe
- `admin / admin`
- `technolog / test`
- `laborant / test`

`admin/admin` jest wyłącznie dla środowiska testowego i nie może pozostać domyślnym hasłem produkcyjnym.

## Aktualny stan gałęzi
Gałąź robocza: `feat/bootstrap-mvp`.
Draft PR: #1.

### Napisane / w dużej części działające
- fundament Next.js/TypeScript
- Prisma/PostgreSQL
- Docker Compose
- lokalne logowanie i sesje
- seed danych testowych
- Dashboard Technologa oparty o dane z bazy
- rejestr zleceń
- tworzenie DRAFT
- generowanie numeru badania
- komponenty i podstawowe kryteria
- przekazanie do Laboratorium
- generowanie próbek ze standardu
- badania wstępne
- Laboratorium: po próbce
- Laboratorium: po badaniu / batch
- `Nie wykonano + powód`
- OK/NOK
- optimistic concurrency wyników
- częściowy zapis batcha
- mikrobiologia — podstawowy przepływ
- auto-completion badania
- logika RF/OOS — aktywacja dla konkretnego NOK (w trakcie finalnego dopięcia)
- wersjonowanie wartości kryteriów (w trakcie finalnego dopięcia)
- przerwanie badania

## CI / maile
CI NIE ma uruchamiać się po każdym commicie na `feat/bootstrap-mvp`.
Workflow jest skonfigurowany na:
- push do `main`
- push do `ci/checkpoint`
- ręczne workflow_dispatch

Do weryfikacji większej paczki należy przesunąć `ci/checkpoint` na aktualny commit. Dzięki temu użytkownik nie dostaje maila po każdym małym commicie.

## Ostatni znany problem przed checkpointem
Po dodaniu RF i edycji kryteriów build wykrył 2 błędy TypeScript związane z `.includes(criterion.kind)` dla enum `CriterionKind`. Są to błędy typowania, nie logiki biznesowej. Należy zastąpić w obu miejscach warunek np. jawnym porównaniem:

```ts
criterion.kind === CriterionKind.RANGE ||
criterion.kind === CriterionKind.MINIMUM ||
criterion.kind === CriterionKind.MAXIMUM
```

Dotyczy:
- `app/studies/[id]/page.tsx`
- `app/studies/attention-actions.ts`

## Co pozostało do wersji 100% gotowej do testów
1. Dopięcie i zielony checkpoint: RF/OOS, wersjonowanie kryteriów, interrupt.
2. Pełna edycja DRAFT.
3. Administracja:
   - użytkownicy
   - klienci
   - słowniki
   - standardy z blokadą po pierwszym użyciu.
4. Dokładny katalog kryteriów/słowników/mikrobiologii z obecnych workflow JagoPro.
5. Docelowe standardy z ustalonymi stałymi offsetami dni.
6. Etykiety A4 4×10, 52.5×29.7 mm, logo JagoPro, actual size.
7. Załącznik raportu mikrobiologicznego.
8. Trendy parametrów numerycznych.
9. Eksport minimum Excel + PDF.
10. Migracje produkcyjne Prisma zamiast testowego `db push`.
11. Dopracowanie seed/demo danych do scenariuszy użytkowych.
12. Testy akceptacyjne end-to-end i polish UX.
13. Gotowy pakiet wdrożeniowy Docker/Azure + instrukcja dla administratora serwera.

## Zasada pracy z użytkownikiem
Nie pytać o rzeczy, które można rozsądnie wywnioskować z powyższej logiki. W razie dwóch realnie różnych opcji biznesowych dopiero wtedy poprosić o decyzję. Preferować prostszy proces: „system dla ludzi, nie ludzie dla systemu”.
