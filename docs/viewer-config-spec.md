# Viewer Config Specification (v1.0)

## 1. 目的

`viewer_config` は、上位アプリ（threejs デモ / map-viewer）が
`DroneViewer` を起動するための外部設定です。

v1.0 では以下を外部仕様にします。

1. three シーン定義の場所
2. PDU 接続情報
3. ドローン状態入力モード（legacy / fleets / none）
4. UI更新周期（任意）
5. ドローン本体の外観（任意）
6. 観客視点カメラ（任意）

ローター係数などのレンダリング最適化パラメータは内部実装責務です。

## 1.1 配置と受け渡し方針

1. `viewer_config` ファイルは `config/` 直下に配置する  
   - 例: `config/viewer-config-legacy.json`, `config/viewer-config-fleets.json`
2. `DroneViewer` は上位から渡された設定を使用する  
   - `DroneViewer` 自身は設定ファイルパスを固定しない
   - 上位アプリが「どの設定ファイルを使うか」を決定する

## 2. ルート構造

```json
{
  "version": "1.0",
  "three": { ... },
  "pdu": { ... },
  "stateInput": { ... }
}
```

必須キー:

1. `version`
2. `three`
3. `pdu`
4. `stateInput`

## 3. 各セクション

### 3.1 `version`

- 型: `string`
- 値: `"1.0"`（固定）

### 3.2 `three`

- `sceneConfigPath` (`string`, 必須)
  - threejs のシーン定義 JSON へのパス
  - compact scene config を指定する
  - 例: `/config/drone_config-compact-1.json`
- `droneAppearance` (`object`, 任意)
  - `bodyColor` (`string`, 任意)
    - 本体フレームGLBのマテリアル色を`#RRGGBB`形式で上書きする
    - 未指定時はGLBに格納された元の色を維持する
    - プロペラ、カメラおよびShow LEDには適用しない
- `initialCameraMode` (`string`, 任意, 既定: `"free"`)
  - `"free"`: 従来のOrbitカメラ
  - `"audience"`: `audienceCamera`で指定した観客視点
- `audienceCamera` (`object`, 任意)
  - `positionM`: ローカルENU座標 `[East, North, Up]` [m]
  - `yawDeg`: 水平向き。0度はEast、正方向はNorth側
  - `pitchDeg`: 仰角。0度は水平、正方向は上（範囲: -85〜85度）
  - `fovDeg`: 垂直画角（範囲: 25〜90度）
  - 観客視点では矢印キーで前後左右、`U`/`D`で上下、`Shift`併用で高速移動する
  - 左ドラッグでyaw、右ドラッグでpitch、ホイールでFOVを変更する
  - タッチ端末では1本指ドラッグでyaw/pitch、2本指のピンチでFOVを変更する
  - 組み込みUIは`setAudienceCameraMovementInput()`で前後・左右・上下の連続入力を渡せる
  - `initialCameraMode = "audience"`の場合は必須

### 3.3 `pdu`

- `pduDefPath` (`string`, 必須)
  - PDU 定義ファイルへのパス
- `wsUri` (`string`, 必須)
  - WebSocket エンドポイント
  - 例: `ws://127.0.0.1:8765`
- `wireVersion` (`string`, 任意, 既定: `"v2"`)
  - ただし `stateInput.mode = "fleets"` の場合は `"v2"` 必須

### 3.4 `stateInput`

- `mode` (`string`, 必須)
  - `"legacy"`、`"fleets"`、またはドローン入力を使わない`"none"`

#### mode = `legacy`

- `legacy` (`object`, 必須)
  - `roleMap` (`object`, 必須)
    - `pos` (`string`, 必須): 位置/姿勢用 pdutype
    - `motor` (`string`, 必須): ローター回転用 pdutype

#### mode = `fleets`

- `fleets` (`object`, 必須)
  - `roleMap` (`object`, 必須)
    - `visual_state_array` (`string`, 必須): 集約状態配列用 pdutype

#### 車両状態入力（任意）

`stateInput.vehicles.roleMap`を指定すると、ドローンmodeとは独立して車両を更新する。

- `vehicle_states`: `sensor_msgs/MultiDOFJointState`
- `joint_states`: `sensor_msgs/JointState`

`stateInput.vehicles.interpolation`（任意）：車両を受信した姿勢の間で毎フレーム補間して描く。

- `enabled` (`boolean`, 既定: `false`)
- `periodMsec` (`number`, 任意): 送り手の周期（推定の初期値）
- `delayMsec` (`number`, 任意): 最新の姿勢からどれだけ遅れて描くか。省略時は周期の1.5倍
- `snapDistanceM` (`number`, 任意, 既定: `2.0`): これより長い移動（リセット、再配置）は補間せずに置く

姿勢に送り手の時刻（`header.stamp`、シミュレーション時刻）があれば、その時刻の間隔で並べる（読み取りが送り手より遅く、1回に1〜2周期分届いても速さが揺れない）。位置はそのフレームの時刻（`document.timeline.currentTime`）で求める。車両を滑らかに動かすには `ui.statePanelIntervalMsec` を送り手の周期（例: 20）にする。

車両専用sceneでは`mode: "none"`を使用する。ドローンと車両を同時表示する
場合は`legacy`または`fleets`に`vehicles`を併記する。車両入力はWebSocket v2を
必須とする。

### 3.5 `ui`（任意）

- `statePanelIntervalMsec` (`integer`, 任意, 既定: `100`)
  - デバッグ状態パネルの更新周期[msec]
- `enableAttachedCameras` (`boolean`, 任意, 既定: `true`)
  - 各ドローンの小窓カメラ描画を有効化する
  - 100機体運用時は `false` 推奨
- `enableMainCameraMouseControl` (`boolean`, 任意, 既定: `true`)

- `attachedCameraPresentation` (`"overlay" | "main"`, 任意, 既定: `"overlay"`)
  - `overlay`: 従来どおりOrbit cameraをメイン、attached cameraを設定viewportへ表示
  - `main`: 最初のattached cameraをメイン、Orbit cameraを左上PiPへ表示
  - `main`では`Tab`で主・副画面を交換し、`F`でPiPを表示・非表示
  - メインカメラ（OrbitControls）のマウス操作を有効化する

### 3.6 `pdu.autoConnect`（任意）

- `autoConnect` (`boolean`, 任意, 既定: `false`): `true` で、ページを開いて設定を読んだらすぐ WebSocket に接続する（connect ボタンを押さなくてよい）

### 3.7 `scenarioPanel`（任意）

シナリオの欄（index UI）を出す。スタートボタン、出来事の一覧、車両の速度、夜、予定ルートの切り替え。

- `robotName` (`string`, 必須): 指令・出来事の PDU を持つ robot
- `commandPdu` (`string`, 必須): `std_msgs/String`。スタートボタンが `start` を書く（Web bridge に WebSocket → 共有メモリの経路が要る）
- `variants` (`[{id, label}]`, 任意): スタートの前に選ぶ実行の種類（例：覚醒・眠気）。選ぶとスタートの指令が `start:<id>:<nonce>` になる。`defaultVariant` (`string`, 任意) で最初に選ぶもの
- `eventsPdu` (`string`, 必須): `std_msgs/String`。シミュレーション側が出来事を1行ずつ書く：`seq|箱庭時刻[s]|シナリオ時刻[s]|kind|name|state`。`seq` が変われば新しい行、減ればやり直し。`kind` が `status` の行は状態（`waiting`、`running`、`completed`、Drone Show の制御と同じ名前）

ドローンのいない scene では、Drone の選択・状態・故障注入・風の欄を出さない。

車両のブレーキランプ：view model の部品のうち、名前が `tail_light`、`stop_lamp`、`high_stop_lamp`、`brake_lamp` を含むものを、減速中（1.0 m/s² 以上、0.4 m/s² 未満で消灯）と停止中に強く光らせる。減速は姿勢の更新から 0.2 秒ごとに求める（物理のない車両にも効く）。

補足:
- `Follow selected`（index UI）のON/OFFは runtime 操作であり、`viewer_config` 項目は持たない
- ただし ON 時の追従体験には `enableMainCameraMouseControl` が影響する

## 4. パス解決規約

1. 相対パスは **viewer_config ファイル基準** で解決する
2. 絶対パスはそのまま使用する
3. 解決失敗時は起動エラーにする（暗黙フォールバックしない）

## 5. pdudef 解決規約（compact前提）

1. `pdu.pduDefPath` は compact 形式の `pdudef` を前提とする
2. 入力チャネルは `stateInput.<mode>.roleMap` の `pdutype` 一致で解決する
3. ドローン数（legacy時の対象機体数）は `pdudef` の robot 定義から自動推定する
4. role 解決が曖昧（複数候補）または不足する場合は起動エラーとする
5. `stateInput.mode = "fleets"` の場合、`pdu.wireVersion` は `"v2"` を必須とする
6. `stateInput.vehicles` を指定した場合も、`pdu.wireVersion` は `"v2"` を必須とする

## 6. 互換規約（フラグなし）

1. `viewer_config` 未指定時:
   - 既存デフォルト（legacy起動）を使用して後方互換を維持
2. `viewer_config` 指定時:
   - 本仕様を厳密適用
3. 互換挙動は `compatibility` フラグで切り替えない

## 7. 最小設定例

### 7.1 legacy

```json
{
  "version": "1.0",
  "three": {
    "sceneConfigPath": "/config/drone_config-compact-1.json",
    "droneAppearance": {
      "bodyColor": "#E8EDF2"
    }
  },
  "pdu": {
    "pduDefPath": "/config/pdudef-fleets.json",
    "wsUri": "ws://127.0.0.1:8765",
    "wireVersion": "v2"
  },
  "ui": {
    "statePanelIntervalMsec": 100,
    "enableAttachedCameras": true,
    "enableMainCameraMouseControl": true
  },
  "stateInput": {
    "mode": "legacy",
    "legacy": {
      "roleMap": {
        "pos": "geometry_msgs/Twist",
        "motor": "hako_mavlink_msgs/HakoHilActuatorControls"
      }
    }
  }
}
```

### 7.2 fleets

```json
{
  "version": "1.0",
  "three": {
    "sceneConfigPath": "/config/drone_config-compact-1.json"
  },
  "pdu": {
    "pduDefPath": "/config/pdudef.json",
    "wsUri": "ws://127.0.0.1:8765",
    "wireVersion": "v2"
  },
  "ui": {
    "statePanelIntervalMsec": 100,
    "enableAttachedCameras": true,
    "enableMainCameraMouseControl": true
  },
  "stateInput": {
    "mode": "fleets",
    "fleets": {
      "roleMap": {
        "visual_state_array": "hako_msgs/DroneVisualStateArray"
      }
    }
  }
}
```
