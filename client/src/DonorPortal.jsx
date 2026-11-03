import React, { useEffect, useState } from 'react';
import {
    ArrowRight, HandCoins, ReceiptIndianRupee, Wallet, FileText, AlertCircle,
    LockKeyhole, ShieldCheck, ChartNoAxesCombined, Users, Key
} from 'lucide-react';
import { api, fmt, shortDate, yearNow, getHashParams } from './helpers';
import { PortalLayout, Stat, Empty } from './SharedComponents';

export default function Donor({ user, onLogout, notify, notifyErr }) {
    const [active, setActive] = useState(() => getHashParams().tab || 'statement');
    const [period, setPeriod] = useState(yearNow);
    const [data, setData] = useState(null);
    const [profile, setProfile] = useState(null);
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    const [profileForm, setProfileForm] = useState({ name: '', phone: '' });
    const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

    const loadStatement = () => { setBusy(true); api('/donor/statement?period=' + period).then(setData).catch(e => setErr(e.message)).finally(() => setBusy(false)); };
    const loadProfile = () => { api('/donor/profile').then(d => { setProfile(d.profile); setProfileForm({ name: d.profile.name, phone: d.profile.phone || '' }); }).catch(() => { }); };

    useEffect(() => { if (active === 'statement' || active === 'history') loadStatement(); if (active === 'profile') loadProfile(); }, [active, period]);

    const info = { statement: ['Your attribution statement', 'A proportional view of how your contribution maps to expenses.'], history: ['Donation history', 'All your recorded donations.'], profile: ['My profile', 'View and update your account.'] }[active] || ['', ''];

    return (
        <PortalLayout user={user} title={info[0]} subtitle={info[1]} active={active} setActive={setActive} onLogout={onLogout}>
            <div className="portal-toolbar">
                <span className="toolbar-note"><LockKeyhole size={15} /> This information is private to your account</span>
                {(active === 'statement' || active === 'history') && <label className="period-select">Reporting year <select value={period} onChange={e => setPeriod(e.target.value)}>{Array.from({ length: 7 }, (_, i) => String(Number(yearNow) - i)).map(y => <option key={y}>{y}</option>)}</select></label>}
            </div>
            {err && <div className="notice error"><AlertCircle size={17} />{err}</div>}
            {busy && <div className="thin-loading" />}

            {(active === 'statement' || active === 'history') && data && <>
                <div className="donor-welcome">
                    <div><span className="section-kicker">YOUR IMPACT, EXPLAINED</span><h2>Thank you for being part of <em>the possibility.</em></h2><p>Your statement shows a proportional representation based on the club's recorded donations and approved expenses for {period}.</p></div>
                    <div className="weight-badge"><span>YOUR CONTRIBUTION WEIGHT</span><strong>{(data.weight * 100).toFixed(2)}%</strong><small>of the recorded donation pool</small></div>
                </div>
                <div className="stat-grid donor-stat-grid">
                    <Stat label="Your contribution" value={fmt(data.donorTotal)} sub="For selected year" Icon={HandCoins} />
                    <Stat label="Attributed expenses" value={fmt(data.categories.reduce((s, c) => s + c.attributedAmount, 0))} sub="Proportional share" Icon={ReceiptIndianRupee} tone="gold" />
                    <Stat label="Remaining share" value={fmt(data.remaining)} sub="Proportional unspent pool" Icon={Wallet} tone="green" />
                    <Stat label="Reporting year" value={period} sub="Based on current ledger" Icon={FileText} tone="plum" />
                </div>

                {active === 'statement' && <div className="portal-two-col donor-panels">
                    <div className="panel">
                        <div className="panel-head"><div><h3>Category attribution</h3><p>Your proportional share of approved expenses</p></div><ChartNoAxesCombined /></div>
                        {data.categories.length ? <div className="category-list">{data.categories.map((c, i) => <div className="category-row" key={c.category}>
                            <div className="category-name"><span className={'category-swatch swatch' + i} /><b>{c.category}</b><small>{fmt(c.attributedAmount)}</small></div>
                            <div className="category-track"><span style={{ width: `${data.spent ? c.organizationAmount / data.spent * 100 : 0}%` }} /></div>
                            <small className="category-org">Org. {fmt(c.organizationAmount)}</small>
                        </div>)}</div> : <Empty>No approved expenses recorded for this period.</Empty>}
                        <p className="panel-footnote">Attributed amounts are calculated using your contribution weight against approved category spending.</p>
                    </div>
                    <div className="panel">
                        <div className="panel-head"><div><h3>How the numbers work</h3><p>Transparent calculation</p></div><ShieldCheck /></div>
                        <div className="formula-list">
                            <div><span>01</span><p><b>Your contribution</b><small>{fmt(data.donorTotal)} ÷ {fmt(data.totalPool)} total pool</small></p></div>
                            <div><span>02</span><p><b>Your weight</b><small>{(data.weight * 100).toFixed(2)}% of the pool</small></p></div>
                            <div><span>03</span><p><b>Category attribution</b><small>Your weight × each category's spending</small></p></div>
                            <div><span>04</span><p><b>Remaining share</b><small>Your weight × unspent pool</small></p></div>
                        </div>
                    </div>
                </div>}

                <div className="panel table-panel">
                    <div className="panel-head"><div><h3>{active === 'history' ? 'All your donations' : 'Your recorded contributions'}</h3><p>Only your entries are visible.</p></div><FileText /></div>
                    <div className="table-wrap"><table>
                        <thead><tr><th>Date received</th><th>Amount</th><th>Year</th><th>Reference</th></tr></thead>
                        <tbody>{data.contributions.map(c => <tr key={c.id}><td>{shortDate(c.received_on)}</td><td className="amount-cell">{fmt(c.amount)}</td><td>{c.period}</td><td>{c.reference || '—'}</td></tr>)}</tbody>
                    </table>{!data.contributions.length && <Empty>No contributions recorded for this year.</Empty>}</div>
                </div>
                <div className="notice"><AlertCircle size={18} /><p><b>How to read this:</b> this is a proportional attribution based on records entered by the club. It does not claim particular rupees were earmarked for an individual expense.</p></div>
            </>}

            {active === 'profile' && profile && <div className="portal-two-col">
                <div className="panel form-panel">
                    <div className="panel-head"><div><h3>Update profile</h3></div><Users /></div>
                    <form className="admin-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await api('/donor/profile', { method: 'PUT', body: JSON.stringify(profileForm) }); notify('Profile updated.'); loadProfile(); } catch (e) { setErr(e.message); } finally { setBusy(false); } }}>
                        <label>Full name<input required value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} /></label>
                        <label>Phone<input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} /></label>
                        <label>Email<input disabled value={profile.email} /><small>Contact admin to change email.</small></label>
                        {profile.donor_ref && <label>Donor reference<input disabled value={profile.donor_ref} /></label>}
                        {err && <div className="inline-error">{err}</div>}
                        <button className="btn btn-dark" disabled={busy}>Save profile <ArrowRight size={16} /></button>
                    </form>
                </div>
                <div className="panel form-panel">
                    <div className="panel-head"><div><h3>Change password</h3><p>Min. 12 characters.</p></div><Key /></div>
                    <form className="admin-form" onSubmit={async e => { e.preventDefault(); if (pwForm.newPassword !== pwForm.confirmPassword) { setErr('Passwords do not match.'); return; } setBusy(true); try { await api('/donor/password', { method: 'PUT', body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }) }); notify('Password changed.'); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); } catch (e) { setErr(e.message); } finally { setBusy(false); } }}>
                        <label>Current password<input required type="password" value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} /></label>
                        <label>New password<input required type="password" value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} /></label>
                        <label>Confirm<input required type="password" value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} /></label>
                        {err && <div className="inline-error">{err}</div>}
                        <button className="btn btn-dark" disabled={busy}>Change password <ArrowRight size={16} /></button>
                    </form>
                </div>
            </div>}
        </PortalLayout>
    );
}
