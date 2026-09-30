# Informacje o licencjach składników

Aplikacja FormatImage (© 2026 Dawid Błaszczyk) korzysta z poniższych składników. Wszystkie są na licencjach
pozwalających na użytek komercyjny.

| Składnik | Do czego służy | Licencja |
|---|---|---|
| BiRefNet, wagi `general` z backbone Swin-T („BiRefNet Lite”) | model AI usuwający tło | MIT, © 2024 ZhengPeng |
| Konwersja modelu do ONNX z projektu rembg | plik `birefnet-general-lite.onnx` | MIT, © 2020 Daniel Gatis |
| ONNX Runtime (`onnxruntime-node`) | uruchamianie modelu AI | MIT, © Microsoft Corporation |
| `@napi-rs/image` | odczyt zdjęć, skalowanie, zapis WebP | MIT, © 2020-present LongYinan |
| Electron | okno aplikacji | MIT, © Electron contributors, © 2013-2020 GitHub Inc. |
| Chromium (w Electronie) | silnik okna | licencje wymienione w `LICENSES.chromium.html` w folderze aplikacji |
| Manrope | krój pisma interfejsu | SIL Open Font License 1.1, © 2019 The Manrope Project Authors |

## BiRefNet — licencja MIT

```
MIT License

Copyright (c) 2024 ZhengPeng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## rembg — licencja MIT

```
MIT License

Copyright (c) 2020 Daniel Gatis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Pełne teksty licencji ONNX Runtime, `@napi-rs/image` i Electrona znajdują się
w ich pakietach (`node_modules/*/LICENSE`) oraz w folderze zainstalowanej aplikacji.
Licencja kroju Manrope: `src/renderer/fonts/OFL.txt`.
