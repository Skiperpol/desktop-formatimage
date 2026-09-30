# Bez tła

Aplikacja na Windowsa do przygotowywania zdjęć produktów do sklepu. Wrzucasz zdjęcia, klikasz jeden przycisk, a program:

1. usuwa tło modelem AI **BiRefNet Lite** (licencja MIT, można używać komercyjnie),
2. zmniejsza zdjęcie do zadanego dłuższego boku (domyślnie 2000 px, mniejszych nie powiększa),
3. zapisuje wynik jako WebP z przezroczystością (domyślnie jakość 80) w wybranym folderze.

Czyli to samo, co skrypty `usuniecie_tla.py` + `zmniejszanie.py`, tylko w jednym oknie i bez Pythona.

## Instalacja (Windows 10/11, 64-bit)

Pobierz `Bez-tla-Setup-<wersja>.exe` z zakładki **Releases** repozytorium i uruchom. Instalator nie wymaga uprawnień administratora, tworzy skrót na pulpicie i w menu Start. Model AI jest w instalatorze, więc aplikacja działa od razu i bez internetu.

Instalator nie jest podpisany certyfikatem, więc przy pierwszym uruchomieniu Windows SmartScreen pokaże ostrzeżenie „Nieznany wydawca”: kliknij *Więcej informacji* → *Uruchom mimo to*. Przy dystrybucji do klientów warto kupić certyfikat do podpisywania kodu.

**Wymagania sprzętowe:** model zajmuje w szczycie ok. 6–7 GB pamięci RAM. Minimum to 8 GB RAM, zalecane 16 GB. Na procesorze z 16 wątkami jedno zdjęcie trwa ok. 8–9 s, na słabszych laptopach odpowiednio dłużej.

## Funkcje

- przeciąganie zdjęć albo całych folderów do okna (lub przycisk *Wybierz zdjęcia*, skrót Ctrl+O),
- podgląd każdego zdjęcia i wyniku na szachownicy przezroczystości,
- postęp z szacowanym czasem do końca, możliwość zatrzymania w dowolnym momencie,
- ustawienia: folder zapisu, dłuższy bok, jakość WebP, wyłączenie usuwania tła (samo zmniejszanie), zastępowanie istniejących plików,
- jasny i ciemny motyw zgodnie z ustawieniem systemu.

Obsługiwane formaty wejściowe: JPG, PNG, WebP, TIFF, BMP. Orientacja z EXIF (zdjęcia z telefonu) jest uwzględniana.

## Budowanie instalatora

Instalator buduje GitHub Actions (`.github/workflows/windows.yml`) na maszynie z Windowsem:

- ręcznie: zakładka *Actions* → *Instalator Windows* → *Run workflow* (instalator pojawi się jako artefakt),
- przy wydaniu: `git tag v1.0.1 && git push --tags` tworzy wydanie z instalatorem w zakładce *Releases*.

Po zbudowaniu workflow uruchamia test spakowanej aplikacji: usuwa tło ze sztucznego zdjęcia i sprawdza wynik.

Lokalnie na Windowsie (Node.js 20+):

```bash
npm ci
npm run dist:win
```

Uruchomienie w trybie deweloperskim:

```bash
npm ci
npm run fetch-model
npm start
```

`npm run fetch-model` pobiera model (224 MB) do folderu `models/` i sprawdza sumę SHA-256. Model nie jest trzymany w repozytorium, bo przekracza limit rozmiaru plików GitHuba.

## Model AI i licencje

- **BiRefNet** (ZhengPeng, 2024), wagi `general` z lekkim backbone Swin-T, licencja MIT. Plik ONNX pochodzi z wydań projektu rembg (licencja MIT). Wcześniej używany model BRIA RMBG 2.0 został usunięty, bo jego licencja (CC BY-NC 4.0) zabrania użytku komercyjnego.
- Na zdjęciach produktów BiRefNet Lite daje wycięcia praktycznie takie jak BRIA (zgodność masek powyżej 99%), a przy trudnych ujęciach bywa lepszy.
- Wszystkie składniki i ich licencje: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (plik jest też dołączany do instalacji).

Licencja MIT dotyczy kodu i wag modelu. Nie jest to porada prawna. Przy sprzedaży aplikacji klientom warto skonsultować licencjonowanie z prawnikiem.

## Jak to działa

- `src/main` — proces główny Electrona: okno, ustawienia, kolejka zadań.
- `src/worker` — osobny proces (Electron w trybie Node) z modelem AI i obróbką obrazu, żeby okno nie przycinało się podczas obliczeń.
- `src/renderer` — interfejs (HTML/CSS/JS, bez frameworka).
- `scripts/fetch-model.js` — pobieranie modelu do budowania; `scripts/smoke-test.js` — test spakowanej aplikacji.

Obróbka odwzorowuje rembg: obraz 1024×1024 znormalizowany średnią i odchyleniem ImageNet, na wynik nakładana jest sigmoida i normalizacja min-max, maska jest skalowana filtrem Lanczos.

Uwagi techniczne:

- do obrazów służy `@napi-rs/image` zamiast `sharp`, bo `sharp` w Electronie na Linuksie konfliktuje z GLib ([electron/electron#46323](https://github.com/electron/electron/issues/46323)),
- proces roboczy to `child_process.fork` z `ELECTRON_RUN_AS_NODE=1`, a nie `utilityProcess`, bo alokator pamięci procesów pomocniczych Chromium przerywa wielogigabajtowe obliczenia modelu,
- bufor na wynik modelu jest alokowany po stronie JS, a arena pamięci onnxruntime jest wyłączona; inaczej ochrona pamięci V8 w Electronie kończy proces.
