# hakoniwa-threejs-drone Combined Test

threejs 単体の結合テスト手順です。  
`legacy` / `fleets` を同一観点で確認します。

## 0. 前提

- `hakoniwa-drone-pro` がビルド済み
- `hakoniwa-pdu-bridge-core` がビルド済み
- 本リポジトリを `python -m http.server` で配信できる

## 1. legacy 結合テスト

### 1-1. drone service 起動（hakoniwa-drone-pro）

```bash
./mac/mac-main_hako_drone_service config/drone/fleets/api-1.json config/pdudef/drone-pdudef-1.json
```

### 1-2. web bridge 起動（hakoniwa-pdu-bridge-core）

```bash
./tools/run-web-bridge.bash \
  --config-root config/web_bridge \
  --asset-name WebBridge \
  --node-name web_bridge_node1 \
  --delta-time-step-usec 20000 \
  --enable-ondemand
```

### 1-3. threejs 起動（hakoniwa-threejs-drone）

```bash
python -m http.server 8000
```

### 1-4. ブラウザアクセス

```text
http://127.0.0.1:8000/index.html?viewerConfigPath=/config/viewer-config-legacy.json&wsUri=ws://127.0.0.1:8765&wireVersion=v2
```

### 1-5. 確認ポイント

- `connect` 成功
- コンソールに `LegacyStateSource` の role 解決ログが出る
- 機体モデルの位置/姿勢が更新される

## 2. fleets 結合テスト

### 2-1. drone service 起動（hakoniwa-drone-pro）

```bash
./mac/mac-main_hako_drone_service config/drone/fleets/api-1.json config/pdudef/drone-pdudef-1.json
```

### 2-2. visual_state_publisher 起動（hakoniwa-drone-pro）

```bash
./src/cmake-build/assets/visual_state_publisher/drone_visual_state_publisher config/assets/visual_state_publisher/visual_state_publisher.json
```

### 2-3. web bridge 起動（hakoniwa-pdu-bridge-core）

```bash
./tools/run-web-bridge.bash \
  --config-root config/web_bridge_fleets \
  --node-name web_bridge_fleets_node1 \
  --delta-time-step-usec 20000 \
  --enable-ondemand
```

### 2-4. threejs 起動（hakoniwa-threejs-drone）

```bash
python -m http.server 8000
```

### 2-5. ブラウザアクセス

```text
http://127.0.0.1:8000/index.html?viewerConfigPath=/config/viewer-config-fleets.json&wsUri=ws://127.0.0.1:8765&wireVersion=v2
```

### 2-6. 確認ポイント

- `connect` 成功
- コンソールに `[FleetStateSource] visual_state_array channels:` が出る
- 機体モデルの位置/姿勢が更新される

## 3. 完了チェック

- [ ] legacy viewer で接続・描画更新ができる
- [ ] fleets viewer で接続・描画更新ができる
- [ ] いずれも `wireVersion=v2` で動作する
