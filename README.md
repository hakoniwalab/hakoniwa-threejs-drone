# hakoniwa-threejs-drone

Hakoniwa Droneの状態を、Three.jsを使ってブラウザ上に表示する可視化コンポーネントです。

`viewer_config`により、従来の機体単位入力である`legacy`と、`DroneVisualStateArray`を使う`fleets`を切り替えられます。単体・複数機の表示、動的スポーン、機体選択、追従カメラ、風・ローター故障入力のUIを提供します。

## このリポジトリの責任範囲

本リポジトリが担当するもの:

- Three.jsによるドローンと背景モデルの描画
- Viewer設定、scene設定、PDU定義の読み込み
- WebSocket経由のHakoniwa PDU入力
- `legacy` / `fleets`状態入力
- ブラウザ側の機体選択、カメラ操作、故障・風入力
- 他のブラウザUIから利用できる`createDroneViewer()`公開API

本リポジトリが担当しないもの:

- ドローンの物理計算
- Hakoniwaシミュレーションの時刻・ライフサイクル管理
- shared-memory PDUからWebSocketへの変換
- PLATEAU都市データの所有・配布
- 展示構成全体のLauncher生成

標準的なデータ経路は次のとおりです。

```text
Hakoniwa Drone service
        |
        v
DroneVisualStatePublisher
        |
        v
shared-memory PDU
        |
        v
hakoniwa-pdu-bridge-core WebBridge
        |
        v
WebSocket :8765
        |
        v
hakoniwa-threejs-drone
```

## 前提条件

- Python 3.9以上
- WebGLを利用できる現在のブラウザ
- recursive cloneされた`hakoniwa-pdu-javascript` submodule
- 実データへ接続する場合は、互換性のあるWebBridgeと状態publisher

```bash
git clone --recursive https://github.com/hakoniwalab/hakoniwa-threejs-drone.git
cd hakoniwa-threejs-drone
```

既存cloneでsubmoduleを取得する場合:

```bash
git submodule update --init --recursive
```

## hako.py標準操作

本リポジトリは、Business Packの`hako.py` CLI Contractに基づき、静的Webコンポーネントとして意味のある3操作を提供します。

```bash
python tools/hako.py doctor
python tools/hako.py test
python tools/hako.py smoke
```

| 操作 | 確認内容 |
| --- | --- |
| `doctor` | Python、必須ファイル、PDU JavaScript submodule、Viewer設定の参照先 |
| `test` | Viewer設定契約、公開API、submodule、README運用契約 |
| `smoke` | 一時HTTPサーバーを起動し、HTML・設定・公開Viewer module・PDU moduleを実際に取得 |

`smoke`は静的配信契約を検証します。ブラウザ描画、WebSocket接続、ドローン飛行までを検証するE2Eテストではありません。

このコンポーネントにはネイティブなbuildやinstall工程がないため、`configure`、`build`、`install`は定義していません。

## 単体起動

静的ファイルサーバーを起動します。

```bash
python -m http.server 8000
```

ブラウザで開きます。

```text
http://127.0.0.1:8000/index.html
```

既定では、次の設定と接続先を使用します。

- Viewer設定: `/config/viewer-config-legacy.json`
- WebSocket: `ws://127.0.0.1:8765`

WebBridgeが起動していない状態でも画面は表示できますが、`connect`は成功しません。

## Viewer設定

URLクエリ`viewerConfigPath`でViewer設定を切り替えます。

```text
# legacy
http://127.0.0.1:8000/index.html?viewerConfigPath=/config/viewer-config-legacy.json

# fleets
http://127.0.0.1:8000/index.html?viewerConfigPath=/config/viewer-config-fleets.json
```

URLクエリで次の値も上書きできます。

- `wsUri`: WebSocket接続先
- `wireVersion`: `v1`または`v2`
- `pduDefPath`: PDU定義のURL
- `dynamicSpawn`: 動的スポーンの有効化
- `templateDroneIndex`: 動的生成時のテンプレート機体
- `maxDynamicDrones`: 動的生成する最大機体数

優先順位はURLクエリ、Viewer設定の順です。

```text
http://127.0.0.1:8000/index.html?viewerConfigPath=/config/viewer-config-fleets.json&wsUri=ws://127.0.0.1:8765&wireVersion=v2&dynamicSpawn=true&templateDroneIndex=0&maxDynamicDrones=100
```

仕様:

- [Viewer config specification](docs/viewer-config-spec.md)
- [Viewer config schema](config/schema/viewer-config.schema.json)
- [Scene config specification](docs/scene-config-spec.md)

主な設定項目:

- `three.sceneConfigPath`
- `pdu.pduDefPath`
- `pdu.wsUri`
- `pdu.wireVersion`
- `stateInput.mode`
- `stateInput.fleets.dynamicSpawn`
- `stateInput.fleets.templateDroneIndex`
- `stateInput.fleets.maxDynamicDrones`
- `ui.enableAttachedCameras`
- `ui.enableMainCameraMouseControl`

`fleets`では`pdu.wireVersion: "v2"`が必須です。多数機表示では、`ui.enableAttachedCameras: false`を推奨します。

## 公開Viewer API

他のブラウザUIは、次のmoduleを動的importしてViewerを組み込めます。

```javascript
import { createDroneViewer } from "/src/public/drone_viewer.js";

const viewer = createDroneViewer();
viewer.configure(viewerConfig);
await viewer.initialize();
await viewer.connectPdu();
await viewer.initDronePdu();
```

`hakoniwa-map-viewer`は、この公開APIを利用してLeaflet地図とThree.js表示を統合します。

## モデル資産

標準の`base`モデルは`assets/models/`で管理します。DJIモデルやPLATEAU GLBなど、ライセンスやサイズの都合でリポジトリへ含めない資産は`assets/local_models/`へ配置します。

```text
assets/local_models/
├── drone.glb
├── prop-1.glb
├── prop-2.glb
├── camera.glb
└── 13113_shibuya-ku_pref_2023_citygml_2_op.glb
```

PLATEAU渋谷GLBの配布責任は`hakoniwa-map-viewer`側にあります。このリポジトリは、指定されたGLBをThree.js sceneとして読み込む機能を担当します。

## Business PackによるE2E構成

複数コンポーネントを手作業で個別起動する代わりに、Business Pack Recipeを利用することを推奨します。

現在の参照Recipe:

- `recipes/examples/drone-single-mujoco-threejs-gamepad.yaml`
- Recipe ID: `drone-single-mujoco-threejs-gamepad`

このRecipeは、Hakoniwa Drone、MuJoCo Viewer、DroneVisualStatePublisher、WebBridge、Three.js Viewer、ゲームパッド制御を一つのLauncher sessionとして生成します。

```text
hakoniwa-business-pack/
└── recipes/examples/drone-single-mujoco-threejs-gamepad.yaml
```

Recipe側が、Foundation Python、実行バイナリ、設定、WebBridge、HTTP server、ログ、終了処理を所有します。本リポジトリのREADMEでは、OS固有のDrone serviceバイナリパスを固定しません。

手動統合する場合も、次の順序を守ります。

1. Hakoniwa CoreとDrone serviceを起動
2. DroneVisualStatePublisherを起動
3. `hakoniwa-pdu-bridge-core`のWebBridgeを起動
4. 本リポジトリをHTTP配信
5. Browser ViewerからWebSocketへ接続

## UI

- `connect`: WebSocket PDU接続
- Drone selector: 注視対象の選択
- `Follow selected`: 選択機体への追従
- Mouse control: OrbitControlsによるメインカメラ操作
- Fault injection: ローター出力倍率の設定
- Wind: 風向・風速の設定と送信

## CI

GitHub Actionsでは、recursive submodule checkout後に次を実行します。

```bash
python tools/hako.py doctor
python tools/hako.py test
python tools/hako.py smoke
```

## 関連リポジトリ

- `hakoniwa-drone-core`: ドローン物理、状態publisher、環境・センサモデル
- `hakoniwa-pdu-bridge-core`: shared-memory PDUとWebSocketの橋渡し
- `hakoniwa-pdu-javascript`: ブラウザ側PDU通信
- `hakoniwa-map-viewer`: Leaflet地図と本Viewerの統合
- `hakoniwa-business-pack`: FoundationとRecipe workspaceの生成
