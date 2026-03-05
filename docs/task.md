# Task: threejs / map-viewer fleets対応（互換優先）

## Phase 0: 設計固定

- [x] `design.md` をレビューし、API境界を確定する
- [x] `DroneViewer` 公開APIの命名と責務を確定する
- [x] viewer config の最小スキーマを確定する
- [x] `docs/viewer-config-spec.md` を確定する
- [x] `config/schema/viewer-config.schema.json` を確定する
- [x] 新規作成予定 JS ファイルごとの責務を定義する
- [x] 既存 JS ファイルごとの責務を再定義する

完了条件:
- [x] 設計レビューで「threejs単体で検証可能」の合意が取れている
- [x] 新規/既存 JS の責務定義表が作成され、境界が合意されている

## Phase 1: threejs ファサード化（挙動不変）

- [x] `DroneViewer` を公開エントリとして整備する
- [x] `index.html` を `DroneViewer` 経由に統一する
- [x] 既存 legacy 動作（接続、機体選択、追従、姿勢更新）を回帰確認する

完了条件:
- [x] legacy の見た目と操作が従来同等
- [x] 上位から内部ファイルに直接依存しなくても基本動作できる

## Phase 2: 入力抽象化（legacyのみ）

- [x] `DroneStateSource` 抽象を追加する
- [x] `LegacyStateSource` を実装し、`DroneState` へ正規化する
- [x] `DroneRenderManager`（動的 upsert 管理）を導入する

完了条件:
- [x] legacy の動作にデグレなし
- [x] 描画更新経路が source 抽象経由になっている

## Phase 3: 設定の compact/fleets 対応

- [x] `drone_config` 系の上位 viewer config を導入する
- [x] scene config の compact 形式を定義する（`droneTypesPath` + `drones`）
- [x] compact scene config 用スキーマを追加する（`config/schema/scene-config.schema.json`）
- [x] compact scene config のサンプルを追加する
- [x] ローダーで compact を内部正規化して読めるようにする
- [x] `viewer_config` ローダーを実装する（`version/three/pdu/stateInput`）
- [x] 相対パスを viewer config 基準で解決する
- [x] `stateInput.roleMap` から pdutype でチャネル解決できるようにする
- [x] compact `pdudef` 前提で robot 数/対象チャネルを導出する
- [x] `mode=fleets` のとき `wireVersion=v2` を実行時バリデーションする
- [x] 既存の PDU compact 対応（`PduChannelConfig`）との差分責務を明文化する

完了条件:
- [x] viewer 設定が legacy/compact/fleets を切替可能
- [x] legacy は `pos/motor` を roleMap 指定で自動解決できる
- [x] fleets は `visual_state_array` を roleMap 指定で解決できる
- [x] fleets で `wireVersion!=v2` を拒否できる
- [x] scene config は compact 形式のみ受け付ける

## Phase 4: fleets 追加（状態入力）

- [x] `FleetStateSource` を追加する
- [x] `DroneVisualStateArray` の chunk 再構成を実装する
- [x] `stateInput.mode` で `legacy/fleets` 切替を有効化する
- [x] `pduNames` ではなく `roleMap.visual_state_array(pdutype)` 起点で読み取り実装する

完了条件:
- [x] fleets モードで複数機体を表示可能
- [x] legacy モードと共存し、切替で相互に壊れない

## Phase 5: map-viewer 移行

- [ ] `map-viewer` の `threejs` 依存を `DroneViewer` API のみに置換する
- [ ] `1/2/10` ハードコード分岐を設定駆動へ置換する
- [ ] 既存地図表示（選択機追従、軌跡、姿勢表示）の回帰確認を行う

完了条件:
- [ ] `map-viewer` が `threejs` 内部実装を直接 import しない
- [ ] 上位設定のみで機体数と入力モードを切替可能

## Phase 6: モデル配布/参照整理（初学者向け）

- [x] `threejs` 標準で必要な最小モデル（drone/environment）を同梱する
- [ ] 外部大型モデル依存をオプション化し、未配置時のフォールバックを用意する
- [ ] モデルライセンスと配置手順を README に明記する
- [ ] `map-viewer` と `threejs` でモデル参照ポリシーを揃える

完了条件:
- [ ] 初期状態（最小アセットのみ）で threejs 単体起動が可能
- [ ] モデル未配置時に致命的エラーで停止せず、原因が明示される

## 共通チェック

- [x] README に利用方法（legacy/fleets）を追記
- [x] 既存サンプル起動手順を維持
- [ ] デバッグログを必要最小限に整理
- [x] fleets 向け結合手順（drone_service / visual_state_publisher / web_bridge_fleets / browser URL）を README に明記

## Bridge連携（fleets）

- [x] `web_bridge_fleets` の comm 設定を現行スキーマ（protocol/impl_type/role）へ修正
- [x] `web_bridge_fleets/bridge/bridge.json` を v2 形式へ統一
- [x] endpoint 起動の固定ID依存を解消（`web_bridge_daemon` は `start_all/post_start_all` を使用）
- [x] `config-root` 起点で `asset-config` を自動解決できるよう修正

完了条件:
- [x] `--config-root config/web_bridge_fleets` で bridge が起動できる
- [x] fleets 経路で threejs 側の状態更新を確認できる

## 検証メモ（2026-03-05）

- [x] `viewerConfigPath=/config/viewer-config-legacy.json` で接続・状態反映・機体追従を確認
- [x] `viewerConfigPath=/config/viewer-config-fleets.json` で接続・状態反映・複数機体表示を確認
- [x] legacy/fleets を切替して再接続してもクラッシュや描画停止がないことを確認
- [x] `web_bridge_fleets` 起動時の endpoint 固定名問題を修正し、E2E 疎通を確認
