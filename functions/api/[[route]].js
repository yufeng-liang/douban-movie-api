/**
 * 豆瓣电影 API - Cloudflare Pages Functions
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CACHE_TTL = {
  nowplaying: 12 * 60 * 60,
  chart: 12 * 60 * 60,
  weekly: 12 * 60 * 60,
  top250: 24 * 60 * 60,
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

// ==================== 正在热映 ====================
function parseNowPlaying(html) {
  const items = [];
  // 匹配 li.ui-slide-item 元素中的 data-* 属性
  const liRegex = /<li[^>]*class="ui-slide-item[^"]*"[^>]*data-title="([^"]*)"[^>]*data-release="([^"]*)"[^>]*data-rate="([^"]*)"[^>]*data-star="([^"]*)"[^>]*data-trailer="[^"]*\/subject\/(\d+)\//g;
  let match;
  while ((match = liRegex.exec(html)) !== null) {
    const [, title, release, rate, star, id] = match;
    // 提取同一 li 元素中的其他属性
    const blockStart = match.index;
    const nextLi = html.indexOf('<li', blockStart + 1);
    const block = html.substring(blockStart, nextLi > 0 ? nextLi : blockStart + 2000);
    
    const durationMatch = block.match(/data-duration="([^"]*)"/);
    const regionMatch = block.match(/data-region="([^"]*)"/);
    const directorMatch = block.match(/data-director="([^"]*)"/);
    const actorsMatch = block.match(/data-actors="([^"]*)"/);
    const raterMatch = block.match(/data-rater="(\d+)"/);
    
    // 提取封面图
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*alt/);
    const poster = imgMatch ? imgMatch[1] : '';
    
    items.push({
      title,
      id,
      url: `https://movie.douban.com/subject/${id}/`,
      poster,
      rating: rate || '暂无评分',
      ratingCount: raterMatch ? raterMatch[1] + '人评价' : '',
      release,
      duration: durationMatch ? durationMatch[1] : '',
      region: regionMatch ? regionMatch[1] : '',
      director: directorMatch ? directorMatch[1] : '',
      actors: actorsMatch ? actorsMatch[1].split(' / ').slice(0, 3).join(' / ') : '',
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
    const linkMatch = block.match(/href="https:\/\/movie\.douban\.com\/subject\/(\d+)\//);
    const id = linkMatch ? linkMatch[1] : '';
    const titleMatch = block.match(/<a[^>]*title="([^"]*)"/);
    const title = titleMatch ? titleMatch[1] : '';
    const subMatch = block.match(/font-size:13px[^>]*>([^<]+)</);
    const subtitle = subMatch ? subMatch[1].trim() : '';
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"[^>]*alt/);
    const poster = imgMatch ? imgMatch[1] : '';
    const ratingMatch = block.match(/<span class="rating_nums">([^<]*)<\/span>/);
    const rating = ratingMatch ? ratingMatch[1] : '暂无评分';
    const countMatch = block.match(/\((\d+)人评价\)/);
    const ratingCount = countMatch ? countMatch[1] + '人评价' : '';
    if (id) {
      items.push({ rank, title, subtitle, id, url: `https://movie.douban.com/subject/${id}/`, poster, rating, ratingCount });
    }
  }
  return items;
}

// ==================== 一周口碑榜 ====================
function parseWeekly(html) {
  const items = [];
  const weeklySection = html.match(/一周口碑榜[\s\S]*?<ul class="content" id="listCont2">([\s\S]*?)<\/ul>/);
  if (!weeklySection) return items;
  const listHtml = weeklySection[1];
  const liRegex = /<li[^>]*>[\s\S]*?<div class="no">(\d+)<\/div>[\s\S]*?href="https:\/\/movie\.douban\.com\/subject\/(\d+)\/"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
  let match;
  while ((match = liRegex.exec(listHtml)) !== null) {
    const [, rank, id, title] = match;
    items.push({ rank: parseInt(rank), title: title.trim(), id, url: `https://movie.douban.com/subject/${id}/` });
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
    const rankMatch = block.match(/<em>(\d+)<\/em>/);
    const rank = rankMatch ? parseInt(rankMatch[1]) : 0;
    const linkMatch = block.match(/href="https:\/\/movie\.douban\.com\/subject\/(\d+)\//);
    const id = linkMatch ? linkMatch[1] : '';
    const titleMatch = block.match(/<span class="title">([^<]*)<\/span>/);
    const title = titleMatch ? titleMatch[1] : '';
    const otherTitleMatch = block.match(/<span class="title">&nbsp;\/&nbsp;([^<]*)<\/span>/);
    const otherTitle = otherTitleMatch ? otherTitleMatch[1] : '';
    const imgMatch = block.match(/<img[^>]*src="([^"]*)"/);
    const poster = imgMatch ? imgMatch[1] : '';
    const ratingMatch = block.match(/<span class="rating_num"[^>]*>([^<]*)<\/span>/);
    const rating = ratingMatch ? ratingMatch[1] : '';
    const countMatch = block.match(/<span>(\d+)人评价<\/span>/);
    const ratingCount = countMatch ? countMatch[1] + '人评价' : '';
    const directorMatch = block.match(/导演:\s*([^\n<]+)/);
    const director = directorMatch ? directorMatch[1].replace(/\s+/g, ' ').trim() : '';
    const infoMatch = block.match(/<br>\s*(\d{4})\s*\/\s*([^<]+)/);
    const year = infoMatch ? infoMatch[1] : '';
    const region = infoMatch ? infoMatch[2].trim() : '';
    const quoteMatch = block.match(/<span class="inq">([^<]*)<\/span>/);
    const quote = quoteMatch ? quoteMatch[1] : '';
    if (id) {
      items.push({ rank, title, otherTitle, id, url: `https://movie.douban.com/subject/${id}/`, poster, rating, ratingCount, director, year, region, quote });
    }
  }
  return items;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== Pages Function 入口 ====================
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const path = url.pathname.replace(/^\/api/, '') || '/';

  try {
    if (path === '/nowplaying' || path === '/') {
      const resp = await fetch('https://movie.douban.com/', { headers: HEADERS });
      const html = await resp.text();
      const items = parseNowPlaying(html);
      return json({ code: 0, data: items, total: items.length, updatedAt: new Date().toISOString() });
    } else if (path === '/chart') {
      const resp = await fetch('https://movie.douban.com/chart', { headers: HEADERS });
      const html = await resp.text();
      const items = parseChart(html);
      return json({ code: 0, data: items, total: items.length, updatedAt: new Date().toISOString() });
    } else if (path === '/weekly') {
      const resp = await fetch('https://movie.douban.com/chart', { headers: HEADERS });
      const html = await resp.text();
      const items = parseWeekly(html);
      return json({ code: 0, data: items, total: items.length, updatedAt: new Date().toISOString() });
    } else if (path === '/top250') {
      let page = parseInt(url.searchParams.get('page') || '1');
      page = Math.max(1, Math.min(10, page));
      const start = (page - 1) * 25;
      const resp = await fetch(`https://movie.douban.com/top250?start=${start}&filter=`, { headers: HEADERS });
      const html = await resp.text();
      const items = parseTop250(html);
      return json({ code: 0, data: items, total: 250, page, pageSize: 25, updatedAt: new Date().toISOString() });
    } else {
      return json({ code: 404, message: 'Not Found' }, 404);
    }
  } catch (err) {
    return json({ code: 500, message: err.message }, 500);
  }
}
