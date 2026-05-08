import { useEffect, useState, useCallback } from 'react';
import { setWithExpiry, getWithExpiry, formatDate } from '../utils';
import toast from 'react-hot-toast';

const NEWS_TTL = 15 * 60 * 1000;
const CATEGORIES = ['General', 'Technology', 'Science', 'Space', 'World'];
const CACHE_KEY = (cat) => `news_${cat}`;

function normalizeArticle(article, fallbackSource = 'News') {
  return {
    title: article.title || article.webTitle || 'Untitled article',
    description: article.description || article.summary || article.abstract || article.story_text || 'Open the full article to read more.',
    url: article.url || article.webUrl || article.link || '#',
    urlToImage: article.urlToImage || article.image || article.imageUrl || article.thumbnail || null,
    source: typeof article.source === 'string'
      ? { name: article.source }
      : { name: article.source?.name || fallbackSource },
    author: article.author || article.byline || article.source?.name || fallbackSource,
    publishedAt: article.publishedAt || article.published_at || article.created_at || article.webPublicationDate || new Date().toISOString(),
  };
}

function NewsCard({ article, idx }) {
  const fallbackImg = `https://picsum.photos/seed/news-${idx + 10}/160/120`;
  return (
    <article className="news-card">
      <img
        className="news-img"
        src={article.urlToImage || fallbackImg}
        alt={article.title}
        onError={e => { e.currentTarget.src = fallbackImg; }}
      />
      <div className="news-body">
        <div className="news-source">{article.source?.name || 'Unknown'}</div>
        <div className="news-title">{article.title}</div>
        <div className="news-meta">
          {article.author ? `${article.author} · ` : ''}
          {article.publishedAt ? formatDate(article.publishedAt) : ''}
        </div>
        <div className="news-desc">{article.description || ''}</div>
        <div className="news-footer">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: 'none', fontSize: 11 }}
          >
            Read More →
          </a>
        </div>
      </div>
    </article>
  );
}

function SkeletonNews() {
  return (
    <div className="news-card">
      <div className="skeleton" style={{ width: 80, height: 80, borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ height: 12, width: '40%' }} />
        <div className="skeleton" style={{ height: 14, width: '90%' }} />
        <div className="skeleton" style={{ height: 12, width: '60%' }} />
        <div className="skeleton" style={{ height: 11, width: '80%' }} />
      </div>
    </div>
  );
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

async function fetchSpaceflightNews(limit = 10) {
  const res = await fetchWithTimeout(`https://api.spaceflightnewsapi.net/v4/articles/?limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results || []).map(a => normalizeArticle({
    title: a.title,
    description: a.summary,
    url: a.url,
    image: a.image_url,
    source: a.news_site,
    author: a.news_site,
    publishedAt: a.published_at,
  }, 'Spaceflight News'));
}

async function fetchHackerNews(category, limit = 10) {
  const query = category === 'General' ? 'breaking news' : category.toLowerCase();
  const res = await fetchWithTimeout(
    `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.hits || [])
    .filter(h => h.title && (h.url || h.objectID))
    .map(h => normalizeArticle({
      title: h.title,
      description: h.story_text?.slice(0, 200) || 'Open the article for the full story.',
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: 'Hacker News',
      author: h.author,
      publishedAt: h.created_at,
    }, 'Hacker News'));
}

export default function NewsDashboard({ activeCategory, onCategoryChange, onDataUpdate, onCategoryCountUpdate }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date');

  const apiKey = import.meta.env.VITE_NEWS_API_KEY;

  const fetchCategoryArticles = useCallback(async (category, force = false) => {
    if (!force) {
      const cached = getWithExpiry(CACHE_KEY(category));
      if (cached) return cached;
    }

    let data = [];
    if (apiKey && apiKey !== 'your_newsapi_key_here') {
      const q = category === 'General' ? 'world OR politics OR business' : category.toLowerCase();
      const res = await fetchWithTimeout(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&pageSize=10&sortBy=publishedAt&apiKey=${apiKey}`
      );
      if (res.ok) {
        const json = await res.json();
        data = (json.articles || []).map(a => normalizeArticle(a, 'NewsAPI'));
      }
    }

    if (!data.length && category === 'Space') data = await fetchSpaceflightNews(10);
    if (!data.length) data = await fetchHackerNews(category, 10);

    if (!data.length) throw new Error(`No ${category.toLowerCase()} articles found`);

    const unique = Array.from(new Map(data.map(a => [a.url || a.title, a])).values()).slice(0, 10);
    setWithExpiry(CACHE_KEY(category), unique, NEWS_TTL);
    return unique;
  }, [apiKey]);

  const fetchNews = useCallback(async (category, force = false, quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }

    try {
      const data = await fetchCategoryArticles(category, force);
      if (!quiet) {
        setArticles(data);
        onDataUpdate?.(data, category);
        if (force) toast.success(`${category} news refreshed`);
      }
      return data;
    } catch (e) {
      if (!quiet) {
        setError(e.message);
        toast.error('Failed to load news');
      }
      return [];
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [fetchCategoryArticles, onDataUpdate]);

  useEffect(() => {
    queueMicrotask(() => fetchNews(activeCategory));
  }, [activeCategory, fetchNews]);

  useEffect(() => {
    let cancelled = false;
    async function loadDistribution() {
      setLoadingCounts(true);
      const results = await Promise.all(
        CATEGORIES.map(async cat => [cat, (await fetchNews(cat, false, true)).length])
      );
      if (!cancelled) {
        results.forEach(([cat, count]) => onCategoryCountUpdate?.(cat, count));
        setLoadingCounts(false);
      }
    }
    queueMicrotask(loadDistribution);
    return () => { cancelled = true; };
  }, [fetchNews, onCategoryCountUpdate]);

  const filtered = articles.filter(a => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      a.title?.toLowerCase().includes(s) ||
      a.description?.toLowerCase().includes(s) ||
      a.source?.name?.toLowerCase().includes(s) ||
      a.author?.toLowerCase().includes(s)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.publishedAt) - new Date(a.publishedAt);
    if (sortBy === 'source') return (a.source?.name || '').localeCompare(b.source?.name || '');
    return 0;
  });

  return (
    <div className="card section">
      <div className="card-header">
        <div className="card-title"><span className="icon">📰</span> Latest News</div>
        <button className="btn btn-ghost btn-sm" onClick={() => fetchNews(activeCategory, true)} disabled={loading}>
          {loading ? <span className="spinner" /> : '↻'} Refresh
        </button>
      </div>

      <div className="category-pills">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`pill ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => onCategoryChange(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="search-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search title, source, author..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="select-input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="date">Sort by Date</option>
          <option value="source">Sort by Source</option>
        </select>
      </div>

      {loadingCounts && (
        <div className="info-strip">Updating category distribution...</div>
      )}

      {error && !loading && (
        <div className="error-state" style={{ marginBottom: 16 }}>
          <div className="error-icon">⚠️</div>
          <p>{error}. Check your news API key or try again.</p>
          <button className="btn btn-primary btn-sm" onClick={() => fetchNews(activeCategory, true)}>Retry</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonNews key={i} />)
          : sorted.length === 0
            ? <div className="empty-state"><div className="empty-icon">🔍</div>No articles found</div>
            : sorted.slice(0, 10).map((a, i) => <NewsCard article={a} key={`${a.url}-${i}`} idx={i} />)
        }
      </div>
    </div>
  );
}
