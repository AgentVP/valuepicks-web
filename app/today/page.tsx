'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Game = {
  id: number
  away_team: string
  home_team: string
  away_score: number | null
  home_score: number | null
  winner_team: string | null
  start_time: string
  period: string | null
  clock: string | null
  status: string | null
}

type Pick = {
  game_id: number
  picked_team: string
  entrant_name: string
}

export default function TodayPage() {

  const [games,setGames] = useState<Game[]>([])
  const [picks,setPicks] = useState<Pick[]>([])
  const [lastUpdate,setLastUpdate] = useState('')

  useEffect(()=>{

    loadPage()

    const interval = setInterval(()=>{
      loadPage()
    },15000)

    return ()=>clearInterval(interval)

  },[])

  async function loadPage(){

    const today = new Date().toISOString().split('T')[0]

    const {data:slate} = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date',today)
      .single()

    if(!slate) return

    const {data:gameRows} = await supabase
      .from('games')
      .select(`
        id,
        away_team,
        home_team,
        away_score,
        home_score,
        winner_team,
        start_time,
        period,
        clock,
        status
      `)
      .eq('slate_id',slate.id)
      .order('start_time')

    setGames(gameRows || [])

    const {data:pickRows} = await supabase
      .from('picks')
      .select(`
        game_id,
        picked_team,
        entries (
          entrant_name
        )
      `)

    const formatted =
      (pickRows || []).map((p:any)=>({
        game_id:p.game_id,
        picked_team:p.picked_team,
        entrant_name:p.entries.entrant_name
      }))

    setPicks(formatted)

    setLastUpdate(new Date().toLocaleTimeString())

  }

  function logo(team:string){
    return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
  }

  return (

    <div style={{padding:40,fontFamily:'sans-serif',maxWidth:900,margin:'auto'}}>

      <h1>Today's Picks</h1>

      <div style={{fontSize:12,opacity:0.7,marginBottom:20}}>
        Live updates every 15 seconds • {lastUpdate}
      </div>

      {games.map((g)=>{

        const gamePicks =
          picks.filter(p=>p.game_id===g.id)

        const awayPicks =
          gamePicks.filter(p=>p.picked_team===g.away_team)

        const homePicks =
          gamePicks.filter(p=>p.picked_team===g.home_team)

        const total =
          gamePicks.length || 1

        const awayPct =
          Math.round((awayPicks.length/total)*100)

        const homePct =
          Math.round((homePicks.length/total)*100)

        return(

          <div
          key={g.id}
          style={{
            border:'1px solid #ddd',
            borderRadius:10,
            padding:18,
            marginBottom:20
          }}>

            <div style={{display:'flex',alignItems:'center',gap:10}}>

              <img src={logo(g.away_team)} width={28}/>
              <strong>{g.away_team}</strong>

              <span style={{margin:'0 6px'}}>@</span>

              <img src={logo(g.home_team)} width={28}/>
              <strong>{g.home_team}</strong>

            </div>

            <div style={{marginTop:8,fontWeight:700}}>

              {g.away_score !== null && g.home_score !== null
                ? `${g.away_score} - ${g.home_score}`
                : 'Game not started'}

            </div>

            <div style={{fontSize:13,opacity:0.7}}>

              {g.status === 'LIVE' && g.period && g.clock
                ? `${g.period} Period • ${g.clock}`
                : g.status === 'FINAL'
                ? 'Final'
                : ''}

            </div>

            {/* Pick Percentages */}

            <div style={{
              marginTop:10,
              fontSize:13,
              fontWeight:600
            }}>

              {g.away_team}: {awayPicks.length} picks ({awayPct}%)

              {'  |  '}

              {g.home_team}: {homePicks.length} picks ({homePct}%)

            </div>

            <div style={{marginTop:12}}>

              {gamePicks.length===0
                ? <div>No picks yet</div>
                : gamePicks.map((p,i)=>{

                  let result = ''

                  if(g.winner_team){

                    if(p.picked_team === g.winner_team){
                      result = ' ✅'
                    }else{
                      result = ' ❌'
                    }

                  }

                  return(
                    <div key={i}>
                      {p.entrant_name} → {p.picked_team}{result}
                    </div>
                  )

                })
              }

            </div>

          </div>

        )

      })}

    </div>

  )

}