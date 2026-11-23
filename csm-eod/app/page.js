'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const phase = member.current.journey?.firstLead ? 'checkin' : member.current.journey?.oilDelivered ? 'launch' : member.current.journey?.onboarded ? 'prelaunch' : 'onboarding';
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
  const { data, cards } = state;

  const addTouch = (member, section) => {
    const t = manualTouch(member, section, csm);
    setState((s) => ({ ...s, data: { ...s.data, touches: [...s.data.touches, t] }, cards: { ...s.cards, [t.id]: newCard(t) } }));
    setAdding(null);
    setTimeout(() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const removeTouch = (id) =>
    setState((s) => {
      const cards = { ...s.cards };
      delete cards[id];
      return { ...s, data: { ...s.data, touches: s.data.touches.filter((t) => t.id !== id) }, cards };
    });

  useEffect(() => {
    setState(initState(csm));
    setSubmittedAt(null);
  }, [csm]);

  const update = (id, fn) => setState((s) => ({ ...s, cards: { ...s.cards, [id]: fn(s.cards[id]) } }));

  const setValue = (id, key, val) =>
    update(id, (c) => {
      const values = { ...c.values, [key]: val };
      const flags = { ...c.flags };
      if ((key === 'affirmResult' || key === 'aeoResult') && val === 'Sold' && !flags.upsell?.on) {
        flags.upsell = { on: true, type: key === 'affirmResult' ? 'Financing' : 'SEO + AEO', amount: '' };
      }
      const wasAi = c.prov[key] === 'ai';
      return { ...c, values, flags, prov: { ...c.prov, [key]: 'edited' }, edits: c.edits + (wasAi ? 1 : 0) };
    });

  const touches = data.touches;
  const confirmedCount = touches.filter((t) => cards[t.id]?.confirmed).length;

  const allWrites = useMemo(
    () =>
      touches.map((t) => {
        const sec = SECTIONS.find((s) => s.id === t.section);
        const c = cards[t.id];
        return { t, writes: c ? computeWrites(sec, t, c.values, c.flags, csm) : [] };
      }),
    [touches, cards, csm]
  );

  return (
    <>
      <div className="top">
        <div className="top-inner">
          <div className="brand">
            Onya <span>· End of Day</span>
          </div>
          <div className="tabs">
            <button className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>EOD</button>
            <button className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>Data we need</button>
          </div>
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

      {tab === 'map' ? (
        <DataMap />
      ) : (
        <div className="wrap">
          <p className="note">
            Demo with fictional members. Everything below is prefilled from today’s calls and texts. Check each card and fix anything that’s wrong.
            <span className="dot-ai" style={{ marginLeft: 6 }} /> = filled in for you.
          </p>
          <div className="add-row">
            <button className="btn" onClick={() => setAdding({})}>+ Add a client</button>
            <span className="meta">Talked to someone who isn’t listed? Add them.</span>
          </div>

          {SECTIONS.map((sec) => {
            const list = touches.filter((t) => t.section === sec.id);
            if (!list.length) return null;
            return (
              <div className="section" key={sec.id}>
                <div className="section-h">
                  <h2>{sec.title}</h2>
                  <span className="count">{list.length}</span>
                </div>
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
                    onRemove={t.manual ? () => removeTouch(t.id) : null}
                  />
                ))}
              </div>
            );
          })}
          {touches.length === 0 && <div className="empty">No calls or texts synced for {csm} today. (Demo data is only loaded for Tristan and Jack.)</div>}

          <Untouched list={needsAttention(ROSTER, csm, new Set(touches.map((t) => t.memberId || t.id)))} onLog={(id) => setAdding({ preselect: id })} />

          <div className="add-row bottom">
            <button className="btn" onClick={() => setAdding({})}>+ Add a client</button>
            <span className="meta">Talked to someone who isn’t listed? Add them.</span>
          </div>
        </div>
      )}

      {tab === 'form' && (
        <div className="bar">
          <div className="bar-inner">
            <div className="progress">
              <small>
                {confirmedCount} of {touches.length} checked
              </small>
              <div className="track">
                <div className="fill" style={{ width: touches.length ? `${(confirmedCount / touches.length) * 100}%` : '0%' }} />
              </div>
            </div>
            {submittedAt && <span className="meta">✓ Submitted</span>}
            <button className="btn primary" disabled={touches.length === 0} onClick={() => setReview(true)}>
              {confirmedCount < touches.length ? 'Preview' : 'Review & submit'}
            </button>
          </div>
        </div>
      )}

      {adding && (
        <AddClient
          csm={csm}
          preselect={adding.preselect}
          already={new Set(touches.map((t) => t.memberId || t.id))}
          onAdd={addTouch}
          onClose={() => setAdding(null)}
        />
      )}

      {review && (
        <Review
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
    </>
  );
}

/* ---------- Card ---------- */

function Card({ t, sec, c, setValue, patch, setFlag, onSeen, onRemove }) {
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

  if (!c.open) {
    const h = healthOf(v.health);
    return (
      <div className="card done" ref={ref}>
        <div className="collapsed" onClick={() => patch({ open: true })}>
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
        </div>
      </div>
    );
  }

  return (
    <div className="card" ref={ref} id={t.id}>
      {/* Header: identity left, health right — same place on every card */}
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

      {c.showDetails && <Details t={t} sec={sec} c={c} />}

      <div className="card-b">
        {compliance.map((a, i) => (
          <div key={i} className="alert bad">{a}</div>
        ))}

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

        {questions.length > 0 && (
          <div className="qs">
            {questions.map((q) => (
              <Question key={q.key} q={q} v={v} ai={ai} setValue={setValue} />
            ))}
          </div>
        )}
        {!callHeld(sec, v) && v.outcome && <div className="muted small">Call didn’t happen, so no call questions.</div>}

        {activeFlags.length > 0 && (
          <div className="flag-rows">
            {activeFlags.map((a) => (
              <AddonRow key={a.key} a={a} val={c.flags[a.key]} set={(p) => setFlag(a.key, p)} />
            ))}
          </div>
        )}

        {c.showAdd && (
          <div className="add-menu">
            {ADDON_GROUPS.map((g) => {
              const items = ADDONS.filter((a) => a.group === g && canAdd(a));
              if (!items.length) return null;
              return (
                <div className="add-group" key={g}>
                  <span className="add-g">{g}</span>
                  {items.map((a) => (
                    <button key={a.key} className="chip" onClick={() => { setFlag(a.key, { on: true, prov: 'edited' }); patch({ showAdd: false }); }}>
                      {a.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card-f">
        <div className="adders">
          <button className="link" onClick={() => patch({ showAdd: !c.showAdd })}>{c.showAdd ? '× Close' : '+ Add'}</button>
          <span className="meta add-hint">issue, marketing, leads, reorder, sale, refund…</span>
          {onRemove && <button className="link danger" onClick={onRemove}>Remove</button>}
        </div>
        <div className="right">
          {missing.length > 0 && <span className="need">Needs: {missing.join(', ')}</span>}
          <button className="btn primary" disabled={missing.length > 0} onClick={() => patch({ confirmed: true, open: false, confirmedAt: Date.now() })}>
            Looks right ✓
          </button>
        </div>
      </div>
    </div>
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
              <input className="money" inputMode="numeric" value={v} onChange={(e) => on(e.target.value.replace(/[^0-9.]/g, ''))} />
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

function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(value === o ? '' : o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function Question({ q, v, ai, setValue }) {
  const val = v[q.key] ?? '';
  return (
    <div className={`q ${q.kind === 'gap' ? 'gap' : ''} ${q.required && !val ? 'missing' : ''}`}>
      <div className="q-label">
        {ai(q.key) && <span className="dot-ai" title="Filled in from the call/text. Check it." />}
        {q.q}
        {q.kind === 'gap' && <span className="gap-tag" title={q.note}>not in Airtable</span>}
      </div>
      <div className="q-ctl">
        {q.kind === 'pitch' && (
          <>
            <Seg options={['Yes', 'No']} value={val} onChange={(x) => setValue(q.key, x)} />
            {val === 'Yes' && (
              <select value={v[q.resultKey] || ''} onChange={(e) => setValue(q.resultKey, e.target.value)}>
                <option value="">Result…</option>
                {PITCH_RESULTS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            )}
          </>
        )}
        {q.kind === 'gap' && (
          <>
            <Seg options={['Yes', 'No', 'Not sure']} value={val} onChange={(x) => setValue(q.key, x)} />
            {val === 'Yes' && <input type="date" value={v[q.dateKey] || ''} onChange={(e) => setValue(q.dateKey, e.target.value)} />}
          </>
        )}
        {q.kind === 'sale' && (
          <>
            <Seg options={['Yes', 'No']} value={val} onChange={(x) => setValue('sale', x)} />
            {val === 'Yes' && (
              <>
                <input type="date" value={v.saleDate || ''} onChange={(e) => setValue('saleDate', e.target.value)} title="Sale date" />
                <label className="mini">
                  $ job
                  <input className="money" inputMode="numeric" value={v.jobValue || ''} onChange={(e) => setValue('jobValue', e.target.value.replace(/[^0-9.]/g, ''))} />
                </label>
                <label className="mini">
                  $ collected
                  <input className="money" inputMode="numeric" value={v.cashCollected || ''} onChange={(e) => setValue('cashCollected', e.target.value.replace(/[^0-9.]/g, ''))} />
                </label>
              </>
            )}
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
  const cur = healthOf(value);
  return (
    <div className="hp">
      <div className="hp-label">
        {ai && <span className="dot-ai" />}
        <span style={{ color: cur?.color }}>{cur ? cur.label : 'Health?'}</span>
        {was && Number(was) !== Number(value) && <span className="muted"> (was {healthOf(was)?.label})</span>}
      </div>
      <div className="hp-row">
        {HEALTH.map((h) => (
          <button
            key={h.v}
            title={`${h.v} · ${h.label}`}
            onClick={() => onChange(h.v)}
            className={Number(value) === h.v ? 'on' : ''}
            style={{ '--c': h.color }}
          >
            {h.v}
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
    <div className="section">
      <button className="untouched-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Needs attention: {list.length} assigned member{list.length > 1 ? 's' : ''} not contacted today
      </button>
      <div className="meta" style={{ marginTop: 2 }}>Rule: {TOUCH_RULE.perWeek} touches a week, no more than {TOUCH_RULE.maxGapDays} days between touches.</div>
      {open && (
        <div className="card untouched">
          {list.map((u) => {
            const h = healthOf(u.current.health);
            const [lvl, cls] = LEVEL[u.status.level];
            return (
              <div className="row" key={u.id}>
                <span className={`lvl ${cls}`}>{lvl}</span>
                <span className="hdot" style={{ background: h?.color }} title={h?.label} />
                <b>{u.name}</b>
                <span className="meta">{u.status.week}/{TOUCH_RULE.perWeek} this week</span>
                <span className="reasons">{u.status.reasons.join(' · ')}</span>
                <span className="spacer" />
                <button className="link" onClick={() => onLog(u.id)}>Log a touch</button>
              </div>
            );
          })}
        </div>
      )}
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

function AddClient({ csm, preselect, already, onAdd, onClose }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState(() => ROSTER.find((m) => m.id === preselect) || null);
  const [type, setType] = useState('');
  const list = ROSTER.filter((m) => (all || m.csm === csm) && !already.has(m.id))
    .filter((m) => !q || `${m.name} ${m.business}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
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
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>
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
