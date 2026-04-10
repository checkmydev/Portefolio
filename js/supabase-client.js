/**
 * CheckMyDev — Supabase likes integration
 *
 * Schema: checkmydev
 * Table:  checkmydev.likes  (project_id TEXT, session_id TEXT, created_at TIMESTAMPTZ)
 *
 * SQL to create in Supabase SQL editor:
 * -------------------------------------------------------
 * CREATE SCHEMA IF NOT EXISTS checkmydev;
 *
 * CREATE TABLE checkmydev.likes (
 *   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   project_id TEXT NOT NULL,
 *   session_id TEXT NOT NULL,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 *
 * -- Unique constraint: one like per session per project
 * ALTER TABLE checkmydev.likes
 *   ADD CONSTRAINT likes_unique_session_project UNIQUE (project_id, session_id);
 *
 * -- Enable RLS and allow anonymous reads + inserts
 * ALTER TABLE checkmydev.likes ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Allow read likes"   ON checkmydev.likes FOR SELECT USING (true);
 * CREATE POLICY "Allow insert likes" ON checkmydev.likes FOR INSERT WITH CHECK (true);
 * CREATE POLICY "Allow delete likes" ON checkmydev.likes FOR DELETE USING (true);
 * -------------------------------------------------------
 */

const SUPABASE_CONFIG_KEY = 'checkmydev_supabase_config';

export function getSupabaseConfig() {
  try {
    const stored = localStorage.getItem(SUPABASE_CONFIG_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function saveSupabaseConfig(url, anonKey) {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey }));
}

/** Minimal Supabase REST client — no SDK needed */
class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url.replace(/\/$/, '');
    this.anonKey = anonKey;
  }

  async _req(method, path, body) {
    const res = await fetch(`${this.url}${path}`, {
      method,
      headers: {
        'apikey':        this.anonKey,
        'Authorization': `Bearer ${this.anonKey}`,
        'Content-Type':  'application/json',
        'Prefer':        method === 'POST' ? 'return=minimal' : '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 409) {
      const txt = await res.text();
      throw new Error(`Supabase ${method} ${path}: ${res.status} ${txt}`);
    }
    try { return await res.json(); } catch { return null; }
  }

  async getLikeCounts() {
    // Returns { [project_id]: count }
    const data = await this._req('GET', '/rest/v1/likes?select=project_id&schema=checkmydev');
    if (!data) return {};
    const counts = {};
    for (const row of data) {
      counts[row.project_id] = (counts[row.project_id] || 0) + 1;
    }
    return counts;
  }

  async getUserLikes(sessionId) {
    const data = await this._req(
      'GET',
      `/rest/v1/likes?select=project_id&session_id=eq.${encodeURIComponent(sessionId)}&schema=checkmydev`
    );
    return data ? data.map(r => r.project_id) : [];
  }

  async addLike(projectId, sessionId) {
    await this._req('POST', '/rest/v1/likes?schema=checkmydev', {
      project_id: projectId,
      session_id: sessionId,
    });
  }

  async removeLike(projectId, sessionId) {
    await this._req(
      'DELETE',
      `/rest/v1/likes?project_id=eq.${encodeURIComponent(projectId)}&session_id=eq.${encodeURIComponent(sessionId)}&schema=checkmydev`
    );
  }
}

let _client = null;

export function getClient() {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  if (!_client || _client.url !== cfg.url) {
    _client = new SupabaseClient(cfg.url, cfg.anonKey);
  }
  return _client;
}

export function resetClient() {
  _client = null;
}

/** Persistent session ID (anonymous user identifier) */
export function getSessionId() {
  let id = localStorage.getItem('checkmydev_session');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('checkmydev_session', id);
  }
  return id;
}
