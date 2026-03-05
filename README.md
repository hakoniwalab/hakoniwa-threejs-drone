# hakoniwa-threejs-drone

three.js ベースの Hakoniwa ドローン可視化ビューアです。  
`viewer_config` 駆動で `legacy` / `fleets` の入力モードを切り替えられます。

## クイックスタート

1. このディレクトリで静的ファイルサーバを起動
   - 例: `python -m http.server 8000`
2. ブラウザで `http://127.0.0.1:8000/index.html` を開く
3. `connect` ボタンで WebSocket (`ws://127.0.0.1:8765`) に接続

## 起動設定（viewer_config）

`index.html` は URL クエリ `viewerConfigPath` で設定ファイルを切り替えます。  
未指定時は `/config/viewer-config-legacy.json` を使用します。

例:
- legacy: `index.html?viewerConfigPath=/config/viewer-config-legacy.json`
- fleets: `index.html?viewerConfigPath=/config/viewer-config-fleets.json`

## 主要設定

`viewer_config` の仕様詳細は以下を参照:
- `docs/viewer-config-spec.md`
- `config/schema/viewer-config.schema.json`

主要キー:
- `three.sceneConfigPath`: scene config（compactのみ）
- `pdu.pduDefPath`: compact pdudef
- `pdu.wsUri`: bridge WebSocket URI
- `stateInput.mode`: `legacy` or `fleets`
- `ui.enableAttachedCameras`: 小窓カメラ描画 ON/OFF
- `ui.enableMainCameraMouseControl`: メインカメラのマウス操作 ON/OFF

100機体向け推奨:
- `ui.enableAttachedCameras: false`
- `pdu.wireVersion: "v2"`（fleetsは必須）

## モデルタイプ（並存運用）

既存タイプと別に、`map-viewer` 由来モデルを `quadrotor_mapviewer` として同梱しています。  
既存 `quadrotor_basic` はそのまま残しており、用途に応じて scene config で切替できます。

- 既存タイプ:
  - `config/drone_types-quadrotor_basic.json`
- map-viewer タイプ:
  - `config/drone_types-quadrotor_mapviewer.json`

サンプル scene config:
- `config/drone_config-compact-1.json`（既存）
- `config/drone_config-compact-mapviewer-1.json`（map-viewer モデル）

## UI 操作

- `connect`: PDU接続を開始
- Drone セレクト: 注視対象ドローンを選択
- `Follow selected`:
  - ON: 選択ドローンをメインカメラで追従
  - OFF: 固定カメラモード
- マウス操作:
  - `ui.enableMainCameraMouseControl=true` のとき OrbitControls が有効

## 設計/タスク

- 設計: `docs/design.md`
- 作業計画: `docs/task.md`
- scene config仕様: `docs/scene-config-spec.md`
