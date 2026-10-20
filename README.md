# Turista – tablero en la TV, jugadores en el celular

Juego tipo Monopolio para 2 a 6 jugadores. El banco es automático (no necesita jugador).

- **TV:** abre `/tv` en el navegador de la TV (o una compu conectada a ella).
- **Jugadores:** escanean el QR que sale en la TV (o abren la dirección que aparece) y escriben su nombre.
- **Inicio:** el primero en entrar es el anfitrión (⭐). Cuando hay 2 o más jugadores, toca **Iniciar partida**.
- En el celular cada quien ve su dinero, sus propiedades, y tiene los botones de su turno (tirar, comprar, construir, hipotecar, tratos).

## Opción A: en casa (mismo WiFi)

Necesitas [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm start
```

La consola muestra dos direcciones: la de la TV (`.../tv`) y la de los jugadores.
Todos deben estar en el mismo WiFi.

## Opción B: en internet (Render, gratis)

1. Sube esta carpeta a un repositorio de GitHub.
2. En [render.com](https://render.com): **New → Web Service**, elige el repositorio.
3. Build command: `npm install` · Start command: `npm start` (el archivo `render.yaml` ya lo trae).
4. Cuando termine te da un link, por ejemplo `https://turista.onrender.com`.
   - TV: `https://turista.onrender.com/tv`
   - Jugadores: el QR de la TV, o el link normal.

Notas:
- En el plan gratis, el servicio se "duerme" tras un rato sin uso; la primera visita tarda ~1 minuto en despertar.
- Hay una sola mesa por servidor. Si reinicia el servidor, la partida se pierde.
- Si usas un dominio propio, define la variable de entorno `PUBLIC_URL` (por ejemplo `https://juego.midominio.com`) para que el QR salga correcto.

## Reglas incluidas

Dados con dobles (3 dobles seguidos = cárcel), cobrar 200 al pasar por la Salida, comprar propiedades,
rentas (doble con el color completo), casas y hotel (construcción pareja), aeropuertos y servicios,
cartas de Suerte y Caja comunal, impuestos, cárcel (fianza $50, carta o dobles), hipotecas,
tratos entre jugadores, deudas y bancarrota. Gana el último jugador en pie.
Si una propiedad no se compra, simplemente queda libre (no hay subasta).

Los nombres de ciudades, precios y cartas se editan al inicio de `server.js`.

## Reconectar

Si a alguien se le cierra el navegador, al volver a abrir la página entra solo a su lugar (se guarda en el navegador).
El anfitrión puede sacar jugadores o reiniciar la partida desde la pestaña **Mesa**.
