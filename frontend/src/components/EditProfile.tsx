// Edit profile: every change must be backed by a proof document. Each document is
// fingerprinted (SHA-256) in the browser and the change is marked pending verification.
// There is no reviewer in this prototype; the request and fingerprints are kept in this browser.
import { useState } from 'react'
import { type ProfileField, type Proof, useApp } from '../ctx'
import { IAlert, ICheck, IDoc } from './Icons'
import { Sheet } from './Sheet'

const FIELDS: { key: ProfileField; label: string }[] = [
  { key: 'name', label: 'Full name' },
  { key: 'role', label: 'Role' },
  { key: 'fund', label: 'Fund / firm' },
]

// Which proof each field needs. Name is identity; role and firm are employment.
const PROOF: Record<ProfileField, { kind: string; hint: string }> = {
  name: { kind: 'Government ID', hint: 'PAN card, passport or Aadhaar showing the new name' },
  role: { kind: 'Employment proof', hint: 'Appointment letter, offer letter or company ID showing the role' },
  fund: { kind: 'Employment proof', hint: 'Appointment letter, offer letter or company ID showing the firm' },
}
const ACCEPT = 'application/pdf,image/png,image/jpeg'
const MAX_BYTES = 10 * 1024 * 1024

async function sha256(f: File) {
  const buf = await crypto.subtle.digest('SHA-256', await f.arrayBuffer())
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('')
}

const kb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

export function EditProfile({ onClose }: { onClose: () => void }) {
  const { b, originalInvestor, profileEdit, setProfileEdit, toast } = useApp()
  const current = b.meta.investor
  const [vals, setVals] = useState<Record<ProfileField, string>>({ name: current.name, role: current.role, fund: current.fund })
  const [proofs, setProofs] = useState<Partial<Record<ProfileField, Proof>>>({})
  const [errs, setErrs] = useState<Partial<Record<ProfileField, string>>>({})
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)

  const changed = FIELDS.filter(f => vals[f.key].trim() && vals[f.key].trim() !== current[f.key])
  const missing = changed.filter(f => !proofs[f.key])
  const empty = FIELDS.filter(f => !vals[f.key].trim())
  const canSave = changed.length > 0 && missing.length === 0 && empty.length === 0 && agree && !busy

  const attach = async (field: ProfileField, f: File | undefined) => {
    if (!f) return
    if (!ACCEPT.split(',').includes(f.type)) return setErrs(e => ({ ...e, [field]: 'Use a PDF, PNG or JPG.' }))
    if (f.size > MAX_BYTES) return setErrs(e => ({ ...e, [field]: 'Keep it under 10 MB.' }))
    setErrs(e => ({ ...e, [field]: undefined }))
    setBusy(true)
    try {
      const hash = await sha256(f)
      setProofs(p => ({ ...p, [field]: { field, kind: PROOF[field].kind, file: f.name, size: f.size, type: f.type, sha256: hash } }))
    } catch {
      setErrs(e => ({ ...e, [field]: "Couldn't read that file." }))
    } finally { setBusy(false) }
  }

  const save = () => {
    if (!canSave) return
    const values: Partial<Record<ProfileField, string>> = { ...(profileEdit?.values ?? {}) }
    for (const f of changed) values[f.key] = vals[f.key].trim()
    // Drop values that are back to the original: nothing to verify there.
    for (const k of Object.keys(values) as ProfileField[]) if (values[k] === originalInvestor[k]) delete values[k]
    const kept = (profileEdit?.proofs ?? []).filter(p => !changed.some(c => c.key === p.field) && values[p.field])
    setProfileEdit(Object.keys(values).length
      ? { values, proofs: [...kept, ...changed.map(f => proofs[f.key]!)], submitted: new Date().toISOString(), status: 'pending' }
      : null)
    toast('Profile updated · verification pending')
    onClose()
  }

  return (
    <Sheet onClose={onClose} label="Edit profile">
      <h2 className="ep-title">Edit your profile</h2>
      <p className="small muted" style={{ marginTop: 4 }}>
        Every change needs a proof document. Changes show as <span className="warn">verification pending</span> until checked.
      </p>

      <div className="ep-fields">
        {FIELDS.map(f => {
          const isChanged = changed.some(c => c.key === f.key)
          const pr = proofs[f.key]
          return (
            <div key={f.key} className={`ep-field ${isChanged ? 'changed' : ''}`}>
              <label className="eyebrow" htmlFor={`ep-${f.key}`}>{f.label}</label>
              <input id={`ep-${f.key}`} className="ep-input" value={vals[f.key]} maxLength={80}
                onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))} />
              {!vals[f.key].trim() && <div className="tiny warn" style={{ marginTop: 6 }}>Can't be empty.</div>}

              {isChanged && (
                <div className="ep-proof">
                  <div className="tiny"><span className="strong">{PROOF[f.key].kind} required</span> <span className="muted">· {PROOF[f.key].hint}</span></div>
                  {pr ? (
                    <div className="ep-file">
                      <span className="up"><ICheck size={15} /></span>
                      <div style={{ minWidth: 0 }} className="grow">
                        <div className="small ellipsis">{pr.file} <span className="faint tiny">· {kb(pr.size)}</span></div>
                        <div className="tiny faint mono ellipsis" title={pr.sha256}>SHA-256 {pr.sha256.slice(0, 16)}…</div>
                      </div>
                      <button className="link tiny" onClick={() => setProofs(p => ({ ...p, [f.key]: undefined }))}>Remove</button>
                    </div>
                  ) : (
                    <label className="ep-drop">
                      <IDoc size={16} /><span className="small">Attach {PROOF[f.key].kind.toLowerCase()}</span><span className="tiny faint">PDF, PNG or JPG · up to 10 MB</span>
                      <input type="file" accept={ACCEPT} hidden onChange={e => attach(f.key, e.target.files?.[0])} />
                    </label>
                  )}
                  {errs[f.key] && <div className="tiny warn" style={{ marginTop: 6 }}><IAlert size={12} /> {errs[f.key]}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {changed.length > 0 && (
        <label className="ep-agree small">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
          <span>I confirm these documents are genuine, belong to me, and show the details I've entered.</span>
        </label>
      )}

      <div className="ep-actions">
        <span className="tiny faint grow">
          {changed.length === 0 ? 'Change a field to continue.'
            : missing.length ? `Attach proof for: ${missing.map(m => m.label.toLowerCase()).join(', ')}.`
            : !agree ? 'Confirm the declaration to save.' : `${changed.length} change${changed.length > 1 ? 's' : ''} ready.`}
        </span>
        <button className="act-btn" onClick={onClose}>Cancel</button>
        <button className="ep-save" disabled={!canSave} onClick={save}>{busy ? 'Reading…' : 'Submit for verification'}</button>
      </div>

      <p className="tiny faint" style={{ marginTop: 14 }}>
        In this prototype the documents aren't uploaded anywhere: only the file name and its fingerprint are kept, in this browser.
      </p>
    </Sheet>
  )
}
