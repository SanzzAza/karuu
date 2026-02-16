const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = 'https://www.goodshort.com/id';
const API_BASE = 'https://api.goodshort.com'; // atau dari reverse engineering

// Helper untuk scraping
async function scrapeGoodShort(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    return cheerio.load(data);
  } catch (error) {
    throw new Error('Failed to fetch data');
  }
}

// 1. Get Navigation Channels
app.get('/api/navChannel', async (req, res) => {
  try {
    const { lang = 'id' } = req.query;
    const $ = await scrapeGoodShort(`${BASE_URL}?lang=${lang}`);
    
    const channels = [];
    $('.nav-channel, .category-item, [data-channel]').each((i, el) => {
      channels.push({
        id: $(el).attr('data-id') || $(el).attr('href')?.split('/').pop(),
        name: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    
    res.json({ status: 'success', data: channels });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 2. Get Home Content
app.get('/api/home', async (req, res) => {
  try {
    const { lang = 'id', channel = '' } = req.query;
    const url = channel ? `${BASE_URL}/channel/${channel}?lang=${lang}` : `${BASE_URL}?lang=${lang}`;
    const $ = await scrapeGoodShort(url);
    
    const dramas = [];
    $('.drama-item, .book-item, [data-book-id]').each((i, el) => {
      const $el = $(el);
      dramas.push({
        id: $el.attr('data-book-id') || $el.find('a').attr('href')?.split('/').pop(),
        title: $el.find('.title, h3, h2').text().trim(),
        cover: $el.find('img').attr('src') || $el.find('img').attr('data-src'),
        description: $el.find('.desc, .description').text().trim(),
        rating: $el.find('.rating, .score').text().trim(),
        genre: $el.find('.genre, .tag').text().trim()
      });
    });
    
    res.json({ 
      status: 'success', 
      data: {
        banners: [], // scraping banner jika ada
        trending: dramas.slice(0, 10),
        latest: dramas.slice(10, 20),
        all: dramas
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 3. Search Drama
app.get('/api/search', async (req, res) => {
  try {
    const { lang = 'id', q } = req.query;
    if (!q) return res.status(400).json({ status: 'error', message: 'Query required' });
    
    const $ = await scrapeGoodShort(`${BASE_URL}/search?q=${encodeURIComponent(q)}&lang=${lang}`);
    
    const results = [];
    $('.search-item, .drama-item').each((i, el) => {
      const $el = $(el);
      results.push({
        id: $el.attr('data-id') || $el.find('a').attr('href')?.split('/book/')[1]?.split('/')[0],
        title: $el.find('.title, h3').text().trim(),
        cover: $el.find('img').attr('src'),
        description: $el.find('.desc').text().trim(),
        totalEpisodes: $el.find('.episodes, .chapter-count').text().trim()
      });
    });
    
    res.json({ status: 'success', query: q, count: results.length, data: results });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 4. Get Hot/Popular Dramas
app.get('/api/hot', async (req, res) => {
  try {
    const { lang = 'id' } = req.query;
    const $ = await scrapeGoodShort(`${BASE_URL}/hot?lang=${lang}`);
    
    const dramas = [];
    $('.hot-item, .popular-item, .drama-item').each((i, el) => {
      const $el = $(el);
      dramas.push({
        rank: i + 1,
        id: $el.attr('data-book-id'),
        title: $el.find('.title').text().trim(),
        cover: $el.find('img').attr('src'),
        views: $el.find('.views, .play-count').text().trim(),
        rating: $el.find('.rating').text().trim()
      });
    });
    
    res.json({ status: 'success', data: dramas });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 5. Get Drama Detail
app.get('/api/book/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'id' } = req.query;
    
    const $ = await scrapeGoodShort(`${BASE_URL}/book/${id}?lang=${lang}`);
    
    const detail = {
      id,
      title: $('h1, .book-title').text().trim(),
      description: $('.book-desc, .description, .synopsis').text().trim(),
      cover: $('.book-cover img, .poster img').attr('src'),
      rating: $('.rating, .score').text().trim(),
      genre: $('.genre, .tags').text().trim().split(',').map(g => g.trim()),
      totalEpisodes: $('.episode-count, .chapter-count').text().trim(),
      cast: $('.cast, .actors').text().trim(),
      status: $('.status').text().trim(),
      releaseDate: $('.release-date').text().trim()
    };
    
    res.json({ status: 'success', data: detail });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 6. Get Chapters/Episodes List
app.get('/api/chapters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lang = 'id', token = '' } = req.query;
    
    const $ = await scrapeGoodShort(`${BASE_URL}/book/${id}/chapters?lang=${lang}&token=${token}`);
    
    const chapters = [];
    $('.chapter-item, .episode-item').each((i, el) => {
      const $el = $(el);
      chapters.push({
        chapterId: $el.attr('data-chapter-id') || $el.attr('href')?.split('/play/')[1]?.split('?')[0],
        title: $el.find('.chapter-title, .episode-title').text().trim(),
        number: $el.find('.chapter-num, .episode-num').text().trim(),
        duration: $el.find('.duration').text().trim(),
        isLocked: $el.hasClass('locked') || $el.find('.lock').length > 0,
        thumbnail: $el.find('img').attr('src')
      });
    });
    
    res.json({ 
      status: 'success', 
      bookId: id,
      totalChapters: chapters.length,
      data: chapters 
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 7. Get Play URL (Video Source)
app.get('/api/play/:chapterId', async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { bookId, lang = 'id' } = req.query;
    
    if (!bookId) return res.status(400).json({ status: 'error', message: 'bookId required' });
    
    const $ = await scrapeGoodShort(`${BASE_URL}/play/${chapterId}?bookId=${bookId}&lang=${lang}`);
    
    // Extract video URL dari script tag atau data attribute
    let videoUrl = '';
    let m3u8Url = '';
    
    $('script').each((i, el) => {
      const script = $(el).html();
      if (script && script.includes('videoUrl')) {
        const match = script.match(/videoUrl["']?\s*:\s*["']([^"']+)["']/);
        if (match) videoUrl = match[1];
      }
      if (script && script.includes('.m3u8')) {
        const match = script.match(/https:\/\/[^"']+\.m3u8/);
        if (match) m3u8Url = match[0];
      }
    });
    
    // Cek di data attribute
    if (!videoUrl) {
      videoUrl = $('#video-player, .video-container').attr('data-src') || 
                 $('video').attr('src');
    }
    
    res.json({
      status: 'success',
      chapterId,
      bookId,
      videoUrl,
      m3u8Url,
      qualities: {
        sd: videoUrl,
        hd: videoUrl?.replace('_sd', '_hd'),
        full_hd: videoUrl?.replace('_sd', '_fhd')
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 8. Get M3U8 Stream (Direct)
app.get('/api/m3u8/:chapterId', async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { bookId } = req.query;
    
    if (!bookId) return res.status(400).json({ status: 'error', message: 'bookId required' });
    
    // Redirect atau proxy ke M3U8
    const m3u8Url = `https://cdn.goodshort.com/streams/${bookId}/${chapterId}/playlist.m3u8`;
    
    res.json({
      status: 'success',
      streamUrl: m3u8Url,
      headers: {
        'Referer': 'https://www.goodshort.com/',
        'User-Agent': 'Mozilla/5.0'
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Documentation Endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'GoodShort API',
    version: '1.0.0',
    description: 'Unofficial API for GoodShort drama streaming',
    baseUrl: req.protocol + '://' + req.get('host') + '/api',
    endpoints: {
      navChannel: { method: 'GET', path: '/navChannel?lang=id', desc: 'Get navigation channels' },
      home: { method: 'GET', path: '/home?lang=id&channel=', desc: 'Get homepage content' },
      search: { method: 'GET', path: '/search?lang=id&q=query', desc: 'Search dramas' },
      hot: { method: 'GET', path: '/hot?lang=id', desc: 'Get popular dramas' },
      bookDetail: { method: 'GET', path: '/book/:id?lang=id', desc: 'Get drama details' },
      chapters: { method: 'GET', path: '/chapters/:id?lang=id&token=', desc: 'Get episode list' },
      play: { method: 'GET', path: '/play/:chapterId?bookId=&lang=id', desc: 'Get video URL' },
      m3u8: { method: 'GET', path: '/m3u8/:chapterId?bookId=', desc: 'Get HLS stream' }
    },
    example: req.protocol + '://' + req.get('host') + '/api/hot?lang=id'
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Something broke!' });
});

// Vercel specific export
if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 GoodShort API running on port ${PORT}`);
  });
}
