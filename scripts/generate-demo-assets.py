"""Reproducible, original MusicSphere preview audio and vector cover art.
No external recordings or copyrighted melodies. Run from repository root.
"""
from pathlib import Path
import math, wave, struct, random
root = Path(__file__).resolve().parents[1] / 'apps/web/public'
palettes = [('#d76846','#f9bf77','#402e4a'),('#5c48a4','#d0b1ee','#1b244a'),('#294f58','#b1ded0','#102834'),('#b3b3db','#f1d8bf','#494464'),('#c96590','#ffb0aa','#422a57'),('#4b6b4b','#dae49c','#243b38'),('#c29853','#f4e0ab','#4a3e41'),('#375d96','#9cc8d8','#202a48')]
for index, (base, accent, dark) in enumerate(palettes):
    circles=''.join(f'<circle cx="{260+i*4}" cy="{230+i*3}" r="{160-i*12}" fill="none" stroke="{accent}" stroke-opacity="{.1+i*.03}" stroke-width="2"/>' for i in range(12))
    shape = f'<circle cx="315" cy="165" r="90" fill="{accent}"/><path d="M-50 350 Q160 130 450 350 L450 450 H-50" fill="{dark}"/><path d="M-50 390 Q170 235 450 390 L450 450 H-50" fill="{base}"/>' if index%2==0 else circles+f'<path d="M-20 80 Q90 360 210 210 T440 270" fill="none" stroke="{accent}" stroke-width="65" opacity=".6"/>'
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="{base}"/><stop offset="1" stop-color="{dark}"/></linearGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".12"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs><rect width="400" height="400" fill="url(#g)"/>{shape}<rect width="400" height="400" filter="url(#n)" opacity=".3"/><text x="28" y="48" font-family="sans-serif" font-size="11" letter-spacing="4" fill="white" opacity=".8">MUSICSPHERE / STUDIES</text><text x="28" y="365" font-family="sans-serif" font-size="55" letter-spacing="-3" fill="white">0{index+1}.</text><path d="M320 345 h48 m-24 -24 v48" stroke="white" opacity=".7"/></svg>'''
    (root/'art'/f'cover-{index}.svg').write_text(svg)
    rng=random.Random(2026+index)
    rate=22050; duration=24
    progressions=[[57,60,64,67],[50,53,57,60],[52,55,59,62],[48,52,55,59]]
    notes=progressions[index%4]
    samples=[]
    for n in range(rate*duration):
        t=n/rate; beat=t*(80+index*4)/60
        note=notes[int(beat*2)%4]+12
        f=440*2**((note-69)/12)
        phase=(beat*2)%1
        pluck=math.exp(-phase*6)*(.12*math.sin(2*math.pi*f*t)+.025*math.sin(2*math.pi*f*2*t))
        bassf=440*2**((notes[int(t/6)%4]-12-69)/12)
        bass=.09*math.sin(2*math.pi*bassf*t)
        pad=sum(.025*math.sin(2*math.pi*440*2**((v-69)/12)*t) for v in notes)
        kickphase=beat%1
        kick=.13*math.exp(-kickphase*22)*math.sin(2*math.pi*(48*t+1.6*(1-math.exp(-kickphase*18))))
        hat=(rng.random()-.5)*.025*math.exp(-((beat*2)%1)*45)
        fade=min(1,t/1.5,(duration-t)/2)
        value=max(-.95,min(.95,(pluck+bass+pad+kick+hat)*fade))
        samples.append(struct.pack('<h',int(value*32767)))
    with wave.open(str(root/'audio'/f'study-{index}.wav'),'wb') as out:
        out.setnchannels(1); out.setsampwidth(2); out.setframerate(rate); out.writeframes(b''.join(samples))
print('Generated 8 original 24-second audio studies and 8 SVG covers.')
