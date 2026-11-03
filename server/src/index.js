import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { parse as csvParse } from 'csv-parse/sync';
import multer from 'multer';
import crypto from 'crypto';

const { Pool } = pg;
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error('JWT_SECRET must be at least 32 characters.'); process.exit(1); }

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

// ── SMTP / Email ──────────────────────────────────────────────────────────────
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    console.log('SMTP configured:', process.env.SMTP_HOST);
} else {
    console.warn('SMTP not configured. Email features will log to console only.');
}

async function sendMail({ to, subject, html }) {
    if (!mailer) { console.log(`[EMAIL - NO SMTP] To: ${to} | Subject: ${subject}`); return { simulated: true }; }
    try {
        const from = process.env.SMTP_FROM || `"Rotaract WWCB" <${process.env.SMTP_USER}>`;
        return await mailer.sendMail({ from, to, subject, html });
    } catch (e) { console.error('Email delivery failed:', e.message); throw new Error('Email could not be delivered. Check SMTP configuration. ' + e.message); }
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/admin/import', rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }));

// ── Helpers ───────────────────────────────────────────────────────────────────
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const money = n => Math.round(Number(n) * 100) / 100;

function auth(req, res, next) {
    const token = req.cookies.wwcb_session || req.get('authorization')?.replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { return res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
}
const only = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    next();
};
const audit = async (actor, action, type, id, metadata = {}) =>
    pool.query('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',
        [actor, action, type, String(id ?? ''), JSON.stringify(metadata)]);

// Token generation
function genToken() { return crypto.randomBytes(32).toString('hex'); }
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'wwcb-api' }));

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const { email, password } = parsed.data;
    const result = await pool.query('SELECT * FROM users WHERE email=$1 AND active=true AND deleted_at IS NULL', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid email or password.' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    res.cookie('wwcb_session', token, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000, path: '/' });
    res.json({ user: safeUser(user) });
}));

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('wwcb_session', { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/' });
    res.json({ ok: true });
});
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

// Password reset via token (public endpoint for donor to set their password)
app.post('/api/auth/reset-password', asyncRoute(async (req, res) => {
    const p = z.object({ token: z.string().min(32), password: z.string().min(12).max(128) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Token and a password of at least 12 characters are required.' });
    const hash = hashToken(p.data.token);
    const r = await pool.query('SELECT * FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW()', [hash]);
    if (!r.rowCount) return res.status(400).json({ error: 'This link is invalid or has expired. Request a new one.' });
    const tokenRow = r.rows[0];
    const newHash = await bcrypt.hash(p.data.password, 12);
    await pool.query('UPDATE users SET password_hash=$1, active=true WHERE id=$2', [newHash, tokenRow.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE id=$1', [tokenRow.id]);
    await audit(tokenRow.user_id, 'reset-password', 'user', tokenRow.user_id, {});
    res.json({ ok: true, message: 'Password updated. You can now sign in.' });
}));

// ── Public endpoints ──────────────────────────────────────────────────────────
app.get('/api/public/content', asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT key,value FROM site_content');
    res.json({ content: Object.fromEntries(r.rows.map(x => [x.key, x.value])) });
}));

app.post('/api/public/feedback', asyncRoute(async (req, res) => {
    const p = z.object({
        name: z.string().trim().min(2).max(120),
        email: z.union([z.string().email().max(200), z.literal('')]).optional(),
        kind: z.enum(['feedback', 'complaint', 'volunteer', 'partnership']),
        message: z.string().trim().min(10).max(3000)
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Please check the form. Messages must be at least 10 characters.' });
    const d = p.data;
    await pool.query('INSERT INTO feedback(name,email,kind,message) VALUES($1,$2,$3,$4)', [d.name, d.email || null, d.kind, d.message]);
    res.status(201).json({ ok: true, message: 'Thank you. Your message has been received.' });
}));

app.get('/api/public/transparency', asyncRoute(async (req, res) => {
    const period = String(req.query.period || new Date().getFullYear());
    if (!/^\d{4}$/.test(period)) return res.status(400).json({ error: 'Invalid reporting period' });
    const [d, e, c] = await Promise.all([
        pool.query('SELECT COALESCE(SUM(amount),0) total,COUNT(*) count FROM donations WHERE period=$1', [period]),
        pool.query("SELECT category,COALESCE(SUM(amount),0) amount FROM expenses WHERE period=$1 AND status='approved' GROUP BY category ORDER BY category", [period]),
        pool.query('SELECT value FROM site_content WHERE key=$1', ['impact'])
    ]);
    const total = Number(d.rows[0].total), spent = e.rows.reduce((s, r) => s + Number(r.amount), 0);
    res.json({ period, totalDonations: money(total), donationCount: Number(d.rows[0].count), totalExpenses: money(spent), remaining: money(total - spent), categories: e.rows.map(r => ({ category: r.category, amount: money(r.amount) })), impact: c.rows[0]?.value || {} });
}));

app.get('/api/public/events', asyncRoute(async (req, res) => {
    const r = await pool.query("SELECT id,title,description,category,start_date,end_date,location,cover_image_url,registration_link,featured FROM events WHERE status='published' ORDER BY start_date DESC LIMIT 50");
    res.json({ events: r.rows });
}));

app.get('/api/public/gallery', asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT id,album_title,image_url,caption,category FROM gallery WHERE published=true ORDER BY sort_order ASC,created_at DESC LIMIT 100');
    res.json({ gallery: r.rows });
}));

// ── Donor portal ──────────────────────────────────────────────────────────────
app.get('/api/donor/statement', auth, only('donor'), asyncRoute(async (req, res) => {
    const period = String(req.query.period || new Date().getFullYear());
    const donorId = req.user.id;
    const [donorRow, allExp, poolR, contribs, donorProfile] = await Promise.all([
        pool.query('SELECT COALESCE(SUM(amount),0) total FROM donations WHERE donor_id=$1 AND period=$2', [donorId, period]),
        pool.query("SELECT category,COALESCE(SUM(amount),0) amount FROM expenses WHERE period=$1 AND status='approved' GROUP BY category ORDER BY category", [period]),
        pool.query('SELECT COALESCE(SUM(amount),0) total FROM donations WHERE period=$1', [period]),
        pool.query('SELECT id,amount,received_on,reference,period,notes FROM donations WHERE donor_id=$1 AND period=$2 ORDER BY received_on DESC', [donorId, period]),
        pool.query('SELECT name,email,phone,donor_ref FROM users WHERE id=$1', [donorId])
    ]);
    const totalDonations = Number(poolR.rows[0].total), donorTotal = Number(donorRow.rows[0].total);
    const weight = totalDonations > 0 ? donorTotal / totalDonations : 0;
    const spent = allExp.rows.reduce((s, r) => s + Number(r.amount), 0);
    const remaining = Math.max(0, totalDonations - spent);
    res.json({
        period, donorTotal: money(donorTotal), totalPool: money(totalDonations), weight, spent: money(spent),
        remaining: money(weight * remaining), poolRemaining: money(remaining),
        donorName: donorProfile.rows[0]?.name, donorEmail: donorProfile.rows[0]?.email,
        donorRef: donorProfile.rows[0]?.donor_ref,
        categories: allExp.rows.map(r => ({ category: r.category, organizationAmount: money(r.amount), attributedAmount: money(Number(r.amount) * weight) })),
        contributions: contribs.rows
    });
}));

app.get('/api/donor/profile', auth, only('donor'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT id,name,email,phone,donor_ref,created_at FROM users WHERE id=$1', [req.user.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Profile not found.' });
    res.json({ profile: r.rows[0] });
}));

app.put('/api/donor/profile', auth, only('donor'), asyncRoute(async (req, res) => {
    const p = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().max(30).optional() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Name is required.' });
    const r = await pool.query('UPDATE users SET name=$1,phone=$2 WHERE id=$3 RETURNING id,name,email,phone,donor_ref', [p.data.name, p.data.phone || null, req.user.id]);
    await audit(req.user.id, 'update-profile', 'user', req.user.id, {});
    res.json({ profile: r.rows[0] });
}));

app.put('/api/donor/password', auth, only('donor'), asyncRoute(async (req, res) => {
    const p = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(128) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Current password and a new password of at least 12 characters are required.' });
    const r = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!r.rowCount || !(await bcrypt.compare(p.data.currentPassword, r.rows[0].password_hash))) return res.status(401).json({ error: 'Current password is incorrect.' });
    const newHash = await bcrypt.hash(p.data.newPassword, 12);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, req.user.id]);
    await audit(req.user.id, 'change-password', 'user', req.user.id, {});
    res.json({ ok: true, message: 'Password changed successfully.' });
}));

// ── Admin: Overview ───────────────────────────────────────────────────────────
app.get('/api/admin/overview', auth, only('admin'), asyncRoute(async (req, res) => {
    const period = String(req.query.period || new Date().getFullYear());
    const [donations, expenses, donors, feedback, events] = await Promise.all([
        pool.query('SELECT COALESCE(SUM(amount),0) total,COUNT(*) count FROM donations WHERE period=$1', [period]),
        pool.query("SELECT COALESCE(SUM(amount),0) total,COUNT(*) count FROM expenses WHERE period=$1 AND status='approved'", [period]),
        pool.query("SELECT COUNT(*) count FROM users WHERE role='donor' AND active=true AND deleted_at IS NULL"),
        pool.query("SELECT COUNT(*) count FROM feedback WHERE status='new'"),
        pool.query("SELECT COUNT(*) count FROM events WHERE status='published'")
    ]);
    const total = Number(donations.rows[0].total), spent = Number(expenses.rows[0].total);
    res.json({ period, donations: money(total), donationCount: Number(donations.rows[0].count), expenses: money(spent), expenseCount: Number(expenses.rows[0].count), remaining: money(total - spent), donors: Number(donors.rows[0].count), newFeedback: Number(feedback.rows[0].count), publishedEvents: Number(events.rows[0].count), reconciles: spent <= total });
}));

// ── Admin: Donors ─────────────────────────────────────────────────────────────
app.get('/api/admin/donors', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query("SELECT u.id,u.name,u.email,u.phone,u.donor_ref,u.active,u.created_at,u.deleted_at,COALESCE(SUM(d.amount),0) contributions,COUNT(d.id) donation_count FROM users u LEFT JOIN donations d ON d.donor_id=u.id WHERE u.role='donor' AND u.deleted_at IS NULL GROUP BY u.id ORDER BY u.created_at DESC");
    res.json({ donors: r.rows });
}));

app.get('/api/admin/donors/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const id = req.params.id;
    const [donor, donations] = await Promise.all([
        pool.query('SELECT id,name,email,phone,donor_ref,active,created_at FROM users WHERE id=$1 AND deleted_at IS NULL', [id]),
        pool.query('SELECT id,amount,received_on,reference,notes,period,created_at FROM donations WHERE donor_id=$1 ORDER BY received_on DESC', [id])
    ]);
    if (!donor.rowCount) return res.status(404).json({ error: 'Donor not found.' });
    res.json({ donor: donor.rows[0], donations: donations.rows });
}));

app.post('/api/admin/donors', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().email().max(200),
        phone: z.string().max(30).optional(),
        donor_ref: z.string().max(100).optional(),
        sendActivation: z.boolean().optional().default(true)
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Name and a valid email are required.' });
    const { name, email, phone, donor_ref, sendActivation } = p.data;
    // Create donor account without a usable password; activation sets it
    const tempHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    let donorRow;
    try {
        const r = await pool.query(
            "INSERT INTO users(name,email,password_hash,role,active,phone,donor_ref) VALUES($1,$2,$3,'donor',false,$4,$5) RETURNING id,name,email,role,active,created_at",
            [name, email.toLowerCase(), tempHash, phone || null, donor_ref || null]
        );
        donorRow = r.rows[0];
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
        throw e;
    }
    await audit(req.user.id, 'create', 'donor', donorRow.id, { email: donorRow.email });
    let emailResult = null;
    if (sendActivation) {
        const token = genToken();
        await pool.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL\'72 hours\')', [donorRow.id, hashToken(token)]);
        const link = `${APP_BASE_URL}/#activate?token=${token}`;
        try {
            emailResult = await sendMail({
                to: email,
                subject: 'Your Rotaract WWCB Donor Portal Access',
                html: `<p>Dear ${name},</p><p>Your donor account has been created on the Rotaract WWCB Transparency Platform. Please click the link below to set your password and activate your account:</p><p><a href="${link}">${link}</a></p><p>This link expires in 72 hours. If you did not expect this email, please contact us.</p><p>Rotaract Club of World Without Childhood Blindness</p>`
            });
            await pool.query('UPDATE users SET active=true WHERE id=$1', [donorRow.id]);
        } catch (mailErr) {
            return res.status(201).json({ donor: donorRow, emailError: mailErr.message, activationToken: token });
        }
    }
    res.status(201).json({ donor: donorRow, emailSent: sendActivation && !emailResult?.simulated, emailSimulated: emailResult?.simulated });
}));

app.put('/api/admin/donors/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().email().max(200),
        phone: z.string().max(30).optional(),
        donor_ref: z.string().max(100).optional(),
        active: z.boolean().optional()
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Name and valid email are required.' });
    const { name, email, phone, donor_ref, active } = p.data;
    // Check duplicate email (exclude self)
    const dup = await pool.query('SELECT id FROM users WHERE email=$1 AND id<>$2', [email.toLowerCase(), req.params.id]);
    if (dup.rowCount) return res.status(409).json({ error: 'That email is already in use by another account.' });
    const r = await pool.query(
        "UPDATE users SET name=$1,email=$2,phone=$3,donor_ref=$4,active=COALESCE($5,active) WHERE id=$6 AND role='donor' AND deleted_at IS NULL RETURNING id,name,email,phone,donor_ref,active",
        [name, email.toLowerCase(), phone || null, donor_ref || null, active ?? null, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Donor not found.' });
    await audit(req.user.id, 'update', 'donor', req.params.id, { name, email });
    res.json({ donor: r.rows[0] });
}));

app.patch('/api/admin/donors/:id/status', auth, only('admin'), asyncRoute(async (req, res) => {
    const active = z.boolean().safeParse(req.body.active);
    if (!active.success) return res.status(400).json({ error: 'active must be true or false' });
    const r = await pool.query("UPDATE users SET active=$1 WHERE id=$2 AND role='donor' AND deleted_at IS NULL RETURNING id,name,email,active", [active.data, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Donor not found' });
    await audit(req.user.id, 'change-status', 'donor', req.params.id, { active: active.data });
    res.json({ donor: r.rows[0] });
}));

app.delete('/api/admin/donors/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const donorCheck = await pool.query("SELECT id FROM users WHERE id=$1 AND role='donor' AND deleted_at IS NULL", [req.params.id]);
    if (!donorCheck.rowCount) return res.status(404).json({ error: 'Donor not found.' });
    const txCheck = await pool.query('SELECT COUNT(*) count FROM donations WHERE donor_id=$1', [req.params.id]);
    if (Number(txCheck.rows[0].count) > 0) {
        // Soft delete — has transactions, cannot hard delete
        await pool.query("UPDATE users SET active=false,deleted_at=NOW() WHERE id=$1", [req.params.id]);
        await audit(req.user.id, 'soft-delete', 'donor', req.params.id, { reason: 'has-transactions' });
        return res.json({ ok: true, mode: 'deactivated', message: 'This donor has associated transactions. The account has been deactivated and hidden rather than permanently deleted to preserve financial records.' });
    }
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    await audit(req.user.id, 'delete', 'donor', req.params.id, {});
    res.json({ ok: true, mode: 'deleted', message: 'Donor account permanently deleted.' });
}));

app.post('/api/admin/donors/:id/send-credentials', auth, only('admin'), asyncRoute(async (req, res) => {
    const donor = await pool.query("SELECT id,name,email FROM users WHERE id=$1 AND role='donor' AND deleted_at IS NULL", [req.params.id]);
    if (!donor.rowCount) return res.status(404).json({ error: 'Donor not found.' });
    const { id, name, email } = donor.rows[0];
    // Invalidate old tokens
    await pool.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL', [id]);
    const token = genToken();
    await pool.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL\'72 hours\')', [id, hashToken(token)]);
    const link = `${APP_BASE_URL}/#activate?token=${token}`;
    try {
        const result = await sendMail({
            to: email, subject: 'Your Rotaract WWCB Portal Access Link',
            html: `<p>Dear ${name},</p><p>An administrator has sent you a secure link to access the Rotaract WWCB Donor Transparency Portal.</p><p><a href="${link}">Set your password and sign in</a></p><p>This link expires in 72 hours. Email: ${email}</p><p>Rotaract Club of World Without Childhood Blindness</p>`
        });
        await audit(req.user.id, 'send-credentials', 'donor', id, { email });
        res.json({ ok: true, emailSent: !result?.simulated, emailSimulated: result?.simulated, activationLink: result?.simulated ? link : undefined });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}));

app.get('/api/admin/donors/:id/statement', auth, only('admin'), asyncRoute(async (req, res) => {
    const period = String(req.query.period || new Date().getFullYear());
    const donorId = req.params.id;
    const [donor, donorRow, allExp, poolR, contribs] = await Promise.all([
        pool.query('SELECT id,name,email,phone,donor_ref FROM users WHERE id=$1 AND deleted_at IS NULL', [donorId]),
        pool.query('SELECT COALESCE(SUM(amount),0) total FROM donations WHERE donor_id=$1 AND period=$2', [donorId, period]),
        pool.query("SELECT category,COALESCE(SUM(amount),0) amount FROM expenses WHERE period=$1 AND status='approved' GROUP BY category ORDER BY category", [period]),
        pool.query('SELECT COALESCE(SUM(amount),0) total FROM donations WHERE period=$1', [period]),
        pool.query('SELECT id,amount,received_on,reference,period FROM donations WHERE donor_id=$1 AND period=$2 ORDER BY received_on DESC', [donorId, period])
    ]);
    if (!donor.rowCount) return res.status(404).json({ error: 'Donor not found.' });
    const totalDonations = Number(poolR.rows[0].total), donorTotal = Number(donorRow.rows[0].total);
    const weight = totalDonations > 0 ? donorTotal / totalDonations : 0;
    const spent = allExp.rows.reduce((s, r) => s + Number(r.amount), 0);
    const remaining = Math.max(0, totalDonations - spent);
    res.json({ donor: donor.rows[0], period, donorTotal: money(donorTotal), totalPool: money(totalDonations), weight, spent: money(spent), remaining: money(weight * remaining), categories: allExp.rows.map(r => ({ category: r.category, organizationAmount: money(r.amount), attributedAmount: money(Number(r.amount) * weight) })), contributions: contribs.rows });
}));

// ── Admin: Donations ──────────────────────────────────────────────────────────
app.get('/api/admin/donations', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT d.*,u.name donor_name,u.email donor_email FROM donations d JOIN users u ON u.id=d.donor_id ORDER BY d.received_on DESC,d.id DESC');
    res.json({ donations: r.rows });
}));

app.post('/api/admin/donations', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        donorId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive().max(1000000000),
        receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reference: z.string().max(200).optional(),
        notes: z.string().max(1000).optional(),
        period: z.string().regex(/^\d{4}$/)
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Check donor, amount, date and four-digit reporting period.' });
    const donor = await pool.query("SELECT id FROM users WHERE id=$1 AND role='donor' AND active=true AND deleted_at IS NULL", [p.data.donorId]);
    if (!donor.rowCount) return res.status(400).json({ error: 'Select an active donor account.' });
    const d = p.data;
    const r = await pool.query('INSERT INTO donations(donor_id,amount,received_on,reference,notes,period,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [d.donorId, money(d.amount), d.receivedOn, d.reference || null, d.notes || null, d.period, req.user.id]);
    await audit(req.user.id, 'create', 'donation', r.rows[0].id, { amount: r.rows[0].amount, period: d.period });
    res.status(201).json({ donation: r.rows[0] });
}));

app.delete('/api/admin/donations/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('DELETE FROM donations WHERE id=$1 RETURNING id,amount,donor_id,period', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Donation not found.' });
    await pool.query('DELETE FROM donor_allocations WHERE donation_id=$1', [req.params.id]);
    await audit(req.user.id, 'delete', 'donation', req.params.id, { amount: r.rows[0].amount });
    res.json({ ok: true });
}));

// ── Admin: Expenses ───────────────────────────────────────────────────────────
app.get('/api/admin/expenses', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT * FROM expenses ORDER BY spent_on DESC,id DESC');
    res.json({ expenses: r.rows });
}));

app.post('/api/admin/expenses', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        category: z.string().trim().min(2).max(100),
        description: z.string().trim().min(3).max(300),
        amount: z.coerce.number().positive().max(1000000000),
        spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        receiptUrl: z.string().max(1000).optional(),
        period: z.string().regex(/^\d{4}$/),
        status: z.enum(['draft', 'approved']).default('approved')
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Check category, description, amount, date and reporting period.' });
    const d = p.data;
    const r = await pool.query('INSERT INTO expenses(category,description,amount,spent_on,receipt_url,period,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [d.category, d.description, money(d.amount), d.spentOn, d.receiptUrl || null, d.period, d.status, req.user.id]);
    await audit(req.user.id, 'create', 'expense', r.rows[0].id, { amount: r.rows[0].amount, period: d.period, status: d.status });
    res.status(201).json({ expense: r.rows[0] });
}));

app.patch('/api/admin/expenses/:id/status', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.enum(['draft', 'approved', 'void']).safeParse(req.body.status);
    if (!p.success) return res.status(400).json({ error: 'status must be draft, approved or void.' });
    const r = await pool.query('UPDATE expenses SET status=$1 WHERE id=$2 RETURNING *', [p.data, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Expense not found.' });
    await audit(req.user.id, 'update-status', 'expense', req.params.id, { status: p.data });
    res.json({ expense: r.rows[0] });
}));

// ── Admin: Donor Allocations ──────────────────────────────────────────────────
app.get('/api/admin/expenses/:id/allocations', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT da.*,u.name donor_name,u.email donor_email FROM donor_allocations da JOIN users u ON u.id=da.donor_id WHERE da.expense_id=$1 ORDER BY da.created_at DESC', [req.params.id]);
    res.json({ allocations: r.rows });
}));

app.post('/api/admin/expenses/:id/allocations', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        donorId: z.coerce.number().int().positive(),
        donationId: z.coerce.number().int().positive().optional(),
        allocatedAmount: z.coerce.number().positive().max(1000000000),
        notes: z.string().max(500).optional(),
        period: z.string().regex(/^\d{4}$/)
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Check donor, amount, and reporting period.' });
    const { donorId, donationId, allocatedAmount, notes, period } = p.data;
    // Check donor balance
    const balanceRow = await pool.query(
        'SELECT COALESCE(SUM(don.amount),0)-(SELECT COALESCE(SUM(da.allocated_amount),0) FROM donor_allocations da WHERE da.donor_id=$1 AND da.period=$2) available FROM donations don WHERE don.donor_id=$1 AND don.period=$2',
        [donorId, period]
    );
    const available = Number(balanceRow.rows[0].available);
    if (allocatedAmount > available) return res.status(400).json({ error: `Allocated amount exceeds available donor balance of ${available.toFixed(2)}.` });
    const r = await pool.query('INSERT INTO donor_allocations(donor_id,donation_id,expense_id,allocated_amount,notes,period,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [donorId, donationId || null, req.params.id, money(allocatedAmount), notes || null, period, req.user.id]);
    await audit(req.user.id, 'create', 'donor_allocation', r.rows[0].id, { donorId, expenseId: req.params.id, amount: allocatedAmount });
    res.status(201).json({ allocation: r.rows[0] });
}));

app.get('/api/admin/donors/:id/balance', auth, only('admin'), asyncRoute(async (req, res) => {
    const period = String(req.query.period || new Date().getFullYear());
    const r = await pool.query(
        'SELECT COALESCE(SUM(don.amount),0) donated,(SELECT COALESCE(SUM(da.allocated_amount),0) FROM donor_allocations da WHERE da.donor_id=$1 AND da.period=$2) allocated FROM donations don WHERE don.donor_id=$1 AND don.period=$2',
        [req.params.id, period]
    );
    const donated = Number(r.rows[0].donated), allocated = Number(r.rows[0].allocated);
    res.json({ period, donated: money(donated), allocated: money(allocated), available: money(donated - allocated) });
}));

// ── Admin: Content ────────────────────────────────────────────────────────────
app.get('/api/admin/content', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT key,value,updated_at FROM site_content ORDER BY key');
    res.json({ items: r.rows });
}));

app.put('/api/admin/content/:key', auth, only('admin'), asyncRoute(async (req, res) => {
    const key = String(req.params.key);
    if (!/^[a-z][a-z0-9_-]{1,60}$/.test(key)) return res.status(400).json({ error: 'Invalid content key' });
    const value = req.body?.value;
    if (value === undefined) return res.status(400).json({ error: 'value is required' });
    const r = await pool.query('INSERT INTO site_content(key,value,updated_by,updated_at) VALUES($1,$2::jsonb,$3,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING key,value,updated_at', [key, JSON.stringify(value), req.user.id]);
    await audit(req.user.id, 'update', 'site_content', key, {});
    res.json({ item: r.rows[0] });
}));

// ── Admin: Events ─────────────────────────────────────────────────────────────
app.get('/api/admin/events', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT * FROM events ORDER BY created_at DESC');
    res.json({ events: r.rows });
}));

app.post('/api/admin/events', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        title: z.string().trim().min(2).max(200),
        description: z.string().max(3000).optional(),
        category: z.string().max(100).optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        location: z.string().max(300).optional(),
        cover_image_url: z.string().url().max(2000).optional().or(z.literal('')),
        registration_link: z.string().url().max(2000).optional().or(z.literal('')),
        status: z.enum(['draft', 'published', 'archived']).default('draft'),
        featured: z.boolean().optional().default(false)
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Event title is required.' });
    const d = p.data;
    const r = await pool.query('INSERT INTO events(title,description,category,start_date,end_date,location,cover_image_url,registration_link,status,featured,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [d.title, d.description || null, d.category || null, d.start_date || null, d.end_date || null, d.location || null, d.cover_image_url || null, d.registration_link || null, d.status, d.featured, req.user.id]);
    await audit(req.user.id, 'create', 'event', r.rows[0].id, { title: d.title });
    res.status(201).json({ event: r.rows[0] });
}));

app.get('/api/admin/events/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT * FROM events WHERE id=$1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Event not found.' });
    res.json({ event: r.rows[0] });
}));

app.put('/api/admin/events/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        title: z.string().trim().min(2).max(200),
        description: z.string().max(3000).optional(),
        category: z.string().max(100).optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        location: z.string().max(300).optional(),
        cover_image_url: z.string().max(2000).optional().or(z.literal('')),
        registration_link: z.string().max(2000).optional().or(z.literal('')),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        featured: z.boolean().optional()
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Event title is required.' });
    const d = p.data;
    const r = await pool.query('UPDATE events SET title=$1,description=$2,category=$3,start_date=$4,end_date=$5,location=$6,cover_image_url=$7,registration_link=$8,status=COALESCE($9,status),featured=COALESCE($10,featured),updated_at=NOW() WHERE id=$11 RETURNING *', [d.title, d.description || null, d.category || null, d.start_date || null, d.end_date || null, d.location || null, d.cover_image_url || null, d.registration_link || null, d.status || null, d.featured ?? null, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Event not found.' });
    await audit(req.user.id, 'update', 'event', req.params.id, { title: d.title });
    res.json({ event: r.rows[0] });
}));

app.patch('/api/admin/events/:id/status', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.enum(['draft', 'published', 'archived']).safeParse(req.body.status);
    if (!p.success) return res.status(400).json({ error: 'status must be draft, published or archived.' });
    const r = await pool.query('UPDATE events SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [p.data, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Event not found.' });
    await audit(req.user.id, 'update-status', 'event', req.params.id, { status: p.data });
    res.json({ event: r.rows[0] });
}));

app.delete('/api/admin/events/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('DELETE FROM events WHERE id=$1 RETURNING id,title', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Event not found.' });
    await audit(req.user.id, 'delete', 'event', req.params.id, { title: r.rows[0].title });
    res.json({ ok: true });
}));

// ── Admin: Gallery ────────────────────────────────────────────────────────────
app.get('/api/admin/gallery', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT * FROM gallery ORDER BY sort_order ASC,created_at DESC');
    res.json({ gallery: r.rows });
}));

app.post('/api/admin/gallery', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({
        image_url: z.string().url().max(2000),
        album_title: z.string().max(200).optional(),
        caption: z.string().max(500).optional(),
        category: z.string().max(100).optional(),
        sort_order: z.coerce.number().int().optional().default(0),
        published: z.boolean().optional().default(true)
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'A valid image URL is required.' });
    const d = p.data;
    const r = await pool.query('INSERT INTO gallery(image_url,album_title,caption,category,sort_order,published,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *', [d.image_url, d.album_title || null, d.caption || null, d.category || null, d.sort_order, d.published, req.user.id]);
    await audit(req.user.id, 'create', 'gallery', r.rows[0].id, {});
    res.status(201).json({ item: r.rows[0] });
}));

app.patch('/api/admin/gallery/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.object({ caption: z.string().max(500).optional(), published: z.boolean().optional(), sort_order: z.coerce.number().int().optional(), album_title: z.string().max(200).optional(), category: z.string().max(100).optional() }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Invalid update data.' });
    const d = p.data;
    const r = await pool.query('UPDATE gallery SET caption=COALESCE($1,caption),published=COALESCE($2,published),sort_order=COALESCE($3,sort_order),album_title=COALESCE($4,album_title),category=COALESCE($5,category) WHERE id=$6 RETURNING *', [d.caption ?? null, d.published ?? null, d.sort_order ?? null, d.album_title ?? null, d.category ?? null, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Gallery item not found.' });
    res.json({ item: r.rows[0] });
}));

app.delete('/api/admin/gallery/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('DELETE FROM gallery WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Gallery item not found.' });
    await audit(req.user.id, 'delete', 'gallery', req.params.id, {});
    res.json({ ok: true });
}));

// ── Admin: Feedback ───────────────────────────────────────────────────────────
app.get('/api/admin/feedback', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT * FROM feedback ORDER BY created_at DESC');
    res.json({ feedback: r.rows });
}));

app.patch('/api/admin/feedback/:id', auth, only('admin'), asyncRoute(async (req, res) => {
    const p = z.enum(['new', 'reviewing', 'resolved', 'archived']).safeParse(req.body.status);
    if (!p.success) return res.status(400).json({ error: 'Invalid feedback status' });
    const r = await pool.query('UPDATE feedback SET status=$1 WHERE id=$2 RETURNING *', [p.data, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Feedback not found' });
    await audit(req.user.id, 'update-status', 'feedback', req.params.id, { status: p.data });
    res.json({ item: r.rows[0] });
}));

// ── Admin: Audit ──────────────────────────────────────────────────────────────
app.get('/api/admin/audit', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT a.*,u.name actor_name,u.email actor_email FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 200');
    res.json({ events: r.rows });
}));

// ── Admin: CSV Import ─────────────────────────────────────────────────────────
const CSV_TEMPLATES = {
    donors: 'donor_name,email,phone,donor_ref\n',
    donations: 'donor_email,donation_date,amount,payment_method,reference_id,reporting_period\n',
    expenses: 'expense_title,category,amount,expense_date,description,reporting_period,status\n',
    events: 'title,description,category,start_date,end_date,location,status\n',
    gallery: 'image_url,album_title,caption,category\n'
};

app.get('/api/admin/import/template/:module', auth, only('admin'), (req, res) => {
    const mod = req.params.module;
    if (!CSV_TEMPLATES[mod]) return res.status(404).json({ error: 'No template for this module.' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${mod}_template.csv"`);
    res.send(CSV_TEMPLATES[mod]);
});

app.get('/api/admin/import/history', auth, only('admin'), asyncRoute(async (req, res) => {
    const r = await pool.query('SELECT h.*,u.name admin_name FROM csv_import_history h LEFT JOIN users u ON u.id=h.admin_id ORDER BY h.created_at DESC LIMIT 50');
    res.json({ history: r.rows });
}));

app.post('/api/admin/import/:module', auth, only('admin'), upload.single('file'), asyncRoute(async (req, res) => {
    const mod = req.params.module;
    const dryrun = req.query.dryrun === 'true';
    if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded.' });
    if (!['donors', 'donations', 'expenses', 'events', 'gallery'].includes(mod)) return res.status(400).json({ error: 'Unsupported import module.' });

    let rows;
    try {
        rows = csvParse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true, bom: true });
    } catch (e) { return res.status(400).json({ error: 'Could not parse CSV: ' + e.message }); }

    if (rows.length === 0) return res.status(400).json({ error: 'CSV file is empty.' });
    if (rows.length > 2000) return res.status(400).json({ error: 'Maximum 2000 rows per import.' });

    const results = { total: rows.length, succeeded: 0, failed: 0, errors: [], dryrun };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // 1-indexed, header is row 1
            try {
                if (mod === 'donors') {
                    const name = row.donor_name?.trim(); const email = row.email?.trim()?.toLowerCase();
                    if (!name || name.length < 2) throw new Error('donor_name is required (min 2 chars)');
                    if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('valid email is required');
                    if (!dryrun) {
                        const existing = await client.query('SELECT id FROM users WHERE email=$1', [email]);
                        if (existing.rowCount) throw new Error(`Email already exists: ${email}`);
                        const tempHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
                        await client.query("INSERT INTO users(name,email,password_hash,role,active,phone,donor_ref) VALUES($1,$2,$3,'donor',false,$4,$5)", [name, email, tempHash, row.phone?.trim() || null, row.donor_ref?.trim() || null]);
                    }
                } else if (mod === 'donations') {
                    const email = row.donor_email?.trim()?.toLowerCase();
                    const amount = parseFloat(row.amount);
                    const date = row.donation_date?.trim();
                    const period = row.reporting_period?.trim();
                    if (!email) throw new Error('donor_email is required');
                    if (isNaN(amount) || amount <= 0) throw new Error('amount must be a positive number');
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('donation_date must be YYYY-MM-DD');
                    if (!/^\d{4}$/.test(period || '')) throw new Error('reporting_period must be a 4-digit year');
                    if (!dryrun) {
                        const donor = await client.query("SELECT id FROM users WHERE email=$1 AND role='donor' AND active=true AND deleted_at IS NULL", [email]);
                        if (!donor.rowCount) throw new Error(`No active donor with email: ${email}`);
                        await client.query('INSERT INTO donations(donor_id,amount,received_on,reference,period,created_by) VALUES($1,$2,$3,$4,$5,$6)', [donor.rows[0].id, money(amount), date, row.reference_id?.trim() || null, period, req.user.id]);
                    }
                } else if (mod === 'expenses') {
                    const title = row.expense_title?.trim(); const cat = row.category?.trim();
                    const amount = parseFloat(row.amount); const date = row.expense_date?.trim(); const period = row.reporting_period?.trim();
                    if (!title || title.length < 2) throw new Error('expense_title is required');
                    if (!cat) throw new Error('category is required');
                    if (isNaN(amount) || amount <= 0) throw new Error('amount must be positive');
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('expense_date must be YYYY-MM-DD');
                    if (!/^\d{4}$/.test(period || '')) throw new Error('reporting_period must be 4-digit year');
                    const status = ['draft', 'approved'].includes(row.status) ? row.status : 'approved';
                    if (!dryrun) await client.query('INSERT INTO expenses(category,description,amount,spent_on,period,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [cat, title, money(amount), date, period, status, req.user.id]);
                } else if (mod === 'events') {
                    const title = row.title?.trim();
                    if (!title || title.length < 2) throw new Error('title is required');
                    const status = ['draft', 'published', 'archived'].includes(row.status) ? row.status : 'draft';
                    if (!dryrun) await client.query('INSERT INTO events(title,description,category,start_date,end_date,location,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [title, row.description?.trim() || null, row.category?.trim() || null, row.start_date?.trim() || null, row.end_date?.trim() || null, row.location?.trim() || null, status, req.user.id]);
                } else if (mod === 'gallery') {
                    const url = row.image_url?.trim();
                    if (!url || !url.startsWith('http')) throw new Error('image_url must be a valid URL');
                    if (!dryrun) await client.query('INSERT INTO gallery(image_url,album_title,caption,category,created_by) VALUES($1,$2,$3,$4,$5)', [url, row.album_title?.trim() || null, row.caption?.trim() || null, row.category?.trim() || null, req.user.id]);
                }
                results.succeeded++;
            } catch (rowErr) {
                results.failed++;
                results.errors.push({ row: rowNum, data: row, error: rowErr.message });
            }
        }

        if (dryrun) {
            await client.query('ROLLBACK');
        } else {
            await client.query('COMMIT');
            // Log import history
            const importStatus = results.failed === 0 ? 'complete' : results.succeeded === 0 ? 'failed' : 'partial';
            await pool.query('INSERT INTO csv_import_history(module,filename,admin_id,total,succeeded,failed,status,errors) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [mod, req.file.originalname, req.user.id, results.total, results.succeeded, results.failed, importStatus, JSON.stringify(results.errors)]);
            await audit(req.user.id, 'csv-import', mod, 0, { total: results.total, succeeded: results.succeeded, failed: results.failed });
        }
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

    res.json(results);
}));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Something went wrong. Please try again.' : err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`WWCB API running on http://localhost:${PORT}`));
