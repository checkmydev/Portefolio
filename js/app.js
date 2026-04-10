import {
  getClient,
  getSessionId,
  getSupabaseConfig,
  saveSupabaseConfig,
  resetClient,
} from './supabase-client.js';

// ---- State ----
let projects   = [];
let activeCategory = 'all';
let searchQuery    = '';
let likeCounts     = {};   // { [project_id]: number }
let likedByMe      = new Set(); // project_ids liked by current session

const CATEGORIES = {
  all:        { label: 'Tous',        icon: '🗂️' },
  lifestyle:  { label: 'Lifestyle',   icon: '🌿' },
  finance:    { label: 'Finance',     icon: '💰' },
  tools:      { label: 'Outils',      icon: '🔧' },
  games:      { label: 'Jeux',        icon: '🎮' },
  data:       { label: 'Data',        icon: '📊' },
  social:     { label: 'Social',      icon: '💬' },
  other:      { label: 'Autre',       icon: '📦' },
};

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  await loadProjects();
  buildFilters();
  renderGrid();
  initSearch();
  initModal();
  await loadLikes();
});

async function loadProjects() {
  try {
    const res = await fetch('./data/projects.json');
    projects = await res.json();
  } catch (e) {
    console.error('Failed to load projects', e);
    projects = [];
  }
}

async function loadLikes() {
  const client = getClient();
  if (!client) return;

  try {
    const sessionId = getSessionId();
    const [counts, userLikes] = await Promise.all([
      client.getLikeCounts(),
      client.getUserLikes(sessionId),
    ]);
    likeCounts = counts;
    likedByMe  = new Set(userLikes);
    // Re-render to show updated counts
    renderGrid();
  } catch (e) {
    console.warn('Could not load likes from Supabase:', e.message);
  }
}

// ---- Filters ----
function buildFilters() {
  const container = document.getElementById('filters');
  if (!container) return;

  const allCategories = new Set(projects.map(p => p.category));
  const orderedKeys = ['all', ...Object.keys(CATEGORIES).filter(k => k !== 'all' && allCategories.has(k))];

  container.innerHTML = '<span class="filters-label">Catégorie</span>';

  orderedKeys.forEach(key => {
    const cat = CATEGORIES[key];
    if (!cat) return;
    const count = key === 'all' ? projects.length : projects.filter(p => p.category === key).length;
    if (key !== 'all' && count === 0) return;

    const btn = document.createElement('button');
    btn.className = `filter-btn${key === activeCategory ? ' active' : ''}`;
    btn.dataset.cat = key;
    btn.innerHTML = `${cat.icon} ${cat.label} <span class="count">${count}</span>`;
    btn.addEventListener('click', () => setCategory(key));
    container.appendChild(btn);
  });
}

function setCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === cat);
  });
  renderGrid();
}

// ---- Search ----
function initSearch() {
  const input = document.getElementById('search');
  if (!input) return;
  input.addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderGrid();
  });
}

// ---- Render grid ----
function renderGrid() {
  const grid = document.getElementById('grid');
  if (!grid) return;

  const filtered = projects.filter(p => {
    const matchCat = activeCategory === 'all' || p.category === activeCategory;
    const matchSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery) ||
      p.description.toLowerCase().includes(searchQuery) ||
      (p.tags || []).some(t => t.toLowerCase().includes(searchQuery));
    return matchCat && matchSearch;
  });

  // Sort: featured first, then by name
  filtered.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured)  return  1;
    return a.name.localeCompare(b.name);
  });

  // Update section title
  const titleEl = document.getElementById('section-title');
  if (titleEl) {
    titleEl.innerHTML = `<span>${filtered.length}</span> application${filtered.length !== 1 ? 's' : ''}
      ${searchQuery ? ` pour &ldquo;${escHtml(searchQuery)}&rdquo;` : ''}
      ${activeCategory !== 'all' ? ` · ${CATEGORIES[activeCategory]?.label || activeCategory}` : ''}`;
  }

  // Update stats
  updateStats();

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <h3>Aucun projet trouvé</h3>
        <p>Essayez un autre terme de recherche ou une autre catégorie.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => cardHTML(p)).join('');

  // Attach like handlers
  grid.querySelectorAll('.like-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleLike(btn.dataset.id));
  });
}

function updateStats() {
  const totalLikes = Object.values(likeCounts).reduce((s, n) => s + n, 0);
  const statProjects = document.getElementById('stat-projects');
  const statLikes    = document.getElementById('stat-likes');
  const statCats     = document.getElementById('stat-cats');

  if (statProjects) statProjects.textContent = projects.length;
  if (statLikes)    statLikes.textContent    = totalLikes;
  if (statCats)     statCats.textContent     = new Set(projects.map(p => p.category)).size;
}

function cardHTML(p) {
  const count   = likeCounts[p.id] || 0;
  const liked   = likedByMe.has(p.id);
  const status  = p.status || 'live';
  const tags    = (p.tags || []).slice(0, 4).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

  const liveBtn  = p.url    ? `<a href="${escHtml(p.url)}"    target="_blank" rel="noopener" class="btn btn-primary">🚀 Voir l'app</a>` : '';
  const githubBtn= p.github ? `<a href="${escHtml(p.github)}" target="_blank" rel="noopener" class="btn btn-ghost">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.014-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.933.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
    GitHub</a>` : '';

  return `
  <article class="card${p.featured ? ' featured' : ''}" data-id="${p.id}">
    <div class="card-header">
      <div class="card-icon">${p.icon || '📦'}</div>
      <div class="card-title-wrap">
        <div class="card-name">${escHtml(p.name)}</div>
        <div class="card-category">
          ${CATEGORIES[p.category]?.icon || ''} ${CATEGORIES[p.category]?.label || p.category}
          &nbsp;·&nbsp;
          <span class="status-badge status-${status}">${statusLabel(status)}</span>
        </div>
      </div>
    </div>
    <p class="card-desc">${escHtml(p.description)}</p>
    ${tags ? `<div class="card-tags">${tags}</div>` : ''}
    <div class="card-footer">
      <div class="card-links">${liveBtn}${githubBtn}</div>
      <button class="like-btn${liked ? ' liked' : ''}" data-id="${p.id}" title="${liked ? 'Retirer mon like' : 'J\'aime ce projet'}">
        <span class="heart">${liked ? '❤️' : '🤍'}</span>
        <span class="like-count">${count}</span>
      </button>
    </div>
  </article>`;
}

function statusLabel(status) {
  return { live: '🟢 Live', beta: '🔵 Beta', wip: '🟡 WIP', archived: '⚫ Archivé' }[status] || status;
}

// ---- Likes ----
async function toggleLike(projectId) {
  const client = getClient();
  if (!client) {
    showToast('⚙️ Configure Supabase pour activer les likes', 'info');
    document.getElementById('supabase-modal').classList.add('open');
    return;
  }

  const sessionId = getSessionId();
  const wasLiked  = likedByMe.has(projectId);

  // Optimistic update
  if (wasLiked) {
    likedByMe.delete(projectId);
    likeCounts[projectId] = Math.max(0, (likeCounts[projectId] || 1) - 1);
  } else {
    likedByMe.add(projectId);
    likeCounts[projectId] = (likeCounts[projectId] || 0) + 1;
  }
  renderGrid();

  try {
    if (wasLiked) {
      await client.removeLike(projectId, sessionId);
    } else {
      await client.addLike(projectId, sessionId);
      showToast('❤️ Like enregistré !');
    }
  } catch (e) {
    // Revert
    if (wasLiked) {
      likedByMe.add(projectId);
      likeCounts[projectId] = (likeCounts[projectId] || 0) + 1;
    } else {
      likedByMe.delete(projectId);
      likeCounts[projectId] = Math.max(0, (likeCounts[projectId] || 1) - 1);
    }
    renderGrid();
    showToast('❌ Erreur : ' + e.message, 'error');
  }
}

// ---- Toast ----
function showToast(msg, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.borderColor = type === 'error' ? 'var(--red)' : 'var(--border)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---- Supabase config modal ----
function initModal() {
  const modal    = document.getElementById('supabase-modal');
  const openBtn  = document.getElementById('configure-btn');
  const closeBtn = document.getElementById('modal-close');
  const saveBtn  = document.getElementById('modal-save');
  const urlInput = document.getElementById('supabase-url');
  const keyInput = document.getElementById('supabase-key');

  if (!modal) return;

  // Pre-fill if already configured
  const existing = getSupabaseConfig();
  if (existing) {
    if (urlInput) urlInput.value = existing.url;
    if (keyInput) keyInput.value = existing.anonKey;
  }

  openBtn?.addEventListener('click', () => modal.classList.add('open'));
  closeBtn?.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  saveBtn?.addEventListener('click', async () => {
    const url = urlInput?.value.trim();
    const key = keyInput?.value.trim();
    if (!url || !key) { showToast('⚠️ Remplis les deux champs', 'error'); return; }
    saveSupabaseConfig(url, key);
    resetClient();
    modal.classList.remove('open');
    showToast('✅ Configuration Supabase sauvegardée');
    await loadLikes();
  });
}

// ---- Helpers ----
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
