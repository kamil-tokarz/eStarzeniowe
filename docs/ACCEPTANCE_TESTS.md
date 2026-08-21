# eStarzeniowe — testy akceptacyjne MVP

Poniższe scenariusze są biznesową bramką gotowości MVP. Zielony build nie zastępuje ich przejścia.

## 1. Zlecenie i role

1. **Widoczność zleceń Technologa**  
   GIVEN istnieją zlecenia przypisane do różnych Technologów  
   WHEN Technolog otwiera listę zleceń  
   THEN widzi wszystkie zlecenia, a filtr „Moje” ogranicza je do jego zleceń.

2. **Wspólna pula Laboratorium**  
   GIVEN istnieje kilka aktywnych badań  
   WHEN Laborant otwiera Laboratorium  
   THEN widzi wspólną kolejkę próbek niezależnie od Technologa odpowiedzialnego.

3. **Numer badania**  
   GIVEN powstają dwa nowe zlecenia w tym samym roku  
   WHEN są tworzone  
   THEN otrzymują unikalne kolejne numery `ES-RRRR-NNNN`, a anulowany numer nie jest ponownie używany.

4. **Edycja DRAFT**  
   GIVEN zlecenie ma status DRAFT  
   WHEN Technolog zmienia dane produktu, komponenty, kryteria, mikrobiologię lub standard  
   THEN zmiany są zapisywane bez generowania próbek.

5. **Anulowanie DRAFT**  
   GIVEN zlecenie ma status DRAFT  
   WHEN Technolog podaje powód i je anuluje  
   THEN status staje się CANCELLED, operacja jest nieodwracalna, a dane pozostają tylko do odczytu.

## 2. Standard i przekazanie do Laboratorium

6. **Standard nie definiuje kryteriów produktu**  
   GIVEN Technolog wybiera standard stabilności  
   THEN standard wyznacza wyłącznie fizyczny plan próbek, warunki i stałe offsety dni; kryteria pozostają zakresem zlecenia.

7. **Walidacja przekazania**  
   GIVEN w DRAFT brakuje wymaganego standardu, kryterium lub planu próbek  
   WHEN Technolog wybiera „Przekaż do Laboratorium”  
   THEN przekazanie nie zachodzi i użytkownik otrzymuje czytelny błąd.

8. **Data rozpoczęcia**  
   GIVEN data rozpoczęcia testów jest wcześniejsza niż dzień przekazania  
   WHEN Technolog próbuje przekazać zlecenie  
   THEN operacja jest blokowana. Data równa dniowi przekazania albo późniejsza jest dozwolona.

9. **Atomowe przekazanie**  
   GIVEN poprawne zlecenie DRAFT  
   WHEN następuje przekazanie  
   THEN w jednej operacji status staje się ACTIVE, zapisywany jest czas przekazania, standard jest zamrożony i powstaje pełny zestaw wymaganych próbek.

10. **Mikrobiologia tylko gdy wybrana**  
    GIVEN standard posiada definicję próbki mikrobiologicznej  
    WHEN zlecenie nie ma wybranych badań mikrobiologicznych  
    THEN próbka mikrobiologiczna nie jest generowana; po wybraniu zakresu mikro jest generowana.

11. **Niezmienność użytego standardu**  
    GIVEN standard został użyty w przekazanym zleceniu  
    THEN Administrator nie może zmienić jego historycznego planu w sposób wpływający na istniejące badanie.

## 3. Badania wstępne

12. **Waga każdej fizycznej próbki**  
    GIVEN zlecenie zostało przekazane  
    THEN każda wygenerowana próbka, również MICRO i RF, wymaga wagi początkowej albo „Nie wykonano” z powodem.

13. **Ciśnienie tylko dla aerozolu**  
    GIVEN produkt jest aerozolem  
    THEN każda fizyczna próbka wymaga także ciśnienia początkowego albo „Nie wykonano” z powodem. Dla nieaerozolu pole nie jest wymagane.

14. **Blokada badań właściwych**  
    GIVEN choć jedna próbka w zleceniu nie ma kompletu badań wstępnych  
    WHEN Laborant otwiera badania właściwe  
    THEN są zablokowane dla całego zlecenia.

15. **Odblokowanie automatyczne**  
    GIVEN ostatnia brakująca wartość wstępna została zapisana  
    THEN badania właściwe stają się dostępne bez dodatkowego zatwierdzenia.

## 4. Harmonogram i sprint Laboratorium

16. **Termin nominalny**  
    GIVEN próbka ma offset `N` dni  
    THEN jej termin nominalny wynosi dokładnie `data rozpoczęcia + N dni`, bez przesuwania weekendów i świąt.

17. **Planowana**  
    GIVEN dzisiaj jest przed poniedziałkiem sprintu zawierającego termin nominalny  
    THEN próbka jest Planowana i nie trafia do głównej kolejki wykonawczej.

18. **Do wykonania / Zaległa / Przeterminowana**  
    GIVEN próbka nie jest ukończona  
    THEN od początku sprintu do terminu jest „Do wykonania”, po terminie do niedzieli „Zaległa”, a od następnego sprintu „Przeterminowana”.

19. **Częściowa realizacja**  
    GIVEN część wyników próbki zapisano w poprzednim sprincie  
    WHEN próbka przechodzi dalej jako zaległa/przeterminowana  
    THEN zapisane wyniki pozostają, a do uzupełnienia pozostają wyłącznie braki.

20. **RF poza harmonogramem**  
    GIVEN próbka RF ma status AVAILABLE  
    THEN nie ma terminu nominalnego, sprintu ani statusu spóźnienia i nie występuje w zwykłej kolejce Laboratorium.

## 5. Wyniki i współbieżność

21. **Wynik liczbowy**  
    GIVEN badanie ma kryterium liczbowe  
    WHEN Laborant zapisuje wartość  
    THEN system zapisuje wartość i oblicza OK/NOK według aktualnego kryterium.

22. **Wynik słownikowy**  
    GIVEN badanie ma wartość oczekiwaną  
    WHEN Laborant wybiera tę samą wartość  
    THEN wynik jest OK; inna wartość daje NOK.

23. **Waga i ciśnienie informacyjnie**  
    GIVEN Laborant zapisuje bieżącą wagę lub ciśnienie  
    THEN system pokazuje wartość bazową, bieżącą, różnicę i zmianę procentową, ale nie nadaje OK/NOK.

24. **Nie wykonano**  
    GIVEN Laborant wybiera „Nie wykonano”  
    THEN powód jest obowiązkowy; taki wpis liczy się jako wykonana wymagana pozycja i ma ocenę N/A.

25. **NOK nie blokuje ukończenia próbki**  
    GIVEN wszystkie wymagane pozycje mają wynik lub „Nie wykonano”  
    WHEN część wyników ma NOK  
    THEN próbka może zostać oznaczona jako COMPLETED, a NOK pozostaje widoczne jako wynik wymagający uwagi.

26. **Edycja wyniku**  
    GIVEN istnieje zapisany wynik w aktywnym badaniu  
    WHEN Laborant go zmienia  
    THEN zapisywany jest użytkownik, czas, stara i nowa wartość oraz ocena w historii.

27. **Optymistyczna współbieżność**  
    GIVEN dwie osoby otworzyły ten sam wynik w tej samej wersji  
    WHEN pierwsza zapisze zmianę, a druga później spróbuje zapisać starą wersję  
    THEN drugi zapis nie nadpisuje wyniku i jest pokazany jako konflikt.

28. **Częściowy zapis seryjny**  
    GIVEN formularz seryjny zawiera poprawne wiersze, błąd walidacji i konflikt  
    WHEN Laborant zapisuje  
    THEN poprawne wiersze są zapisane, konflikt nie jest nadpisany, a błędny wiersz jest raportowany osobno.

## 6. Mikrobiologia i RF/OOS

29. **Wynik mikrobiologii**  
    GIVEN próbka MICRO ma komplet badań wstępnych  
    WHEN Laborant zapisuje zbiorczą ocenę OK/NOK  
    THEN próbka mikrobiologiczna zostaje ukończona, a wybrany zakres 24-testowego katalogu pozostaje widoczny informacyjnie.

30. **Raport mikrobiologiczny**  
    GIVEN Laborant ma wynik mikro  
    WHEN dołącza poprawny PDF/PNG/JPG  
    THEN plik jest przechowywany trwale i dostępny tylko zalogowanym użytkownikom z karty próbki.

31. **Aktywacja RF z NOK**  
    GIVEN zwykła próbka ma aktualny NOK i istnieje AVAILABLE RF w tym samym warunku przechowywania  
    WHEN Technolog wybiera „Użyj RF” i podaje powód  
    THEN RF przechodzi do ACTIVATED, zapisuje źródłową próbkę i wynik NOK oraz otrzymuje zadanie tylko dla wskazanego badania.

32. **Brak nadpisania NOK przez RF**  
    GIVEN aktywowano RF  
    WHEN Laboratorium zapisze wynik RF  
    THEN wynik pierwotny pozostaje bez zmian, a wynik RF tworzy oddzielny audytowalny łańcuch.

## 7. Zmiana kryterium i zakończenie

33. **Zmiana wartości kryterium w ACTIVE**  
    GIVEN badanie jest ACTIVE  
    WHEN Technolog zmienia istniejącą wartość kryterium i podaje uzasadnienie  
    THEN powstaje nowa wersja kryterium, a zakres badań nie zmienia się.

34. **Przeliczenie wyników historycznych**  
    GIVEN wynik historyczny był NOK według starego kryterium  
    WHEN nowe kryterium powoduje zgodność  
    THEN bieżąca ocena staje się OK, ale `evaluationAtEntry` i wersja kryterium użyta przy zapisie pozostają niezmienione.

35. **Automatyczne zakończenie**  
    GIVEN wszystkie wymagane próbki zwykłe, mikro i aktywowane RF są kompletne  
    WHEN kończy się ostatnia wymagana pozycja  
    THEN badanie automatycznie przechodzi do COMPLETED, a niewykorzystane RF przechodzą do UNUSED.

36. **Niewykorzystane RF nie blokują końca**  
    GIVEN wszystkie obowiązkowe próbki są kompletne, a RF pozostaje AVAILABLE  
    THEN RF nie wchodzi do mianownika postępu i nie blokuje COMPLETED.

37. **Przerwanie ACTIVE**  
    GIVEN badanie jest ACTIVE  
    WHEN Technolog podaje powód i przerywa badanie  
    THEN status staje się INTERRUPTED, badanie znika z kolejki Lab, dane pozostają tylko do odczytu i nie można go wznowić.

## 8. Etykiety, eksport i widoki

38. **Etykiety**  
    GIVEN wygenerowano próbki  
    WHEN użytkownik drukuje etykiety  
    THEN układ A4 ma 4×10 etykiet 52,5×29,7 mm, zachowuje rzeczywisty rozmiar i pokazuje JagoPRO, projekt, klienta, numer badania, kod próbki, checkpoint/rolę i warunek przechowywania.

39. **Eksport Excel**  
    GIVEN istnieje badanie  
    WHEN użytkownik pobiera Excel  
    THEN otrzymuje dane badania, komponentów, kryteriów, próbek, wyników i historii w rozdzielonych arkuszach.

40. **Eksport PDF**  
    GIVEN istnieje badanie  
    WHEN użytkownik pobiera PDF  
    THEN raport zawiera kluczową konfigurację, kryteria, próbki, wyniki i historię z poprawnymi polskimi znakami.

41. **Dashboard Technologa**  
    GIVEN istnieją aktywne badania  
    THEN dashboard pokazuje bieżący postęp, aktualne NOK, zaległe i przeterminowane pozycje oraz pozwala przejść do projektu bez wykonywania pracy Laboratorium z dashboardu.

42. **Finalne stany tylko do odczytu**  
    GIVEN badanie ma status COMPLETED, CANCELLED lub INTERRUPTED  
    THEN formularze modyfikujące jego konfigurację i wyniki nie są dostępne.
