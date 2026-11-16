import { useEffect, useRef, useState } from 'react';
import type { Track } from './catalog';
export function usePlayer(notify: (message:string)=>void) {
  const audio = useRef<HTMLAudioElement>(null);
  // Empty until the catalog loads from the API (see prime).
  const [current,setCurrent]=useState<Track|null>(null);
  const [queue,setQueue]=useState<Track[]>([]);
  const [playing,setPlaying]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  const [volume,setVolume]=useState(.65);
  const [shuffle,setShuffle]=useState(false);
  const [repeat,setRepeat]=useState(false);
  const intent=useRef(false);
  const playAudio=()=>{ const element=audio.current; if(element) void element.play().catch(()=>{setPlaying(false);notify('Couldn’t play this audio. Try another track or select your local file again.');}); };
  useEffect(()=>{ const element=audio.current; if(!element||!current)return; element.src=current.src; element.load();setPosition(0);setDuration(current.duration); if(intent.current) playAudio(); },[current?.id,current?.src]);
  useEffect(()=>{ if(audio.current) audio.current.volume=volume; },[volume]);
  // Load a default queue without starting playback; keeps any track the listener already chose.
  function prime(list:Track[]){ setQueue(value=>value.length?value:list); setCurrent(value=>value??list[0]??null); }
  function select(track:Track, list?:Track[]) { intent.current=true; if(list?.length)setQueue(list); if(track.id===current?.id)playAudio();else setCurrent(track); }
  function toggle(){ if(!audio.current)return; if(!current){ if(queue[0])select(queue[0]); return; } intent.current=!playing; if(playing)audio.current.pause();else playAudio(); }
  function move(direction:number, ended=false){
    const index=queue.findIndex(track=>track.id===current?.id);
    if(ended && !shuffle && index===queue.length-1){intent.current=false;setPlaying(false);return;}
    if(!queue.length)return;
    const next=shuffle && queue.length>1 ? (index+1+Math.floor(Math.random()*(queue.length-1)))%queue.length : (index+direction+queue.length)%queue.length;
    const track=queue[next]; if(track){ if(track.id===current?.id && audio.current)audio.current.currentTime=0;select(track); }
  }
  function seek(value:number){if(audio.current && Number.isFinite(audio.current.duration)){ audio.current.currentTime=value;setPosition(value);}}
  return {audio,current,queue,setQueue,playing,setPlaying,position,setPosition,duration,setDuration,volume,setVolume,shuffle,setShuffle,repeat,setRepeat,prime,select,toggle,move,seek};
}
export type PlayerState = ReturnType<typeof usePlayer>;
