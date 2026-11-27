'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { SECTIONS, HEALTH, PITCH_RESULTS, sectionById, callTypeFor, healthOf } from '@/lib/config';
import { ADDONS, ADDON_GROUPS } from '@/lib/addons';
import { buildQuestions, planCard, missingRequired, complianceAlerts, callHeld } from '@/lib/plan';

const SRC_ICON = { fathom: '🎥', sms: '💬', call: '📞', calendar: '📅', manual: '✍️' };
const QUICK_MS = 5000; // confirmed faster than this with zero edits = "quick confirm"
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const secs = (ms) => (ms == null ? '—' : `${Math.round(ms / 1000)}s`);
const digits = (s) => s.replace(/[^0-9.]/g, '');
// The CSM's own calendar day, not UTC.
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Motion presets
const EASE = [0.32, 0.72, 0, 1];
const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 };
const DRAWER = { duration: 0.32, ease: EASE };

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

// Smooth open/close for any block.
function Drawer({ open, children, className }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={DRAWER}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Modal({ onClose, narrow, children }) {
  return (
    <motion.div className="modal-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
      <motion.div
        className={`modal ${narrow ? 'narrow' : ''}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={SPRING}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function newCard(t) {
  const flags = JSON.parse(JSON.stringify(t.flags || {}));
  if (t.values.issues) flags.issue = { on: true, text: t.values.issues, prov: t.prov.issues };
  return { values: { ...t.values }, prov: { ...t.prov }, flags, confirmed: false, open: true, showAdd: false, showDetails: false, seenAt: null, confirmedAt: null, edits: 0 };
}

// A conversation the CSM adds by hand (not found in GHL / Fathom).
function manualTouch(member, section, csm) {
  return {
    id: `m-${member.id}-${Date.now()}`,
    manual: true,
    memberId: member.id,
    member,
    section,
    name: member.name,
    business: member.business,
    sources: [{ kind: 'manual', label: 'Added by ' + csm, detail: 'not found in GHL / Fathom' }],
    summary: 'Added by you. Nothing was synced for this conversation, so fill it in.',
    evidence: [],
    flags: {},
    values: { health: member.health ?? '' },
    prov: { health: 'airtable' },
  };
}

function Login({ onDone }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const go = async (e) => {
    e.preventDefault();
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ passcode: code }) });
    if (r.ok) onDone();
    else setErr(r.json.error || 'Wrong passcode');
  };
  return (
    <form className="login" onSubmit={go}>
      <div className="brand">Onya <span>· End of Day</span></div>
      <input type="password" autoFocus placeholder="Passcode" value={code} onChange={(e) => setCode(e.target.value)} />
      {err && <div className="need">{err}</div>}
      <button className="btn primary" disabled={!code}>Open</button>
    </form>
  );
}

export default function Page() {
  const [auth, setAuth] = useState('checking'); // checking | needed | ok
  const [csms, setCsms] = useState([]);
  const [csm, setCsm] = useState('');
  const [roster, setRoster] = useState({ loading: false, members: [], error: '' });
  const [touches, setTouches] = useState([]);
  const [cards, setCards] = useState({});
  const [openedAt, setOpenedAt] = useState(Date.now());
  const [today] = useState(localToday);
  const [review, setReview] = useState(false);
  const [result, setResult] = useState(null); // server response after submit
  const [adding, setAdding] = useState(null);
  const [openSec, setOpenSec] = useState(null);

  // Auth + CSM list
  const loadCsms = async () => {
    const r = await api('/api/roster');
    if (r.status === 401) return setAuth('needed');
    if (!r.ok) return setAuth('error:' + (r.json.error || r.status));
    setAuth('ok');
    setCsms(r.json.csms);
    try {
      const saved = localStorage.getItem('eod-csm');
      if (saved && r.json.csms.includes(saved)) setCsm(saved);
    } catch {}
  };
  useEffect(() => { loadCsms(); }, []);

  // CSM switch: load their members live from Airtable, reset the form.
  useEffect(() => {
    if (!csm) return;
    try { localStorage.setItem('eod-csm', csm); } catch {}
    setTouches([]);
    setCards({});
    setResult(null);
    setOpenedAt(Date.now());
    setRoster({ loading: true, members: [], error: '' });
    api('/api/roster?csm=' + encodeURIComponent(csm)).then((r) =>
      setRoster({ loading: false, members: r.json.members || [], error: r.ok ? '' : r.json.error || 'Could not load members' })
    );
  }, [csm]);

  const sections = SECTIONS.map((sec) => {
    const list = touches.filter((t) => t.section === sec.id);
    const done = list.filter((t) => cards[t.id]?.confirmed).length;
    return { sec, list, done, complete: list.length > 0 && done === list.length };
  }).filter((s) => s.list.length);

  const firstIncomplete = (exceptId) => sections.find((s) => !s.complete && s.sec.id !== exceptId)?.sec.id ?? null;
  const update = (id, fn) => setCards((cs) => ({ ...cs, [id]: fn(cs[id]) }));

  const setValue = (id, key, val) =>
    update(id, (c) => {
      const wasAi = c.prov[key] === 'ai';
      return { ...c, values: { ...c.values, [key]: val }, prov: { ...c.prov, [key]: 'edited' }, edits: c.edits + (wasAi ? 1 : 0) };
    });

  const confirmCard = (t) => {
    update(t.id, (c) => ({ ...c, confirmed: true, open: false, showAdd: false, showDetails: false, confirmedAt: Date.now() }));
    const s = sections.find((x) => x.sec.id === t.section);
    if (s && s.done + 1 === s.list.length) {
      const next = firstIncomplete(t.section);
      setTimeout(() => {
        setOpenSec(next);
        if (next) setTimeout(() => document.getElementById('sec-' + next)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 360);
      }, 380);
    }
  };

  const addTouch = (member, section) => {
    const t = manualTouch(member, section, csm);
    setTouches((ts) => [...ts, t]);
    setCards((cs) => ({ ...cs, [t.id]: newCard(t) }));
    setAdding(null);
    setOpenSec(section);
    setTimeout(() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 420);
  };
  const removeTouch = (id) => {
    setTouches((ts) => ts.filter((t) => t.id !== id));
    setCards((cs) => {
      const n = { ...cs };
      delete n[id];
      return n;
    });
  };

  const confirmedCount = touches.filter((t) => cards[t.id]?.confirmed).length;
  const pct = touches.length ? (confirmedCount / touches.length) * 100 : 0;

  const plans = useMemo(
    () =>
      touches.map((t) => {
        const c = cards[t.id];
        return { t, plan: c ? planCard(sectionById(t.section), t.member, c.values, c.flags, { csm, date: today }) : null };
      }),
    [touches, cards, csm, today]
  );

  const stats = () => {
    const timing = touches.map((t) => {
      const c = cards[t.id];
      const ms = c.confirmedAt && c.seenAt ? c.confirmedAt - c.seenAt : null;
      return { ms, edits: c.edits, quick: c.confirmed && ms != null && ms < QUICK_MS && c.edits === 0 };
    });
    return {
      timeOnFormMs: Date.now() - openedAt,
      quickConfirms: timing.filter((x) => x.quick).length,
      aiValuesChanged: timing.reduce((n, x) => n + x.edits, 0),
    };
  };

  const submit = async (force = false) => {
    const body = {
      csm,
      date: today,
      force,
      stats: stats(),
      cards: touches.map((t) => ({ section: t.section, memberId: t.memberId, name: t.name, manual: !!t.manual, values: cards[t.id].values, flags: cards[t.id].flags })),
    };
    setResult({ pending: true });
    const r = await api('/api/submit', { method: 'POST', body: JSON.stringify(body) });
    if (r.status === 409) return setResult({ duplicate: true });
    if (!r.ok) return setResult({ error: r.json.error || 'Submit failed (' + r.status + ')' });
    setResult(r.json);
  };

  if (auth === 'checking') return <div className="wrap"><div className="empty">Loading…</div></div>;
  if (auth === 'needed') return <Login onDone={loadCsms} />;
  if (auth.startsWith('error:')) return <div className="wrap"><div className="empty">{auth.slice(6)}</div></div>;

  return (
    <MotionConfig reducedMotion="user">
      <div className="top">
        <div className="top-inner">
          <div className="brand">
            Onya <span>· End of Day</span>
          </div>
          <div className="spacer" />
          <div className="csm-pick">
            <select value={csm} onChange={(e) => setCsm(e.target.value)} aria-label="CSM">
              <option value="">Who are you?</option>
              {csms.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="meta">{fmtDate(today)}</span>
          </div>
        </div>
      </div>

      {!csm ? (
        <div className="wrap"><div className="empty">Pick your name to start.</div></div>
      ) : (
        <motion.div key={'form-' + csm} className="wrap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          <div className="intro">
            <p className="note">
              Everyone you talked to today. Check each card and fix anything that’s wrong.
              <span className="dot-ai" style={{ marginLeft: 6 }} /> = filled in for you.
            </p>
            <button className="btn" disabled={roster.loading} onClick={() => setAdding({})}>+ Add a client</button>
          </div>
          {roster.error && <div className="alert bad">Couldn’t load your clients from Airtable: {roster.error}</div>}

          {sections.map(({ sec, list, done, complete }) => (
            <section key={sec.id} id={'sec-' + sec.id} className={`sec ${openSec === sec.id ? 'is-open' : ''} ${complete ? 'is-done' : ''}`}>
              <button className="sec-h" onClick={() => setOpenSec(openSec === sec.id ? null : sec.id)} aria-expanded={openSec === sec.id}>
                <motion.span className="chev" animate={{ rotate: openSec === sec.id ? 90 : 0 }} transition={SPRING}>›</motion.span>
                <span className="sec-title">{sec.title}</span>
                <span className="sec-count">{list.length}</span>
                <span className="spacer" />
                <AnimatePresence mode="popLayout" initial={false}>
                  {complete ? (
                    <motion.span key="done" className="sec-done" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={SPRING}>
                      ✓ Done
                    </motion.span>
                  ) : (
                    <motion.span key="prog" className="sec-prog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {done}/{list.length} checked
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
              <Drawer open={openSec === sec.id}>
                <div className="sec-b">
                  {list.map((t) => (
                    <Card
                      key={t.id}
                      t={t}
                      sec={sec}
                      c={cards[t.id]}
                      today={today}
                      csm={csm}
                      setValue={(k, v) => setValue(t.id, k, v)}
                      patch={(p) => update(t.id, (c) => ({ ...c, ...p }))}
                      setFlag={(k, p) => update(t.id, (c) => ({ ...c, flags: { ...c.flags, [k]: { ...(c.flags[k] || {}), ...p } } }))}
                      onSeen={() => update(t.id, (c) => (c.seenAt ? c : { ...c, seenAt: Date.now() }))}
                      onConfirm={() => confirmCard(t)}
                      onRemove={t.manual ? () => removeTouch(t.id) : null}
                    />
                  ))}
                </div>
              </Drawer>
            </section>
          ))}
          {touches.length === 0 && <div className="empty">No calls or texts synced for you today yet. Use “+ Add a client” for anyone you talked to.</div>}

          <div className="add-row bottom">
            <button className="btn" disabled={roster.loading} onClick={() => setAdding({})}>+ Add a client</button>
            <span className="meta">Talked to someone who isn’t listed? Add them.</span>
          </div>
        </motion.div>
      )}

      {csm && (
        <div className="bar">
          <div className="bar-inner">
            <div className="progress">
              <small>
                {confirmedCount} of {touches.length} checked
              </small>
              <div className="track">
                <motion.div className="fill" initial={false} animate={{ width: `${pct}%` }} transition={SPRING} />
              </div>
            </div>
            <AnimatePresence>{result?.ok && <motion.span className="meta" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}>✓ Submitted</motion.span>}</AnimatePresence>
            <motion.button whileTap={{ scale: 0.97 }} className="btn primary" disabled={touches.length === 0} onClick={() => setReview(true)}>
              {confirmedCount < touches.length ? 'Preview' : 'Review & submit'}
            </motion.button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {adding && <AddClient key="add" csm={csm} members={roster.members} already={new Set(touches.map((t) => t.memberId))} onAdd={addTouch} onClose={() => setAdding(null)} />}
        {review && (
          <Review
            key="review"
            plans={plans}
            cards={cards}
            openedAt={openedAt}
            today={today}
            canSubmit={confirmedCount === touches.length && touches.length > 0}
            result={result}
            onClose={() => setReview(false)}
            onSubmit={submit}
            csm={csm}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

/* ---------- Card ---------- */

function Card({ t, sec, c, today, csm, setValue, patch, setFlag, onSeen, onConfirm, onRemove }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || c?.seenAt) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && onSeen(), { threshold: 0.5 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [c?.seenAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return null;
  const v = c.values;
  const ai = (k) => c.prov[k] === 'ai' && v[k] !== '' && v[k] != null;
  const questions = buildQuestions(sec, t.member, v);
  const missing = missingRequired(sec, t.member, v);
  const compliance = complianceAlerts(sec, t.member, v);
  const activeFlags = ADDONS.filter((f) => c.flags[f.key]?.on);
  const canAdd = (a) => !c.flags[a.key]?.on && (!a.onlyAfterFirstSale || t.member.journey?.firstSale);
  const h = healthOf(v.health);

  return (
    <motion.div layout="position" className={`card ${c.confirmed ? 'done' : ''}`} ref={ref} id={t.id} transition={SPRING}>
      {/* Collapsed summary (after "Looks right") */}
      <Drawer open={!c.open}>
        <button className="collapsed" onClick={() => patch({ open: true, confirmed: false, confirmedAt: null })} title="Reopen to edit (needs re-checking)">
          <span className="ok">✓</span>
          <b>{t.name}</b>
          <span className="sum">{v.outcome || '—'}</span>
          {v.sale === 'Yes' && <span className="pill good">First sale</span>}
          {activeFlags.map((f) => (
            <span key={f.key} className={`pill ${f.tone}`}>{f.label}</span>
          ))}
          <span className="sum muted">→ {v.nextStep || '—'} {v.nextDue ? fmtDate(v.nextDue) : ''}</span>
          <span className="spacer" />
          {h && <span className="hdot" style={{ background: h.color }} title={h.label} />}
        </button>
      </Drawer>

      {/* Full card */}
      <Drawer open={c.open}>
        <div className="card-h">
          <div className="who">
            <div className="name">
              {t.name} <span className="biz">{t.business}</span>
              {t.manual && <span className="pill manual">added by you</span>}
            </div>
            <div className="summary-line">
              {t.sources.map((s, i) => (
                <span key={i} title={`${s.label} · ${s.detail}`}>{SRC_ICON[s.kind]} </span>
              ))}
              {t.summary}{' '}
              <button className="link" onClick={() => patch({ showDetails: !c.showDetails })}>
                {c.showDetails ? 'hide' : 'details'}
              </button>
            </div>
          </div>
          <HealthPicker value={v.health} ai={ai('health')} was={t.member.health} onChange={(n) => setValue('health', n)} />
        </div>

        <Drawer open={c.showDetails}>
          <Details t={t} sec={sec} c={c} today={today} csm={csm} />
        </Drawer>

        <div className="card-b">
          <AnimatePresence initial={false}>
            {compliance.map((a) => (
              <motion.div key={a} className="alert bad" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={DRAWER}>
                {a}
              </motion.div>
            ))}
          </AnimatePresence>

          <div className="core">
            <Labeled label="Outcome" ai={ai('outcome')} missing={!v.outcome}>
              {sec.outcomes ? (
                <select value={v.outcome || ''} onChange={(e) => setValue('outcome', e.target.value)}>
                  <option value="">Select…</option>
                  {sec.outcomes.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input value={v.outcome || ''} onChange={(e) => setValue('outcome', e.target.value)} placeholder="What happened?" />
              )}
            </Labeled>
            <Labeled label="Next step" ai={ai('nextStep')}>
              <input value={v.nextStep || ''} onChange={(e) => setValue('nextStep', e.target.value)} />
            </Labeled>
            <Labeled label="Due" ai={ai('nextDue')}>
              <input type="date" value={v.nextDue || ''} onChange={(e) => setValue('nextDue', e.target.value)} />
            </Labeled>
          </div>

          <Drawer open={questions.length > 0}>
            <div className="qs">
              <AnimatePresence initial={false}>
                {questions.map((q) => (
                  <motion.div key={q.key} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={DRAWER} style={{ overflow: 'hidden' }}>
                    <Question q={q} v={v} ai={ai} setValue={setValue} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Drawer>
          <Drawer open={!callHeld(sec, v) && !!v.outcome}>
            <div className="muted small" style={{ paddingTop: 8 }}>Call didn’t happen, so no call questions.</div>
          </Drawer>

          <div className="flag-rows">
            <AnimatePresence initial={false}>
              {activeFlags.map((a) => (
                <motion.div key={a.key} layout initial={{ opacity: 0, height: 0, y: -4 }} animate={{ opacity: 1, height: 'auto', y: 0 }} exit={{ opacity: 0, height: 0 }} transition={DRAWER} style={{ overflow: 'hidden' }}>
                  <AddonRow a={a} val={c.flags[a.key]} set={(p) => setFlag(a.key, p)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <Drawer open={c.showAdd}>
            <div className="add-menu">
              {ADDON_GROUPS.map((g) => {
                const items = ADDONS.filter((a) => a.group === g && canAdd(a));
                if (!items.length) return null;
                return (
                  <div className="add-group" key={g}>
                    <span className="add-g">{g}</span>
                    {items.map((a) => (
                      <motion.button
                        key={a.key}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        className="chip"
                        onClick={() => {
                          setFlag(a.key, { on: true, prov: 'edited' });
                          patch({ showAdd: false });
                        }}
                      >
                        {a.label}
                      </motion.button>
                    ))}
                  </div>
                );
              })}
            </div>
          </Drawer>
        </div>

        <div className="card-f">
          <div className="adders">
            <button className="link" onClick={() => patch({ showAdd: !c.showAdd })}>
              <motion.span style={{ display: 'inline-block' }} animate={{ rotate: c.showAdd ? 45 : 0 }} transition={SPRING}>+</motion.span> {c.showAdd ? 'Close' : 'Add'}
            </button>
            {!c.showAdd && <span className="meta add-hint">issue, marketing, leads, reorder, sale, refund…</span>}
            {onRemove && <button className="link danger" onClick={onRemove}>Remove</button>}
          </div>
          <div className="right">
            <AnimatePresence initial={false}>
              {missing.length > 0 && (
                <motion.span className="need" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }}>
                  Needs: {missing.join(', ')}
                </motion.span>
              )}
            </AnimatePresence>
            <motion.button whileTap={{ scale: 0.96 }} className="btn primary" disabled={missing.length > 0} onClick={onConfirm}>
              Looks right ✓
            </motion.button>
          </div>
        </div>
      </Drawer>
    </motion.div>
  );
}

function AddonRow({ a, val, set }) {
  const hint = a.hint?.(val);
  return (
    <div className={`flag-row ${a.tone}`}>
      <span className="flag-name">
        {val.prov === 'ai' && <span className="dot-ai" title="Detected in the call/text. Check it." />}
        {a.label}
      </span>
      {a.fields.map((f) => {
        const v = val[f.k] || '';
        const on = (x) => set({ [f.k]: x });
        if (f.type === 'select')
          return (
            <select key={f.k} value={v} onChange={(e) => on(e.target.value)} className="sel">
              <option value="">Select…</option>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          );
        if (f.type === 'date') return <input key={f.k} type="date" className="dt" value={v} onChange={(e) => on(e.target.value)} />;
        if (f.type === 'money' || f.type === 'number')
          return (
            <label key={f.k} className="mini">
              {f.ph}
              <input className="money" inputMode="numeric" value={v} onChange={(e) => on(digits(e.target.value))} />
            </label>
          );
        return <input key={f.k} className="grow" placeholder={f.ph} value={v} onChange={(e) => on(e.target.value)} />;
      })}
      <button className="x" onClick={() => set({ on: false })} aria-label="Remove">×</button>
      {hint && <div className="flag-hint">{hint}</div>}
    </div>
  );
}

function Labeled({ label, ai, missing, children }) {
  return (
    <div className={`f ${missing ? 'missing' : ''}`}>
      <label>
        {ai && <span className="dot-ai" title="Filled in from the call/text. Check it." />}
        {label}
      </label>
      {children}
    </div>
  );
}

// Segmented control with a sliding selection pill.
function Seg({ options, value, onChange, className = '' }) {
  const id = useId();
  return (
    <div className={`seg ${className}`}>
      {options.map((o) => (
        <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(value === o && !className.includes('tabs') ? '' : o)}>
          {value === o && <motion.span layoutId={'pill' + id} className="seg-pill" transition={SPRING} />}
          <span className="seg-t">{o}</span>
        </button>
      ))}
    </div>
  );
}

const Reveal = ({ show, children }) => (
  <AnimatePresence initial={false}>
    {show && (
      <motion.span className="reveal" initial={{ opacity: 0, x: -6, width: 0 }} animate={{ opacity: 1, x: 0, width: 'auto' }} exit={{ opacity: 0, x: -6, width: 0 }} transition={DRAWER}>
        {children}
      </motion.span>
    )}
  </AnimatePresence>
);

function Question({ q, v, ai, setValue }) {
  const val = v[q.key] ?? '';
  return (
    <div className={`q ${q.required && !val ? 'missing' : ''}`}>
      <div className="q-label">
        {ai(q.key) && <span className="dot-ai" title="Filled in from the call/text. Check it." />}
        {q.q}
      </div>
      <div className="q-ctl">
        {q.kind === 'pitch' && (
          <>
            <Seg options={['Yes', 'No']} value={val} onChange={(x) => setValue(q.key, x)} />
            <Reveal show={val === 'Yes'}>
              <select value={v[q.resultKey] || ''} onChange={(e) => setValue(q.resultKey, e.target.value)}>
                <option value="">Result…</option>
                {PITCH_RESULTS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </Reveal>
            <Reveal show={val === 'Yes' && v[q.resultKey] === 'Sold'}>
              <label className="mini">
                $ collected
                <input className="money" inputMode="numeric" value={v[q.amountKey] || ''} onChange={(e) => setValue(q.amountKey, digits(e.target.value))} />
              </label>
            </Reveal>
          </>
        )}
        {q.kind === 'gap' && (
          <>
            <Seg options={['Yes', 'No', 'Not sure']} value={val} onChange={(x) => setValue(q.key, x)} />
            <Reveal show={val === 'Yes'}>
              <input type="date" value={v[q.dateKey] || ''} onChange={(e) => setValue(q.dateKey, e.target.value)} />
            </Reveal>
          </>
        )}
        {q.kind === 'sale' && (
          <>
            <Seg options={['Yes', 'No']} value={val} onChange={(x) => setValue('sale', x)} />
            <Reveal show={val === 'Yes'}>
              <input type="date" value={v.saleDate || ''} onChange={(e) => setValue('saleDate', e.target.value)} title="Sale date" />
              <label className="mini">
                $ job
                <input className="money" inputMode="numeric" value={v.jobValue || ''} onChange={(e) => setValue('jobValue', digits(e.target.value))} />
              </label>
              <label className="mini">
                $ collected
                <input className="money" inputMode="numeric" value={v.cashCollected || ''} onChange={(e) => setValue('cashCollected', digits(e.target.value))} />
              </label>
            </Reveal>
          </>
        )}
        {q.kind === 'date' && <input type="date" value={val} onChange={(e) => setValue(q.key, e.target.value)} />}
        {q.kind === 'select' && <Seg options={q.options} value={val} onChange={(x) => setValue(q.key, x)} />}
        {q.kind === 'yn' && <Seg options={['Yes', 'No']} value={val} onChange={(x) => setValue(q.key, x)} />}
      </div>
    </div>
  );
}

function HealthPicker({ value, ai, was, onChange }) {
  const id = useId();
  const cur = healthOf(value);
  return (
    <div className="hp">
      <div className="hp-label">
        {ai && <span className="dot-ai" />}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={cur?.label || 'none'} style={{ color: cur?.color }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            {cur ? `DEFCON ${cur.v} · ${cur.label}` : 'DEFCON?'}
          </motion.span>
        </AnimatePresence>
        {was && Number(was) !== Number(value) && <span className="muted"> (was {was})</span>}
      </div>
      <div className="hp-row">
        {HEALTH.map((h) => (
          <button key={h.v} title={`DEFCON ${h.v} · ${h.label}: ${h.help}`} onClick={() => onChange(h.v)} className={Number(value) === h.v ? 'on' : ''} style={{ '--c': h.color }}>
            {Number(value) === h.v && <motion.span layoutId={'hp' + id} className="hp-pill" style={{ background: h.color }} transition={SPRING} />}
            <span className="hp-n">{h.v}</span>
          </button>
        ))}
      </div>
      {cur && <div className="hp-help">{cur.help}</div>}
    </div>
  );
}

function Details({ t, sec, c, today, csm }) {
  const plan = planCard(sec, t.member, c.values, c.flags, { csm, date: today });
  return (
    <div className="details">
      <div className="d-col">
        <div className="d-h">Sources</div>
        {t.sources.map((s, i) => (
          <div key={i} className="small">
            {SRC_ICON[s.kind]} {s.label} · {s.detail}
          </div>
        ))}
        {t.evidence.length > 0 && <div className="d-h" style={{ marginTop: 8 }}>What was said</div>}
        {t.evidence.map((e, i) => (
          <div className="ev" key={i}>
            <i>{e.t}</i> <b>{e.who}:</b> “{e.text}”
          </div>
        ))}
      </div>
      <div className="d-col">
        <div className="d-h">Will update in Airtable</div>
        {plan.updates.map((u, i) => (
          <div key={i} className="small">
            <span className="muted">{u.field}:</span> {String(u.to)}
          </div>
        ))}
        {plan.comment && <div className="small"><span className="muted">Comment:</span> {plan.comment}</div>}
        {!plan.updates.length && !plan.comment && <div className="small muted">Nothing yet.</div>}
      </div>
    </div>
  );
}

/* ---------- Add a client ---------- */

const ADD_TYPES = [
  ['onboarding', 'Onboarding call'],
  ['prelaunch', 'Pre-launch call'],
  ['launch', 'Launch call'],
  ['checkin', 'Check-in call'],
  ['comms', 'Text / phone'],
  ['outreach', 'Reached out, no response'],
];

function AddClient({ csm, members, already, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const [type, setType] = useState('');
  const list = members.filter((m) => !already.has(m.id)).filter((m) => !q || `${m.name} ${m.business}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal onClose={onClose} narrow>
      <h3>Add a client</h3>
      <div className="meta">One of your clients you talked to today who isn’t listed.</div>

      {!picked ? (
        <>
          <input className="search" autoFocus placeholder="Search name or business…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="pick-list">
            {list.map((m) => (
              <button key={m.id} className="pick" onClick={() => { setPicked(m); setType(m.phase ? ADD_DEFAULT[callTypeFor(m)] || '' : ''); }}>
                <b>{m.name}</b> <span className="muted">{m.business}</span>
                {m.phase && <span className="pill manual">{m.phase}</span>}
              </button>
            ))}
            {list.length === 0 && <div className="meta" style={{ padding: 10 }}>No matches in your clients. Not in Airtable, or assigned to someone else? Flag it to ops.</div>}
          </div>
        </>
      ) : (
        <>
          <div className="picked">
            <b>{picked.name}</b> <span className="muted">{picked.business}</span>
            <span className="spacer" />
            <button className="link" onClick={() => setPicked(null)}>change</button>
          </div>
          <div className="meta" style={{ margin: '12px 0 6px' }}>What kind of conversation?</div>
          <div className="type-grid">
            {ADD_TYPES.map(([id, label]) => (
              <button key={id} className={`chip ${type === id ? 'on' : ''}`} onClick={() => setType(id)}>{label}</button>
            ))}
          </div>
        </>
      )}

      <div className="modal-f">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!picked || !type} onClick={() => onAdd(picked, type)}>Add card</button>
      </div>
    </Modal>
  );
}

const ADD_DEFAULT = { onboarding: 'onboarding', prelaunch: 'prelaunch', launch: 'launch', checkin: 'checkin' };

/* ---------- Review ---------- */

const ST = { written: ['✓', 'ok'], failed: ['✗ failed', 'bad'], skipped: ['skipped', 'muted'], preview: ['preview only', 'muted'], warning: ['!', 'warn'] };

function Review({ plans, cards, openedAt, today, canSubmit, result, onClose, onSubmit, csm }) {
  const done = result && (result.ok || result.pending);
  const total = plans.reduce((n, x) => n + (x.plan ? x.plan.updates.length + (x.plan.comment ? 1 : 0) : 0), 0);
  const now = Date.now();
  const timing = plans.map(({ t }) => {
    const c = cards[t.id];
    const ms = c.confirmedAt && c.seenAt ? c.confirmedAt - c.seenAt : null;
    return { id: t.id, name: t.name, manual: t.manual, ms, edits: c.edits, confirmed: c.confirmed, quick: c.confirmed && ms != null && ms < QUICK_MS && c.edits === 0 };
  });
  const quick = timing.filter((x) => x.quick).length;
  const manual = plans.filter(({ t }) => t.manual).length;
  const edits = timing.reduce((n, x) => n + x.edits, 0);
  const byMember = result?.results ? Object.fromEntries(result.results.map((r) => [r.memberId, r])) : null;

  return (
    <Modal onClose={onClose}>
      <h3>{result?.ok ? 'Submitted' : canSubmit ? 'Submit your EOD' : 'Preview'}</h3>
      <div className="meta">
        {result?.ok
          ? result.live
            ? `Saved. EOD log: ${result.eod?.status}${result.eod?.warning ? ` (${result.eod.warning})` : ''}${result.eod?.error ? ` (${result.eod.error})` : ''}.`
            : 'Preview mode: nothing was written to Airtable.'
          : `${total} Airtable changes across ${plans.length} clients, plus your EOD log row for ${fmtDate(today)}.${canSubmit ? '' : ' Check every card to submit.'}`}
      </div>
      {result?.error && <div className="alert bad">{result.error}</div>}
      {result?.duplicate && (
        <div className="alert bad">
          You already submitted an EOD today. Submitting again re-writes the fields, adds the comments again, and updates today’s log row.{' '}
          <button className="link" onClick={() => onSubmit(true)}>Submit again anyway</button>
        </div>
      )}

      {plans.map(({ t, plan }) => {
        const res = byMember?.[t.memberId];
        const rows = res
          ? res.ops || [{ field: '(card)', to: res.error, status: 'failed' }]
          : [
              ...plan.updates.map((u) => ({ field: u.field, from: u.from, to: u.to })),
              ...plan.skips.map((s) => ({ field: s.field, to: s.to, status: 'skipped', note: s.reason })),
              ...(plan.comment ? [{ field: 'Comment', to: plan.comment }] : []),
            ];
        return (
          <div className="grp writes" key={t.id}>
            <h4>{t.name}</h4>
            <table>
              <tbody>
                {rows.map((w, i) => (
                  <tr key={i} className={w.status === 'skipped' ? 'skipped' : ''}>
                    <td style={{ width: '30%' }}>{w.field}</td>
                    <td>
                      {w.from && w.from !== w.to && <span className="from">{String(w.from)}</span>}
                      {String(w.to)}
                      {w.note && <span className="muted"> ({w.note})</span>}
                      {w.error && <div className="bad-t small">{w.error}</div>}
                    </td>
                    <td style={{ width: 110, textAlign: 'right' }}>{w.status && <span className={`st ${ST[w.status]?.[1]}`}>{ST[w.status]?.[0]}</span>}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr><td className="muted" colSpan={3}>No changes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      <div className="admin">
        <div className="admin-h">Behind the scenes (admin only)</div>
        <div className="admin-stats">
          <span>Time on form: <b>{secs(now - openedAt)}</b></span>
          <span>AI values changed: <b>{edits}</b></span>
          <span>Quick confirms (&lt;{QUICK_MS / 1000}s, no edits): <b className={quick ? 'bad-t' : ''}>{quick}</b></span>
          <span>Added by hand (missed by sync): <b className={manual ? 'bad-t' : ''}>{manual}</b></span>
        </div>
        <table>
          <tbody>
            {timing.map((x) => (
              <tr key={x.id}>
                <td>{x.name}{x.manual && <span className="muted"> · added by hand</span>}</td>
                <td>{x.confirmed ? secs(x.ms) : 'not checked'}</td>
                <td>{x.edits} edit{x.edits === 1 ? '' : 's'}</td>
                <td style={{ textAlign: 'right' }}>{x.quick && <span className="st viktor">quick confirm</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="modal-f">
        <button className="btn" onClick={onClose}>{result?.ok ? 'Close' : 'Back'}</button>
        {!result?.ok && (
          <button className="btn primary" disabled={!canSubmit || done} onClick={() => onSubmit(false)}>
            {result?.pending ? 'Submitting…' : 'Submit EOD'}
          </button>
        )}
      </div>
    </Modal>
  );
}
