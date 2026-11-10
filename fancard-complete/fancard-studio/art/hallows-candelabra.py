# writes art/hallows-candelabra.svg : #relief (raised silver), #ink (engraved niello), #flame (gold foil)
# a three-arm candelabra, mirrored into both bottom corners. origin = centre of the foot, y up is negative.
import sys
RELIEF = ('<path d="M-64,0 C-62,-16 -32,-20 -15,-30 L15,-30 C32,-20 62,-16 64,0 Z"/>'
          '<rect x="-68" y="-2" width="136" height="12" rx="5"/>'
          '<rect x="-8" y="-158" width="16" height="132"/>'
          '<ellipse cx="0" cy="-58" rx="17" ry="10"/><ellipse cx="0" cy="-106" rx="13" ry="8"/><ellipse cx="0" cy="-156" rx="20" ry="10"/>'
          '<path d="M-6,-156 C-40,-158 -76,-160 -78,-198 M6,-156 C40,-158 76,-160 78,-198" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>'
          '<path d="M-78,-178 C-96,-176 -104,-166 -98,-156 M78,-178 C96,-176 104,-166 98,-156" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'
          '<rect x="-6" y="-214" width="12" height="60"/>'
          '<ellipse cx="-78" cy="-200" rx="19" ry="7"/><ellipse cx="78" cy="-200" rx="19" ry="7"/><ellipse cx="0" cy="-216" rx="21" ry="8"/>'
          '<rect x="-87" y="-298" width="18" height="98" rx="2"/><rect x="69" y="-298" width="18" height="98" rx="2"/>'
          '<rect x="-10" y="-330" width="20" height="116" rx="2"/>')
INK = ('<path d="M-40,-8 C-30,-14 -18,-20 -10,-24 M40,-8 C30,-14 18,-20 10,-24 M-62,4 H62" />'
       '<path d="M-3,-150 V-34 M3,-150 V-34" stroke-width="1.6"/>'
       '<path d="M-12,-58 H12 M-9,-106 H9 M-15,-156 H15"/>'
       '<path d="M-96,-200 H-60 M60,-200 H96 M-20,-216 H20"/>'
       '<path d="M-87,-286 C-84,-280 -82,-270 -80,-262 M-73,-290 C-74,-282 -73,-276 -72,-270 M73,-290 C74,-282 73,-276 72,-270 M87,-286 C84,-280 82,-270 80,-262'
       ' M-10,-318 C-7,-310 -6,-300 -4,-292 M8,-322 C7,-314 7,-306 6,-300"/>'
       '<path d="M-78,-298 V-306 M78,-298 V-306 M0,-330 V-338" stroke-width="3"/>')
def flame(x, y, s=1):
    return (f'<path d="M{x},{y-34*s} C{x+11*s},{y-18*s} {x+13*s},{y-6*s} {x},{y+4*s} C{x-13*s},{y-6*s} {x-11*s},{y-18*s} {x},{y-34*s} Z"/>')
FLAME = flame(-78, -312) + flame(78, -312) + flame(0, -344, 1.15)
PLACES = [(150, 1600, .78), (930, 1600, .78)]
def g(body, extra=''):
    return "".join(f'<g transform="translate({x},{y}) scale({s})" {extra}>{body}</g>' for x, y, s in PLACES)
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1669" viewBox="0 0 1080 1669">'
       f'<g id="relief" fill="#fff">{g(RELIEF)}</g>'
       f'<g id="ink" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round">{g(INK)}</g>'
       f'<g id="flame" fill="#fff">{g(FLAME)}</g></svg>')
open(f'{sys.argv[1]}/hallows-candelabra.svg', 'w').write(svg)
print('ok')
