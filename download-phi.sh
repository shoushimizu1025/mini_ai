# Nuxt プロジェクト直下で
mkdir -p public/models
cd public/models

# MLC公式のモデル
REPO="mlc-ai/Phi-3.5-mini-instruct-q4f32_1-MLC"
BASE="https://huggingface.co/$REPO/resolve/main"

# フォルダ作成
mkdir -p Phi-3.5-mini-instruct-q4f32_1-MLC
cd Phi-3.5-mini-instruct-q4f32_1-MLC

# 必須ファイル
echo "Downloading config files..."
curl -f -L -O "$BASE/mlc-chat-config.json"
curl -f -L -O "$BASE/tokenizer.json"
curl -f -L -O "$BASE/ndarray-cache.json" || true

# shard をすべて取得
echo "Downloading shards..."
i=0
while true; do
  fname="params_shard_${i}.bin"
  url="$BASE/$fname"
  if curl -s -f -I "$url" >/dev/null; then
    echo "download $fname ..."
    curl -f -L -O "$url"
    i=$((i+1))
  else
    echo "no more shards."
    break
  fi
done

echo "DONE."
ls -lh