'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { CSMS, SECTIONS, HEALTH, DATA_MAP, OPEN_QUESTIONS, DECISIONS, TODAY, PITCH_RESULTS, STEPS, EXPECTED } from '@/lib/config';
import { ADDONS, ADDON_GROUPS } from '@/lib/addons';
import { getCsmData, ROSTER } from '@/lib/mock';
import { buildQuestions, computeWrites, missingRequired, complianceAlerts, callHeld } from '@/lib/writes';
import { needsAttention, TOUCH_RULE } from '@/lib/touch';

const SRC_ICON = { fathom: '🎥', sms: '💬', call: '📞', calendar: '📅', manual: '✍️' };
const QUICK_MS = 5000; // confirmed faster than this with zero edits = "quick confirm"
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const healthOf = (v) => HEALTH.find((h) => h.v === Number(v));
const secs = (ms) => (ms == null ? '—' : `${Math.round(ms / 1000)}s`);
const digits = (s) => s.replace(/[^0-9.]/g, '');

// Motion presets
const EASE = [0.32, 0.72, 0, 1];
const SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 };
const DRAWER = { duration: 0.32, ease: EASE };

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

function initState(csm) {
  const data = getCsmData(csm);
  const cards = {};
  for (const t of data.touches) cards[t.id] = newCard(t);
  return { data: { ...data, touches: [...data.touches] }, cards, openedAt: Date.now() };
}

function newCard(t) {
  const flags = JSON.parse(JSON.stringify(t.flags || {}));
  // AI-detected issue / reorder become add-ons (only shown because they were detected)
  if (t.values.issues) flags.issue = { on: true, text: t.values.issues, prov: t.prov.issues };
  if (t.values.reorder && t.values.reorder !== 'Not discussed') flags.reorder = { on: true, status: t.values.reorder, prov: t.prov.reorder };
  return {
    values: { ...t.values },
    prov: { ...t.prov },
    flags,
    confirmed: false,
    open: true,
    showAdd: false,
    showDetails: false,
    // behind-the-scenes timing
    seenAt: null,
    confirmedAt: null,
    edits: 0,
  };
}

// A touch the CSM adds by hand (not found in GHL/Fathom).
function manualTouch(member, section, csm) {
  const j = member.current.journey || {};
  const phase = j.firstLead ? 'checkin' : j.oilDelivered ? 'launch' : j.onboarded ? 'prelaunch' : 'onboarding';
  return {
    id: `m-${member.id}-${Date.now()}`,
    manual: true,
    memberId: member.id,
    section,
    phase,
    name: member.name,
    business: member.business,
    pkg: member.pkg,
    current: member.current,
    sources: [{ kind: 'manual', label: 'Added by ' + csm, detail: 'not found in GHL / Fathom' }],
    summary: 'Added by you. Nothing was synced for this conversation, so fill it in.',
    evidence: [],
    alerts: [],
    flags: {},
    values: { health: member.current.health },
    prov: { health: 'airtable' },
  };
}

export default function Page() {
  const [tab, setTab] = useState('form');
  const [csm, setCsm] = useState('Tristan');
  const [state, setState] = useState(() => initState('Tristan'));
  const [review, setReview] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [adding, setAdding] = useState(null); // null | { preselect?: memberId }
  const [openSec, setOpenSec] = useState(null);
  const { data, cards } = state;
  const touches = data.touches;

  const sections = SECTIONS.map((sec) => {
    const list = touches.filter((t) => t.section === sec.id);
    const done = list.filter((t) => cards[t.id]?.confirmed).length;
    return { sec, list, done, complete: list.length > 0 && done === list.length };
  }).filter((s) => s.list.length);

  const firstIncomplete = (exceptId) => sections.find((s) => !s.complete && s.sec.id !== exceptId)?.sec.id ?? null;

  // On load / CSM switch: open the first section with unchecked cards.
  useEffect(() => {
    const s = initState(csm);
    setState(s);
    setSubmittedAt(null);
    const first = SECTIONS.find((sec) => s.data.touches.some((t) => t.section === sec.id));
    setOpenSec(first?.id ?? null);
  }, [csm]);

  const update = (id, fn) => setState((s) => ({ ...s, cards: { ...s.cards, [id]: fn(s.cards[id]) } }));

  const setValue = (id, key, val) =>
    update(id, (c) => {
      const wasAi = c.prov[key] === 'ai';
      return { ...c, values: { ...c.values, [key]: val }, prov: { ...c.prov, [key]: 'edited' }, edits: c.edits + (wasAi ? 1 : 0) };
    });

  const confirmCard = (t) => {
    update(t.id, (c) => ({ ...c, confirmed: true, open: false, showAdd: false, showDetails: false, confirmedAt: Date.now() }));
    // If that finished the section, glide to the next unfinished one.
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
    setState((s) => ({ ...s, data: { ...s.data, touches: [...s.data.touches, t] }, cards: { ...s.cards, [t.id]: newCard(t) } }));
    setAdding(null);
    setOpenSec(section);
    setTimeout(() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 420);
  };
  const removeTouch = (id) =>
    setState((s) => {
      const cards = { ...s.cards };
      delete cards[id];
      return { ...s, data: { ...s.data, touches: s.data.touches.filter((t) => t.id !== id) }, cards };
    });

  const confirmedCount = touches.filter((t) => cards[t.id]?.confirmed).length;
  const pct = touches.length ? (confirmedCount / touches.length) * 100 : 0;

  const allWrites = useMemo(
    () =>
      touches.map((t) => {
        const sec = SECTIONS.find((s) => s.id === t.section);
        const c = cards[t.id];
        return { t, writes: c ? computeWrites(sec, t, c.values, c.flags, csm) : [] };
      }),
    [touches, cards, csm]
  );

  const attention = needsAttention(ROSTER, csm, new Set(touches.map((t) => t.memberId || t.id)));

  return (
    <MotionConfig reducedMotion="user">
      <div className="top">
        <div className="top-inner">
          <div className="brand">
            Onya <span>· End of Day</span>
          </div>
          <Seg options={['EOD', 'Data we need']} value={tab === 'form' ? 'EOD' : 'Data we need'} onChange={(x) => x && setTab(x === 'EOD' ? 'form' : 'map')} className="tabs" />
          <div className="spacer" />
          <div className="csm-pick">
            <select value={csm} onChange={(e) => setCsm(e.target.value)} aria-label="CSM">
              {CSMS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="meta">Mon, Nov 23</span>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'map' ? (
          <motion.div key="map" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            <DataMap />
          </motion.div>
        ) : (
          <motion.div key={'form-' + csm} className="wrap" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            <div className="intro">
              <p className="note">
                Prefilled from today’s calls and texts. Check each card and fix anything that’s wrong.
                <span className="dot-ai" style={{ marginLeft: 6 }} /> = filled in for you.
              </p>
              <button className="btn" onClick={() => setAdding({})}>+ Add a client</button>
            </div>

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
            {touches.length === 0 && <div className="empty">No calls or texts synced for {csm} today. (Demo data is only loaded for Tristan and Jack.)</div>}

            <Untouched list={attention} onLog={(id) => setAdding({ preselect: id })} />

            <div className="add-row bottom">
              <button className="btn" onClick={() => setAdding({})}>+ Add a client</button>
              <span className="meta">Talked to someone who isn’t listed? Add them.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {tab === 'form' && (
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
            <AnimatePresence>{submittedAt && <motion.span className="meta" initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}>✓ Submitted</motion.span>}</AnimatePresence>
            <motion.button whileTap={{ scale: 0.97 }} className="btn primary" disabled={touches.length === 0} onClick={() => setReview(true)}>
              {confirmedCount < touches.length ? 'Preview' : 'Review & submit'}
            </motion.button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {adding && (
          <AddClient key="add" csm={csm} preselect={adding.preselect} already={new Set(touches.map((t) => t.memberId || t.id))} onAdd={addTouch} onClose={() => setAdding(null)} />
        )}
        {review && (
          <Review
            key="review"
            allWrites={allWrites}
            cards={cards}
            openedAt={state.openedAt}
            canSubmit={confirmedCount === touches.length && touches.length > 0}
            onClose={() => setReview(false)}
            onSubmit={() => {
              setSubmittedAt(Date.now());
              setReview(false);
            }}
            csm={csm}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

/* ---------- Card ---------- */

function Card({ t, sec, c, setValue, patch, setFlag, onSeen, onConfirm, onRemove }) {
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
  const questions = buildQuestions(sec, t, v);
  const missing = missingRequired(sec, t, v);
  const compliance = complianceAlerts(sec, t, v);
  const activeFlags = ADDONS.filter((f) => c.flags[f.key]?.on);
  const canAdd = (a) => !c.flags[a.key]?.on && (!a.onlyAfterFirstSale || t.current.journey?.firstSale);
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
          <HealthPicker value={v.health} ai={ai('health')} was={t.current.health} onChange={(n) => setValue('health', n)} />
        </div>

        <Drawer open={c.showDetails}>
          <Details t={t} sec={sec} c={c} />
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
            {cur ? cur.label : 'Health?'}
          </motion.span>
        </AnimatePresence>
        {was && Number(was) !== Number(value) && <span className="muted"> (was {healthOf(was)?.label})</span>}
      </div>
      <div className="hp-row">
        {HEALTH.map((h) => (
          <button key={h.v} title={`${h.v} · ${h.label}`} onClick={() => onChange(h.v)} className={Number(value) === h.v ? 'on' : ''} style={{ '--c': h.color }}>
            {Number(value) === h.v && <motion.span layoutId={'hp' + id} className="hp-pill" style={{ background: h.color }} transition={SPRING} />}
            <span className="hp-n">{h.v}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Details({ t, sec, c }) {
  const writes = computeWrites(sec, t, c.values, c.flags);
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
        {writes.filter((w) => w.kind !== 'skip').map((w, i) => (
          <div key={i} className="small">
            <span className="muted">{w.table === 'Members' ? '' : w.table + ' · '}{w.field}:</span> {String(w.to)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Untouched ---------- */

const LEVEL = { 3: ['Overdue', 'bad'], 2: ['Touch today', 'warn'], 1: ['Due tomorrow', 'soon'] };

function Untouched({ list, onLog }) {
  const [open, setOpen] = useState(true);
  if (!list?.length) return null;
  return (
    <section className={`sec attention ${open ? 'is-open' : ''}`}>
      <button className="sec-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <motion.span className="chev" animate={{ rotate: open ? 90 : 0 }} transition={SPRING}>›</motion.span>
        <span className="sec-title">Needs attention</span>
        <span className="sec-count">{list.length}</span>
        <span className="spacer" />
        <span className="sec-prog">Not contacted today · {TOUCH_RULE.perWeek}/week, max {TOUCH_RULE.maxGapDays} days apart</span>
      </button>
      <Drawer open={open}>
        <div className="untouched">
          {list.map((u, i) => {
            const hh = healthOf(u.current.health);
            const [lvl, cls] = LEVEL[u.status.level];
            return (
              <motion.div className="row" key={u.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...DRAWER, delay: i * 0.04 }}>
                <span className={`lvl ${cls}`}>{lvl}</span>
                <span className="hdot" style={{ background: hh?.color }} title={hh?.label} />
                <b>{u.name}</b>
                <span className="meta">{u.status.week}/{TOUCH_RULE.perWeek} this week</span>
                <span className="reasons">{u.status.reasons.join(' · ')}</span>
                <span className="spacer" />
                <button className="link" onClick={() => onLog(u.id)}>Log a touch</button>
              </motion.div>
            );
          })}
        </div>
      </Drawer>
    </section>
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

function AddClient({ csm, preselect, already, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState(() => ROSTER.find((m) => m.id === preselect) || null);
  const [type, setType] = useState('');
  const list = ROSTER.filter((m) => (all || m.csm === csm) && !already.has(m.id))
    .filter((m) => !q || `${m.name} ${m.business}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal onClose={onClose} narrow>
        <h3>Add a client</h3>
        <div className="meta">For a conversation that didn’t sync from GHL or Fathom.</div>

        {!picked ? (
          <>
            <input className="search" autoFocus placeholder="Search name or business…" value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="meta check">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show members assigned to other CSMs
            </label>
            <div className="pick-list">
              {list.map((m) => (
                <button key={m.id} className="pick" onClick={() => setPicked(m)}>
                  <b>{m.name}</b> <span className="muted">{m.business}</span>
                  {m.csm !== csm && <span className="pill manual">{m.csm}</span>}
                </button>
              ))}
              {list.length === 0 && <div className="meta" style={{ padding: 10 }}>No matches. Not in Airtable? That’s a sales→CS handoff issue. Flag it to ops.</div>}
            </div>
          </>
        ) : (
          <>
            <div className="picked">
              <b>{picked.name}</b> <span className="muted">{picked.business}</span>
              {picked.csm !== csm && <span className="pill manual">{picked.csm}’s client</span>}
              <span className="spacer" />
              {!preselect && <button className="link" onClick={() => setPicked(null)}>change</button>}
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

/* ---------- Review ---------- */

function Review({ allWrites, cards, openedAt, canSubmit, onClose, onSubmit, csm }) {
  const total = allWrites.reduce((n, x) => n + x.writes.filter((w) => w.kind !== 'skip').length, 0);
  const now = Date.now();
  const timing = allWrites.map(({ t }) => {
    const c = cards[t.id];
    const ms = c.confirmedAt && c.seenAt ? c.confirmedAt - c.seenAt : null;
    return { name: t.name, manual: t.manual, ms, edits: c.edits, confirmed: c.confirmed, quick: c.confirmed && ms != null && ms < QUICK_MS && c.edits === 0 };
  });
  const quick = timing.filter((x) => x.quick).length;
  const manual = allWrites.filter(({ t }) => t.manual).length;
  const edits = timing.reduce((n, x) => n + x.edits, 0);

  return (
    <Modal onClose={onClose}>
        <h3>{canSubmit ? 'Submit your EOD' : 'Preview'}</h3>
        <div className="meta">
          {total} Airtable updates across {allWrites.length} members, plus 1 EOD log row for {csm} ({fmtDate(TODAY)}).
          {!canSubmit && ' Check every card to submit.'}
        </div>

        {allWrites.map(({ t, writes }) => (
          <div className="grp writes" key={t.id}>
            <h4>{t.name}</h4>
            <table>
              <tbody>
                {writes.map((w, i) => (
                  <tr key={i} className={w.kind === 'skip' ? 'skipped' : ''}>
                    <td style={{ width: '34%' }}>
                      {w.table !== 'Members' && <span className="muted">{w.table} · </span>}
                      {w.field}
                    </td>
                    <td>
                      {w.from && w.from !== w.to && <span className="from">{String(w.from)}</span>}
                      {String(w.to)}
                      {w.note && <span className="muted"> — {w.note}</span>}
                    </td>
                    <td style={{ width: 150, textAlign: 'right' }}>
                      {w.kind === 'create' && <span className="st create">new row</span>}{' '}
                      {w.kind === 'comment' && <span className="st comment">comment</span>}{' '}
                      {w.status === 'new' && <span className="st new">new field</span>}{' '}
                      {w.status === 'options' && <span className="st options">new options</span>}{' '}
                      {w.viktor && <span className="st viktor">viktor</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="admin">
          <div className="admin-h">Behind the scenes (admin only, the CSM never sees this)</div>
          <div className="admin-stats">
            <span>Time on form: <b>{secs(now - openedAt)}</b></span>
            <span>AI values changed: <b>{edits}</b></span>
            <span>Quick confirms (&lt;{QUICK_MS / 1000}s, no edits): <b className={quick ? 'bad-t' : ''}>{quick}</b></span>
            <span>Added by hand (missed by sync): <b className={manual ? 'bad-t' : ''}>{manual}</b></span>
          </div>
          <table>
            <tbody>
              {timing.map((x) => (
                <tr key={x.name}>
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
          <button className="btn" onClick={onClose}>Back</button>
          <button className="btn primary" disabled={!canSubmit} onClick={onSubmit}>Submit EOD</button>
        </div>
    </Modal>
  );
}

/* ---------- Data map ---------- */

function DataMap() {
  const label = { exists: 'existing field', options: 'add options', comment: 'comment', eod: 'EOD Check-ins', supabase: 'Supabase' };
  const n = (s) => DATA_MAP.filter((r) => r[3] === s).length;
  const order = Object.keys(STEPS);
  return (
    <div className="wrap map">
      <p className="note">
        What the real build needs. Airtable changes are kept to the minimum: two new Health Status options and five fields on the existing EOD Check-ins table. No new Members fields, no new tables. Everything else uses existing fields or a comment on the record.
      </p>

      <h2>How the prefill works</h2>
      <div className="flow">
        <div className="node">GHL webhooks<small>SMS, calls, calendar</small></div>
        <span className="arr">+</span>
        <div className="node">Fathom webhook<small>recording + transcript</small></div>
        <span className="arr">→</span>
        <div className="node">Touch store<small>matched to Member + CSM</small></div>
        <span className="arr">→</span>
        <div className="node">AI extraction<small>outcome, next step, sale, pitches, gaps</small></div>
        <span className="arr">→</span>
        <div className="node">EOD form<small>CSM checks each card</small></div>
        <span className="arr">→</span>
        <div className="node">Airtable<small>Members + related tables + EOD log</small></div>
      </div>

      <h2>Which questions show up</h2>
      <p className="small muted">
        Every card asks outcome, next step, due and health. Pitch and sale questions are asked every time for their call type. A journey step that should be done by this call but has no date in Airtable becomes a question. If the date is already there, the question doesn’t show.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Call type</th>
              <th>Always asked</th>
              <th>Asked only if missing in Airtable</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><b>Onboarding</b></td><td>Pitched SEO/AEO? → result</td><td>—</td></tr>
            <tr><td><b>Pre-launch</b></td><td>—</td><td>{EXPECTED.prelaunch.map((k) => STEPS[k].label).join(', ')}</td></tr>
            <tr><td><b>Launch</b></td><td>Pitched Affirm? → result · Marketing go-live date</td><td>{EXPECTED.launch.map((k) => STEPS[k].label).join(', ')}</td></tr>
            <tr><td><b>Check-in</b></td><td>First sale yet? → date, $ job, $ collected (only until a first sale is on record). Everything else is optional via “+ Add”.</td><td>{EXPECTED.checkin.map((k) => STEPS[k].label).join(', ')}, then first appointment booked / held once a first lead exists</td></tr>
            <tr><td><b>Texts / phone</b></td><td>First sale yet? (only until one is on record)</td><td>Same as the member’s current stage</td></tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">Journey order: {order.map((k) => STEPS[k].label).join(' → ')}</p>

      <h2>Data points</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Data point</th>
              <th>Source</th>
              <th>Where it goes</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {DATA_MAP.map((r, i) => (
              <tr key={i}>
                <td><b>{r[0]}</b></td>
                <td>{r[1]}</td>
                <td>{r[2]}</td>
                <td><span className={`st ${r[3]}`}>{label[r[3]]}</span></td>
                <td>{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Decided</h2>
      <ul>
        {DECISIONS.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ul>

      <h2>Open questions</h2>
      <ol>
        {OPEN_QUESTIONS.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>
    </div>
  );
}
