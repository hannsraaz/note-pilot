import { initShellPage, showToast } from "./modules/app.js";
import {
  fetchBrowseNotes,
  fetchRecentNotes,
  fetchTrendingNotes
} from "./modules/notes.js";
import {
  populateCommonSelects,
  renderNotesGrid,
  renderSkeletons
} from "./modules/ui.js";
import { formatNumber, getNoteFileLinks, qs } from "./modules/utils.js";

const elements = {
  trendingGrid: qs("#trendingGrid"),
  recentGrid: qs("#recentGrid"),
  notesGrid: qs("#notesGrid"),
  browseForm: qs("#browseForm"),
  searchInput: qs("#searchInput"),
  semesterFilter: qs("#semesterFilter"),
  categoryFilter: qs("#categoryFilter"),
  heroNotesCount: qs("#heroNotesCount"),
  heroContributorsCount: qs("#heroContributorsCount"),
  heroTrendingCount: qs("#heroTrendingCount"),
  heroSavedCount: qs("#heroSavedCount")
};

let currentUser = null;

function defaultActions(note) {
  const fileLinks = getNoteFileLinks(note);

  return [
    { label: "View Details", href: `./note.html?id=${note.id}`, variant: "button-primary" },
    ...(fileLinks.openUrl ? [{ label: "Open PDF", href: fileLinks.openUrl, variant: "button-secondary", external: true }] : [])
  ];
}

function updateHeroStats(allNotes, trendingNotes) {
  const contributorCount = new Set(allNotes.map((note) => note.uploaderId).filter(Boolean)).size;
  const savedCount = allNotes.reduce((sum, note) => sum + Number(note.bookmarkCount || 0), 0);

  elements.heroNotesCount.textContent = formatNumber(allNotes.length);
  elements.heroContributorsCount.textContent = formatNumber(contributorCount);
  elements.heroTrendingCount.textContent = formatNumber(trendingNotes.length);
  elements.heroSavedCount.textContent = formatNumber(savedCount);
}

function renderHomeFallback(message) {
  renderNotesGrid(elements.trendingGrid, [], {
    emptyTitle: "Trending notes will appear here",
    emptyText: message
  });
  renderNotesGrid(elements.recentGrid, [], {
    emptyTitle: "Recent uploads will appear here",
    emptyText: message
  });
  renderNotesGrid(elements.notesGrid, [], {
    emptyTitle: "Connect Firebase to load the library",
    emptyText: message
  });
}

async function loadBrowseResults() {
  renderSkeletons(elements.notesGrid, 6);

  const notes = await fetchBrowseNotes({
    search: elements.searchInput.value,
    semester: elements.semesterFilter.value,
    category: elements.categoryFilter.value,
    limitCount: 30
  });

  renderNotesGrid(elements.notesGrid, notes, {
    emptyTitle: "No matching notes yet",
    emptyText: "Try a broader keyword or remove a filter to explore more uploads.",
    actionsBuilder: defaultActions
  });

  return notes;
}

async function loadHome() {
  renderSkeletons(elements.trendingGrid, 3);
  renderSkeletons(elements.recentGrid, 3);
  renderSkeletons(elements.notesGrid, 6);

  const [trendingNotes, recentNotes, browseNotes] = await Promise.all([
    fetchTrendingNotes(3),
    fetchRecentNotes(6),
    fetchBrowseNotes({ limitCount: 30 })
  ]);

  renderNotesGrid(elements.trendingGrid, trendingNotes, {
    emptyTitle: "Trending notes will appear here",
    emptyText: "Once students start liking notes, this section will highlight them.",
    actionsBuilder: defaultActions
  });
  renderNotesGrid(elements.recentGrid, recentNotes, {
    emptyTitle: "No recent uploads yet",
    emptyText: "Upload the first PDF note to bring this section to life.",
    actionsBuilder: defaultActions
  });
  renderNotesGrid(elements.notesGrid, browseNotes, {
    emptyTitle: "No notes in the library yet",
    emptyText: "Create the first upload to seed your campus note hub.",
    actionsBuilder: defaultActions
  });

  updateHeroStats(browseNotes, trendingNotes);
}

elements.browseForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await loadBrowseResults();
  } catch (error) {
    showToast(error.message, "error");
  }
});

initShellPage("home", {
  onAuthResolved: async (user) => {
    currentUser = user;
    void currentUser;
    populateCommonSelects();

    try {
      await loadHome();
    } catch (error) {
      renderHomeFallback(error.message);
      showToast(error.message, "error");
    }
  }
});
