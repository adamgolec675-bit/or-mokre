// Geometria bezpiecznego ustawienia budowli w skali 1:1 (bez zależności od three.js,
// dzięki czemu jest testowana jednostkowo w Jest: __tests__/arPlacement.test.js).
//
// Układ współrzędnych WebXR: oś Y w górę, płaszczyzna podłoża to XZ.
// Front modelu skierowany jest wzdłuż jego lokalnej osi +Z.

/** Odstęp użytkownika od najbliższej ściany budowli w trybie 1:1 (m). */
export const EXTERIOR_CLEARANCE_M = 5.0;

/**
 * Wyznacza położenie i obrót budowli tak, aby użytkownik stał na zewnątrz, przed fasadą.
 *
 *   halfExtent = max(szerokość, głębokość) · skala / 2
 *   pozycja    = kamera + kierunekXZ · (halfExtent + odstęp),   y = wysokość podłoża
 *   obrót      = atan2(kamera.x − pozycja.x, kamera.z − pozycja.z)   (front +Z → użytkownik)
 *
 * @param {{x:number,y:number,z:number}} cameraPos pozycja kamery
 * @param {{x:number,y:number,z:number}} forward kierunek patrzenia (dowolna długość)
 * @param {{x:number,y:number,z:number}} size wymiary modelu w jego jednostkach
 * @param {number} scale skala modelu (1:1 → metry)
 * @param {number} floorY wysokość wykrytego podłoża
 */
export function exteriorPlacement({ cameraPos, forward, size, scale, floorY, clearance = EXTERIOR_CLEARANCE_M }) {
  let fx = forward.x;
  let fz = forward.z;
  const length = Math.hypot(fx, fz);
  if (length < 1e-6) {
    // Telefon skierowany pionowo w dół lub w górę – przyjmujemy kierunek „przed siebie” (−Z).
    fx = 0;
    fz = -1;
  } else {
    fx /= length;
    fz /= length;
  }

  const scaledWidth = size.x * scale;
  const scaledDepth = size.z * scale;
  const halfExtent = Math.max(scaledWidth, scaledDepth) * 0.5;
  const distance = halfExtent + clearance;

  const position = { x: cameraPos.x + fx * distance, y: floorY, z: cameraPos.z + fz * distance };
  const yaw = Math.atan2(cameraPos.x - position.x, cameraPos.z - position.z);
  return { position, yaw, halfExtent, distance };
}

/**
 * Odległość punktu (w płaszczyźnie XZ) od prostokątnej podstawy budowli obróconej o `yaw`
 * – 0, gdy punkt leży wewnątrz podstawy. Służy do weryfikacji w testach.
 */
export function distanceToFootprint(point, center, yaw, halfWidth, halfDepth) {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  // Przejście do lokalnego układu modelu (obrót o −yaw wokół osi Y).
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const outX = Math.max(Math.abs(localX) - halfWidth, 0);
  const outZ = Math.max(Math.abs(localZ) - halfDepth, 0);
  return Math.hypot(outX, outZ);
}
