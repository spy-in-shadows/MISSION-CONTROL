import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'chatbot_messages';
const MAX_MESSAGES = 30;
const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2';

function greetingMessage() {
  return {
    role: 'bot',
    content: 'Hello! I am Mission Control AI. Ask me about:\n• ISS location & speed\n• Astronauts in space\n• Latest news articles',
    time: new Date().toLocaleTimeString()
  };
}

// ─── Simple markdown renderer ─────────────────────────────────────────────────
// Converts **bold**, *italic*, bullet points, and newlines to JSX
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, i) => {
    // Process inline: **bold** and *italic*
    const parts = [];
    let remaining = line;
    let key = 0;
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
      const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
      if (boldMatch && (!italicMatch || boldMatch[1].length <= italicMatch[1].length)) {
        if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
        parts.push(<strong key={key++}>{boldMatch[2]}</strong>);
        remaining = boldMatch[3];
      } else if (italicMatch) {
        if (italicMatch[1]) parts.push(<span key={key++}>{italicMatch[1]}</span>);
        parts.push(<em key={key++}>{italicMatch[2]}</em>);
        remaining = italicMatch[3];
      } else {
        parts.push(<span key={key++}>{remaining}</span>);
        remaining = '';
      }
    }
    // Bullet point lines
    const isBullet = line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ');
    if (isBullet) {
      return <div key={i} style={{ paddingLeft: 12, marginTop: 2 }}>• {parts.slice(1)}</div>;
    }
    return <div key={i} style={{ marginTop: i > 0 ? 3 : 0 }}>{parts}</div>;
  });
}

function buildSystemPrompt(dashboardData) {
  const { issData, newsData } = dashboardData;
  return `You are a Mission Control AI assistant. You ONLY answer questions based on the dashboard data below. Do NOT use external knowledge. If asked something outside this data, say "I can only answer based on current dashboard data."

=== DASHBOARD DATA ===
ISS: Lat=${issData?.lat?.toFixed(4) || 'N/A'}, Lng=${issData?.lng?.toFixed(4) || 'N/A'}, Speed=${issData?.speed?.toFixed(0) || 'N/A'} km/h, Location=${issData?.place || 'N/A'}, People=${issData?.people?.number || 'N/A'}
Astronauts: ${issData?.people?.people?.map(p => `${p.name}(${p.craft})`).join(', ') || 'N/A'}
News (${newsData?.articles?.length || 0} articles, category: ${newsData?.category || 'General'}):
${newsData?.articles?.slice(0, 10).map((a, i) => `${i + 1}. "${a.title}" - ${a.source?.name || 'Unknown'}`).join('\n') || 'No articles loaded'}
=== END ===
Answer concisely based ONLY on the data above.`;
}

export default function Chatbot({ dashboardData }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      return saved.length ? saved.slice(-MAX_MESSAGES) : [greetingMessage()];
    } catch {
      return [greetingMessage()];
    }
  });
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const token = import.meta.env.VITE_AI_TOKEN;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
  }, [messages]);

  const addBotMsg = (content) =>
    setMessages(prev => [...prev, { role: 'bot', content, time: new Date().toLocaleTimeString() }].slice(-MAX_MESSAGES));

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setMessages(prev => [...prev, { role: 'user', content: text, time: new Date().toLocaleTimeString() }].slice(-MAX_MESSAGES));
    setInput('');
    setTyping(true);

    try {
      if (!isDashboardQuestion(text)) {
        await new Promise(r => setTimeout(r, 300));
        addBotMsg('I can only answer based on current dashboard data: ISS position, ISS speed, people in space, and loaded news articles.');
        return;
      }

      const noToken = !token || token === 'your_huggingface_token_here';
      if (noToken) {
        // Small artificial delay to feel natural
        await new Promise(r => setTimeout(r, 600));
        addBotMsg(localFallback(text, dashboardData));
        return;
      }

      const systemPrompt = buildSystemPrompt(dashboardData);
      const historyText = messages.slice(-6).map(m =>
        m.role === 'user' ? `[INST] ${m.content} [/INST]` : m.content
      ).join('\n');

      const fullPrompt = `<s>[INST] ${systemPrompt} [/INST]\n${historyText}\n[INST] ${text} [/INST]`;

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: { max_new_tokens: 300, temperature: 0.3, return_full_text: false },
        }),
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (!res.ok) {
        if (res.status === 503) {
          addBotMsg('⏳ AI model is loading (cold start). Please try again in ~20 seconds.');
        } else if (res.status === 401) {
          addBotMsg('🔑 Invalid Hugging Face token. Using local fallback:\n\n' + localFallback(text, dashboardData));
        } else {
          addBotMsg(localFallback(text, dashboardData));
        }
        return;
      }

      const data = await res.json();
      let reply = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
      reply = (reply || '').replace(/\[INST\].*?\[\/INST\]/gs, '').trim();
      if (!reply) reply = localFallback(text, dashboardData);
      addBotMsg(reply);

    } catch (e) {
      if (e.name === 'AbortError') {
        addBotMsg('⏱️ Request timed out. ' + localFallback(text, dashboardData));
      } else {
        // Network error — use local fallback silently
        addBotMsg(localFallback(text, dashboardData));
      }
    } finally {
      setTyping(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const clearChat = () => {
    const fresh = [greetingMessage()];
    setMessages(fresh);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    toast.success('Chat cleared');
  };

  return (
    <>
      <button className="chat-fab" onClick={() => setOpen(v => !v)} title="Open AI Chatbot">
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <div className="chat-window">
          <div className="chat-header">
            <div>
              <div className="chat-header-title">🤖 Mission Control AI</div>
              <div className="chat-header-sub">Mistral-7B · Dashboard data only</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
                onClick={clearChat}
                title="Clear chat"
              >🗑️</button>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}
                onClick={() => setOpen(false)}
              >✕</button>
            </div>
          </div>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {/* Render markdown for bot, plain text for user */}
                {m.role === 'bot' ? renderMarkdown(m.content) : m.content}
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 4, textAlign: m.role === 'user' ? 'right' : 'left' }}>
                  {m.time}
                </div>
              </div>
            ))}
            {typing && (
              <div className="chat-typing">
                <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-row">
            <input
              className="chat-input"
              placeholder="Ask about ISS or news..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={typing}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={sendMessage}
              disabled={typing || !input.trim()}
            >
              {typing ? <span className="spinner" /> : '➤'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Rule-based fallback (no HF token / network error) ──────────────────────
function localFallback(text, { issData, newsData }) {
  const t = text.toLowerCase();

  if (t.includes('speed')) {
    const spd = issData?.speed?.toFixed(0);
    return spd && spd !== '0'
      ? `The ISS speed shown on the dashboard is **${Number(spd).toLocaleString()} km/h**.`
      : 'Speed data is still loading. Please wait a moment and try again.';
  }

  if (t.includes('lat') || t.includes('lon') || t.includes('location') || t.includes('where') || t.includes('position')) {
    const lat = issData?.lat?.toFixed(4);
    const lng = issData?.lng?.toFixed(4);
    const place = issData?.place;
    if (!lat || lat === '0.0000') return 'ISS position is still loading. Please wait a moment.';
    return `The ISS is currently at:\n• Latitude: **${lat}°**\n• Longitude: **${lng}°**\n• Dashboard location: **${place || 'unknown location'}**`;
  }

  if (t.includes('astronaut') || t.includes('people') || t.includes('crew') || t.includes('who') || t.includes('human')) {
    const people = issData?.people;
    if (!people) return 'Astronaut data is loading or unavailable on the dashboard right now.';
    const names = people.people?.map(p => `**${p.name}** (${p.craft})`).join('\n• ') || 'Unknown';
    return `The dashboard shows **${people.number} people** in space:\n• ${names}`;
  }

  if (t.includes('news') || t.includes('article') || t.includes('headline') || t.includes('today') || t.includes('summary')) {
    const articles = newsData?.articles?.filter(a => a.title) || [];
    if (!articles.length) return 'No news articles are loaded on the dashboard yet. Refresh the news section and try again.';
    return `**Latest ${Math.min(articles.length, 5)} dashboard headlines** (${newsData?.category || 'General'}):\n${articles.slice(0, 5).map((a, i) => `${i + 1}. "${a.title}" — **${a.source?.name || 'Unknown'}**`).join('\n')}`;
  }

  return 'I can only answer based on current dashboard data: ISS position, ISS speed, people in space, and loaded news articles.';
}

function isDashboardQuestion(text) {
  const t = text.toLowerCase();
  return [
    'iss', 'speed', 'lat', 'lon', 'location', 'where', 'position',
    'astronaut', 'people', 'crew', 'space', 'news', 'article',
    'headline', 'summary', 'source', 'author', 'date', 'today', 'count'
  ].some(keyword => t.includes(keyword));
}
