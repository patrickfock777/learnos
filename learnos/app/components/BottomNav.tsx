'use client'
import { usePathname, useRouter } from 'next/navigation'

const tabs = [
  { href: '/notes', icon: '⚡', label: 'Capture' },
  { href: '/learn', icon: '🎓', label: 'Lernen' },
  { href: '/knowledge', icon: '📚', label: 'Wissen' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  // Map sub-pages to their parent tab
  const activeTab = pathname.startsWith('/vocab') || pathname.startsWith('/writing') || pathname.startsWith('/grammar')
    ? '/learn'
    : pathname.startsWith('/library') || pathname.startsWith('/youtube')
    ? '/knowledge'
    : pathname.startsWith('/notes')
    ? '/notes'
    : pathname

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#111827',
      borderTop: '1px solid #2a3050',
      display: 'flex',
      justifyContent: 'center',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{ display: 'flex', maxWidth: '600px', width: '100%' }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.href
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '10px 0 8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: isActive ? '#00e5c8' : '#5a6478',
                position: 'relative',
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '25%',
                  right: '25%',
                  height: '2px',
                  background: '#00e5c8',
                  borderRadius: '0 0 2px 2px',
                }} />
              )}
              <span style={{ fontSize: '20px' }}>{tab.icon}</span>
              <span style={{ fontSize: '10px', fontWeight: isActive ? 700 : 500, letterSpacing: '0.02em' }}>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
