// Perspective camera with an off-axis frustum. The camera sits back and
// below the playfield and looks straight down, with its frustum skewed so the
// plane z = 0 maps exactly onto the screen. Result: a tilted, three-quarter view
// of 3D objects while the screen-wrap edges stay perfectly aligned.
import * as THREE from 'three';

export const CAMERA = {
  distance: 1200, // px from the play plane
  tiltDegrees: 12, // apparent viewing angle
  near: 10,
  far: 4000,
};

export function createPlayfieldCamera() {
  const camera = new THREE.PerspectiveCamera();
  let width = 1;
  let height = 1;

  function update(shakeX = 0, shakeY = 0, roll = 0) {
    const { distance: D, near: n, far } = CAMERA;
    const shift = D * Math.tan(THREE.MathUtils.degToRad(CAMERA.tiltDegrees));
    const k = n / D;
    camera.position.set(shakeX, -shift + shakeY, D);
    camera.rotation.set(0, 0, roll);
    camera.updateMatrixWorld();
    camera.projectionMatrix.makePerspective(
      (-width / 2) * k, (width / 2) * k,
      (height / 2 + shift) * k, (-height / 2 + shift) * k,
      n, far,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function setPlayfield(w, h) {
    width = w;
    height = h;
    update();
  }

  return { camera, setPlayfield, update };
}
