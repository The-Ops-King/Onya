'use client';

import { useMemo, useState, useEffect } from 'react';
import { CSMS, SECTIONS, FLAGS, HEALTH, DATA_MAP, OPEN_QUESTIONS, TODAY } from '@/lib/config';
import { getCsmData } from '@/lib/mock';
import { computeWrites, missingRequired, complianceAlerts, isVisible } from '@/lib/writes';

const PROV_LABEL = { ai: 'AI', airtable: 'Airtable', calendar: 'Calendar', edited: 'Edited', empty: 'Needs input' };
const SRC_ICON = { fathom: '🎥', sms: '💬', call: '📞', calendar: '📅' };
const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const healthOf = (v) => HEALTH.find((h) => h.v === Number(v));

function initState(csm) {
  const data = getCsmData(csm);
  const cards = {};
  for (const t of data.touches) {
    cards[t.id] = { values: { ...t.values }, prov: { ...t.prov }, flags: JSON.parse(JSON.stringify(t.flags || {})), confirmed: false, open: true };
  }
  return { data, cards };
}

export default function Page() {
  const [tab, setTab] = useState('form');
  const [csm, setCsm] = useState('Tristan');
  const [{ data, cards }, setState] = useState(() => initState('Tristan'));
  const [day, setDay] = useState({ wins: '', blockers: '', improvement: '' });
  const [review, setReview] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setState(initState(csm));
    setSubmitted(false);
    setDay({ wins: '', blockers: '', improvement: '' });
  }, [csm]);

  const update = (id, fn) => setState((s) => ({ ...s, cards: { ...s.cards, [id]: fn(s.cards[id]) } }));

  const setValue = (id, key, val) =>
    update(id, (c) => {
      const values = { ...c.values, [key]: val };
      const flags = { ...c.flags };
      // "Sold" on a pitch auto-toggles the upsell flag
      if ((key === 'affirmResult' || key === 'aeoResult') && val === 'Sold') {
        flags.upsell = { on: true, type: key === 'affirmResult' ? 'Financing' : 'SEO + AEO', amount: flags.upsell?.amount || '', prov: 'edited' };
      }
      return { ...c, values, flags, prov: { ...c.prov, [key]: 'edited' } };
    });

  const setFlag = (id, key, patch) => update(id, (c) => ({ ...c, flags: { ...c.flags, [key]: { ...(c.flags[key] || {}), ...patch } } }));

  const touches = data.touches;
  const counts = useMemo(() => {
    let confirmed = 0, sales = 0, refunds = 0, needs = 0, upsells = 0, compliance = 0;
    for (const t of touches) {
      const c = cards[t.id];
      if (!c) continue;
      const sec = SECTIONS.find((s) => s.id === t.section);
      if (c.confirmed) confirmed++;
      if (c.values.sale === 'Yes') sales++;
      if (c.flags.refund?.on) refunds++;
      if (c.flags.upsell?.on) upsells++;
      if (missingRequired(sec, c.values).length) needs++;
      compliance += complianceAlerts(sec, c.values).length;
    }
    const calls = touches.filter((t) => t.section !== 'comms').length;
    return { confirmed, sales, refunds, needs, upsells, compliance, calls, comms: touches.length - calls };
  }, [touches, cards]);

  const allWrites = useMemo(
    () =>
      touches.map((t) => {
        const sec = SECTIONS.find((s) => s.id === t.section);
        const c = cards[t.id];
        return { t, writes: c ? computeWrites(sec, t, c.values, c.flags) : [] };
      }),
    [touches, cards]
  );

  return (
    <>
      <div className="top">
        <div className="top-inner">
          <div className="brand">
            Onya <span>· CSM End of Day</span>
          </div>
          <div className="tabs">
            <button className={tab === 'form' ? 'on' : ''} onClick={() => setTab('form')}>EOD form</button>
            <button className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>Data we need</button>
          </div>
          <div className="spacer" />
          <div className="csm-pick">
            <span className="meta">I am</span>
            <select value={csm} onChange={(e) => setCsm(e.target.value)}>
              {CSMS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="meta">
            Mon, Nov 23 · synced from GHL + Fathom {data.lastSync}
          </div>
        </div>
      </div>

      {tab === 'map' ? (
        <DataMap />
      ) : (
        <div className="wrap">
          <div className="banner">Demo. Members are fictional and nothing is written to Airtable. Demo data is loaded for Tristan and Jack.</div>

          <div className="stats">
            <Stat n={touches.length} l="Members touched" />
            <Stat n={counts.calls} l="Calls" />
            <Stat n={counts.comms} l="Texts / phone" />
            <Stat n={counts.sales} l="Sales reported" hl />
            <Stat n={counts.upsells} l="Upsells" hl />
            <Stat n={counts.refunds} l="Refund flags" bad={counts.refunds > 0} />
            <Stat n={counts.compliance} l="Missed pitches" bad={counts.compliance > 0} />
            <Stat n={counts.needs} l="Cards need input" bad={counts.needs > 0} />
          </div>

          <div className="legend">
            Prefill source:
            <span className="tag ai">AI</span> from transcript/SMS
            <span className="tag airtable">Airtable</span> current record
            <span className="tag calendar">Calendar</span> GHL event
            <span className="tag edited">Edited</span> by you
            <span className="tag empty">Needs input</span>
          </div>

          {SECTIONS.map((sec) => {
            const list = touches.filter((t) => t.section === sec.id);
            return (
              <div className="section" key={sec.id}>
                <div className="section-h">
                  <h2>{sec.title}</h2>
                  <span className="count">{list.length}</span>
                  <span className="src">{sec.source}</span>
                </div>
                {list.length === 0 && <div className="empty">None today.</div>}
                {list.map((t) => (
                  <Card
                    key={t.id}
                    t={t}
                    sec={sec}
                    c={cards[t.id]}
                    setValue={(k, v) => setValue(t.id, k, v)}
                    setFlag={(k, p) => setFlag(t.id, k, p)}
                    setConfirmed={(v) => update(t.id, (c) => ({ ...c, confirmed: v, open: !v }))}
                    setOpen={(v) => update(t.id, (c) => ({ ...c, open: v }))}
                  />
                ))}
              </div>
            );
          })}

          <Untouched list={data.untouched} />

          <div className="section">
            <div className="section-h">
              <h2>Your day</h2>
              <span className="src">Optional · goes to the EOD log, not Members</span>
            </div>
            <div className="day grid">
              <div className="f wide">
                <label>Anything not captured above?</label>
                <textarea value={day.wins} onChange={(e) => setDay({ ...day, wins: e.target.value })} placeholder="Internal work, escalations in progress, etc." />
              </div>
              <div className="f wide">
                <label>Blockers / need help from leadership</label>
                <textarea value={day.blockers} onChange={(e) => setDay({ ...day, blockers: e.target.value })} />
              </div>
              <div className="f wide">
                <label>1% improvement</label>
                <input value={day.improvement} onChange={(e) => setDay({ ...day, improvement: e.target.value })} />
              </div>
              <div className="f wide">
                <label>Tomorrow (auto from next steps due)</label>
                <div className="hint">
                  {touches
                    .filter((t) => cards[t.id]?.values.nextDue === '2026-11-24')
                    .map((t) => `${t.name}: ${cards[t.id].values.nextStep}`)
                    .join(' · ') || 'Nothing due tomorrow.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'form' && (
        <div className="bar">
          <div className="bar-inner">
            <div className="progress">
              <small>
                {counts.confirmed} of {touches.length} confirmed
                {counts.needs ? ` · ${counts.needs} need input` : ''}
              </small>
              <div className="track">
                <div className="fill" style={{ width: touches.length ? `${(counts.confirmed / touches.length) * 100}%` : '0%' }} />
              </div>
            </div>
            {submitted && <span className="meta">✓ Submitted (demo)</span>}
            <button className="btn" onClick={() => setReview(true)}>Preview Airtable writes</button>
            <button className="btn primary" disabled={counts.confirmed < touches.length || touches.length === 0} onClick={() => setReview(true)}>
              Review &amp; submit
            </button>
          </div>
        </div>
      )}

      {review && (
        <Review
          allWrites={allWrites}
          canSubmit={counts.confirmed === touches.length && touches.length > 0}
          onClose={() => setReview(false)}
          onSubmit={() => {
            setSubmitted(true);
            setReview(false);
          }}
          csm={csm}
        />
      )}
    </>
  );
}

function Stat({ n, l, hl, bad }) {
  return (
    <div className={`stat ${hl && n ? 'hl' : ''} ${bad ? 'bad' : ''}`}>
      <b>{n}</b>
      <span>{l}</span>
    </div>
  );
}

function HealthBadge({ v }) {
  const h = healthOf(v);
  if (!h) return null;
  return (
    <span className="pill" style={{ borderColor: h.color, color: h.color }}>
      <span className="hdot" style={{ background: h.color, marginRight: 5 }} />
      {h.label}
    </span>
  );
}

function Card({ t, sec, c, setValue, setFlag, setConfirmed, setOpen }) {
  if (!c) return null;
  const missing = missingRequired(sec, c.values);
  const compliance = complianceAlerts(sec, c.values);

  if (!c.open) {
    return (
      <div className={`card ${c.confirmed ? 'done' : ''}`}>
        <div className="collapsed" onClick={() => setOpen(true)}>
          {c.confirmed && <span className="ok">✓</span>}
          <span className="name" style={{ fontWeight: 650 }}>{t.name}</span>
          <span className="pill">{c.values.outcome || '—'}</span>
          <HealthBadge v={c.values.health} />
          {c.values.sale === 'Yes' && <span className="pill" style={{ color: 'var(--ok)' }}>Sale ${Number(c.values.jobValue || 0).toLocaleString()}</span>}
          {c.flags.refund?.on && <span className="pill" style={{ color: 'var(--bad)' }}>Refund flag</span>}
          <span className="sum">
            Next: {c.values.nextStep || '—'} {c.values.nextDue ? `· ${fmtDate(c.values.nextDue)}` : ''}
          </span>
          <span className="spacer" />
          <button className="link">Edit</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${c.confirmed ? 'done' : ''}`}>
      <div className="card-h">
        <span className="name">{t.name}</span>
        <span className="biz">{t.business}</span>
        <span className="pill">{t.pkg}</span>
        <span className="pill">{t.current.stage}</span>
        <span className="spacer" style={{ flex: 1 }} />
        {t.sources.map((s, i) => (
          <span key={i} className="src-chip" title="Opens the recording / thread in the real build">
            {SRC_ICON[s.kind]} <b>{s.label}</b> · {s.detail}
          </span>
        ))}
      </div>
      <div className="card-b">
        <div className="summary">
          <p>{t.summary}</p>
          {t.evidence?.length > 0 && (
            <details className="evd">
              <summary>Evidence ({t.evidence.length})</summary>
              {t.evidence.map((e, i) => (
                <div className="ev" key={i}>
                  <i>{e.t}</i>
                  <b>{e.who}:</b> “{e.text}”
                </div>
              ))}
            </details>
          )}
        </div>

        {t.alerts.map((a, i) => (
          <div key={i} className="alert warn">⚠ {a}</div>
        ))}
        {compliance.map((a, i) => (
          <div key={'c' + i} className="alert bad">✕ {a}</div>
        ))}

        <div className="grid">
          {sec.fields.filter((f) => isVisible(f, c.values)).map((f) => (
            <Field key={f.key} f={f} v={c.values[f.key] ?? ''} prov={c.prov[f.key]} onChange={(v) => setValue(f.key, v)} current={t.current} />
          ))}
        </div>

        <div className="flags">
          {FLAGS.map((fl) => {
            const on = c.flags[fl.key]?.on;
            const good = fl.key === 'upsell' || fl.key === 'caseStudy';
            return (
              <button key={fl.key} className={`flag ${on ? 'on' : ''} ${good ? 'good' : ''}`} onClick={() => setFlag(fl.key, { on: !on, prov: 'edited' })} title={`Writes to: ${fl.at}`}>
                {on ? '✓ ' : '+ '}
                {fl.label}
                {on && c.flags[fl.key]?.prov === 'ai' && <span className="tag ai" style={{ marginLeft: 6 }}>AI</span>}
              </button>
            );
          })}
        </div>
        {(c.flags.refund?.on || c.flags.upsell?.on || c.flags.escalate?.on || c.flags.caseStudy?.on) && (
          <div className="flag-detail">
            {c.flags.refund?.on && (
              <div className="f wide">
                <label>Refund / cancel — what did they say?</label>
                <input value={c.flags.refund.note || ''} onChange={(e) => setFlag('refund', { note: e.target.value })} />
              </div>
            )}
            {c.flags.upsell?.on && (
              <>
                <div className="f">
                  <label>Upsell type</label>
                  <select value={c.flags.upsell.type || ''} onChange={(e) => setFlag('upsell', { type: e.target.value })}>
                    <option value="">Select…</option>
                    {['Skid', 'Gutter Guards', 'Financing', 'SEO', 'AEO', 'SEO + AEO', 'Package upgrade', 'Lead purchase', 'Other'].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="f">
                  <label>Cash collected $</label>
                  <input inputMode="numeric" value={c.flags.upsell.amount || ''} onChange={(e) => setFlag('upsell', { amount: e.target.value.replace(/[^\d.]/g, '') })} />
                </div>
              </>
            )}
            {c.flags.escalate?.on && (
              <div className="f wide">
                <label>Escalation — what do you need?</label>
                <input value={c.flags.escalate.note || ''} onChange={(e) => setFlag('escalate', { note: e.target.value })} />
              </div>
            )}
            {c.flags.caseStudy?.on && (
              <div className="f wide">
                <label>Case study — type / status</label>
                <input value={c.flags.caseStudy.note || ''} onChange={(e) => setFlag('caseStudy', { note: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card-f">
        <span className="meta">{missing.length ? `Needs: ${missing.join(', ')}` : 'All required fields filled'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {c.confirmed && (
            <button className="btn ghost" onClick={() => setOpen(false)}>
              Collapse
            </button>
          )}
          <button className="btn primary" disabled={missing.length > 0} onClick={() => setConfirmed(!c.confirmed)}>
            {c.confirmed ? 'Unconfirm' : 'Looks right ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ f, v, prov, onChange, current }) {
  const empty = v === '' || v == null;
  const p = empty ? (f.required ? 'empty' : null) : prov;
  const cls = `f ${f.wide ? 'wide' : ''} ${empty && f.required ? 'missing' : ''}`;
  const tip = f.at ? `Writes to ${f.at}${f.status === 'new' ? ' (NEW field)' : f.status === 'options' ? ' (options change)' : ''}${f.note ? ' — ' + f.note : ''}` : 'EOD log only';

  let input;
  if (f.type === 'select') {
    input = (
      <select value={v} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {f.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    );
  } else if (f.type === 'yesno') {
    input = (
      <div className="yn">
        {f.options.map((o) => (
          <button key={o} className={v === o ? 'on' : ''} onClick={() => onChange(v === o ? '' : o)}>
            {o}
          </button>
        ))}
      </div>
    );
  } else if (f.type === 'health') {
    input = (
      <div className="health">
        {HEALTH.map((h) => (
          <button
            key={h.v}
            onClick={() => onChange(h.v)}
            title={h.label}
            style={Number(v) === h.v ? { background: h.color, borderColor: h.color, color: '#fff', fontWeight: 700 } : {}}
          >
            {h.v}
            <br />
            <span style={{ fontSize: 10 }}>{h.label}</span>
          </button>
        ))}
      </div>
    );
  } else if (f.type === 'textarea') {
    input = <textarea value={v} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === 'date') {
    input = <input type="date" value={v} onChange={(e) => onChange(e.target.value)} />;
  } else if (f.type === 'money') {
    input = <input inputMode="numeric" placeholder="$" value={v} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} />;
  } else {
    input = <input value={v} onChange={(e) => onChange(e.target.value)} />;
  }

  let hint = null;
  if (f.type === 'health' && current?.health && Number(current.health) !== Number(v)) hint = `Was: ${healthOf(current.health)?.label}`;
  if (f.key === 'nextStep' && current?.nextStep && current.nextStep !== v) hint = `Was: ${current.nextStep}`;

  return (
    <div className={cls} title={tip}>
      <label>
        {f.label}
        {f.required && <span className="req">*</span>}
        {p && <span className={`tag ${p}`}>{PROV_LABEL[p]}</span>}
        {f.status === 'new' && <span className="st new" title="Field does not exist in Airtable yet">new</span>}
      </label>
      {input}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function Untouched({ list }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="section">
      <div className="section-h">
        <h2>Needs attention: no contact today</h2>
        <span className="count">{list.length}</span>
        <button className="link" style={{ marginLeft: 'auto' }} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <div className="card untouched">
          {list.length === 0 && <div className="row meta">Nobody flagged.</div>}
          {list.map((u) => (
            <div className="row" key={u.id}>
              <b>{u.name}</b>
              <span className="meta">{u.business}</span>
              <HealthBadge v={u.health} />
              <span className="reasons">{u.reasons.join(' · ')}</span>
              <button className="link">Log a touch</button>
            </div>
          ))}
        </div>
      )}
      {!open && <div className="empty">Assigned members with an overdue next step, health 3 or worse, or 5+ days without contact. Not required.</div>}
    </div>
  );
}

function Review({ allWrites, canSubmit, onClose, onSubmit, csm }) {
  const total = allWrites.reduce((n, x) => n + x.writes.filter((w) => w.kind !== 'skip').length, 0);
  const viktor = allWrites.reduce((n, x) => n + x.writes.filter((w) => w.viktor).length, 0);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Airtable writes on submit</h3>
        <div className="meta">
          {total} writes · {viktor} touch fields Viktor also writes · plus 1 EOD log row for {csm} on {fmtDate(TODAY)}
        </div>
        {allWrites.map(({ t, writes }) => (
          <div className="grp writes" key={t.id}>
            <h4>{t.name}</h4>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '24%' }}>Table</th>
                  <th style={{ width: '24%' }}>Field</th>
                  <th>Value</th>
                  <th style={{ width: 130 }}></th>
                </tr>
              </thead>
              <tbody>
                {writes.map((w, i) => (
                  <tr key={i}>
                    <td>{w.table}</td>
                    <td>{w.field}</td>
                    <td>
                      {w.from && w.from !== w.to && <span className="from">{String(w.from)}</span>}
                      {String(w.to)}
                      {w.note && <div className="meta">{w.note}</div>}
                    </td>
                    <td>
                      {w.kind === 'skip' && <span className="st skip">skip</span>}
                      {w.kind === 'create' && <span className="st create">new row</span>}{' '}
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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            Back
          </button>
          <button className="btn primary" disabled={!canSubmit} onClick={onSubmit} title={canSubmit ? '' : 'Confirm every card first'}>
            Submit EOD (demo)
          </button>
        </div>
      </div>
    </div>
  );
}

function DataMap() {
  const label = { exists: 'exists', new: 'new', options: 'options change' };
  const n = (s) => DATA_MAP.filter((r) => r[3] === s).length;
  return (
    <div className="wrap map">
      <div className="banner">
        What the real build needs. {n('exists')} data points already have an Airtable home, {n('new')} need a new field or table, and {n('options')} needs its options changed.
      </div>

      <h2>How the prefill works</h2>
      <div className="flow">
        <div className="node">GHL webhooks<small>SMS, calls, calendar events</small></div>
        <span className="arr">+</span>
        <div className="node">Fathom webhook<small>recording + transcript</small></div>
        <span className="arr">→</span>
        <div className="node">Touch store<small>Supabase/Railway · matched to Member + CSM</small></div>
        <span className="arr">→</span>
        <div className="node">AI extraction<small>outcome, next step, sale, refund, pitches</small></div>
        <span className="arr">→</span>
        <div className="node">EOD form<small>CSM confirms each card</small></div>
        <span className="arr">→</span>
        <div className="node">Airtable<small>Members + related tables + EOD log</small></div>
      </div>

      <h2>Data points</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Data point</th>
              <th>Source</th>
              <th>Airtable target</th>
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

      <h2>Open questions</h2>
      <ol>
        {OPEN_QUESTIONS.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>
    </div>
  );
}
