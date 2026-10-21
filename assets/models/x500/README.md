# X500 viewer models

These GLBs were generated from the public X500 MJCF in `hakoniwa-drone-pro` with the existing MBody Registry converter. The `threejs` target frame maps MJCF/ROS FLU axes into the viewer's Three.js right/up/back axes.

Exact conversion command:

```bash
../hakoniwa-business-pack/work/foundation/install/python/bin/python ../hakoniwa-mbody-registry/tools/mjcf2glb.py ../hakoniwa-drone-pro/config/drone/x500-px4-sitl/drone.xml --split-by body --visible-only --target-frame threejs -o /tmp/hakoniwa-x500-glb-20261021
```

`drone_base.glb` was copied to `x500-frame.glb`. The MJCF propeller asset is a flat cylinder used for physics, so the visual model instead uses `../base-drone-prop.glb`, scaled by 0.858 from its 0.296 m blade span to the X500's 0.254 m (10-inch) span. Its centered origin and unchanged position/HPR make it spin about the rotor axis.
