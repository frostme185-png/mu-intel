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

// Highlight tên riêng trong tiêu đề bằng heuristic viết hoa, KHÔNG dùng NLP —
// đã thử spaCy NER thật (en_core_web_sm) trước khi chọn cách này: model gắn
// nhầm "Man United"/"Manchester United" thành PERSON ở nhiều tiêu đề và miss
// hẳn tên cầu thủ ít phổ biến, tệ hơn heuristic dưới đây trên chính domain
// tiêu đề bóng đá (viết tắt, ngoặc vuông kiểu Reddit, tên CLB trông giống tên
// người) — nên vẫn dùng regex + 2 danh sách, nhưng phần dễ lỗi thời (tên CLB
// đang thi đấu, đội hình/HLV hiện tại) lấy TỰ ĐỘNG từ report.known_entities
// (fetch qua API-Football trong collect_match_data.py), không gõ tay nữa.
// Chỉ còn phần thực sự ổn định lâu dài (giải đấu, media, vài CLB châu Âu lớn
// ngoài Premier League, HLV/cựu cầu thủ nổi tiếng không còn trong đội hình)
// là giữ tĩnh — các mục này gần như không đổi nên chi phí maintain rất thấp.
//   - Cụm ≥2 từ viết hoa liên tiếp (VD "Ayyoub Bouaddi") được coi là tên người,
//     trừ khi khớp danh sách "non-person" (CLB/giải đấu/media).
//   - Từ viết hoa đơn lẻ chỉ highlight nếu nằm trong danh sách "known single
//     names" (đội hình + HLV hiện tại, tự cập nhật + vài tên tĩnh bổ sung).
const STATIC_NON_PERSON_PHRASES = [
  "man united", "man utd", "manchester evening",
  "premier league", "champions league", "europa league", "conference league",
  "world cup", "old trafford", "the athletic", "sky sports", "bbc sport",
  "daily mail", "daily mirror", "royal box",
  "transfer round", "daily discussion", "world cup watch",
  "real madrid", "bayern munich", "inter milan", "atletico madrid",
  "borussia dortmund", "paris saint",
];

const STATIC_KNOWN_SINGLE_NAMES = [
  "ancelotti", "guardiola", "klopp", "arteta", "amorim", "mourinho",
  "ferguson", "postecoglou", "emery", "howe", "moyes",
  "neville", "carragher", "keane", "scholes", "rooney", "ronaldo", "messi",
];

// Từ nối đầu câu/đầu cụm chỉ viết hoa vì VỊ TRÍ (đầu title hoặc đầu vế câu
// trong tiêu đề kiểu Reddit), không phải vì là tên riêng — phải bóc ra khỏi
// đầu run trước khi xét phần còn lại, nếu không "The Manchester United",
// "Why Lisandro Martinez's" sẽ bị coi nhầm là tên. Đây là từ ngữ pháp tiếng
// Anh, không đổi theo mùa giải nên giữ tĩnh vĩnh viễn, không cần tự động hoá.
const LEADING_STOPWORDS = new Set([
  "the", "a", "an", "this", "that", "these", "those", "why", "how", "what",
  "who", "new", "but", "full", "some", "no", "another", "from", "told",
]);

function buildEntitySets(knownEntities) {
  const nonPersonPhrases = new Set(STATIC_NON_PERSON_PHRASES);
  const knownSingleNames = new Set(STATIC_KNOWN_SINGLE_NAMES);

  for (const club of knownEntities?.league_clubs ?? []) {
    if (club.includes(" ")) nonPersonPhrases.add(club.toLowerCase());
  }
  for (const surname of knownEntities?.known_surnames ?? []) {
    knownSingleNames.add(surname.toLowerCase());
  }

  return { nonPersonPhrases, knownSingleNames };
}

// 1 "run" viết hoa liên tiếp có thể chứa NHIỀU tên khác nhau nối bởi sở hữu
// cách (VD "Michael Carrick's Marcus Rashford stance..." — 2 người, không phải
// 1) — nên phải cắt run thành từng đoạn ngay sau từ có 's/'s, mỗi đoạn xử lý
// (chặn theo NON_PERSON_PHRASES / check KNOWN_SINGLE_NAMES) độc lập.
function splitOnPossessive(words) {
  const chunks = [];
  let current = [];
  for (const word of words) {
    current.push(word);
    if (/['’]s$/i.test(word)) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function highlightNames(title, nonPersonPhrases, knownSingleNames) {
  // Yêu cầu ≥1 chữ thường sau chữ cái đầu — loại các chữ cái viết hoa lẻ loi
  // (VD "U" trong "U-turn", "H" trong "HUGE") vô tình bị regex nuốt vào cụm.
  const runPattern = /[A-ZÀ-Ý][\p{Ll}À-ÿ]+(?:['’][\p{Ll}]+)?(?:\s+[A-ZÀ-Ý][\p{Ll}À-ÿ]+(?:['’][\p{Ll}]+)?)*/gu;
  const segments = [];
  let cursor = 0;
  let match;

  while ((match = runPattern.exec(title)) !== null) {
    const runStart = match.index;
    if (runStart > cursor) segments.push({ text: title.slice(cursor, runStart), isName: false });

    let runWords = match[0].split(/\s+/);
    const leadingStopwords = [];
    while (runWords.length > 1 && LEADING_STOPWORDS.has(runWords[0].toLowerCase())) {
      leadingStopwords.push(runWords[0]);
      runWords = runWords.slice(1);
    }
    if (leadingStopwords.length > 0) {
      segments.push({ text: leadingStopwords.join(" ") + " ", isName: false });
    }

    const chunks = splitOnPossessive(runWords);
    chunks.forEach((chunk, chunkIndex) => {
      if (chunkIndex > 0) segments.push({ text: " ", isName: false });

      let words = chunk;
      const plainPrefix = [];
      while (words.length >= 2) {
        const pair = words.slice(0, 2).join(" ").toLowerCase().replace(/['’]s$/i, "");
        if (nonPersonPhrases.has(pair)) {
          plainPrefix.push(...words.slice(0, 2));
          words = words.slice(2);
        } else {
          break;
        }
      }

      if (plainPrefix.length > 0) {
        segments.push({ text: plainPrefix.join(" "), isName: false });
        if (words.length > 0) segments.push({ text: " ", isName: false });
      }

      if (words.length >= 2) {
        segments.push({ text: words.join(" "), isName: true });
      } else if (words.length === 1) {
        const isKnown = knownSingleNames.has(words[0].toLowerCase().replace(/['’]s$/i, ""));
        segments.push({ text: words[0], isName: isKnown });
      }
    });

    cursor = runStart + match[0].length;
  }

  if (cursor < title.length) segments.push({ text: title.slice(cursor), isName: false });
  return segments;
}

function HighlightedTitle({ text, entitySets }) {
  return (
    <>
      {highlightNames(text, entitySets.nonPersonPhrases, entitySets.knownSingleNames).map((seg, i) =>
        seg.isName ? (
          <span key={i} className="name-highlight">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
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

function StoryCard({ story, isRead, onToggleRead, entitySets }) {
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
      <h3 className="story-title">
        <HighlightedTitle text={story.representative_title} entitySets={entitySets} />
      </h3>
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

  const entitySets = useMemo(() => buildEntitySets(report?.known_entities), [report]);

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
                            entitySets={entitySets}
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
                    entitySets={entitySets}
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
