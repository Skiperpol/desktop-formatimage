# Bez tła

Aplikacja desktopowa do przygotowywania zdjęć produktów do sklepu. Wrzucasz zdjęcia, klikasz jeden przycisk, a program:

1. usuwa tło (model AI BRIA RMBG 2.0, ten sam, którego domyślnie używa `rembg`),
2. zmniejsza zdjęcie do zadanego dłuższego boku (domyślnie 2000 px, bez powiększania mniejszych),
3. zapisuje wynik jako WebP z przezroczystością (domyślnie jakość 80) w wybranym folderze.

Czyli to samo, co skrypty `usuniecie_tla.py` + `zmniejszanie.py`, tylko w jednym oknie.

## Funkcje

- przeciąganie zdjęć albo całych folderów do okna (lub przycisk *Wybierz zdjęcia*, skrót Ctrl+O),
- podgląd każdego zdjęcia i wyniku na szachownicy przezroczystości,
- postęp z szacowanym czasem do końca, możliwość zatrzymania w dowolnym momencie,
- ustawienia: folder zapisu, dłuższy bok, jakość WebP, wyłączenie usuwania tła (samo zmniejszanie), zastępowanie istniejących plików,
- jasny i ciemny motyw (zgodnie z ustawieniem systemu),
- działa bez internetu; model AI pobiera się raz (ok. 1 GB) przy pierwszym użyciu.

Obsługiwane formaty wejściowe: JPG, PNG, WebP, TIFF, BMP. Orientacja z EXIF (zdjęcia z telefonu) jest uwzględniana.

## Uruchomienie

Wymagany Node.js 20 lub nowszy.

```bash
npm install
npm start
```

## Budowanie instalatora

```bash
npm run dist        # Linux: AppImage i .deb w folderze dist/
npm run dist:win    # Windows: instalator NSIS (budować najlepiej na Windowsie)
```

## Model AI

Przy pierwszym usuwaniu tła aplikacja szuka modelu w kolejności:

1. `~/.config/Bez tła/models/bria-rmbg-2.0.onnx` (własna kopia aplikacji),
2. katalog `rembg` (`~/.rembg/models/bria-rmbg/bria-rmbg.onnx` itp.), więc jeśli używałeś już `rembg`, nic nie trzeba pobierać.

Jeśli modelu nie ma, pobiera go z wydań projektu rembg na GitHubie i sprawdza sumę SHA-256.

Uwaga licencyjna: BRIA RMBG 2.0 jest udostępniany na licencji CC BY-NC 4.0 (użytek niekomercyjny). Do zastosowań komercyjnych BRIA wymaga osobnej licencji.

## Jak to działa

- `src/main` — proces główny Electrona: okno, ustawienia, kolejka zadań, pobieranie modelu.
- `src/worker` — osobny proces (Electron w trybie Node) z modelem AI i obróbką obrazu, żeby okno nie przycinało się podczas obliczeń.
- `src/renderer` — interfejs (HTML/CSS/JS, bez frameworka).

Obróbka obrazu odwzorowuje `rembg`: obraz 1024×1024 znormalizowany średnią i odchyleniem ImageNet, maska normalizowana min-max i skalowana filtrem Lanczos. Wyniki różnią się od `rembg` średnio o 0,02 poziomu przezroczystości na 255.

Uwagi techniczne:

- zamiast `sharp` używana jest biblioteka `@napi-rs/image`, bo `sharp` w Electronie na Linuksie konfliktuje z GLib ([electron/electron#46323](https://github.com/electron/electron/issues/46323)),
- proces roboczy to `child_process.fork` z `ELECTRON_RUN_AS_NODE=1`, a nie `utilityProcess`, bo alokator pamięci procesów pomocniczych Chromium przerywa wielogigabajtowe obliczenia modelu,
- bufor na wynik modelu jest alokowany po stronie JS, a arena pamięci onnxruntime jest wyłączona; inaczej ochrona pamięci V8 w Electronie kończy proces.
