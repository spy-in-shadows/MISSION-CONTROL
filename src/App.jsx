import { useState, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import ISSTracker from './components/ISSTracker';
import NewsDashboard from './components/NewsDashboard';
import Chatbot from './components/Chatbot';
import { ISSSpeedChart, NewsDistributionChart } from './components/Charts';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    const initial = saved || 'dark';
    document.documentElement.setAttribute('data-theme', initial);
    return initial;
  });
  const toggle = () => setTheme(prev => {
    const next = prev === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    return next;
  });
  return [theme, toggle];
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [issData, setIssData] = useState(null);
  const [newsData, setNewsData] = useState({ articles: [], category: 'General' });
  const [newsCountByCategory, setNewsCountByCategory] = useState({});
  const [selectedNewsCategory, setSelectedNewsCategory] = useState('General');

  const handleISSUpdate = useCallback((data) => {
    setIssData(data);
  }, []);

  const handleNewsUpdate = useCallback((articles, category) => {
    setNewsData({ articles, category });
    setNewsCountByCategory(prev => ({ ...prev, [category]: articles.length }));
  }, []);

  const handleNewsCountUpdate = useCallback((category, count) => {
    setNewsCountByCategory(prev => ({ ...prev, [category]: count }));
  }, []);

  const dashboardData = { issData, newsData };

  return (
    <div className="app-wrapper">
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'toast-custom',
          duration: 3000,
          style: {
            background: theme === 'dark' ? '#1a2035' : '#ffffff',
            color: theme === 'dark' ? '#e2e8f0' : '#0f172a',
            border: `1px solid ${theme === 'dark' ? '#2a3a5c' : '#e2e8f0'}`,
          }
        }}
      />

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">🛸</div>
          <div>
            <div className="header-title">MISSION CONTROL</div>
            <div className="header-subtitle">ISS & News Intelligence Dashboard</div>
          </div>
        </div>
        <div className="header-right">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="status-dot" />
            <span className="status-label">LIVE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {theme === 'dark' ? '🌙' : '☀️'}
            </span>
            <button
              className={`theme-toggle ${theme === 'light' ? 'active' : ''}`}
              onClick={toggleTheme}
              title="Toggle theme"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Top Row: ISS Tracker + Speed Chart */}
        <div className="grid-2 section">
          <ISSTracker onDataUpdate={handleISSUpdate} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title"><span className="icon">📈</span> ISS Speed Trend</div>
                <span className="badge badge-blue">Last 30 readings</span>
              </div>
              <ISSSpeedChart positions={issData?.positions || []} theme={theme} />
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title"><span className="icon">🍩</span> News by Category</div>
                <span className="badge badge-green">Click to filter</span>
              </div>
              <NewsDistributionChart
                newsCountByCategory={newsCountByCategory}
                onCategoryClick={setSelectedNewsCategory}
                theme={theme}
              />
            </div>
          </div>
        </div>

        {/* News Dashboard */}
        <NewsDashboard
          activeCategory={selectedNewsCategory}
          onCategoryChange={setSelectedNewsCategory}
          onDataUpdate={handleNewsUpdate}
          onCategoryCountUpdate={handleNewsCountUpdate}
        />
      </main>

      {/* Floating Chatbot */}
      <Chatbot dashboardData={dashboardData} />
    </div>
  );
}
