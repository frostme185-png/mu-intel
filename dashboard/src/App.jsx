import { useEffect, useMemo, useState } from "react";

const TIER_META = {
  0: { label: "Tier 0", desc: "Chính thức", key: "tier-0" },
  1: { label: "Tier 1", desc: "Gần như chắc chắn", key: "tier-1" },
  2: { label: "Tier 2", desc: "Có cơ sở", key: "tier-2" },
  3: { label: "Tier 3", desc: "Chưa kiểm chứng", key: "tier-3" },
  4: { label: "Tier 4", desc: "Đồn đoán", key: "tier-4" },
};

const CATEGORY_META = {
  transfer: { label: "Chuyển nhượng" },
  match: { label: "Trận đấu" },
  off_pitch: { label: "Khác" },
};
const CATEGORY_ORDER = ["transfer", "match", "off_pitch"];

function storyId(story) {
  return story.items?.[0]?.url ?? story.representative_title;
}

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

function useReadState(selectedDate) {
  const [readIds, setReadIds] = useState(new Set());

  useEffect(() => {
    if (!selectedDate) return;
    const raw = localStorage.getItem(`mu-intel:read:${selectedDate}`);
    setReadIds(new Set(raw ? JSON.parse(raw) : []));
  }, [selectedDate]);

  const toggleRead = (id) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(`mu-intel:read:${selectedDate}`, JSON.stringify([...next]));
      return next;
    });
  };

  return { readIds, toggleRead };
}

function TierBadge({ tier }) {
  const meta = TIER_META[tier] ?? { label: `Tier ${tier}`, desc: "", key: "tier-4" };
  return (
    <span className={`tier-badge ${meta.key}`}>
      {meta.label} <span className="tier-badge-desc">· {meta.desc}</span>
    </span>
  );
}

function StoryCard({ story, isRead, onToggleRead }) {
  return (
    <article className={`story-card tier-${story.min_tier}-border ${isRead ? "is-read" : ""}`}>
      <div className="story-head">
        <TierBadge tier={story.min_tier} />
        <div className="story-head-right">
          {story.corroboration_count > 1 && (
            <span className="corroboration">×{story.corroboration_count} nguồn</span>
          )}
          <button className="read-toggle" onClick={onToggleRead}>
            {isRead ? "✓ Đã đọc" : "Đánh dấu đã đọc"}
          </button>
        </div>
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

function formatFixtureDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function FixtureCard({ label, fixture, playerStats }) {
  if (!fixture) return null;

  const home = fixture.teams?.home?.name ?? "?";
  const away = fixture.teams?.away?.name ?? "?";
  const homeGoals = fixture.goals?.home;
  const awayGoals = fixture.goals?.away;
  const hasScore = homeGoals !== null && homeGoals !== undefined;
  const statusShort = fixture.fixture?.status?.short;
  const dateStr = formatFixtureDate(fixture.fixture?.date);

  const topPlayers = (playerStats ?? [])
    .filter((p) => typeof p.rating === "number")
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);

  return (
    <div className="fixture-card">
      <p className="fixture-label">{label}</p>
      <div className="fixture-score-row">
        <span className="fixture-team">{home}</span>
        <span className={`fixture-score ${hasScore ? "" : "fixture-score-vs"}`}>
          {hasScore ? `${homeGoals} – ${awayGoals}` : "vs"}
        </span>
        <span className="fixture-team">{away}</span>
      </div>
      <p className="fixture-meta">
        {dateStr}
        {statusShort ? ` · ${statusShort}` : ""}
      </p>
      {topPlayers.length > 0 && (
        <ul className="player-ratings">
          {topPlayers.map((p, i) => (
            <li key={i} className="player-rating-row">
              <span className="player-name">{p.player_name}</span>
              <span className="player-contrib">
                {p.goals > 0 ? `⚽×${p.goals} ` : ""}
                {p.assists > 0 ? `🅰×${p.assists}` : ""}
              </span>
              <span className="player-rating">{p.rating.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchDataSection({ matchData }) {
  if (!matchData) return null;
  const hasRecent = !!matchData.recent_fixture;
  const hasUpcoming = !!matchData.upcoming_fixture;

  return (
    <section className="match-section">
      <h2 className="section-heading">Số liệu trận đấu</h2>
      {!hasRecent && !hasUpcoming ? (
        <p className="status-text">
          Chưa có trận đấu MUFC nào gần đây hoặc sắp tới (khả năng đang giữa mùa giải).
        </p>
      ) : (
        <div className="fixture-grid">
          <FixtureCard
            label="Trận gần nhất"
            fixture={matchData.recent_fixture}
            playerStats={matchData.recent_fixture_player_stats}
          />
          <FixtureCard label="Trận sắp tới" fixture={matchData.upcoming_fixture} />
        </div>
      )}
    </section>
  );
}

export default function App() {
  const { manifest, loading: manifestLoading } = useReportManifest();
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeTiers, setActiveTiers] = useState(new Set([0, 1, 2, 3, 4]));
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (manifest.length > 0 && !selectedDate) {
      setSelectedDate(manifest[0]);
    }
  }, [manifest, selectedDate]);

  const { report, loading: reportLoading } = useReport(selectedDate);
  const { readIds, toggleRead } = useReadState(selectedDate);

  const toggleTier = (tier) => {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  const tierFilteredStories = useMemo(() => {
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

  const groupedStories = useMemo(() => {
    const groups = { transfer: [], match: [], off_pitch: [] };
    for (const story of tierFilteredStories) {
      const key = groups[story.category] ? story.category : "off_pitch";
      groups[key].push(story);
    }
    return groups;
  }, [tierFilteredStories]);

  const visibleStories =
    selectedCategory === "all" ? tierFilteredStories : groupedStories[selectedCategory] ?? [];

  const unreadCount = visibleStories.filter((s) => !readIds.has(storyId(s))).length;

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

      {report && <MatchDataSection matchData={report.match_data} />}

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
        <select
          className="category-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="all">Tất cả mục ({tierFilteredStories.length})</option>
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_META[cat].label} ({groupedStories[cat].length})
            </option>
          ))}
        </select>
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
              {visibleStories.length} / {report.stories.length} story · {unreadCount} chưa đọc
            </p>

            {selectedCategory === "all" ? (
              CATEGORY_ORDER.map(
                (cat) =>
                  groupedStories[cat].length > 0 && (
                    <section key={cat} className="category-section">
                      <h2 className="category-heading">
                        {CATEGORY_META[cat].label}
                        <span className="category-count">{groupedStories[cat].length}</span>
                      </h2>
                      <div className="story-list">
                        {groupedStories[cat].map((story) => (
                          <StoryCard
                            key={storyId(story)}
                            story={story}
                            isRead={readIds.has(storyId(story))}
                            onToggleRead={() => toggleRead(storyId(story))}
                          />
                        ))}
                      </div>
                    </section>
                  )
              )
            ) : (
              <div className="story-list">
                {visibleStories.map((story) => (
                  <StoryCard
                    key={storyId(story)}
                    story={story}
                    isRead={readIds.has(storyId(story))}
                    onToggleRead={() => toggleRead(storyId(story))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
