import { formatTime, type Track } from '../lib/catalog';
import { Icon } from './Icon';
export function TrackList({ tracks, currentId, playing, liked, play, like, add, enqueue }: {tracks:Track[];currentId:string;playing:boolean;liked:string[];play:(track:Track)=>void;like:(track:Track)=>void;add:(track:Track)=>void;enqueue:(track:Track)=>void}) {
  return <div className="track-list"><div className="track-table-head"><span>#</span><span>TRACK</span><span className="track-genre">GENRE</span><span className="track-duration"><Icon name="clock" size={15}/></span><span/></div>{tracks.map((track,index)=><div className={`track-row ${track.id===currentId?'current':''}`} key={track.id}>
    <button className="track-number" onClick={()=>play(track)} aria-label={`Play ${track.title}`}>{track.id===currentId&&playing?<span className="equalizer"><i/><i/><i/></span>:<><span>{String(index+1).padStart(2,'0')}</span><Icon name="play" size={15} filled/></>}</button>
    <button className="track-title" onClick={()=>play(track)}><img src={track.cover} alt=""/><span><strong>{track.title}</strong><small>{track.local?'Your local file':track.artist}</small></span></button>
    <span className="track-genre">{track.genre}</span><span className="track-duration">{formatTime(track.duration)}</span>
    <div className="track-actions"><button className={`icon-button ${liked.includes(track.id)?'selected':''}`} onClick={()=>like(track)} aria-label={`${liked.includes(track.id)?'Unlike':'Like'} ${track.title}`} aria-pressed={liked.includes(track.id)}><Icon name="heart" size={17} filled={liked.includes(track.id)}/></button><button className="icon-button" onClick={()=>add(track)} aria-label={`Add ${track.title} to playlist`}><Icon name="plus" size={17}/></button><button className="icon-button enqueue-button" onClick={()=>enqueue(track)} aria-label={`Queue ${track.title}`}><Icon name="queue" size={17}/></button></div>
  </div>)}</div>;
}
