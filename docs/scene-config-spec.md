# Scene Config Specification (compact only)

## 1. 目的

threejs 表示用の scene config は compact 形式のみを対象とする。
また、scene config 内の座標・姿勢はすべて ROS 座標系で記述する。

## 2. 形式（compact）

- `droneTypesPath` で機体テンプレートファイルを参照
- `drones[]` はインスタンス情報を定義
- ローダーで内部正規化してから利用

## 3. compact 形式（v1.0）

```json
{
  "version": "1.0",
  "format": "compact",
  "environments": [],
  "main_camera": {},
  "droneTypesPath": "/config/drone_types-quadrotor_base.json",
  "drones": [
    {
      "name": "Drone",
      "type": "quadrotor_base",
      "pos": [0, 0, 0],
      "hpr": [0, 0, 0]
    }
  ]
}
```

ルール:

1. `droneTypesPath` は scene config ファイル基準の相対パス、または絶対パスで指定する
2. `drones[].type` は `droneTypesPath` 先ファイル内の type キーを参照する
3. インスタンス項目は type 定義を上書きする
4. ローダーは compact を内部正規化して描画処理へ渡す
5. legacy scene config は受け付けない

## 4. 各項目の仕様と役割

### 4.1 `environments`

役割:
- 背景モデル（地形/建物）をシーンへ配置する

主な項目:
- `name` (string): 環境オブジェクト名
- `model` (string): GLB/GLTF/MJCF(XML) のモデルパス
- `pos` ([number, number, number]): 配置位置（ROS座標系）
- `hpr` ([number, number, number]): 回転（`[roll, pitch, yaw]`、度、ROS）
- `scale` (number, optional): 一様スケール

備考:
- MJCF(`.xml`) の場合はビル群として展開して配置する

### 4.2 `main_camera`

役割:
- メイン表示カメラ（Orbit/Follower）の初期条件を定義する

主な項目:
- `fov` (number, default: `60`)
- `near` (number, default: `0.1`)
- `far` (number, default: `1000`)
- `position` ([number, number, number]): ROS座標系オフセット
- `initialMode` (string, default: `"follow"`)
- `followDistance` (number|null, default: `null`)
- `followLerpPos` (number, default: `8.0`)
- `followLerpTarget` (number, default: `10.0`)
- `followToggleKey` (string, default: `"c"`)

備考:
- 現在実装では `target` よりも「先頭ドローン追従」が優先される

### 4.3 `droneTypesPath` / drone types ファイル

役割:
- ドローン機体テンプレート（モデル/ローター/搭載カメラ）を外部ファイルで管理する

`droneTypesPath`:
- scene config から drone types JSON へのパス
- scene config ファイル基準の相対パス、または絶対パス

drone types ファイル例（`/config/drone_types-quadrotor_base.json`）:
- ルート: `{"<typeName>": { ...typeDef... }}`
- typeDef の主な項目:
- `model`: 機体本体モデル定義
- `rotors`: ローターモデルと取り付け位置/姿勢
- `cameras`: 取り付けカメラ定義（FOV/viewport 含む）

補足:
- 従来モデルを使う場合は `droneTypesPath` を `config/drone_types-quadrotor_dji.json` に切り替える。
- `dji` の実モデル配置は `assets/local_models/` を使用する（非コミット運用）。

## 5. 座標系

scene config の `pos` / `hpr` は ROS(Hakoniwa) 座標系で記述する。

- 位置:
- ROS `[x, y, z] = [Forward, Left, Up]`
- three.js へは `[-y, z, -x]` に変換

- 回転:
- `hpr` は実装上 `[roll, pitch, yaw]`（degree, ROS）
- three.js へはクォータニオン変換して適用
