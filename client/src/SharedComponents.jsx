import React, { useEffect, useState, useRef } from 'react';
import {
    ArrowRight, HandCoins, ReceiptIndianRupee, Wallet, FileText, LogOut, Plus,
    RefreshCw, AlertCircle, Send, ShieldCheck, Activity, LockKeyhole, Upload,
    Image, CalendarDays, Users, Globe, Settings, Tags, Download, X, LayoutDashboard
} from 'lucide-react';
import { api, apiUpload, fmt, shortDate, yearNow, setHashView } from './helpers';

// ── Portal Layout ──────────────────────────────────────────────────────────────
export function PortalLayout({ user, title, subtitle, active, setActive, onLogout, children }) {
    const adminLinks = [['overview', 'Overview', LayoutDashboard], ['donations', 'Donations', HandCoins], ['expenses', 'Expenses', ReceiptIndianRupee], ['donors', 'Donors', Users], ['events', 'Events', CalendarDays], ['gallery', 'Gallery', Image], ['content', 'Website content', Globe], ['feedback', 'Inbox', Send], ['audit', 'Activity log', Activity], ['imports', 'Import history', Upload]];
    const donorLinks = [['statement', 'My statement', FileText], ['history', 'Donation history', HandCoins], ['profile', 'My profile', Users]];
    const links = user.role === 'admin' ? adminLinks : donorLinks;
    return (
        <div className="portal-app">
            <aside className="sidebar">
                <div className="sidebar-brand"><img src="/wwcb-logo.png" /><div><b>WWCB</b><small>TRANSPARENCY PORTAL</small></div></div>
                <div className="side-label">WORKSPACE</div>
                {links.map(([id, label, Icon]) => <button key={id} className={'side-link ' + (active === id ? 'active' : '')} onClick={() => { setActive(id); setHashView(user.role, id); }}><Icon size={17} />{label}</button>)}
                <div className="sidebar-spacer" />
                <div className="sidebar-user"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><b>{user.name}</b><small>{user.role === 'admin' ? 'Administrator' : 'Registered donor'}</small></div></div>
                <button className="side-link signout" onClick={onLogout}><LogOut size={17} /> Sign out</button>
                <div className="side-trust"><ShieldCheck size={15} /> Private &amp; access-controlled</div>
            </aside>
            <main className="portal-main">
                <header className="portal-header">
                    <div><div className="section-kicker">ROTARACT WWCB / {user.role.toUpperCase()}</div><h1>{title}</h1><p>{subtitle}</p></div>
                    <div className="portal-header-right"><span className="secure-pill"><span /> Secure session</span><span className="portal-date">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                </header>
                <div className="portal-content">{children}</div>
                <footer className="portal-footer">Every contribution deserves transparency. <span>WWCB · Secure reporting</span></footer>
            </main>
        </div>
    );
}

// ── Shared UI Components ───────────────────────────────────────────────────────
export function Stat({ label, value, sub, Icon, tone = 'rose' }) {
    return <div className="stat-card"><div className={'stat-icon ' + tone}><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}
export function Empty({ children }) { return <div className="empty-state"><span><FileText size={22} /></span><b>{children}</b></div>; }

export function Modal({ title, onClose, children, wide }) {
    useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; } }, []);
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className={'modal-box' + (wide ? ' modal-wide' : '')}>
                <div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
                <div className="modal-body">{children}</div>
            </div>
        </div>
    );
}

export function Ledger({ rows, kind }) {
    return (
        <div className="table-wrap">
            <table>
                <thead><tr>{kind === 'donations' ? <><th>Donor</th><th>Amount</th><th>Date</th><th>Year</th><th>Reference</th></> : <><th>Category / description</th><th>Amount</th><th>Date</th><th>Year</th><th>Status</th></>}</tr></thead>
                <tbody>{rows.map(r => <tr key={r.id}>{kind === 'donations'
                    ? <><td><b>{r.donor_name}</b><small>{r.donor_email}</small></td><td className="amount-cell">{fmt(r.amount)}</td><td>{shortDate(r.received_on)}</td><td>{r.period}</td><td>{r.reference || '—'}</td></>
                    : <><td><b>{r.category}</b><small>{r.description}</small></td><td className="amount-cell">{fmt(r.amount)}</td><td>{shortDate(r.spent_on)}</td><td>{r.period}</td><td><span className={'status-pill ' + (r.status === 'approved' ? 'good' : 'muted')}>{r.status}</span></td></>
                }</tr>)}</tbody>
            </table>
            {!rows.length && <Empty>No entries yet.</Empty>}
        </div>
    );
}

export function CsvImport({ module, onDone, notify, notifyErr }) {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef();
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

    const runPreview = async f => {
        setBusy(true);
        const fd = new FormData(); fd.append('file', f);
        try { const d = await apiUpload(`/admin/import/${module}?dryrun=true`, fd); setPreview(d); }
        catch (e) { notifyErr(e.message); } finally { setBusy(false); }
    };
    const pickFile = e => { const f = e.target.files[0]; if (f) { setFile(f); setPreview(null); runPreview(f); } };
    const drop = e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setPreview(null); runPreview(f); } };

    const doImport = async () => {
        if (!file) return; setBusy(true);
        const fd = new FormData(); fd.append('file', file);
        try { const d = await apiUpload(`/admin/import/${module}`, fd); notify(`Import complete: ${d.succeeded} succeeded, ${d.failed} failed.`); onDone(); }
        catch (e) { notifyErr(e.message); } finally { setBusy(false); }
    };

    return (
        <div>
            <div className="csv-actions"><button className="table-action" onClick={() => window.open(API_BASE + `/admin/import/template/${module}`, '_blank')}><Download size={14} /> Download template</button></div>
            <div className={'csv-dropzone' + (dragging ? ' dragging' : '')} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} onClick={() => fileRef.current.click()}>
                <Upload size={28} /><b>{file ? file.name : 'Drop a CSV file or click to browse'}</b><small>Max 2,000 rows · UTF-8 CSV</small>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={pickFile} />
            </div>
            {busy && <div className="thin-loading" />}
            {preview && <div className="csv-preview">
                <div className="csv-summary">
                    <span className="status-pill good">{preview.succeeded} valid</span>
                    {preview.failed > 0 && <span className="status-pill danger">{preview.failed} invalid</span>}
                    <span className="status-pill muted">{preview.total} total</span>
                </div>
                {preview.errors?.length > 0 && <div className="csv-errors"><b>Issues:</b>
                    <div className="table-wrap"><table><thead><tr><th>Row</th><th>Error</th></tr></thead><tbody>{preview.errors.slice(0, 20).map(e => <tr key={e.row}><td>{e.row}</td><td>{e.error}</td></tr>)}</tbody></table></div>
                    {preview.errors.length > 20 && <small>{preview.errors.length - 20} more not shown.</small>}
                </div>}
                {preview.succeeded > 0 && <div className="editor-actions" style={{ marginTop: '1rem' }}>
                    <span>{preview.succeeded} rows will be imported.</span>
                    <button className="btn btn-dark" onClick={doImport} disabled={busy}>Confirm import <ArrowRight size={16} /></button>
                </div>}
            </div>}
        </div>
    );
}
