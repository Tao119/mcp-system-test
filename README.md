# MCP test

Python と TypeScript における MCP クライアントとサーバーの比較実装

## ディレクトリ構造

このリポジトリには、以下の実装が含まれています：

- `/python` - Python 実装（クライアントとサーバー）
- `/typescript` - TypeScript 実装（クライアントとサーバー）

## 実装されているツール

両方の実装で共通して利用できるツール：

- `get_epoch_time` - 現在の UNIX エポック時間（秒）を取得
- `count_characters` - テキスト内の文字数をカウント

## 使い方

.env を作成して ANTHROPIC_API_KEY を入力してください

### クイックスタート

```bash
# TypeScript サーバーを起動

cd typescript/server
npm install
npm run build

cd ../client
npm install
npm run build
node dist/client.js ../server/dist/server.js

# または、Python 実装を使用
cd python

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd client
python client.py ../server/server.py
```
