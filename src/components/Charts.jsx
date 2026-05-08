import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const CATEGORY_COLORS = {
  General: '#3b82f6',
  Technology: '#8b5cf6',
  Science: '#10b981',
  Space: '#06b6d4',
  World: '#f59e0b',
};

export function ISSSpeedChart({ positions, theme }) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(42,58,92,0.5)' : 'rgba(226,232,240,0.7)';

  const labels = positions.map(p => p.time);
  const speeds = positions.map(p => Math.round(p.speed));

  const data = {
    labels,
    datasets: [{
      label: 'ISS Speed (km/h)',
      data: speeds,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      pointBackgroundColor: '#3b82f6',
      pointRadius: 3,
      pointHoverRadius: 6,
      tension: 0.4,
      fill: true,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: textColor, font: { family: 'Inter', size: 12 } } },
      tooltip: {
        backgroundColor: isDark ? '#1a2035' : '#ffffff',
        titleColor: isDark ? '#e2e8f0' : '#0f172a',
        bodyColor: textColor,
        borderColor: isDark ? '#2a3a5c' : '#e2e8f0',
        borderWidth: 1,
        callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString()} km/h` }
      }
    },
    scales: {
      x: {
        ticks: { color: textColor, font: { size: 10 }, maxRotation: 45 },
        grid: { color: gridColor },
      },
      y: {
        ticks: { color: textColor, font: { size: 11 }, callback: v => v.toLocaleString() },
        grid: { color: gridColor },
      }
    }
  };

  if (!positions.length) {
    return (
      <div className="empty-state" style={{ height: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-icon">📊</div>
        <p>Waiting for ISS data...</p>
      </div>
    );
  }

  return (
    <div className="chart-wrapper">
      <Line data={data} options={options} />
    </div>
  );
}

export function NewsDistributionChart({ newsCountByCategory, onCategoryClick, theme }) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';

  const labels = Object.keys(newsCountByCategory);
  const values = Object.values(newsCountByCategory);
  const colors = labels.map(l => CATEGORY_COLORS[l] || '#64748b');

  const data = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: colors.map(c => c + 'cc'),
      borderColor: colors,
      borderWidth: 2,
      hoverOffset: 8,
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: textColor, font: { family: 'Inter', size: 12 }, padding: 16, usePointStyle: true }
      },
      tooltip: {
        backgroundColor: isDark ? '#1a2035' : '#ffffff',
        titleColor: isDark ? '#e2e8f0' : '#0f172a',
        bodyColor: textColor,
        borderColor: isDark ? '#2a3a5c' : '#e2e8f0',
        borderWidth: 1,
        callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} articles` }
      }
    },
    onClick: (_, elements) => {
      if (elements.length > 0 && onCategoryClick) {
        onCategoryClick(labels[elements[0].index]);
      }
    },
    onHover: (event, elements) => {
      event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    },
  };

  if (!labels.length || values.every(v => v === 0)) {
    return (
      <div className="empty-state" style={{ height: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="empty-icon">🍩</div>
        <p>Load news to see distribution</p>
      </div>
    );
  }

  return (
    <div className="chart-wrapper">
      <Doughnut data={data} options={options} />
    </div>
  );
}
