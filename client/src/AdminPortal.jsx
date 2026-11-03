import React, { useEffect, useState } from 'react';
import {
    ArrowRight, Users, HandCoins, ReceiptIndianRupee, Wallet, FileText, Settings, Plus, Tags,
    RefreshCw, CheckCircle2, AlertCircle, Globe, Activity, Edit2, Trash2, Mail, Upload,
    Image, CalendarDays, ShieldCheck, ChartNoAxesCombined, X, Eye as EyeIcon
} from 'lucide-react';
import { api, fmt, shortDate, dateNow, yearNow, getHashParams, setHashView } from './helpers';
import { PortalLayout, Stat, Empty, Modal, Ledger, CsvImport } from './SharedComponents';

export default function Admin({ user, onLogout, notify, notifyErr, content, saveContent, refreshContent }) {
    const [active, setActive] = useState(() => getHashParams().tab || 'overview');
    const [data, setData] = useState({});
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [period, setPeriod] = useState(yearNow);
    const [modal, setModal] = useState(null);
    const [showCsv, setShowCsv] = useState(false);
    const [donorForm, setDonorForm] = useState({ name: '', email: '', phone: '', donor_ref: '', sendActivation: true });
    const [donationForm, setDonationForm] = useState({ donorId: '', amount: '', receivedOn: dateNow(), reference: '', notes: '', period: yearNow });
    const [expenseForm, setExpenseForm] = useState({ category: 'Eye care', description: '', amount: '', spentOn: dateNow(), receiptUrl: '', period: yearNow, status: 'approved' });
    const [eventForm, setEventForm] = useState({ title: '', description: '', category: '', start_date: '', end_date: '', location: '', cover_image_url: '', registration_link: '', status: 'draft', featured: false });
    const [galleryForm, setGalleryForm] = useState({ image_url: '', album_title: '', caption: '', category: '' });
    const [contentKey, setContentKey] = useState('brand');
    const [contentText, setContentText] = useState('');

    const load = async () => {
        setBusy(true); setErr('');
        try {
            let d;
            if (active === 'overview') d = await api('/admin/overview?period=' + period);
            else if (active === 'donors') d = await api('/admin/donors');
            else if (active === 'donations') { const [l, dr] = await Promise.all([api('/admin/donations'), api('/admin/donors')]); d = { donations: l.donations || [], donors: dr.donors || [] }; }
            else if (active === 'expenses') { const [ex, dr] = await Promise.all([api('/admin/expenses'), api('/admin/donors')]); d = { expenses: ex.expenses || [], donors: dr.donors || [] }; }
            else if (active === 'events') d = await api('/admin/events');
            else if (active === 'gallery') d = await api('/admin/gallery');
            else if (active === 'content') d = await api('/admin/content');
            else if (active === 'feedback') d = await api('/admin/feedback');
            else if (active === 'audit') d = await api('/admin/audit');
            else if (active === 'imports') d = await api('/admin/import/history');
            setData(d || {});
            if (active === 'content') { const item = (d?.items || []).find(x => x.key === contentKey); setContentText(JSON.stringify(item?.value ?? content[contentKey] ?? {}, null, 2)); }
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };

    useEffect(() => { load(); }, [active, period]);
    useEffect(() => { if (active === 'content') setContentText(JSON.stringify(content[contentKey] ?? {}, null, 2)); }, [contentKey, content]);

    const act = async (fn, success) => { setBusy(true); setErr(''); try { await fn(); notify(success); await load(); if (active === 'content') await refreshContent(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

    const info = { overview: ['Your reporting at a glance', 'Contributions, spending and reconciliation.'], donors: ['Donor accounts', 'Create, edit and manage donors.'], donations: ['Donation ledger', 'Record and review contributions.'], expenses: ['Expense ledger', 'Track approved spending.'], events: ['Events', 'Manage public events.'], gallery: ['Photo gallery', 'Manage gallery images.'], content: ['Public website editor', 'Edit public website info.'], feedback: ['Community inbox', 'Review messages.'], audit: ['Activity log', 'Change history.'], imports: ['Import history', 'CSV import log.'] }[active] || ['', ''];
    const donors = data.donors || [];

    return (
        <PortalLayout user={user} title={info[0]} subtitle={info[1]} active={active} setActive={setActive} onLogout={onLogout}>
            <div className="portal-toolbar">
                <span className="toolbar-note"><span className="pulse-dot" /> Changes save to the central database</span>
                <div className="toolbar-actions">
                    {active === 'overview' && <label className="period-select">Reporting year <select value={period} onChange={e => setPeriod(e.target.value)}>{Array.from({ length: 7 }, (_, i) => String(Number(yearNow) - i)).map(y => <option key={y}>{y}</option>)}</select></label>}
                    {['donors', 'donations', 'expenses', 'events', 'gallery'].includes(active) && <button className="table-action" onClick={() => setShowCsv(true)}><Upload size={14} /> Import CSV</button>}
                    <button className="icon-button" onClick={load} title="Refresh"><RefreshCw size={16} /></button>
                </div>
            </div>
            {err && <div className="notice error"><AlertCircle size={17} />{err}</div>}
            {busy && <div className="thin-loading" />}
            {showCsv && <Modal title={`Import CSV · ${active}`} onClose={() => { setShowCsv(false); load(); }} wide><CsvImport module={active} onDone={() => { setShowCsv(false); load(); }} notify={notify} notifyErr={notifyErr} /></Modal>}
            {modal?.type === 'donor-edit' && <DonorEditModal donor={modal.payload} onClose={() => setModal(null)} onSave={async (id, body) => { await api(`/admin/donors/${id}`, { method: 'PUT', body: JSON.stringify(body) }); notify('Donor updated.'); setModal(null); load(); }} notifyErr={notifyErr} />}
            {modal?.type === 'donor-view' && <DonorViewModal donor={modal.payload} period={period} onClose={() => setModal(null)} />}
            {modal?.type === 'donor-delete' && <DeleteConfirmModal title="Remove donor" msg={`Remove "${modal.payload.name}"? Donors with transactions will be deactivated instead.`} onClose={() => setModal(null)} onConfirm={async () => { const d = await api(`/admin/donors/${modal.payload.id}`, { method: 'DELETE' }); notify(d.message); setModal(null); load(); }} notifyErr={notifyErr} />}
            {modal?.type === 'event-edit' && <EventEditModal event={modal.payload} onClose={() => setModal(null)} onSave={async (id, body) => { await api(`/admin/events/${id}`, { method: 'PUT', body: JSON.stringify(body) }); notify('Event updated.'); setModal(null); load(); }} notifyErr={notifyErr} />}

            {/* Overview */}
            {active === 'overview' && <>
                <div className="stat-grid">
                    <Stat label="Total contributions" value={fmt(data.donations)} sub={`${data.donationCount || 0} entries`} Icon={HandCoins} />
                    <Stat label="Approved expenses" value={fmt(data.expenses)} sub={`${data.expenseCount || 0} entries`} Icon={ReceiptIndianRupee} tone="gold" />
                    <Stat label="Remaining balance" value={fmt(data.remaining)} sub="Contributions less spend" Icon={Wallet} tone="green" />
                    <Stat label="Active donors" value={data.donors ?? '—'} sub={`${data.newFeedback || 0} messages · ${data.publishedEvents || 0} events`} Icon={Users} tone="plum" />
                </div>
                <div className="portal-two-col">
                    <div className="panel">
                        <div className="panel-head"><div><h3>Reconciliation check</h3><p>Funds vs expenses</p></div><ShieldCheck size={20} /></div>
                        <div className="recon-status"><span className={data.reconciles ? 'status-dot' : 'status-dot danger'} /><div><b>{data.reconciles ? 'Within recorded pool' : 'Expenses exceed contributions'}</b><small>{data.reconciles ? 'Approved expenses do not exceed donations.' : 'Review entries before publishing.'}</small></div></div>
                        <div className="recon-bar"><span style={{ width: `${data.donations > 0 ? Math.min(100, data.expenses / data.donations * 100) : 0}%` }} /></div>
                        <div className="recon-legend"><span>Expenses <b>{fmt(data.expenses)}</b></span><span>Contributions <b>{fmt(data.donations)}</b></span></div>
                    </div>
                    <div className="panel quick-panel">
                        <div className="panel-head"><div><h3>Quick actions</h3></div><Plus size={19} /></div>
                        <button onClick={() => setActive('donations')}><span className="quick-icon"><HandCoins /></span><span><b>Record a donation</b><small>Add a contribution</small></span><ArrowRight size={16} /></button>
                        <button onClick={() => setActive('expenses')}><span className="quick-icon"><ReceiptIndianRupee /></span><span><b>Add an expense</b><small>Log category and amount</small></span><ArrowRight size={16} /></button>
                        <button onClick={() => setActive('events')}><span className="quick-icon"><CalendarDays /></span><span><b>Manage events</b></span><ArrowRight size={16} /></button>
                        <button onClick={() => setActive('content')}><span className="quick-icon"><Globe /></span><span><b>Edit website</b></span><ArrowRight size={16} /></button>
                    </div>
                </div>
            </>}

            {/* Donors */}
            {active === 'donors' && <>
                <div className="panel form-panel">
                    <div className="panel-head"><div><h3>Create donor account</h3><p>An activation email will be sent.</p></div><Users /></div>
                    <form className="admin-form form-grid" onSubmit={e => { e.preventDefault(); act(() => api('/admin/donors', { method: 'POST', body: JSON.stringify(donorForm) }).then(() => setDonorForm({ name: '', email: '', phone: '', donor_ref: '', sendActivation: true })), 'Donor created.'); }}>
                        <label>Full name<input required minLength="2" value={donorForm.name} onChange={e => setDonorForm({ ...donorForm, name: e.target.value })} placeholder="Donor's full name" /></label>
                        <label>Email<input required type="email" value={donorForm.email} onChange={e => setDonorForm({ ...donorForm, email: e.target.value })} placeholder="donor@example.com" /></label>
                        <label>Phone<input value={donorForm.phone} onChange={e => setDonorForm({ ...donorForm, phone: e.target.value })} placeholder="Optional" /></label>
                        <label>Reference<input value={donorForm.donor_ref} onChange={e => setDonorForm({ ...donorForm, donor_ref: e.target.value })} placeholder="Optional ID" /></label>
                        <label className="checkbox-label"><input type="checkbox" checked={donorForm.sendActivation} onChange={e => setDonorForm({ ...donorForm, sendActivation: e.target.checked })} /> Send activation email</label>
                        <button className="btn btn-dark" disabled={busy}>Create donor <Plus size={16} /></button>
                    </form>
                </div>
                <div className="panel table-panel">
                    <div className="panel-head"><div><h3>Registered donors</h3><p>{donors.length} accounts</p></div></div>
                    <div className="table-wrap"><table>
                        <thead><tr><th>Donor</th><th>Ref</th><th>Contributions</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{donors.map(d => <tr key={d.id}>
                            <td><b>{d.name}</b><small>{d.email}{d.phone ? ' · ' + d.phone : ''}</small></td>
                            <td>{d.donor_ref || '—'}</td>
                            <td>{fmt(d.contributions)}<small>{d.donation_count} donations</small></td>
                            <td><span className={'status-pill ' + (d.active ? 'good' : 'muted')}>{d.active ? 'Active' : 'Disabled'}</span></td>
                            <td><div className="action-row">
                                <button className="table-action" onClick={() => setModal({ type: 'donor-view', payload: d })}><EyeIcon size={14} /></button>
                                <button className="table-action" onClick={() => setModal({ type: 'donor-edit', payload: d })}><Edit2 size={14} /></button>
                                <button className="table-action" onClick={() => act(() => api(`/admin/donors/${d.id}/status`, { method: 'PATCH', body: JSON.stringify({ active: !d.active }) }), d.active ? 'Disabled.' : 'Enabled.')}>{d.active ? 'Disable' : 'Enable'}</button>
                                <button className="table-action" onClick={() => act(() => api(`/admin/donors/${d.id}/send-credentials`, { method: 'POST' }), 'Email sent.')}><Mail size={14} /></button>
                                <button className="table-action danger" onClick={() => setModal({ type: 'donor-delete', payload: d })}><Trash2 size={14} /></button>
                            </div></td>
                        </tr>)}</tbody>
                    </table>{!donors.length && <Empty>No donors yet.</Empty>}</div>
                </div>
            </>}

            {/* Donations */}
            {active === 'donations' && <>
                <div className="panel form-panel">
                    <div className="panel-head"><div><h3>Record a contribution</h3></div><HandCoins /></div>
                    <form className="admin-form form-grid" onSubmit={e => { e.preventDefault(); act(() => api('/admin/donations', { method: 'POST', body: JSON.stringify(donationForm) }).then(() => setDonationForm({ ...donationForm, amount: '', reference: '', notes: '' })), 'Donation recorded.'); }}>
                        <label>Donor<select required value={donationForm.donorId} onChange={e => setDonationForm({ ...donationForm, donorId: e.target.value })}><option value="">Choose donor</option>{donors.map(d => <option value={d.id} key={d.id}>{d.name} · {d.email}</option>)}</select></label>
                        <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={donationForm.amount} onChange={e => setDonationForm({ ...donationForm, amount: e.target.value })} placeholder="1000.00" /></label>
                        <label>Received on<input required type="date" value={donationForm.receivedOn} onChange={e => setDonationForm({ ...donationForm, receivedOn: e.target.value })} /></label>
                        <label>Year<input required pattern="\d{4}" value={donationForm.period} onChange={e => setDonationForm({ ...donationForm, period: e.target.value })} /></label>
                        <label>Reference<input value={donationForm.reference} onChange={e => setDonationForm({ ...donationForm, reference: e.target.value })} placeholder="Optional" /></label>
                        <label>Note<input value={donationForm.notes} onChange={e => setDonationForm({ ...donationForm, notes: e.target.value })} placeholder="Optional" /></label>
                        <button className="btn btn-dark" disabled={busy}>Save <Plus size={16} /></button>
                    </form>
                </div>
                <div className="panel table-panel"><div className="panel-head"><div><h3>Donation ledger</h3></div></div><Ledger rows={data.donations || []} kind="donations" /></div>
            </>}

            {/* Expenses */}
            {active === 'expenses' && <>
                <div className="panel form-panel">
                    <div className="panel-head"><div><h3>Record an expense</h3><p>Only approved expenses count.</p></div><ReceiptIndianRupee /></div>
                    <form className="admin-form form-grid" onSubmit={e => { e.preventDefault(); act(() => api('/admin/expenses', { method: 'POST', body: JSON.stringify(expenseForm) }).then(() => setExpenseForm({ ...expenseForm, description: '', amount: '', receiptUrl: '' })), 'Expense recorded.'); }}>
                        <label>Category<input required value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} placeholder="Eye care, travel…" /></label>
                        <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></label>
                        <label className="wide-field">Description<input required value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} /></label>
                        <label>Spent on<input required type="date" value={expenseForm.spentOn} onChange={e => setExpenseForm({ ...expenseForm, spentOn: e.target.value })} /></label>
                        <label>Year<input required pattern="\d{4}" value={expenseForm.period} onChange={e => setExpenseForm({ ...expenseForm, period: e.target.value })} /></label>
                        <label>Receipt URL<input value={expenseForm.receiptUrl} onChange={e => setExpenseForm({ ...expenseForm, receiptUrl: e.target.value })} /></label>
                        <label>Status<select value={expenseForm.status} onChange={e => setExpenseForm({ ...expenseForm, status: e.target.value })}><option value="approved">Approved</option><option value="draft">Draft</option></select></label>
                        <button className="btn btn-dark" disabled={busy}>Save <Plus size={16} /></button>
                    </form>
                </div>
                <div className="panel table-panel"><div className="panel-head"><div><h3>Expense ledger</h3></div></div><Ledger rows={data.expenses || []} kind="expenses" /></div>
            </>}

            {/* Events */}
            {active === 'events' && <>
                <div className="panel form-panel">
                    <div className="panel-head"><div><h3>Create event</h3></div><CalendarDays /></div>
                    <form className="admin-form form-grid" onSubmit={e => { e.preventDefault(); act(() => api('/admin/events', { method: 'POST', body: JSON.stringify(eventForm) }).then(() => setEventForm({ title: '', description: '', category: '', start_date: '', end_date: '', location: '', cover_image_url: '', registration_link: '', status: 'draft', featured: false })), 'Event created.'); }}>
                        <label className="wide-field">Title<input required value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} /></label>
                        <label>Category<input value={eventForm.category} onChange={e => setEventForm({ ...eventForm, category: e.target.value })} /></label>
                        <label>Start<input type="date" value={eventForm.start_date} onChange={e => setEventForm({ ...eventForm, start_date: e.target.value })} /></label>
                        <label>End<input type="date" value={eventForm.end_date} onChange={e => setEventForm({ ...eventForm, end_date: e.target.value })} /></label>
                        <label>Location<input value={eventForm.location} onChange={e => setEventForm({ ...eventForm, location: e.target.value })} /></label>
                        <label>Status<select value={eventForm.status} onChange={e => setEventForm({ ...eventForm, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
                        <label className="wide-field">Cover image<input value={eventForm.cover_image_url} onChange={e => setEventForm({ ...eventForm, cover_image_url: e.target.value })} /></label>
                        <label className="wide-field">Description<textarea rows="2" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} /></label>
                        <label className="checkbox-label"><input type="checkbox" checked={eventForm.featured} onChange={e => setEventForm({ ...eventForm, featured: e.target.checked })} /> Featured</label>
                        <button className="btn btn-dark" disabled={busy}>Create <Plus size={16} /></button>
                    </form>
                </div>
                <div className="panel table-panel">
                    <div className="panel-head"><div><h3>Events</h3><p>{(data.events || []).length} total</p></div></div>
                    <div className="table-wrap"><table>
                        <thead><tr><th>Title</th><th>Category</th><th>Dates</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>{(data.events || []).map(ev => <tr key={ev.id}>
                            <td><b>{ev.title}</b>{ev.featured && <small> ★</small>}</td>
                            <td>{ev.category || '—'}</td>
                            <td><small>{shortDate(ev.start_date)}{ev.end_date ? ' → ' + shortDate(ev.end_date) : ''}</small></td>
                            <td><span className={'status-pill ' + (ev.status === 'published' ? 'good' : 'muted')}>{ev.status}</span></td>
                            <td><div className="action-row">
                                <button className="table-action" onClick={() => setModal({ type: 'event-edit', payload: ev })}><Edit2 size={14} /></button>
                                <button className="table-action" onClick={() => act(() => api(`/admin/events/${ev.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: ev.status === 'published' ? 'draft' : 'published' }) }), ev.status === 'published' ? 'Unpublished.' : 'Published.')}>{ev.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                                <button className="table-action danger" onClick={() => act(() => api(`/admin/events/${ev.id}`, { method: 'DELETE' }), 'Deleted.')}><Trash2 size={14} /></button>
                            </div></td>
                        </tr>)}</tbody>
                    </table>{!(data.events || []).length && <Empty>No events yet.</Empty>}</div>
                </div>
            </>}

            {/* Gallery */}
            {active === 'gallery' && <>
                <div className="panel form-panel">
                    <div className="panel-head"><div><h3>Add photo</h3></div><Image /></div>
                    <form className="admin-form form-grid" onSubmit={e => { e.preventDefault(); act(() => api('/admin/gallery', { method: 'POST', body: JSON.stringify(galleryForm) }).then(() => setGalleryForm({ image_url: '', album_title: '', caption: '', category: '' })), 'Photo added.'); }}>
                        <label className="wide-field">Image URL<input required value={galleryForm.image_url} onChange={e => setGalleryForm({ ...galleryForm, image_url: e.target.value })} placeholder="https://…" /></label>
                        <label>Album<input value={galleryForm.album_title} onChange={e => setGalleryForm({ ...galleryForm, album_title: e.target.value })} /></label>
                        <label>Category<input value={galleryForm.category} onChange={e => setGalleryForm({ ...galleryForm, category: e.target.value })} /></label>
                        <label className="wide-field">Caption<input value={galleryForm.caption} onChange={e => setGalleryForm({ ...galleryForm, caption: e.target.value })} /></label>
                        <button className="btn btn-dark" disabled={busy}>Add <Plus size={16} /></button>
                    </form>
                </div>
                <div className="panel">
                    <div className="panel-head"><div><h3>Gallery</h3><p>{(data.gallery || []).length} photos</p></div></div>
                    <div className="gallery-grid">{(data.gallery || []).map(g => <div key={g.id} className="gallery-item">
                        <img src={g.image_url} alt={g.caption || ''} onError={e => { e.target.style.display = 'none'; }} />
                        <div className="gallery-item-info"><b>{g.album_title || 'Untitled'}</b><small>{g.caption}</small></div>
                        <div className="gallery-item-actions">
                            <button className="table-action" onClick={() => act(() => api(`/admin/gallery/${g.id}`, { method: 'PATCH', body: JSON.stringify({ published: !g.published }) }), g.published ? 'Hidden.' : 'Shown.')}>{g.published ? 'Hide' : 'Show'}</button>
                            <button className="table-action danger" onClick={() => act(() => api(`/admin/gallery/${g.id}`, { method: 'DELETE' }), 'Removed.')}><Trash2 size={14} /></button>
                        </div>
                    </div>)}{!(data.gallery || []).length && <Empty>No photos yet.</Empty>}</div>
                </div>
            </>}

            {/* Content */}
            {active === 'content' && <div className="content-editor-layout">
                <div className="panel content-key-list">
                    <h3>Content sections</h3>
                    {['brand', 'facts', 'programmes', 'leadership', 'stories', 'partners', 'gallery', 'impact', 'partnerships'].map(k => <button key={k} className={contentKey === k ? 'selected' : ''} onClick={() => setContentKey(k)}><FileText size={16} /><span>{k}</span><ArrowRight size={15} /></button>)}
                    <div className="editor-tip"><ShieldCheck size={17} /><small>Changes are immediately reflected on the public website.</small></div>
                </div>
                <div className="panel content-editor">
                    <div className="panel-head"><div><h3>Edit: {contentKey}</h3><p>JSON editor</p></div><Settings /></div>
                    <textarea spellCheck="false" className="json-editor" value={contentText} onChange={e => setContentText(e.target.value)} />
                    <div className="editor-actions">
                        <span>Keep existing field structure.</span>
                        <button className="btn btn-dark" disabled={busy} onClick={() => { try { const v = JSON.parse(contentText); act(() => saveContent(contentKey, v), 'Content published.'); } catch { setErr('Invalid JSON.'); } }}>Save &amp; publish <ArrowRight size={16} /></button>
                    </div>
                </div>
            </div>}

            {/* Feedback */}
            {active === 'feedback' && <div className="panel table-panel">
                <div className="panel-head"><div><h3>Community messages</h3></div></div>
                <div className="feedback-list">{(data.feedback || []).map(f => <article key={f.id} className="feedback-item">
                    <div className="feedback-item-head"><div><span className="tag">{f.kind}</span><h4>{f.name}</h4><small>{f.email || '—'} · {new Date(f.created_at).toLocaleDateString('en-IN')}</small></div>
                        <select value={f.status} onChange={e => act(() => api(`/admin/feedback/${f.id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) }), 'Updated.')}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="archived">Archived</option></select></div>
                    <p>{f.message}</p>
                </article>)}{!data.feedback?.length && <Empty>No messages.</Empty>}</div>
            </div>}

            {/* Audit */}
            {active === 'audit' && <div className="panel table-panel">
                <div className="panel-head"><div><h3>Activity log</h3></div><Activity /></div>
                <div className="table-wrap"><table>
                    <thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>When</th></tr></thead>
                    <tbody>{(data.events || []).map(e => <tr key={e.id}><td><b>{e.action}</b></td><td>{e.entity_type} · {e.entity_id}</td><td>{e.actor_name || 'System'}</td><td>{new Date(e.created_at).toLocaleString('en-IN')}</td></tr>)}</tbody>
                </table>{!data.events?.length && <Empty>No activity.</Empty>}</div>
            </div>}

            {/* Imports */}
            {active === 'imports' && <div className="panel table-panel">
                <div className="panel-head"><div><h3>Import history</h3></div><Upload /></div>
                <div className="table-wrap"><table>
                    <thead><tr><th>Module</th><th>File</th><th>Admin</th><th>Records</th><th>Status</th><th>When</th></tr></thead>
                    <tbody>{(data.history || []).map(h => <tr key={h.id}><td>{h.module}</td><td><small>{h.filename}</small></td><td>{h.admin_name}</td><td><span className="status-pill good">{h.succeeded}</span>{h.failed > 0 && <span className="status-pill danger"> {h.failed} fail</span>}</td><td><span className={'status-pill ' + (h.status === 'complete' ? 'good' : 'muted')}>{h.status}</span></td><td><small>{new Date(h.created_at).toLocaleString('en-IN')}</small></td></tr>)}</tbody>
                </table>{!data.history?.length && <Empty>No imports.</Empty>}</div>
            </div>}
        </PortalLayout>
    );
}

// Sub-modals
function DonorEditModal({ donor, onClose, onSave, notifyErr }) {
    const [form, setForm] = useState({ name: donor.name, email: donor.email, phone: donor.phone || '', donor_ref: donor.donor_ref || '', active: donor.active });
    const [busy, setBusy] = useState(false);
    return <Modal title="Edit donor" onClose={onClose}><form className="admin-form form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onSave(donor.id, form); } catch (e) { notifyErr(e.message); } finally { setBusy(false); } }}>
        <label>Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label>Phone<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Reference<input value={form.donor_ref} onChange={e => setForm({ ...form, donor_ref: e.target.value })} /></label>
        <label>Status<select value={String(form.active)} onChange={e => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Disabled</option></select></label>
        <button className="btn btn-dark" disabled={busy}>Save <ArrowRight size={16} /></button>
    </form></Modal>;
}

function DonorViewModal({ donor, period, onClose }) {
    const [data, setData] = useState(null); const [busy, setBusy] = useState(true);
    useEffect(() => { api(`/admin/donors/${donor.id}/statement?period=${period}`).then(setData).catch(() => { }).finally(() => setBusy(false)); }, []);
    return <Modal title={`${donor.name} · Statement`} onClose={onClose} wide>
        {busy && <div className="thin-loading" />}
        {data && <><div className="stat-grid donor-stat-grid">
            <Stat label="Contributions" value={fmt(data.donorTotal)} sub={`${data.contributions?.length || 0} donations`} Icon={HandCoins} />
            <Stat label="Weight" value={(data.weight * 100).toFixed(2) + '%'} sub="Of pool" Icon={ChartNoAxesCombined} tone="gold" />
            <Stat label="Attributed" value={fmt(data.categories?.reduce((s, c) => s + c.attributedAmount, 0))} sub="Proportional" Icon={ReceiptIndianRupee} tone="plum" />
            <Stat label="Remaining" value={fmt(data.remaining)} sub="Unspent" Icon={Wallet} tone="green" />
        </div>
            <div className="table-wrap" style={{ marginTop: '1rem' }}><table>
                <thead><tr><th>Date</th><th>Amount</th><th>Period</th><th>Ref</th></tr></thead>
                <tbody>{(data.contributions || []).map(c => <tr key={c.id}><td>{shortDate(c.received_on)}</td><td className="amount-cell">{fmt(c.amount)}</td><td>{c.period}</td><td>{c.reference || '—'}</td></tr>)}</tbody>
            </table></div></>}
    </Modal>;
}

function DeleteConfirmModal({ title, msg, onClose, onConfirm, notifyErr }) {
    const [busy, setBusy] = useState(false);
    return <Modal title={title} onClose={onClose}><p>{msg}</p>
        <div className="editor-actions" style={{ marginTop: '1rem' }}>
            <button className="table-action" onClick={onClose}>Cancel</button>
            <button className="btn btn-dark" style={{ background: '#c0392b' }} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } catch (e) { notifyErr(e.message); } finally { setBusy(false); } }}>Confirm <Trash2 size={16} /></button>
        </div>
    </Modal>;
}

function EventEditModal({ event, onClose, onSave, notifyErr }) {
    const [form, setForm] = useState({ title: event.title, description: event.description || '', category: event.category || '', start_date: shortDate(event.start_date), end_date: shortDate(event.end_date), location: event.location || '', cover_image_url: event.cover_image_url || '', status: event.status, featured: event.featured });
    const [busy, setBusy] = useState(false);
    return <Modal title="Edit event" onClose={onClose} wide><form className="admin-form form-grid" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await onSave(event.id, form); } catch (e) { notifyErr(e.message); } finally { setBusy(false); } }}>
        <label className="wide-field">Title<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label>Category<input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></label>
        <label>Start<input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></label>
        <label>End<input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></label>
        <label>Location<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
        <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        <label className="wide-field">Cover image<input value={form.cover_image_url} onChange={e => setForm({ ...form, cover_image_url: e.target.value })} /></label>
        <label className="wide-field">Description<textarea rows="3" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Featured</label>
        <button className="btn btn-dark" disabled={busy}>Save <ArrowRight size={16} /></button>
    </form></Modal>;
}
