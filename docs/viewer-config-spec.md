# Viewer Config Specification (v1.0)

## 1. 目的

`viewer_config` は、上位アプリ（threejs デモ / map-viewer）が
`DroneViewer` を起動するための外部設定です。

v1.0 では以下だけを外部仕様にします。

1. three シーン定義の場所
2. PDU 接続情報
3. 状態入力モード（legacy / fleets）
4. UI更新周期（任意）

描画パラメータ（レンダリング最適化やローター係数など）は v1.0 では内部実装責務です。

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
  - `"legacy"` または `"fleets"`

#### mode = `legacy`

- `legacy` (`object`, 必須)
  - `roleMap` (`object`, 必須)
    - `pos` (`string`, 必須): 位置/姿勢用 pdutype
    - `motor` (`string`, 必須): ローター回転用 pdutype

#### mode = `fleets`

- `fleets` (`object`, 必須)
  - `roleMap` (`object`, 必須)
    - `visual_state_array` (`string`, 必須): 集約状態配列用 pdutype

### 3.5 `ui`（任意）

- `statePanelIntervalMsec` (`integer`, 任意, 既定: `100`)
  - デバッグ状態パネルの更新周期[msec]
- `enableAttachedCameras` (`boolean`, 任意, 既定: `true`)
  - 各ドローンの小窓カメラ描画を有効化する
  - 100機体運用時は `false` 推奨
- `enableMainCameraMouseControl` (`boolean`, 任意, 既定: `true`)
  - メインカメラ（OrbitControls）のマウス操作を有効化する

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
    "sceneConfigPath": "/config/drone_config-compact-1.json"
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
