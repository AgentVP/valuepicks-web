'use client'

import Navbar from '../components/navbar'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type DbGame = {
  id: number
  away_team: string
  home_team: string
  start_time: string
  status: string | null
}

export default function ContestPage() {

  const [names, setNames] = useState<string[]>([])
  const [games, setGames] = useState<DbGame[]>([])
  const [selectedName, setSelectedName] = useState('')
  const [picks, setPicks] = useState<Record<number,string>>({})
  const [message,setMessage] = useState('')
  const [isSubmitting,setIsSubmitting] = useState(false)

  useEffect(()=>{
    loadPage()
  },[])

  async function loadPage(){
    await Promise.all([loadNames(),loadGames()])
  }

  async function loadNames(){

    const {data} = await supabase
      .from('allowed_names')
      .select('name')
      .order('name')

    setNames((data || []).map((n:any)=>n.name))

  }

  async function loadGames(){

    await fetch('/api/generate-slate')

    const today = new Date().toISOString().split('T')[0]

    const {data:slate} = await supabase
      .from('slates')
      .select('id')
      .eq('slate_date',today)
      .single()

    if(!slate) return

    const {data} = await supabase
      .from('games')
      .select('id,away_team,home_team,start_time,status')
      .eq('slate_id',slate.id)
      .order('start_time')

    setGames(data || [])

  }

  function isLocked(start:string){
    return new Date(start) <= new Date()
  }

  function makePick(gameId:number,team:string,locked:boolean){

    if(locked) return

    setPicks(prev=>({
      ...prev,
      [gameId]:team
    }))

  }

  async function submitPicks(){

    if(!selectedName){
      setMessage('Select your name first')
      return
    }

    const pickEntries = Object.entries(picks).map(([gameId,pickedTeam])=>({
      gameId:Number(gameId),
      pickedTeam
    }))

    if(!pickEntries.length){
      setMessage('Make at least one pick')
      return
    }

    setIsSubmitting(true)

    const res = await fetch('/api/save-picks',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        entrantName:selectedName,
        picks:pickEntries
      })
    })

    const json = await res.json()

    if(json.success){
      setMessage(`Saved ${json.savedCount} picks`)
    }else{
      setMessage(json.error || 'Error saving picks')
    }

    setIsSubmitting(false)

  }

  function logo(team:string){
    return `https://assets.nhle.com/logos/nhl/svg/${team}_dark.svg`
  }

  return (

    <div style={{
      padding:40,
      fontFamily:'sans-serif',
      maxWidth:900,
      margin:'auto'
    }}>

      <h1>NHL Pick Contest</h1>

      <div style={{marginBottom:30}}>

        <select
          value={selectedName}
          onChange={(e)=>setSelectedName(e.target.value)}
        >

          <option value="">Select Your Name</option>

          {names.map(name=>(
            <option key={name}>{name}</option>
          ))}

        </select>

      </div>

      {games.map(game=>{

        const locked = isLocked(game.start_time)

        return (

          <div
          key={game.id}
          style={{
            border:'1px solid #ddd',
            borderRadius:12,
            padding:16,
            marginBottom:16,
            background:'#fafafa'
          }}>

            <div style={{
              fontSize:12,
              opacity:0.7,
              marginBottom:10
            }}>
              {new Date(game.start_time).toLocaleString()}
              {locked && ' • Locked'}
            </div>

            <div style={{
              display:'flex',
              gap:10
            }}>

              {[game.away_team,game.home_team].map(team=>{

                const selected =
                  picks[game.id] === team

                return (

                  <button
                  key={team}
                  disabled={locked}
                  onClick={()=>makePick(game.id,team,locked)}
                  style={{
                    flex:1,
                    display:'flex',
                    alignItems:'center',
                    gap:10,
                    padding:14,
                    borderRadius:10,
                    border:selected
                      ? '2px solid #4CAF50'
                      : '1px solid #ccc',
                    background:selected
                      ? '#e8f5e9'
                      : 'white',
                    cursor:locked
                      ? 'not-allowed'
                      : 'pointer'
                  }}>

                    <img
                    src={logo(team)}
                    width={28}
                    height={28}
                    />

                    <strong>{team}</strong>

                  </button>

                )

              })}

            </div>

          </div>

        )

      })}

      <button
      onClick={submitPicks}
      disabled={isSubmitting}
      style={{
        marginTop:20,
        padding:'12px 20px',
        fontSize:16,
        cursor:'pointer'
      }}>
        {isSubmitting ? 'Saving...' : 'Submit Picks'}
      </button>

      {message && (
        <div style={{marginTop:16,fontWeight:600}}>
          {message}
        </div>
      )}

    </div>

  )

}