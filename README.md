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
- legacy(dji): `index.html?viewerConfigPath=/config/viewer-config-legacy.json`
- fleets: `index.html?viewerConfigPath=/config/viewer-config-fleets.json`

fleets では compact pdudef（`/config/pdudef-fleets.json`）を使用します。

URLクエリ上書き（任意）:
- `wsUri`: WebSocket接続先を上書き
- `wireVersion`: `v1` / `v2` を上書き
- `pduDefPath`: PDU定義ファイルを上書き（相対/絶対URL可）
- `dynamicSpawn`: `true` / `false`
- `templateDroneIndex`: テンプレートに使う機体index
- `maxDynamicDrones`: 動的生成の上限機体数

優先順位:
- URLクエリ > viewer_config

例:
- `index.html?viewerConfigPath=/config/viewer-config-legacy.json&wsUri=ws://127.0.0.1:8765&wireVersion=v2`
- `index.html?viewerConfigPath=/config/viewer-config-fleets.json&wsUri=ws://127.0.0.1:8765&wireVersion=v2&dynamicSpawn=true&templateDroneIndex=0&maxDynamicDrones=100`

## 主要設定

`viewer_config` の仕様詳細は以下を参照:
- `docs/viewer-config-spec.md`
- `config/schema/viewer-config.schema.json`

主要キー:
- `three.sceneConfigPath`: scene config（compactのみ）
- `pdu.pduDefPath`: compact pdudef
- `pdu.wsUri`: bridge WebSocket URI
- `stateInput.mode`: `legacy` or `fleets`
- `stateInput.fleets.dynamicSpawn`: 動的スポーン有効化
- `stateInput.fleets.templateDroneIndex`: テンプレート機体index
- `stateInput.fleets.maxDynamicDrones`: 動的スポーン最大機体数
- `ui.enableAttachedCameras`: 小窓カメラ描画 ON/OFF
- `ui.enableMainCameraMouseControl`: メインカメラのマウス操作 ON/OFF

100機体向け推奨:
- `ui.enableAttachedCameras: false`
- `pdu.wireVersion: "v2"`（fleetsは必須）

## モデルタイプ（並存運用）

モデルタイプは `base` と `dji` を併存運用します。

- `base`（デフォルト）:
  - type: `quadrotor_base`
  - types file: `config/drone_types-quadrotor_base.json`
- `dji`（従来モデル / ローカル運用）:
  - type: `quadrotor_dji`
  - types file: `config/drone_types-quadrotor_dji.json`

サンプル scene config:
- `config/drone_config-compact-1.json`（デフォルト: base）
- `config/drone_config-compact-base-1.json`（base 明示）
- `config/drone_config-compact-dji-1.json`（dji）

ローカル運用ルール:
- `assets/models/` は base 用のみをコミット対象にする
- `dji` などのローカルモデルは `assets/local_models/` に配置する

`assets/local_models` を使う手順:
1. ディレクトリ作成: `mkdir -p assets/local_models`
2. 手元モデルを配置（例）:
   - `assets/local_models/drone.glb`
   - `assets/local_models/prop-1.glb`
   - `assets/local_models/prop-2.glb`
   - `assets/local_models/camera.glb`
   - `assets/local_models/13113_shibuya-ku_pref_2023_citygml_2_op.glb`
3. `dji` 設定を使う:
   - scene config: `config/drone_config-compact-dji-1.json`
   - types: `config/drone_types-quadrotor_dji.json`（`/assets/local_models/...` を参照）
4. 非コミット運用にしたい場合は `.gitignore` に `assets/local_models/` を追加

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

## fleets 結合手順（E2E）

前提:
- Hakoniwa 本体: `hakoniwa-drone-pro`
- bridge: `hakoniwa-pdu-bridge-core`
- threejs: このリポジトリ

1. drone service 起動（`hakoniwa-drone-pro`）
```bash
./mac/mac-main_hako_drone_service config/drone/fleets/api-1.json config/pdudef/drone-pdudef-1.json
```

2. visual_state_publisher 起動（`hakoniwa-drone-pro`）
```bash
./src/cmake-build/assets/visual_state_publisher/drone_visual_state_publisher config/assets/visual_state_publisher/visual_state_publisher.json
```

3. web bridge 起動（`hakoniwa-pdu-bridge-core`）
```bash
./tools/run-web-bridge.bash \
  --config-root config/web_bridge_fleets \
  --node-name web_bridge_fleets_node1 \
  --delta-time-step-usec 20000 \
  --enable-ondemand
```

4. threejs を配信（`hakoniwa-threejs-drone`）
```bash
python -m http.server 8000
```

5. ブラウザで fleets viewer を開く
```text
http://127.0.0.1:8000/index.html?viewerConfigPath=/config/viewer-config-fleets.json&wsUri=ws://127.0.0.1:8765&wireVersion=v2
```

確認ポイント:
- ブラウザ console に `[FleetStateSource] visual_state_array channels:` が出る
- connect 後、機体の位置・姿勢が更新される
