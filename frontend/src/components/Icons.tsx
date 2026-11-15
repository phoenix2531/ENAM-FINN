// Small hand-drawn icon set (24px grid, 1.7 stroke) so the app has one visual voice.
type P = { size?: number }
const S = ({ size = 22, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
export const IBrief = (p: P) => <S {...p}><path d="M4 6h16M4 12h10M4 18h7" /><circle cx="18.5" cy="16.5" r="2.5" /></S>
export const IResearch = (p: P) => <S {...p}><path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19v-4" /></S>
export const INetwork = (p: P) => <S {...p}><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="7" r="2.5" /><circle cx="12" cy="17.5" r="2.5" /><path d="M8 8.6 10.6 15M16 8.6 13.4 15M8.5 7h7" /></S>
export const ISearch = (p: P) => <S {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.3-4.3" /></S>
export const IMic = (p: P) => <S {...p}><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></S>
export const IClose = (p: P) => <S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>
export const IBack = (p: P) => <S {...p}><path d="m14.5 5.5-6.5 6.5 6.5 6.5" /></S>
export const IArrow = (p: P) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>
export const IChev = (p: P) => <S {...p}><path d="m9.5 6 6 6-6 6" /></S>
export const ISun = (p: P) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></S>
export const IMoon = (p: P) => <S {...p}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></S>
export const ISliders = (p: P) => <S {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></S>
export const ICheck = (p: P) => <S {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></S>
export const IDoc = (p: P) => <S {...p}><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8L14 3.5Z" /><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" /></S>
export const IExt = (p: P) => <S {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></S>
export const IPhone = (p: P) => <S {...p}><path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" /></S>
export const ICopy = (p: P) => <S {...p}><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></S>
export const IPath = (p: P) => <S {...p}><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="5.5" r="2" /><path d="M7.5 18.5h6a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7h6" /></S>
export const IRefresh = (p: P) => <S {...p}><path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15M4.5 19.5V15H9" /></S>
export const IAlert = (p: P) => <S {...p}><path d="M12 4 21 19.5H3L12 4Z" /><path d="M12 10v4M12 17v.01" /></S>
export const IGap = (p: P) => <S {...p}><circle cx="12" cy="12" r="8" /><path d="M8 12h8" /></S>
export const ICal = (p: P) => <S {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></S>
export const IPulse = (p: P) => <S {...p}><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></S>
export const IUser = (p: P) => <S {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></S>
export const IEdit = (p: P) => <S {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></S>
