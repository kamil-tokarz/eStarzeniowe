# eStarzeniowe

Wewnętrzna aplikacja JagoPro do obsługi testów stabilności: zlecenia Technologa, standardy, próbki, badania wstępne, sprint Laboratorium, wyniki OK/NOK, próbki RF/OOS, mikrobiologia, wersjonowane kryteria i audit trail.

## Najprostszy test — GitHub Codespaces

1. Otwórz repozytorium na GitHubie.
2. `Code` → `Codespaces` → `Create codespace`.
3. Konfiguracja devcontainer automatycznie uruchomi `docker compose up --build -d`.
4. Otwórz przekierowany port **3000**.
5. Zaloguj się: **admin / admin**.

Pierwszy start pobiera obrazy Dockera i buduje aplikację, więc w Codespaces może potrwać chwilę.

## Uruchomienie lokalne przez Docker

Wymagany jest Docker Desktop / Docker Engine z Compose.

```bash
docker compose up --build
```

Aplikacja: `http://localhost:3000`

Testowy administrator:

- login: `admin`
- hasło: `admin`

Baza PostgreSQL oraz dane testowe tworzą się automatycznie przy pierwszym starcie.

### Reset danych testowych

```bash
docker compose down -v
docker compose up --build
```

## Co znajduje się w seedzie

- administrator `admin/admin`,
- 3 konta Laboratorium (`laborant1`, `laborant2`, `laborant3`, hasło `test123`),
- Technolodzy z obecnego procesu JagoPro (hasło `test123`),
- klienci demonstracyjni,
- słowniki i kryteria wyciągnięte z obecnego workflow,
- 24 badania mikrobiologiczne,
- 7 standardów z obecnego workflow,
- badania demonstracyjne obejmujące m.in. NOK, zaległość, RF/OOS i projekt roboczy.

## Architektura wdrożeniowa

Aplikacja jest od początku konteneryzowana. Docelowy serwer Azure będzie uruchamiał ten sam obraz aplikacji. Konfiguracja trafia przez zmienne środowiskowe, a dane pozostają poza kontenerem.

Testowo `docker-compose.yml` uruchamia:

- `app` — Next.js,
- `db` — PostgreSQL 17,
- trwały wolumen bazy,
- trwały wolumen załączników.

Na produkcji hasło `admin/admin` **nie może pozostać aktywne**. Produkcyjny pakiet wdrożeniowy będzie zawierał osobną instrukcję dla administratora Azure.

## Przydatne polecenia developerskie

```bash
npm run typecheck
npm test
npm run build
```

## Zasada projektowa

> System jest dla ludzi, a nie ludzie dla systemu.

Priorytety: prostota, czytelność, szybkość pracy, elastyczność i pełna identyfikowalność danych.
