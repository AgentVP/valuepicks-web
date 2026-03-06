'use client'

import { useEffect, useState } from 'react'

type Game = {
  id:number
  awayTeam:{abbrev:string, score?:number}
  homeTeam:{abbrev:string, score?:number}
  gameState:string
  periodDescriptor?:{number:number}
  clock?:{timeRemaining:string}
}

export default function Scoreboard(){

  const [games,setGames] = useState<Game[]>([])

  useEffect(()=>{

    loadGames()

    const interval = setInterval(()=>{
      loadGames()
    },20000)

    return ()=>clearInterval(interval)

  },[])

  async function loadGames(){

    const today = new Date().toISOString().split('T')[0]

    const res = await fetch(
      `https://api-web.nhle.com/v1/schedule/${today}`
    )

    const json = await res.json()

    const games =
      json.gameWeek
        ?.filter((d:any)=>d.date===today)
        .flatMap((d:any)=>d.games) || []

    setGames(games)

  }

  return(

    <div
      style={{
        background:'#111',
        color:'white',
        padding:'10px 20px',
        overflowX:'auto'
      }}
    >

      <div style={{
        display:'flex',
        gap:24,
        alignItems:'center'
      }}>

        <strong>🏒 Tonight</strong>

        {games.map(g=>{

          const period =
            g.periodDescriptor?.number

          const clock =
            g.clock?.timeRemaining

          return(

            <div
              key={g.id}
              style={{
                whiteSpace:'nowrap',
                fontSize:14
              }}
            >

              {g.awayTeam.abbrev}
              {' '}
              {g.awayTeam.score ?? '-'}
              {'  '}
              {g.homeTeam.abbrev}
              {' '}
              {g.homeTeam.score ?? '-'}

              {'  '}

              {g.gameState === 'LIVE' && period
                ? `(${period} • ${clock})`
                : g.gameState === 'FINAL'
                ? '(Final)'
                : ''}

            </div>

          )

        })}

      </div>

    </div>

  )

}