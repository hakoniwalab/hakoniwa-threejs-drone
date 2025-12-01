// frame.js

const DEG2RAD = Math.PI / 180;

// three.js 側の前提：右手系
//  X: right, Y: up, Z: forward(手前) を -Z とみなす構成にする。
// Hakoniwa/ROS 側: X: forward, Y: left, Z: up (ENU 的想定)

export const HakoniwaFrame = {
  /**
   * 位置: ROS(Hakoniwa) → three.js
   * ros = [x_forward, y_left, z_up]
   */
  rosPosToThree(rosPos) {
    const [xr, yr, zr] = rosPos;
    return {
      x: -yr,  // left -> -right
      y:  zr,  // up   -> up
      z: xr,  
    };
  },

  /**
   * 位置: three.js → ROS(Hakoniwa)
   */
  threePosToRos(threePos) {
    const { x, y, z } = threePos;
    return {
      x: z,
      y: -x,
      z:  y,
    };
  },

  rosRpyDegToThreeEuler(rosRpyDeg) {
    const [rollDeg, pitchDeg, yawDeg] = rosRpyDeg;
    const roll  = rollDeg  * DEG2RAD;
    const pitch = pitchDeg * DEG2RAD;
    const yaw   = yawDeg   * DEG2RAD;


    return {
      x: -pitch,
      y: yaw,
      z: roll,
    };
  },

  /**
   * three.js Object3D に ROS 位置・RPY[deg] を直接適用するヘルパー
   */
  applyRosPoseToObject3D(object3d, rosPos, rosRpyDeg) {
    if (rosPos) {
      const p = this.rosPosToThree(rosPos);
      object3d.position.set(p.x, p.y, p.z);
    }
    if (rosRpyDeg) {
      const e = this.rosRpyDegToThreeEuler(rosRpyDeg);
      object3d.rotation.set(e.x, e.y, e.z);
    }
  }
};
