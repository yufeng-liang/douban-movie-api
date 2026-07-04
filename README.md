# 豆瓣电影 API

基于 Cloudflare Worker 的豆瓣电影数据接口，免费部署，国内访问快。

## API 端点

| 端点 | 说明 | 缓存 |
|------|------|------|
| `GET /api/nowplaying` | 正在热映 | 12小时 |
| `GET /api/chart` | 豆瓣新片榜（10部） | 12小时 |
| `GET /api/weekly` | 一周口碑榜（10部） | 12小时 |
| `GET /api/top250?page=1` | 豆瓣Top250（分页，每页25部） | 1天 |

## 返回格式

```json
{
  "code": 0,
  "data": [
    {
      "rank": 1,
      "title": "肖申克的救赎",
      "id": "1292052",
      "url": "https://movie.douban.com/subject/1292052/",
      "poster": "https://img.doubanio.com/...",
      "rating": "9.7",
      "ratingCount": "3300590人评价"
    }
  ],
  "total": 250,
  "page": 1,
  "pageSize": 25,
  "cached": false,
  "updatedAt": "2026-07-04T10:00:00Z"
}
```

## 部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 部署 Worker

```bash
# 在项目目录下
wrangler deploy
```

部署后会得到一个 URL，如：`https://douban-movie-api.xxx.workers.dev`

### 4. 绑定自定义域名（可选）

在 Cloudflare Dashboard → Workers → 你的 Worker → 设置 → 触发器 → 添加自定义域名

## 本地开发

```bash
# 启动本地开发服务器
wrangler dev

# 访问 http://localhost:8787
```

## 注意事项

- 数据来源于豆瓣网页，仅供学习交流使用
- 缓存机制减少对豆瓣的请求，避免被封
- 如需更频繁更新，可调整 `CACHE_TTL` 配置
