# 新增角色素材记录

2026-10-24，通过内置 ImageGen 工具生成三套原创角色。每套八种状态，共 24 张透明 PNG，画布均为 384×512。通过现有角色包发现与状态映射加载，无需新增运行时依赖。

设置 → 字幕与资源 → 角色，选择「樱铃 · Sakura」「星璃 · Stella」或「森柚 · Yuzu」。没有附带角色语音；语音包可独立选择。

## 制作与状态顺序

每个角色分别生成一张 1536×1024、4 列 × 2 行的图集，随后按等分网格机械切图，保留原始透明通道。不做背景重绘或角色替换。状态按从左到右、从上到下排列：`idle`、`thinking`、`working`、`waiting`、`done`、`error`、`stopped`、`offline`。

## 实际生成提示词

每次调用的完整提示词由下面的共用提示词与对应角色描述连接而成，均设置 `transparent_background: true`。

### 共用提示词

```text
Use case: stylized-concept. Asset type: production sprite sheet for MoonPet desktop companion. Create ONE landscape 1536x1024 transparent PNG sprite sheet, exact 4 columns x 2 rows of EIGHT equally sized cells (384x512 per cell). Transparent empty background, no scenery, no checkerboard painted into image. One full-body character per cell. Consistent polished cute anime game standing illustration, detailed clean lineart, soft cel shading, roughly 4.5 heads tall. Same identifiable face, exact same costume and proportions in every cell. Feet aligned at same baseline with 5% clear margin from cell boundaries, heads at same height, whole silhouette centered within each cell, no clipping, no overlap between cells, no text or borders. Eight poses in STRICT row-major order: top row 1 idle gentle smile relaxed hands, 2 thinking curious hand on chin, 3 working focused expression holding a small notebook and pencil, 4 waiting hopeful raised hand to get attention. Bottom row 5 done joyful smile peace-sign hand, 6 error worried concerned face hands together, 7 stopped calm relaxed arms down, 8 offline eyes closed sleeping peacefully standing with hands folded at chest. Each pose visibly distinct while maintaining face identity. NO shadows or glow outside silhouette. Wholesome fully clothed. Character design:
```

### 樱铃 · Sakura

```text
Sakura: cheerful gentle anime young adult woman with long flowing pastel pink hair, cherry-blossom hairpins, pink eyes, modest white and blush pink frilled knee-length dress, pink ribbon belt, white socks, pink mary-jane shoes. Elegant spring blossom motif, no animal ears.
```

保存目录：`assets/packs/sakura/`，含 `pack.json`、`pet.json` 与 `sprites/` 八张状态立绘。

### 星璃 · Stella

```text
Stella: serene mysterious anime young adult woman with long silver-lavender hair, violet eyes, star hairpin, navy blue and violet modest knee-length dress, short star-embroidered celestial capelet, opaque stockings, elegant violet ankle boots. Tiny golden stars on clothing, moon pendant. No hat.
```

保存目录：`assets/packs/stella/`，含 `pack.json`、`pet.json` 与 `sprites/` 八张状态立绘。

### 森柚 · Yuzu

```text
Yuzu: energetic cute anime young adult woman with chestnut short bob hair, amber eyes, green cat-ear shaped fabric hoodie hat (human girl), forest green and ivory modest overall dress over white blouse, small leaf brooch, cream socks, brown ankle boots. Cozy woodland explorer motif.
```

保存目录：`assets/packs/yuzu/`，含 `pack.json`、`pet.json` 与 `sprites/` 八张状态立绘。
