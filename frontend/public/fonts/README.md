# Fuente de marca

`Braze.woff2`: fuente **Braze** (BrandEarth / DawnCreative) reducida a las mayúsculas A–Z, solo para el nombre DEVMARK.
Se generó desde el TTF original con:

```bash
pyftsubset Braze.ttf --text="ABCDEFGHIJKLMNOPQRSTUVWXYZ " --flavor=woff2 --output-file=Braze.woff2 --layout-features=kern --name-IDs='*'
```

El archivo completo no se sube al repositorio (es público). Uso sujeto a la licencia BrandEarth.
