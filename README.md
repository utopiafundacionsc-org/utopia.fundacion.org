# Rifa Solidaria Mundial 2026 — GitHub Pages

Página conectada con la aplicación web de Google Apps Script.

## Conexión configurada

La dirección ya está colocada en `config.js`:

```text
https://script.google.com/macros/s/AKfycbyuGbQsMkBIJGmMztT4i0jh-7Pv8k_XNsc7OO0lJ5xziI3HrWF70DqLDeHVF7rZTnO8_A/exec
```

## Funciones

- Números girando permanentemente.
- Cuenta regresiva.
- Tres premios presionables.
- Consulta individual del ganador de cada premio.
- Sección automática de ganadores.
- Registro de participantes en Google Sheets.
- Consulta del estado de un ticket.
- Actualización automática cada 10 segundos.
- Cédula y celular protegidos en la página pública.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo.
2. Sube todo el contenido de esta carpeta, incluida `assets`.
3. En GitHub entra a `Settings`.
4. Abre `Pages`.
5. En `Build and deployment` selecciona:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
6. Guarda.

## Pruebas recomendadas

Antes de publicar, abre:

```text
https://script.google.com/macros/s/AKfycbyuGbQsMkBIJGmMztT4i0jh-7Pv8k_XNsc7OO0lJ5xziI3HrWF70DqLDeHVF7rZTnO8_A/exec?action=raffle&raffleId=RIFA-UTOPIA-2026
```

Debe devolver los datos de la rifa y los tres premios.

## Registro

Cada ticket enviado desde el formulario crea una fila en `PARTICIPANTES`.

El estado inicial es:

```text
PENDIENTE
```

Después debe aprobarse desde el menú de Google Sheets para que pueda participar en el sorteo.
