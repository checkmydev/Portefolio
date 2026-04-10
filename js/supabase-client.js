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
 * ALTER TABLE checkmydev.likes
 *   ADD CONSTRAINT likes_unique_session_project UNIQUE (project_id, session_id);
 *
 * ALTER TABLE checkmydev.likes ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Allow read likes"   ON checkmydev.likes FOR SELECT USING (true);
 * CREATE POLICY "Allow insert likes" ON checkmydev.likes FOR INSERT WITH CHECK (true);
 * CREATE POLICY "Allow delete likes" ON checkmydev.likes FOR DELETE USING (true);
 * -------------------------------------------------------
 *
 * Credentials are injected at build time via GitHub Actions secrets:
 *   SUPABASE_URL      → Settings > Secrets > Actions
 *   SUPABASE_ANON_KEY → Settings > Secrets > Actions
 * They are substituted into js/config.js (gitignored) from js/config.template.js.
 */

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

/** Returns a configured client, or null if credentials are not injected. */
export function getClient() {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key || url.startsWith('$') || key.startsWith('$')) return null;
  if (!_client || _client.url !== url.replace(/\/$/, '')) {
    _client = new SupabaseClient(url, key);
  }
  return _client;
}

/** Persistent anonymous session ID stored in localStorage. */
export function getSessionId() {
  let id = localStorage.getItem('checkmydev_session');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('checkmydev_session', id);
  }
  return id;
}
