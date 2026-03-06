'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navbar() {

  const pathname = usePathname()

  function navStyle(route:string){

    const active = pathname === route

    return {
      padding:'8px 14px',
      borderRadius:8,
      textDecoration:'none',
      fontWeight:600,
      fontSize:14,
      background: active ? '#111' : '#eee',
      color: active ? 'white' : '#111'
    }

  }

  return (

    <div
      style={{
        display:'flex',
        gap:10,
        alignItems:'center',
        flexWrap:'wrap'
      }}
    >

      <Link href="/contest" style={navStyle('/contest')}>
        Contest
      </Link>

      <Link href="/today" style={navStyle('/today')}>
        Today
      </Link>

      <Link href="/leaderboard" style={navStyle('/leaderboard')}>
        Leaderboard
      </Link>

    </div>

  )

}