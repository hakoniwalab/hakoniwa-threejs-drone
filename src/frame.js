// frame.js
import * as THREE from "three";

const DEG2RAD = Math.PI / 180;

export const HakoniwaFrame = {
  /**
   * 位置: ROS(Hakoniwa) → three.js
   * ROS: [Forward, Left, Up]
   * Three: [Right, Up, Back] (Back is +Z, so Forward is -Z)
   */
  rosPosToThree(rosPos) {
    const [xr, yr, zr] = rosPos;
    return {
      x: -yr, // ROSの左(+Y) → Threeの右(+X) なので符号反転
      y:  zr, // ROSの上(+Z) → Threeの上(+Y)
      z: -xr, // ROSの前(+X) → Threeの前(-Z) !重要!
    };
  },

  /**
   * 回転: ROS RPY[deg] → three.js Quaternion
   * * ROSのRPY (Roll, Pitch, Yaw) は通常 Z-Y-X (Intrinsic) の順序で適用されます。
   * これをThree.jsの座標系に変換するには、クォータニオンレベルでの変換が最も安全です。
   */
  rosRpyToThreeQuaternion(rosRpyDeg) {
    const [rollDeg, pitchDeg, yawDeg] = rosRpyDeg;

    // 1. ROSの座標系での姿勢(Quaternion)を作成する
    //    ROSは通常 ZYX 順序 (Yaw -> Pitch -> Roll)
    const eulerROS = new THREE.Euler(
      rollDeg  * DEG2RAD,
      pitchDeg * DEG2RAD,
      yawDeg   * DEG2RAD,
      'ZYX' // !重要! ROSの回転順序を指定
    );
    
    // ROS空間でのクォータニオン (x, y, z, w)
    const qRos = new THREE.Quaternion().setFromEuler(eulerROS);

    // 2. 座標変換: ROS(ENU) → Three.js(Y-up, -Z fwd)
    //    変換ルール: (x, y, z, w) -> (-y, z, -x, w)
    //    
    //    解説:
    //    ROS Roll(X軸)回転  → Three -Z軸回転 (右に傾く動作の整合)
    //    ROS Pitch(Y軸)回転 → Three -X軸回転 (頭を下げる動作の整合)
    //    ROS Yaw(Z軸)回転   → Three +Y軸回転 (左を向く動作の整合)
    return new THREE.Quaternion(
      -qRos.y, 
       qRos.z, 
      -qRos.x, 
       qRos.w
    );
  },

  /**
   * 適用ヘルパー
   */
  applyRosPoseToObject3D(object3d, rosPos, rosRpyDeg) {
    if (rosPos) {
      const p = this.rosPosToThree(rosPos);
      object3d.position.set(p.x, p.y, p.z);
    }
    if (rosRpyDeg) {
      // クォータニオンを直接代入するのが最もバグが少ない
      const q = this.rosRpyToThreeQuaternion(rosRpyDeg);
      object3d.quaternion.copy(q);
    }
  }
};