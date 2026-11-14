import { useApp } from '../ctx'
import { initials } from '../format'
import type { Path, PersonCard } from '../types'
import { IChev } from './Icons'
import { hue, Tie } from './Viz'

export function Avatar({ p, lg }: { p: { name: string; kind?: string }; lg?: boolean }) {
  return (
    <div className={`avatar ${lg ? 'lg' : ''} ${p.kind === 'public' ? 'pub' : ''}`} style={{ '--h': hue(p.name) } as React.CSSProperties}>
      {initials(p.name)}
    </div>
  )
}

/** You → contact → target, with the evidence on each step. */
export function PathView({ path, target }: { path: Path; target: { name: string; kind?: string } }) {
  const { openPerson } = useApp()
  const link = path.links[0]
  return (
    <div className="path">
      <div className="avatar you">YOU</div>
      <div className="who">You</div>
      <div className="rail" />
      <div className="edge row" style={{ gap: 8, alignItems: 'baseline' }}>
        <Tie tie={path.tie} />
        <span>{path.tie.label} tie{path.tie.how ? `, ${path.tie.how}` : ''}{path.tie.last ? <span className="faint"> · {path.tie.last}</span> : ''}</span>
      </div>
      <button onClick={() => openPerson(path.contact.id)} style={{ display: 'contents' }}>
        <Avatar p={path.contact} />
        <div className="who link" style={{ color: 'var(--ink)' }}>{path.contact.name}</div>
      </button>
      <div className={`rail ${link.confidence === 'confirmed' ? '' : 'dash'}`} />
      <div className="edge">{link.text} <span className={`tag ${link.confidence === 'confirmed' ? 'up' : link.confidence === 'likely' ? 'accent' : 'plain'}`} style={{ marginLeft: 4, height: 18 }}>{link.confidence}</span></div>
      <Avatar p={{ ...target, kind: 'public' }} />
      <div className="who">{target.name}</div>
    </div>
  )
}

export function PersonLine({ p, sub, right }: { p: PersonCard & { tie?: { label: 'strong' | 'medium' | 'weak' } }; sub?: React.ReactNode; right?: React.ReactNode }) {
  const { openPerson, b } = useApp()
  const tie = p.tie ?? b.network.people[p.id]?.tie
  return (
    <button className="li" onClick={() => openPerson(p.id)}>
      <Avatar p={p} />
      <div className="grow">
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontWeight: 550, fontSize: 14.5 }} className="ellipsis">{p.name}</span>
          {p.kind === 'contact' && tie && <Tie tie={tie} />}
        </div>
        <div className="tiny muted clamp2">{sub ?? p.headline}</div>
      </div>
      {right}
      <span className="chev"><IChev size={16} /></span>
    </button>
  )
}
