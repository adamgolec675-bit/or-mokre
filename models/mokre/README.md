# Model 3D – Pałac w Mokrem

Umieść w tym folderze pliki, do których odwołuje się `sites/mokre.json`:

| Plik          | Do czego służy                                         |
|---------------|--------------------------------------------------------|
| `palac.glb`   | Android (WebXR) oraz podgląd 3D w przeglądarce          |
| `palac.usdz`  | iPhone / iPad (AR Quick Look)                           |
| `poster.jpg`  | Opcjonalny obraz podglądu modelu (np. 1024 × 768 px)    |

Wskazówki:
- Jednostką modelu powinien być metr, a „przód” budowli skierowany w osi +Z.
- Pole `realWidthMeters` w `sites/mokre.json` to rzeczywista szerokość budowli –
  na jej podstawie przeglądarka liczy tryb „Skala 1:1”. Uzupełnij je danymi
  z dokumentacji historycznej.
- Przed publikacją skompresuj model, np. `npx @gltf-transform/cli optimize palac.glb palac.glb --compress meshopt --texture-compress webp`.
  Przeglądarka ma wbudowany dekoder Meshopt.
