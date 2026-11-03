import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
    ArrowDownRight, ArrowRight, Eye, HeartHandshake, ShieldCheck, ChartNoAxesCombined,
    HandCoins, Menu, X, Instagram, Linkedin, ExternalLink,
    CheckCircle2, AlertCircle, Send, LockKeyhole, Heart,
    BookOpen, FileText
} from 'lucide-react';
import './styles.css';
import { api, fmt, getHashParams, setHashView } from './helpers';
import Admin from './AdminPortal';
import Donor from './DonorPortal';

// ── App shell ──────────────────────────────────────────────────────────────────
function App() {
    const [content, setContent] = useState({});
    const [transparency, setTransparency] = useState(null);
    const [user, setUser] = useState(null);
    const [view, setView] = useState('home');
    const [menu, setMenu] = useState(false);
    const [toast, setToast] = useState('');
    const [toastErr, setToastErr] = useState('');
    const [loading, setLoading] = useState(true);
    const [activationToken, setActivationToken] = useState(null);

    const notify = t => { setToast(t); setTimeout(() => setToast(''), 3500); };
    const notifyErr = t => { setToastErr(t); setTimeout(() => setToastErr(''), 4500); };

    const loadContent = async () => {
        try { const d = await api('/public/content'); setContent(d.content || {}); }
        catch (e) { notifyErr(e.message); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        // Check for activation token in hash
        const { view: hView, token } = getHashParams();
        if (token) { setActivationToken(token); setView('activate'); return; }
        loadContent();
        api('/public/transparency').then(setTransparency).catch(() => { });
        api('/auth/me').then(d => {
            setUser(d.user);
            const savedTab = getHashParams().tab;
            if (d.user.role === 'admin') setView('admin');
            else setView('donor');
        }).catch(() => { if (hView === 'login') setView('login'); });
    }, []);

    useEffect(() => {
        const obs = new IntersectionObserver(entries => entries.forEach(e => {
            if (e.isIntersecting) { e.target.classList.add('revealed'); obs.unobserve(e.target); }
        }), { threshold: .12 });
        document.querySelectorAll('.reveal:not(.revealed)').forEach(el => obs.observe(el));
        return () => obs.disconnect();
    }, [view, content, loading]);

    const signOut = async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch { }
        setUser(null); setView('home'); setHashView('home'); notify('You have signed out securely.');
    };

    const login = async (email, password) => {
        const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        setUser(d.user);
        const dest = d.user.role === 'admin' ? 'admin' : 'donor';
        setView(dest); setHashView(dest);
        notify(`Welcome back, ${d.user.name.split(' ')[0]}.`);
    };

    const saveContent = async (key, value) => {
        await api('/admin/content/' + key, { method: 'PUT', body: JSON.stringify({ value }) });
        await loadContent();
        notify('Public content updated successfully.');
    };

    const brand = content.brand || {};
    const go = v => { setView(v); setMenu(false); setHashView(v); window.scrollTo({ top: 0, behavior: 'smooth' }); };

    if (view === 'activate') return <PasswordSetup token={activationToken} onDone={() => { setActivationToken(null); go('login'); }} notify={notify} notifyErr={notifyErr} />;
    if (view === 'login') return <Login onLogin={login} onBack={() => go('home')} />;
    if (view === 'admin' && user?.role === 'admin') return <Admin user={user} onLogout={signOut} notify={notify} notifyErr={notifyErr} content={content} saveContent={saveContent} refreshContent={loadContent} />;
    if (view === 'donor' && user?.role === 'donor') return <Donor user={user} onLogout={signOut} notify={notify} notifyErr={notifyErr} />;

    // ── Public website ────────────────────────────────────────────────────────
    return (
        <div className="site">
            <header className="topbar">
                <a className="brand" href="#top" onClick={e => { e.preventDefault(); go('home'); }}>
                    <img src="/wwcb-logo.png" /><span><b>ROTARACT WWCB</b><small>WORLD WITHOUT CHILDHOOD BLINDNESS</small></span>
                </a>
                <button className="mobile-toggle" onClick={() => setMenu(!menu)} aria-label="Toggle navigation">{menu ? <X /> : <Menu />}</button>
                <nav className={menu ? 'nav open' : 'nav'}>
                    <a href="#mission" onClick={() => setMenu(false)}>Our mission</a>
                    <a href="#programmes" onClick={() => setMenu(false)}>Programmes</a>
                    <a href="#transparency" onClick={() => setMenu(false)}>Transparency</a>
                    <a href="#connect" onClick={() => setMenu(false)}>Get involved</a>
                    <button className="nav-login" onClick={() => go('login')}><LockKeyhole size={15} /> Portal login</button>
                </nav>
            </header>
            <main id="top">
                {/* Hero */}
                <section className="hero">
                    <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
                    <div className="hero-copy">
                        <div className="eyebrow"><span className="eyebrow-dot" /> A CLUB BUILT AROUND POSSIBILITY</div>
                        <h1>{brand.heroTitle || 'See beyond vision. See possibility.'}</h1>
                        <p>{brand.heroText || 'Working towards a world where every child has the opportunity to see, learn and thrive.'}</p>
                        <div className="hero-actions">
                            <a className="btn btn-light" href="#mission">Discover our mission <ArrowRight size={17} /></a>
                            <a className="text-link light-link" href="#transparency">Follow the impact <ArrowDownRight size={17} /></a>
                        </div>
                        <div className="hero-note"><span className="note-icon"><Eye size={19} /></span><span><b>Every contribution deserves transparency.</b><small>Our promise to every donor, volunteer and child.</small></span></div>
                    </div>
                    <div className="hero-art">
                        <div className="art-glow" /><div className="art-circle"><div className="art-inner"><Eye size={76} strokeWidth={1.15} /><span>SEE POSSIBILITY</span></div></div>
                        <div className="floating-card card-top"><span className="tiny-icon"><HeartHandshake size={17} /></span><span><b>Care with purpose</b><small>Community first</small></span></div>
                        <div className="floating-card card-bottom"><span className="pulse-dot" /><span><b>Trust, made visible</b><small>Transparent by design</small></span></div>
                        <div className="art-caption">A clearer view of a brighter future.</div>
                    </div>
                    <div className="hero-bottom"><span>01 / OUR PURPOSE</span><span>SCROLL TO EXPLORE ↓</span></div>
                </section>

                {/* Facts strip */}
                <section className="facts-strip">
                    <div className="facts-label"><span className="section-kicker">THE CAUSE, IN CONTEXT</span><p>Figures from partner-reported context. Not club-level impact totals.</p></div>
                    {(content.facts || defaultFacts).map(f => <div className="fact-item" key={f.label}><strong>{f.value}</strong><span>{f.label}</span><small>{f.note || ''}</small></div>)}
                </section>

                {/* Mission */}
                <section className="intro section-pad reveal" id="mission">
                    <div className="section-kicker">01 — WHY WE SHOW UP · {brand.district || 'ROTARACT DISTRICT 3011'}</div>
                    <div className="intro-grid">
                        <h2>{brand.vision || 'Because every child deserves to see a world full of possibility.'}</h2>
                        <div className="intro-copy">
                            <p><b>{brand.mission || 'Screen, treat, educate.'}</b> We raise awareness, offer education, and support medical camps for eye screening and treatment in underserved communities.</p>
                            <p><b>Motto: {brand.motto || 'Unite for Good'}.</b> Working with clubs, hospitals, schools and volunteers to create lasting impact.</p>
                            <a href="#programmes" className="text-link">Explore our programmes <ArrowRight size={17} /></a>
                        </div>
                    </div>
                    <div className="values-row">
                        <div><span>01</span><b>See the need</b><small>Listen to communities with care.</small></div>
                        <div><span>02</span><b>Show up together</b><small>Bring people and resources closer.</small></div>
                        <div><span>03</span><b>Make impact visible</b><small>Share progress with accountability.</small></div>
                    </div>
                </section>

                {/* Programmes */}
                <section className="program-section section-pad" id="programmes">
                    <div className="section-head reveal"><div><div className="section-kicker">02 — OUR WORK</div><h2>Small acts. <em>Lasting impact.</em></h2></div><p>Every programme is a promise to keep showing up, learning and doing better together.</p></div>
                    <div className="program-grid">
                        {(content.programmes || defaultProgrammes).map((p, i) => (
                            <article className={'program-card reveal p' + i} key={p.name}>
                                <div className="program-top"><span className="program-index">0{i + 1}</span><span className="program-icon">{i === 0 ? <Eye /> : i === 1 ? <Heart /> : i === 2 ? <HandCoins /> : <BookOpen />}</span></div>
                                <span className="tag">{p.category || 'COMMUNITY PROGRAMME'}</span>
                                <h3>{p.name}</h3><p>{p.description}</p>
                                <div className="program-foot"><span>{p.status || 'Our initiative'}</span><ArrowRight size={17} /></div>
                            </article>
                        ))}
                    </div>
                </section>

                {/* Transparency */}
                <section className="transparency section-pad" id="transparency">
                    <div className="transparency-copy reveal">
                        <div className="section-kicker light-kicker">03 — OPEN BY DESIGN</div>
                        <h2>Trust isn't a claim. It's a <em>practice.</em></h2>
                        <p>We believe generosity deserves clarity. Our reporting platform connects contributions, approved expenses and remaining funds in a way that's easier to understand.</p>
                        <div className="transparency-points">
                            <div><span><ChartNoAxesCombined /></span><div><b>Clear by category</b><small>Understand how recorded expenses are grouped.</small></div></div>
                            <div><span><ShieldCheck /></span><div><b>Accountable by design</b><small>Financial changes are logged for review.</small></div></div>
                            <div><span><FileText /></span><div><b>Personal, where it matters</b><small>Donors can access their own statements securely.</small></div></div>
                        </div>
                        <button className="btn btn-light" onClick={() => go('login')}>Access donor portal <ArrowRight size={17} /></button>
                    </div>
                    <div className="transparency-visual reveal">
                        <div className="report-card">
                            <div className="report-head"><span className="report-logo"><Eye size={18} /></span><div><b>Transparency overview</b><small>Reporting snapshot</small></div><span className="live-tag">● LIVE DATA</span></div>
                            <div className="report-total"><small>Total recorded contributions</small><strong>{transparency ? fmt(transparency.totalDonations) : 'Figures loading'}</strong><span>Approved expenses: {transparency ? fmt(transparency.totalExpenses) : '—'} · Remaining pool: {transparency ? fmt(transparency.remaining) : '—'}.</span></div>
                            <div className="report-chart"><div className="chart-head"><span>Funds at a glance</span><span>₹ INR</span></div><div className="chart-placeholder"><span className="chart-bar b1" /><span className="chart-bar b2" /><span className="chart-bar b3" /><span className="chart-bar b4" /><span className="chart-bar b5" /><span className="chart-bar b6" /><span className="chart-bar b7" /></div><div className="chart-legend"><span><i />Contributions</span><span><i />Approved expenses</span></div></div>
                            <div className="report-foot"><ShieldCheck size={16} /> Donor-level statements remain private.</div>
                        </div>
                        <div className="stamp">BUILT ON<br /><b>TRUST</b></div>
                    </div>
                </section>

                {/* Community */}
                <section className="community section-pad reveal">
                    <div className="community-mark"><HeartHandshake size={38} /></div>
                    <div>
                        <div className="section-kicker">04 — THE PEOPLE MAKE IT POSSIBLE</div>
                        <h2>Good work grows when <em>we grow together.</em></h2>
                        <p>{brand.partnersText || 'Together with our partners, we connect screening with care and treatment.'}</p>
                        <p className="partner-line">In partnership with <b>{(content.partnerships || defaultPartners).map(p => p.name).join(' · ')}</b></p>
                    </div>
                    <a href="#connect" className="round-link" aria-label="Get involved"><ArrowRight /></a>
                </section>

                {/* Connect */}
                <section className="connect section-pad" id="connect">
                    <div className="connect-left reveal">
                        <div className="section-kicker">05 — START A CONVERSATION</div>
                        <h2>There is room for <em>you here.</em></h2>
                        <p>Questions, ideas, feedback or a wish to collaborate? Tell us what brings you here.</p>
                        <div className="socials">
                            {brand.instagram && <a href={brand.instagram} target="_blank" rel="noreferrer"><Instagram size={17} /> Instagram <ExternalLink size={13} /></a>}
                            {brand.linkedin && <a href={brand.linkedin} target="_blank" rel="noreferrer"><Linkedin size={17} /> LinkedIn <ExternalLink size={13} /></a>}
                            {brand.x && <a href={brand.x} target="_blank" rel="noreferrer">𝕏 <span>Follow on X</span> <ExternalLink size={13} /></a>}
                        </div>
                        <small className="contact-email">{brand.email || 'Contact the club through its official social channels.'}</small>
                    </div>
                    <FeedbackForm notify={notify} />
                </section>
            </main>
            <footer className="footer">
                <div className="footer-main">
                    <a className="brand footer-brand" href="#top"><img src="/wwcb-logo.png" /><span><b>ROTARACT WWCB</b><small>WORLD WITHOUT CHILDHOOD BLINDNESS</small></span></a>
                    <p>{brand.tagline || 'Every Contribution Deserves Transparency'}</p>
                    <a href="#top" className="back-top">Back to top ↑</a>
                </div>
                <div className="footer-bottom">
                    <span>© {new Date().getFullYear()} Rotaract Club of World Without Childhood Blindness</span>
                    <span>Care. Clarity. Accountability.</span>
                    <button onClick={() => go('login')}><LockKeyhole size={13} /> Secure portal</button>
                </div>
            </footer>
            {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
            {toastErr && <div className="toast error-toast"><AlertCircle size={18} />{toastErr}</div>}
            {loading && <div className="loading-line" />}
        </div>
    );
}

// ── Default content ────────────────────────────────────────────────────────────
const defaultFacts = [{ value: '280,000+', label: 'Blind children in India', note: 'Partner-reported context' }, { value: '85%', label: 'Preventable or treatable', note: 'Childhood blindness estimate' }, { value: '$118B', label: 'Economic impact cited', note: 'Existing club website' }, { value: '50 yrs', label: 'Eye-care experience', note: 'Partner-reported history' }];
const defaultPartners = [{ name: 'Eye Foundation of America' }, { name: 'Goutami Eye Institute' }];
const defaultProgrammes = [{ name: 'Project Drishti', category: 'Eye health', description: 'Promoting awareness, early screening and access to eye-care support for children and communities.' }, { name: 'Project Choti Khushiyan', category: 'Community care', description: 'Creating thoughtful moments of care, dignity and joy for children.' }, { name: 'Ahaardaan', category: 'Community support', description: 'Supporting community wellbeing through food and essential-resource initiatives.' }, { name: 'Lexaid', category: 'Access & awareness', description: 'Connecting people with information, support and community resources.' }];

// ── Shared components ──────────────────────────────────────────────────────────
function FeedbackForm({ notify }) {
    const [form, setForm] = useState({ name: '', email: '', kind: 'feedback', message: '' });
    const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
    const submit = async e => {
        e.preventDefault(); setBusy(true); setErr('');
        try { const d = await api('/public/feedback', { method: 'POST', body: JSON.stringify(form) }); notify(d.message); setForm({ name: '', email: '', kind: 'feedback', message: '' }); }
        catch (e) { setErr(e.message); } finally { setBusy(false); }
    };
    return (
        <form className="feedback-form reveal" onSubmit={submit}>
            <div className="form-title"><span>LET'S CONNECT</span><b>Send us a note.</b></div>
            <div className="form-row">
                <label>Your name<input required minLength="2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" /></label>
                <label>Email address<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
            </div>
            <label>I'm reaching out about<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="feedback">General feedback</option><option value="complaint">A concern or complaint</option><option value="volunteer">Volunteering</option><option value="partnership">Partnership</option></select></label>
            <label>Your message<textarea required minLength="10" rows="4" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Tell us a little about it..." /></label>
            {err && <p className="inline-error">{err}</p>}
            <button className="btn btn-dark" disabled={busy}>{busy ? 'Sending…' : 'Send message'} <Send size={16} /></button>
            <small>Messages are shared with authorised club administrators for follow-up.</small>
        </form>
    );
}

function Login({ onLogin, onBack }) {
    const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
    const submit = async e => { e.preventDefault(); setBusy(true); setErr(''); try { await onLogin(email, password); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
    return (
        <div className="portal-shell login-shell">
            <button className="portal-back" onClick={onBack}>← Back to public website</button>
            <div className="login-grid">
                <div className="login-story">
                    <img src="/wwcb-logo.png" />
                    <div className="section-kicker light-kicker">ROTARACT WWCB · SECURE ACCESS</div>
                    <h1>Transparency, with the right people in the right place.</h1>
                    <p>Secure access for club administrators and registered donors. Every account sees only what its role allows.</p>
                    <div className="login-assurance"><ShieldCheck /><span><b>Privacy by design</b><small>Individual donor statements are never public.</small></span></div>
                </div>
                <form className="login-card" onSubmit={submit}>
                    <span className="login-eyebrow">WELCOME BACK</span>
                    <h2>Portal sign in</h2>
                    <p>Use the credentials provided by your club administrator.</p>
                    <label>Email address<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@organization.org" /></label>
                    <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" /></label>
                    {err && <div className="inline-error">{err}</div>}
                    <button className="btn btn-dark login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'} <ArrowRight size={17} /></button>
                    <div className="login-note"><LockKeyhole size={14} /> Protected by role-based access control</div>
                    <div className="login-help">Donor accounts are created by the club admin. Contact your administrator if you need access.</div>
                </form>
            </div>
            <p className="login-footer">{new Date().getFullYear()} · Rotaract Club of World Without Childhood Blindness</p>
        </div>
    );
}

function PasswordSetup({ token, onDone, notify, notifyErr }) {
    const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
    const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
    const submit = async e => {
        e.preventDefault(); if (password !== confirm) { setErr('Passwords do not match.'); return; }
        if (password.length < 12) { setErr('Password must be at least 12 characters.'); return; }
        setBusy(true); setErr('');
        try {
            const d = await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
            notify(d.message); setDone(true); setTimeout(onDone, 2000);
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };
    return (
        <div className="portal-shell login-shell">
            <div className="login-grid">
                <div className="login-story"><img src="/wwcb-logo.png" /><div className="section-kicker light-kicker">ROTARACT WWCB · ACCOUNT SETUP</div><h1>Set your password to activate your donor account.</h1><p>Choose a strong password of at least 12 characters. You can sign in immediately after.</p></div>
                <form className="login-card" onSubmit={submit}>
                    <span className="login-eyebrow">ACTIVATE YOUR ACCOUNT</span>
                    <h2>Set your password</h2>
                    {done ? <div className="notice"><CheckCircle2 size={18} /><p>Password set! Redirecting to sign in…</p></div> : <>
                        <label>New password (min. 12 characters)<input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Choose a strong password" /></label>
                        <label>Confirm password<input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" /></label>
                        {err && <div className="inline-error">{err}</div>}
                        <button className="btn btn-dark login-submit" disabled={busy}>{busy ? 'Setting password…' : 'Activate account'} <ArrowRight size={17} /></button>
                    </>}
                </form>
            </div>
        </div>
    );
}


createRoot(document.getElementById('root')).render(<App />);



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


function Stat({ label, value, sub, Icon, tone = 'rose' }) {
    return <div className="stat-card"><div className={'stat-icon ' + tone}><Icon size={19} /></div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
}
function Empty({ children }) { return <div className="empty-state"><span><FileText size={22} /></span><b>{children}</b></div>; }

function Modal({ title, onClose, children, wide }) {
    useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className={'modal-box' + (wide ? ' modal-wide' : '')}>
                <div className="modal-head"><h3>{title}</h3><button className="icon-button" onClick={onClose}><X size={18} /></button></div>
                <div className="modal-body">{children}</div>
            </div>
        </div>
    );
}

function Ledger({ rows, kind }) {
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

function CsvImport({ module, donors, onDone, notify, notifyErr }) {
    const [file, setFile] = useState(null); const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false); const [dragging, setDragging] = useState(false);
    const fileRef = useRef();

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

    const downloadTemplate = () => { window.open(API + `/admin/import/template/${module}`, '_blank'); };
    const downloadErrors = () => {
        if (!preview?.errors?.length) return;
        const csv = ['row,error,' + Object.keys(preview.errors[0]?.data || {}).join(','), ...preview.errors.map(e => `${e.row},"${e.error}",${Object.values(e.data || {}).join(',')}`)].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${module}_errors.csv`; a.click();
    };

    return (
        <div>
            <div className="csv-actions">
                <button className="table-action" onClick={downloadTemplate}><Download size={14} /> Download template</button>
            </div>
            <div className={'csv-dropzone' + (dragging ? ' dragging' : '')} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} onClick={() => fileRef.current.click()}>
                <Upload size={28} /><b>{file ? file.name : 'Drop a CSV file here or click to browse'}</b><small>Maximum 2,000 rows · UTF-8 CSV format</small>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={pickFile} />
            </div>
            {busy && <div className="thin-loading" />}
            {preview && (
                <div className="csv-preview">
                    <div className="csv-summary">
                        <span className="status-pill good">{preview.succeeded} valid</span>
                        {preview.failed > 0 && <span className="status-pill danger">{preview.failed} invalid</span>}
                        <span className="status-pill muted">{preview.total} total rows</span>
                    </div>
                    {preview.errors?.length > 0 && (
                        <div className="csv-errors">
                            <b>Validation issues:</b>
                            <div className="table-wrap"><table><thead><tr><th>Row</th><th>Error</th></tr></thead><tbody>{preview.errors.slice(0, 20).map(e => <tr key={e.row}><td>{e.row}</td><td>{e.error}</td></tr>)}</tbody></table></div>
                            {preview.errors.length > 20 && <small>{preview.errors.length - 20} more errors not shown.</small>}
                            <button className="table-action" onClick={downloadErrors}><Download size={14} /> Download error CSV</button>
                        </div>
                    )}
                    {preview.succeeded > 0 && (
                        <div className="editor-actions" style={{ marginTop: '1rem' }}>
                            <span>{preview.succeeded} rows will be imported. {preview.failed} will be skipped.</span>
                            <button className="btn btn-dark" onClick={doImport} disabled={busy}>Confirm import <ArrowRight size={16} /></button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
