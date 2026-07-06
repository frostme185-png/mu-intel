import { useEffect, useMemo, useState } from "react";

const TIER_META = {
  0: { label: "Tier 0", desc: "Chính thức", key: "tier-0" },
  1: { label: "Tier 1", desc: "Gần như chắc chắn", key: "tier-1" },
  2: { label: "Tier 2", desc: "Có cơ sở", key: "tier-2" },
  3: { label: "Tier 3", desc: "Chưa kiểm chứng", key: "tier-3" },
  4: { label: "Tier 4", desc: "Đồn đoán", key: "tier-4" },
};

function useReportManifest() {
  const [manifest, setManifest] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/reports/index.json")
      .then((res) => res.json())
      .then((data) => {
        setManifest(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { manifest, loading };
}

function useReport(filename) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filename) return;
    setLoading(true);
    fetch(`/reports/${filename}`)
      .then((res) => res.json())
      .then((data) => {
        setReport(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filename]);

  return { report, loading };
}

function TierBadge({ tier }) {
  const meta = TIER_META[tier] ?? { label: `Tier ${tier}`, desc: "", key: "tier-4" };
  return (
    <span className={`tier-badge ${meta.key}`}>
      {meta.label} <span className="tier-badge-desc">· {meta.desc}</span>
    </span>
  );
}

function StoryCard({ story }) {
  return (
    <article className={`story-card tier-${story.min_tier}-border`}>
      <div className="story-head">
        <TierBadge tier={story.min_tier} />
        {story.corroboration_count > 1 && (
          <span className="corroboration">×{story.corroboration_count} nguồn</span>
        )}
      </div>
      <h3 className="story-title">{story.representative_title}</h3>
      <div className="story-sources">
        {story.items.map((item, i) => (
          <a
            key={i}
            className="source-tag"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {item.source} ↗
          </a>
        ))}
      </div>
    </article>
  );
}

export default function App() {
  const { manifest, loading: manifestLoading } = useReportManifest();
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeTiers, setActiveTiers] = useState(new Set([0, 1, 2, 3, 4]));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (manifest.length > 0 && !selectedDate) {
      setSelectedDate(manifest[0]);
    }
  }, [manifest, selectedDate]);

  const { report, loading: reportLoading } = useReport(selectedDate);

  const toggleTier = (tier) => {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  const filteredStories = useMemo(() => {
    if (!report) return [];
    return report.stories.filter((story) => {
      if (!activeTiers.has(story.min_tier)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const inTitle = story.representative_title.toLowerCase().includes(q);
        const inSources = story.sources.some((s) => s.toLowerCase().includes(q));
        if (!inTitle && !inSources) return false;
      }
      return true;
    });
  }, [report, activeTiers, search]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Daily briefing</p>
          <h1>mu-intel</h1>
        </div>

        {manifest.length > 0 && (
          <select
            className="date-select"
            value={selectedDate ?? ""}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {manifest.map((filename) => (
              <option key={filename} value={filename}>
                {filename.replace(".json", "")}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="filter-bar">
        <div className="tier-filters">
          {Object.entries(TIER_META).map(([tier, meta]) => (
            <button
              key={tier}
              className={`tier-toggle tier-${tier} ${activeTiers.has(Number(tier)) ? "active" : "inactive"}`}
              onClick={() => toggleTier(Number(tier))}
            >
              {meta.label}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          type="text"
          placeholder="Tìm theo tiêu đề hoặc nguồn..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <main>
        {manifestLoading && <p className="status-text">Đang tải danh sách report...</p>}
        {!manifestLoading && manifest.length === 0 && (
          <p className="status-text">
            Chưa có report nào trong reports/. Chạy `python scripts/generate_report.py` hoặc
            đợi GitHub Actions chạy lần đầu.
          </p>
        )}
        {reportLoading && <p className="status-text">Đang tải report...</p>}

        {report && (
          <>
            <p className="story-count">
              {filteredStories.length} / {report.stories.length} story
            </p>
            <div className="story-list">
              {filteredStories.map((story, i) => (
                <StoryCard key={i} story={story} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
