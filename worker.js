/**
 * 豆瓣电影 API - Cloudflare Worker
 * 
 * 端点：
 *   GET /api/nowplaying    - 正在热映
 *   GET /api/chart         - 豆瓣新片榜
 *   GET /api/weekly        - 一周口碑榜
 *   GET /api/top250?page=1 - 豆瓣Top250（分页，每页25部）
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CACHE_TTL = {
  nowplaying: 12 * 60 * 60,  // 12小时
  chart: 12 * 60 * 60,
  weekly: 12 * 60 * 60,
  top250: 24 * 60 * 60,      // 1天
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://movie.douban.com/',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

function extractId(href) {
  const m = href && href.match(/subject\/(\d+)/);
  return m ? m[1] : null;
}

// ==================== 正在热映 ====================
function parseNowPlaying(html) {
  const items = [];
  const regex = /data-title="([^"]*)"[\s\S]*?data-rate="([^"]*)"[\s\S]*?data-star="([^"]*)"[\s\S]*?data-ticket="[^"]*\/(\d+)[^"]*"[\s\S]*?data-duration="([^"]*)"[\s\S]*?data-region="([^"]*)"[\s\S]*?data-director="([^"]*)"[\s\S]*?data-actors="([^"]*)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const [, title, rate, star, id, duration, region, director, actors] = match;
    // 提取封面图
    const imgRegex = new RegExp(`data-title="${escapeRegex(title)}"[\\s\\S]*?<img[^>]*src="([^"]*)"`, 'g');
    const imgMatch = imgRegex.exec(html);
    const poster = imgMatch ? imgMatch[1] : '';
    items.push({
      title,
      id,
      url: `https://movie.douban.com/subject/${id}/`,
      poster,
      rating: rate || '暂无评分',
      ratingCount: '',
      duration,
      region,
      director,
      actors: actors.split(' / ').slice(0, 3).join(' / '),
    });
  }
  return items;
}

// ==================== 新片榜 ====================
function parseChart(html) {
  const items = [];
  const tableRegex = /<tr class="item">([\s\S]*?)<\/tr>/g;
  let match;
  let rank = 0;
  while ((match = tableRegex.exec(html)) !== null) {
    rank++;
    const block = match[1];
    // 链接和ID
    const linkMatch = block.match(/href="https:\/\/movie\.douban\.com\/subject\/(\d+)\//);
    const id = linkMatch ? linkMatch[1] : '';
    // 标题
    const titleMatch = block.match(/<a[^>]*title="([^"]*)"/);
    const title = titleMatch ? titleMatch[1] : '';
    // 副标题
    const subMatch = block.match(/font-size:13px[^>]*>([^<]+)</);
    const subtitle = subMatch ? subMatch[1].trim() : '';
    // 封面
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*alt/);
    const poster = imgMatch ? imgMatch[1] : '';
    // 评分
    const ratingMatch = block.match(/<span class="rating_nums">([^<]*)<\/span>/);
    const rating = ratingMatch ? ratingMatch[1] : '暂无评分';
    // 评价人数
    const countMatch = block.match(/\((\d+)人评价\)/);
    const ratingCount = countMatch ? countMatch[1] + '人评价' : '';
    if (id) {
      items.push({
        rank,
        title,
        subtitle,
        id,
        url: `https://movie.douban.com/subject/${id}/`,
        poster,
        rating,
        ratingCount,
      });
    }
  }
  return items;
}

// ==================== 一周口碑榜 ====================
function parseWeekly(html) {
  const items = [];
  // 找到一周口碑榜区域
  const weeklySection = html.match(/一周口碑榜[\s\S]*?<ul class="content" id="listCont2">([\s\S]*?)<\/ul>/);
  if (!weeklySection) return items;
  const listHtml = weeklySection[1];
  const liRegex = /<li[^>]*>[\s\S]*?<div class="no">(\d+)<\/div>[\s\S]*?href="https:\/\/movie\.douban\.com\/subject\/(\d+)\/"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
  let match;
  while ((match = liRegex.exec(listHtml)) !== null) {
    const [, rank, id, title] = match;
    items.push({
      rank: parseInt(rank),
      title: title.trim(),
      id,
      url: `https://movie.douban.com/subject/${id}/`,
    });
  }
  return items;
}

// ==================== Top250 ====================
function parseTop250(html) {
  const items = [];
  const itemRegex = /<li>\s*<div class="item">([\s\S]*?)<\/div>\s*<\/li>/g;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];
    // 排名
    const rankMatch = block.match(/<em>(\d+)<\/em>/);
    const rank = rankMatch ? parseInt(rankMatch[1]) : 0;
    // ID和链接
    const linkMatch = block.match(/href="https:\/\/movie\.douban\.com\/subject\/(\d+)\//);
    const id = linkMatch ? linkMatch[1] : '';
    // 标题
    const titleMatch = block.match(/<span class="title">([^<]*)<\/span>/);
    const title = titleMatch ? titleMatch[1] : '';
    // 其他标题
    const otherTitleMatch = block.match(/<span class="title">&nbsp;\/&nbsp;([^<]*)<\/span>/);
    const otherTitle = otherTitleMatch ? otherTitleMatch[1] : '';
    // 封面
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"/);
    const poster = imgMatch ? imgMatch[1] : '';
    // 评分
    const ratingMatch = block.match(/<span class="rating_num"[^>]*>([^<]*)<\/span>/);
    const rating = ratingMatch ? ratingMatch[1] : '';
    // 评价人数
    const countMatch = block.match(/<span>(\d+)人评价<\/span>/);
    const ratingCount = countMatch ? countMatch[1] + '人评价' : '';
    // 导演和主演
    const directorMatch = block.match(/导演:\s*([^\n<]+)/);
    const director = directorMatch ? directorMatch[1].replace(/\s+/g, ' ').trim() : '';
    // 年份/地区/类型
    const infoMatch = block.match(/<br>\s*(\d{4})\s*\/\s*([^<]+)/);
    const year = infoMatch ? infoMatch[1] : '';
    const region = infoMatch ? infoMatch[2].trim() : '';
    // 一句话评价
    const quoteMatch = block.match(/<span class="inq">([^<]*)<\/span>/);
    const quote = quoteMatch ? quoteMatch[1] : '';
    if (id) {
      items.push({
        rank,
        title,
        otherTitle,
        id,
        url: `https://movie.douban.com/subject/${id}/`,
        poster,
        rating,
        ratingCount,
        director,
        year,
        region,
        quote,
      });
    }
  }
  return items;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== 分页逻辑 ====================
function paginateTop250(allItems, page) {
  const pageSize = 25;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return allItems.slice(start, end);
}

async function fetchTop250Page(page) {
  const start = (page - 1) * 25;
  const url = `https://movie.douban.com/top250?start=${start}&filter=`;
  const resp = await fetch(url, { headers: HEADERS });
  return await resp.text();
}

// ==================== 主路由 ====================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // API 路由
    const path = url.pathname;

    try {
      if (path === '/api/nowplaying') {
        return await handleNowPlaying(ctx);
      } else if (path === '/api/chart') {
        return await handleChart(ctx);
      } else if (path === '/api/weekly') {
        return await handleWeekly(ctx);
      } else if (path === '/api/top250') {
        const page = parseInt(url.searchParams.get('page') || '1');
        return await handleTop250(page, ctx);
      } else if (path === '/') {
        return json({
          name: '豆瓣电影 API',
          endpoints: [
            'GET /api/nowplaying - 正在热映',
            'GET /api/chart - 豆瓣新片榜',
            'GET /api/weekly - 一周口碑榜',
            'GET /api/top250?page=1 - 豆瓣Top250（分页）',
          ],
        });
      } else {
        return json({ code: 404, message: 'Not Found' }, 404);
      }
    } catch (err) {
      return json({ code: 500, message: err.message }, 500);
    }
  },
};

async function handleNowPlaying(ctx) {
  const cacheKey = 'douban:nowplaying';
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    data.cached = true;
    return json(data);
  }

  const resp = await fetch('https://movie.douban.com/', { headers: HEADERS });
  const html = await resp.text();
  const items = parseNowPlaying(html);

  const result = {
    code: 0,
    data: items,
    total: items.length,
    cached: false,
    updatedAt: new Date().toISOString(),
  };

  // 写入缓存
  const response = new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
  const cacheResponse = new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL.nowplaying}`,
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, cacheResponse));

  return json(result);
}

async function handleChart(ctx) {
  const cacheKey = 'douban:chart';
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    data.cached = true;
    return json(data);
  }

  const resp = await fetch('https://movie.douban.com/chart', { headers: HEADERS });
  const html = await resp.text();
  const items = parseChart(html);

  const result = {
    code: 0,
    data: items,
    total: items.length,
    cached: false,
    updatedAt: new Date().toISOString(),
  };

  const cacheResponse = new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL.chart}`,
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, cacheResponse));

  return json(result);
}

async function handleWeekly(ctx) {
  const cacheKey = 'douban:weekly';
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    data.cached = true;
    return json(data);
  }

  const resp = await fetch('https://movie.douban.com/chart', { headers: HEADERS });
  const html = await resp.text();
  const items = parseWeekly(html);

  const result = {
    code: 0,
    data: items,
    total: items.length,
    cached: false,
    updatedAt: new Date().toISOString(),
  };

  const cacheResponse = new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL.weekly}`,
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, cacheResponse));

  return json(result);
}

async function handleTop250(page, ctx) {
  page = Math.max(1, Math.min(10, page)); // 1-10页
  const cacheKey = `douban:top250:${page}`;
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const data = await cached.json();
    data.cached = true;
    return json(data);
  }

  const html = await fetchTop250Page(page);
  const items = parseTop250(html);

  const result = {
    code: 0,
    data: items,
    total: 250,
    page,
    pageSize: 25,
    cached: false,
    updatedAt: new Date().toISOString(),
  };

  const cacheResponse = new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL.top250}`,
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, cacheResponse));

  return json(result);
}
