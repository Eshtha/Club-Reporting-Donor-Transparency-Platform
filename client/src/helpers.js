// Shared helpers
const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function api(path, options = {}) {
    const r = await fetch(API + path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
}

export async function apiUpload(path, formData) {
    const r = await fetch(API + path, { credentials: 'include', method: 'POST', body: formData });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Upload failed');
    return data;
}

export const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(n || 0));
export const dateNow = () => new Date().toISOString().slice(0, 10);
export const yearNow = String(new Date().getFullYear());
export const shortDate = s => s ? String(s).slice(0, 10) : '—';

export function getHashParams() {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    return { view: params.get('view'), tab: params.get('tab'), token: params.get('token') };
}

export function setHashView(view, tab) {
    const p = new URLSearchParams();
    if (view) p.set('view', view);
    if (tab) p.set('tab', tab);
    window.history.replaceState(null, '', '#' + p.toString());
}
